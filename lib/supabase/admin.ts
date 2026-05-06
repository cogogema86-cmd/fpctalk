/**
 * 관리자 권한 Supabase 클라이언트
 * - service_role 키 사용 → 모든 RLS 우회
 * - 서버 사이드에서만 사용 (절대 클라이언트로 노출 금지)
 * - 사용 예: 사용자 생성, 임의 데이터 조회, 관리자 작업
 */
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
