/**
 * 인증 헬퍼
 *
 * 학원 직원은 이메일이 아닌 username(아이디)로 로그인합니다.
 * 내부적으로만 가짜 이메일을 합성해 Supabase Auth로 위임:
 *   "parker"  →  "parker@fpctalk.local"
 *
 * 사용자는 username만 알면 됩니다.
 */

export const INTERNAL_EMAIL_DOMAIN = "@fpctalk.local";

/** username → 합성 이메일 (Supabase Auth 내부용) */
export function usernameToEmail(username: string): string {
  return `${username.toLowerCase().trim()}${INTERNAL_EMAIL_DOMAIN}`;
}

/** 합성 이메일 → username (UI 표시용) */
export function emailToUsername(email: string): string {
  return email.replace(INTERNAL_EMAIL_DOMAIN, "");
}

/** username 형식 검증 */
export function isValidUsername(username: string): boolean {
  // 영문/숫자/언더스코어/하이픈만 허용, 3~20자
  return /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

/**
 * 무작위 비밀번호 생성 (10자, 영문+숫자만)
 * - 헷갈리는 문자(0/O, 1/l/I) 제외해서 사람이 받아 적기 쉽게
 */
export function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  // crypto.getRandomValues로 보안 난수
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}
