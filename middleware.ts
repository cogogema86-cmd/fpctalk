/**
 * 인증 미들웨어
 * - 모든 요청에서 Supabase 세션 쿠키 자동 갱신
 * - 미인증 사용자가 보호된 라우트 접근 시 /login으로 리다이렉트
 * - 인증된 사용자가 /login 접근 시 /dashboard로 리다이렉트
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applyRememberMe, REMEMBER_ME_COOKIE } from "@/lib/supabase/server";

const PUBLIC_PATHS = ["/login", "/sign", "/api/sign-files"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const rememberMe =
    request.cookies.get(REMEMBER_ME_COOKIE)?.value === "1";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(
              name,
              value,
              applyRememberMe(options, rememberMe),
            ),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  // 미인증 사용자가 보호된 라우트 접근 → /login
  if (!user && !isPublic && path !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 이미 로그인된 사용자가 /login 접근 → /dashboard
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
