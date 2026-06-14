/**
 * 인프라(외부 서비스) 인벤토리 — 비밀이 아닌 정보만.
 *
 * 🔴 절대 비밀번호·API 키·시크릿 값을 여기 넣지 말 것.
 *    실제 비밀값은 비밀번호 관리자(Bitwarden 등)에 보관하고, 여기엔 "이름/위치"만.
 *
 * 용도:
 *  - 대시보드 '인프라 정보' 카드(원장 전용)에 표시
 *  - 계정 변경·점검·재현 시 "무엇이 어디에 있는지" 한눈에
 *
 * 값이 바뀌면(계정 변경 등) 이 파일을 수정해 재배포하면 됨.
 */

export type InfraService = {
  /** 서비스명 */
  name: string;
  /** 아이콘(이모지) */
  icon: string;
  /** 용도 */
  purpose: string;
  /** 로그인/관리 콘솔 URL */
  loginUrl: string;
  /** 비밀 아닌 식별자(계정ID·프로젝트ref·버킷명 등) */
  identifiers: { label: string; value: string }[];
  /** 이 서비스가 쓰는 환경변수 이름 (값 X) */
  envVars: string[];
  /** 비밀값 보관 위치/메모 */
  secretNote?: string;
};

export const INFRA_SERVICES: InfraService[] = [
  {
    name: "Supabase",
    icon: "🗄️",
    purpose: "데이터베이스 · 로그인(인증) · 실시간",
    loginUrl: "https://supabase.com/dashboard",
    identifiers: [{ label: "프로젝트 ref", value: "tgjcvhuoiitbkrfzrust" }],
    envVars: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY 🔒",
      "DATABASE_URL 🔒",
      "DIRECT_URL 🔒",
    ],
    secretNote: "service_role 키·DB 비번 = 비밀번호 관리자 보관",
  },
  {
    name: "Cloudflare R2",
    icon: "📦",
    purpose: "파일 저장 (채팅 첨부 · 문서 · 사인본). 무료 10GB",
    loginUrl: "https://dash.cloudflare.com",
    identifiers: [
      { label: "계정 ID", value: "d282c56dc6bd0b932095575ac3079454" },
      { label: "버킷", value: "fpctalk" },
    ],
    envVars: [
      "STORAGE_PROVIDER",
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID 🔒",
      "R2_SECRET_ACCESS_KEY 🔒",
      "R2_BUCKET",
    ],
    secretNote: "Access Key / Secret = 비밀번호 관리자 보관",
  },
  {
    name: "Vercel",
    icon: "▲",
    purpose: "배포(호스팅) · Cron · 환경변수 보관",
    loginUrl: "https://vercel.com/dashboard",
    identifiers: [{ label: "프로젝트", value: "fpctalk" }],
    envVars: ["(모든 환경변수가 여기 등록됨)", "CRON_SECRET 🔒"],
    secretNote: "환경변수 값은 Vercel Settings → Environment Variables",
  },
  {
    name: "GitHub",
    icon: "🐙",
    purpose: "소스코드 저장소 (push 시 Vercel 자동 배포)",
    loginUrl: "https://github.com/cogogema86-cmd/fpctalk",
    identifiers: [{ label: "repo", value: "cogogema86-cmd/fpctalk" }],
    envVars: [],
  },
  {
    name: "Google Gemini",
    icon: "🤖",
    purpose: "AI 비서 (무료 등급 flash/lite)",
    loginUrl: "https://aistudio.google.com/apikey",
    identifiers: [],
    envVars: ["GEMINI_API_KEY 🔒", "AI_MODEL_FAST", "AI_MODEL_PRO"],
    secretNote: "API 키 = 비밀번호 관리자 / 관리자 화면(/admin/ai)에서 교체 가능",
  },
  {
    name: "도메인 (hosting.kr)",
    icon: "🌐",
    purpose: "도메인 등록 · DNS",
    loginUrl: "https://hosting.kr",
    identifiers: [
      { label: "도메인", value: "fpctalk.com" },
      { label: "A 레코드", value: "76.76.21.21" },
      { label: "CNAME(www)", value: "cname.vercel-dns.com" },
    ],
    envVars: [],
  },
  {
    name: "Web Push (VAPID)",
    icon: "🔔",
    purpose: "푸시 알림 키 (자체 발급)",
    loginUrl: "",
    identifiers: [],
    envVars: [
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY 🔒",
      "VAPID_SUBJECT",
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    ],
    secretNote: "분실 시 `npx tsx scripts/generate-vapid.ts`로 재발급(구독 초기화됨)",
  },
];
