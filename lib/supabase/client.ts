/**
 * 브라우저용 Supabase 클라이언트
 * - Client Component에서 사용
 * - Realtime 구독, 클라이언트 사이드 파일 업로드 등
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
