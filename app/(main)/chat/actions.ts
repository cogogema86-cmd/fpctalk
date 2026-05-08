"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createOrGetDM,
  getMe,
  markAsRead,
  sendMessage,
} from "@/lib/chat";

// =====================================================
// 직원 선택 → 1:1 채팅 시작
// =====================================================
export async function startDmAction(formData: FormData) {
  const me = await getMe();
  if (!me) redirect("/login");
  const otherUserId = formData.get("userId") as string;
  if (!otherUserId) return;
  const chatId = await createOrGetDM(me.id, otherUserId);
  revalidatePath("/chat");
  redirect(`/chat/${chatId}`);
}

// =====================================================
// 메시지 전송
// =====================================================
export type SendMessageState = {
  error?: string;
};

export async function sendMessageAction(
  _prev: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const me = await getMe();
  if (!me) return { error: "로그인이 필요합니다." };

  const chatId = formData.get("chatId") as string;
  const content = formData.get("content") as string;
  if (!chatId || !content?.trim()) return {};

  try {
    await sendMessage(chatId, me.id, content);
    await markAsRead(chatId, me.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "전송 실패" };
  }

  // Realtime이 알아서 새 메시지를 푸시할 거지만, fallback으로 revalidate
  revalidatePath(`/chat/${chatId}`);
  revalidatePath("/chat");
  return {};
}

// =====================================================
// 읽음 표시
// =====================================================
export async function markAsReadAction(chatId: string) {
  const me = await getMe();
  if (!me) return;
  try {
    await markAsRead(chatId, me.id);
  } catch {
    // 멤버 아니면 무시
  }
}
