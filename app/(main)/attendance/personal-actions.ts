"use server";

/**
 * 개인 일정 CRUD — 본인 행위만 허용.
 */
import { prisma } from "@/lib/db";
import { getMe } from "@/lib/chat";
import { revalidatePath } from "next/cache";

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

export type PersonalEventInput = {
  title: string;
  date: string; // "YYYY-MM-DD" (시작 기준일)
  allDay: boolean;
  startTime?: string | null; // "HH:MM" (allDay가 아닐 때만)
  endTime?: string | null; // "HH:MM" (선택)
  note?: string | null;
};

/** 클라이언트 입력을 DB에 저장 가능한 (startAt, endAt) 으로 정규화. */
function parseInput(input: PersonalEventInput): { startAt: Date; endAt: Date | null } | null {
  const m = input.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  if (y < 2000 || y > 2100 || mo < 0 || mo > 11 || d < 1 || d > 31) return null;

  let startAt: Date;
  let endAt: Date | null = null;
  if (input.allDay || !input.startTime) {
    // 종일: 00:00 ~ 23:59:59
    startAt = new Date(y, mo, d, 0, 0, 0, 0);
    endAt = new Date(y, mo, d, 23, 59, 59, 999);
  } else {
    const sMatch = input.startTime.match(/^(\d{2}):(\d{2})$/);
    if (!sMatch) return null;
    startAt = new Date(y, mo, d, parseInt(sMatch[1], 10), parseInt(sMatch[2], 10), 0, 0);
    if (input.endTime) {
      const eMatch = input.endTime.match(/^(\d{2}):(\d{2})$/);
      if (!eMatch) return null;
      endAt = new Date(y, mo, d, parseInt(eMatch[1], 10), parseInt(eMatch[2], 10), 0, 0);
      // 종료가 시작보다 이전이면 종료를 다음날로 — 23:59 이내로 강제
      if (endAt.getTime() <= startAt.getTime()) {
        endAt = new Date(y, mo, d, 23, 59, 59, 999);
      }
    }
  }
  return { startAt, endAt };
}

export async function addPersonalEventAction(
  input: PersonalEventInput,
): Promise<Result<{ id: string }>> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "제목을 입력하세요." };
  if (title.length > 200) return { ok: false, error: "제목이 너무 깁니다 (200자 제한)." };
  const note = (input.note ?? "").trim().slice(0, 1000) || null;

  const parsed = parseInput(input);
  if (!parsed) return { ok: false, error: "날짜/시간 형식이 잘못되었습니다." };

  const ev = await prisma.personalEvent.create({
    data: {
      userId: me.id,
      title,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      allDay: input.allDay,
      note,
    },
    select: { id: true },
  });

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  return { ok: true, data: { id: ev.id } };
}

export async function updatePersonalEventAction(
  id: string,
  input: PersonalEventInput,
): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const existing = await prisma.personalEvent.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!existing) return { ok: false, error: "일정을 찾을 수 없습니다." };
  if (existing.userId !== me.id) return { ok: false, error: "본인 일정만 수정할 수 있습니다." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "제목을 입력하세요." };
  if (title.length > 200) return { ok: false, error: "제목이 너무 깁니다 (200자 제한)." };
  const note = (input.note ?? "").trim().slice(0, 1000) || null;

  const parsed = parseInput(input);
  if (!parsed) return { ok: false, error: "날짜/시간 형식이 잘못되었습니다." };

  await prisma.personalEvent.update({
    where: { id },
    data: {
      title,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      allDay: input.allDay,
      note,
    },
  });

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deletePersonalEventAction(id: string): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const existing = await prisma.personalEvent.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!existing) return { ok: false, error: "일정을 찾을 수 없습니다." };
  if (existing.userId !== me.id) return { ok: false, error: "본인 일정만 삭제할 수 있습니다." };

  await prisma.personalEvent.delete({ where: { id } });
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  return { ok: true };
}
