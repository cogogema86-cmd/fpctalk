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
