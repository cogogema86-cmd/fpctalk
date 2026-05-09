/**
 * 서버용 Supabase 클라이언트
 * - Server Component, Route Handler, Server Action 에서 사용
 * - 쿠키 기반 세션 자동 처리
 *
 * 자동 로그인 control:
 *   `fpctalk-rememberMe=1` 쿠키가 있으면 Supabase auth 쿠키를 30일 maxAge로 갱신.
 *   없으면 session cookie (브라우저 닫으면 삭제)로 강제 → 공용 기기 안전.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const REMEMBER_ME_COOKIE = "fpctalk-rememberMe";
const REMEMBER_ME_MAX_AGE = 60 * 60 * 24 * 30; // 30일

export async function createClient() {
  const cookieStore = await cookies();
  const rememberMe =
    cookieStore.get(REMEMBER_ME_COOKIE)?.value === "1";

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, applyRememberMe(options, rememberMe));
            });
          } catch {
            // Server Component에서 호출 시 발생 — Middleware가 토큰 갱신 처리
          }
        },
      },
    },
  );
}

/**
 * Supabase가 설정하려는 cookie options를 rememberMe 여부에 따라 조정.
 * - rememberMe=true: 30일 유지 (기본 행동)
 * - rememberMe=false: session cookie (브라우저 닫으면 삭제)
 */
export function applyRememberMe(
  options: Record<string, unknown> | undefined,
  rememberMe: boolean,
): Record<string, unknown> {
  const opts = { ...(options ?? {}) };
  if (rememberMe) {
    opts.maxAge = REMEMBER_ME_MAX_AGE;
    delete opts.expires;
  } else {
    delete opts.maxAge;
    delete opts.expires;
  }
  return opts;
}
