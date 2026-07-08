/**
 * 문자(SMS/LMS) 발송 — 솔라피(SOLAPI) API.
 *
 * 용도: 외부 사인 요청 시 전화번호가 입력되면 사인 링크를 문자로 자동 발송.
 *
 * 환경변수 (셋 다 필요 — 없으면 발송 건너뜀):
 *  - SOLAPI_API_KEY    : 솔라피 콘솔 → API Key 관리
 *  - SOLAPI_API_SECRET : 위와 동일 (생성 시 1회만 노출)
 *  - SOLAPI_SENDER     : 솔라피에 사전 등록된 발신번호
 *
 * 메시지 타입(SMS/LMS)은 솔라피가 본문 길이에 따라 자동 선택.
 */

import crypto from "node:crypto";

const SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send";

export type SendSmsResult = { ok: true } | { ok: false; error: string };

/** 휴대폰 번호 정규화 — 숫자만 남김 (010-1234-5678 → 01012345678) */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function sendSms(
  to: string,
  text: string,
): Promise<SendSmsResult> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;
  if (!apiKey || !apiSecret || !sender) {
    return {
      ok: false,
      error:
        "문자 환경변수 미설정 (SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER)",
    };
  }

  const toDigits = normalizePhone(to);
  // 한국 휴대폰 형식 검증 (01X + 7~8자리)
  if (!/^01[016789]\d{7,8}$/.test(toDigits)) {
    return { ok: false, error: `유효하지 않은 휴대폰 번호: ${to}` };
  }

  // 솔라피 HMAC-SHA256 인증 헤더
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");

  try {
    const res = await fetch(SOLAPI_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      },
      body: JSON.stringify({
        message: { to: toDigits, from: normalizePhone(sender), text },
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        errorMessage?: string;
      } | null;
      return {
        ok: false,
        error: body?.errorMessage ?? `솔라피 응답 오류 (HTTP ${res.status})`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `문자 발송 실패: ${String(e)}` };
  }
}
