"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import { sendPushToUsers } from "@/lib/push";

type ProposalMetadata = {
  state?: "PENDING" | "APPROVED" | "CANCELLED";
  title?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
};

async function isMessageAuthor(
  messageId: string,
  userId: string,
): Promise<boolean> {
  const m = await prisma.message.findUnique({
    where: { id: messageId },
    select: { userId: true },
  });
  return m?.userId === userId;
}

/** EVENT_PROPOSAL 메시지를 [확인]하면 Event 등록 */
export async function approveEventProposalAction(
  messageId: string,
): Promise<{ ok: boolean; error?: string; eventId?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  if (!(await isMessageAuthor(messageId, me.id))) {
    return { ok: false, error: "본인이 작성한 메시지가 아닙니다." };
  }

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { chat: { select: { id: true, members: { select: { userId: true } } } } },
  });
  if (!msg || msg.type !== "EVENT_PROPOSAL") {
    return { ok: false, error: "유효하지 않은 제안입니다." };
  }

  const meta = (msg.metadata ?? {}) as ProposalMetadata;
  if (meta.state && meta.state !== "PENDING") {
    return { ok: false, error: "이미 처리된 제안입니다." };
  }
  if (!meta.title || !meta.startDate || !meta.endDate) {
    return { ok: false, error: "제안에 일정 정보가 없습니다." };
  }

  // 이미 같은 sourceMessageId로 등록된 Event가 있는지 (중복 클릭 방지)
  const existing = await prisma.event.findUnique({
    where: { sourceMessageId: messageId },
  });
  if (existing) {
    return { ok: true, eventId: existing.id };
  }

  const ev = await prisma.event.create({
    data: {
      title: meta.title,
      startDate: new Date(meta.startDate),
      endDate: new Date(meta.endDate),
      location: meta.location ?? null,
      createdById: me.id,
      source: "CHAT_AI",
      sourceMessageId: messageId,
    },
  });

  // 메시지 metadata 업데이트 → 더 이상 [확인]/[취소] 안 보임
  await prisma.message.update({
    where: { id: messageId },
    data: {
      metadata: { ...meta, state: "APPROVED", eventId: ev.id },
    },
  });

  // 채팅 멤버 전체에 푸시 알림 (작성자 제외)
  const recipients = msg.chat.members
    .map((m) => m.userId)
    .filter((id) => id !== me.id);
  if (recipients.length > 0) {
    void sendPushToUsers(recipients, {
      title: "🎉 학원 행사 등록",
      body: ev.title,
      url: "/attendance",
      tag: `event-${ev.id}`,
    });
  }

  revalidatePath(`/chat/${msg.chatId}`);
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  return { ok: true, eventId: ev.id };
}

/** EVENT_PROPOSAL 메시지를 [취소]하면 metadata만 갱신 (Event 미생성) */
export async function cancelEventProposalAction(
  messageId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  if (!(await isMessageAuthor(messageId, me.id))) {
    return { ok: false, error: "본인이 작성한 메시지가 아닙니다." };
  }

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { type: true, metadata: true, chatId: true },
  });
  if (!msg || msg.type !== "EVENT_PROPOSAL") {
    return { ok: false, error: "유효하지 않은 제안입니다." };
  }

  const meta = (msg.metadata ?? {}) as ProposalMetadata;
  if (meta.state && meta.state !== "PENDING") {
    return { ok: false };
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { metadata: { ...meta, state: "CANCELLED" } },
  });

  revalidatePath(`/chat/${msg.chatId}`);
  return { ok: true };
}

/** 본인이 ack 하지 않은 다가오는 행사 ack 처리 */
export async function ackEventAction(
  eventId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  await prisma.eventAcknowledgement
    .upsert({
      where: { eventId_userId: { eventId, userId: me.id } },
      create: { eventId, userId: me.id },
      update: {},
    })
    .catch(() => {});
  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  return { ok: true };
}

/** 행사 삭제 — 관리자 전용. 관련 EventAcknowledgement는 Cascade. */
export async function deleteEventAction(
  eventId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  const u = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { isAdmin: true } } },
  });
  if (!u?.role.isAdmin) {
    return { ok: false, error: "관리자만 행사를 삭제할 수 있습니다." };
  }

  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { sourceMessageId: true },
  });
  if (!ev) return { ok: false, error: "행사를 찾을 수 없습니다." };

  // 채팅 EVENT_PROPOSAL 메시지의 metadata가 있으면 CANCELLED로 갱신 (등록 흔적 정리)
  if (ev.sourceMessageId) {
    const msg = await prisma.message.findUnique({
      where: { id: ev.sourceMessageId },
      select: { metadata: true, chatId: true },
    });
    if (msg) {
      const meta = (msg.metadata ?? {}) as Record<string, unknown>;
      await prisma.message.update({
        where: { id: ev.sourceMessageId },
        data: { metadata: { ...meta, state: "CANCELLED", eventId: undefined } },
      });
      revalidatePath(`/chat/${msg.chatId}`);
    }
  }

  await prisma.event.delete({ where: { id: eventId } });

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * 행사 수정 — 관리자 전용. 제목/기간/장소 변경.
 * 등록 멤버에게 변경 푸시 알림. (sourceMessage metadata도 동기화)
 */
export async function updateEventAction(input: {
  eventId: string;
  title: string;
  startDate: string; // ISO (datetime-local 값)
  endDate: string;
  location: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };
  const u = await prisma.user.findUnique({
    where: { id: me.id },
    include: { role: { select: { isAdmin: true } } },
  });
  if (!u?.role.isAdmin) {
    return { ok: false, error: "관리자만 행사를 수정할 수 있습니다." };
  }

  const title = input.title.trim();
  if (!title) return { ok: false, error: "제목을 입력해주세요." };

  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { ok: false, error: "날짜 형식이 올바르지 않습니다." };
  }
  if (end.getTime() < start.getTime()) {
    return { ok: false, error: "종료일이 시작일보다 빠를 수 없습니다." };
  }

  const ev = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: { id: true, sourceMessageId: true },
  });
  if (!ev) return { ok: false, error: "행사를 찾을 수 없습니다." };

  const location = input.location?.trim() || null;

  await prisma.event.update({
    where: { id: input.eventId },
    data: { title, startDate: start, endDate: end, location },
  });

  // 채팅 EVENT_PROPOSAL 메시지 metadata 동기화 (있으면)
  if (ev.sourceMessageId) {
    const msg = await prisma.message.findUnique({
      where: { id: ev.sourceMessageId },
      select: { metadata: true, chatId: true },
    });
    if (msg) {
      const meta = (msg.metadata ?? {}) as Record<string, unknown>;
      await prisma.message.update({
        where: { id: ev.sourceMessageId },
        data: {
          metadata: {
            ...meta,
            title,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            location,
          },
        },
      });
      revalidatePath(`/chat/${msg.chatId}`);
    }
  }

  // 확인(ack)한 멤버에게 변경 알림
  const acks = await prisma.eventAcknowledgement.findMany({
    where: { eventId: input.eventId },
    select: { userId: true },
  });
  const recipients = acks.map((a) => a.userId).filter((id) => id !== me.id);
  if (recipients.length > 0) {
    void sendPushToUsers(recipients, {
      title: "📝 학원 행사 변경",
      body: title,
      url: "/attendance",
      tag: `event-${input.eventId}`,
    });
  }

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  return { ok: true };
}
