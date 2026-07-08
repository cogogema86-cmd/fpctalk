# FPCTalk — 다른 학원/조직 재현 가이드

이 문서는 FPCTalk와 동일한 메신저 사이트를 다른 학원·조직용으로 새로 셋업할 때 필요한 준비 사항을 정리한 것입니다.

> **소요 시간**: 처음이라면 약 **3~5시간** (계정 생성 + 결제정보 등록 + 환경변수 + DNS 전파 대기 포함)
> **월 비용**: 직원 ~30명 기준 **0원~$2** (Vercel Hobby + Supabase Free + R2 무료 한도 내)

---

## 1. 외부 계정·서비스 준비 (먼저)

### 1-1. GitHub 계정
- 이 repo를 본인 계정으로 **fork**
- 또는 organization repo로 옮긴 후 push 권한 확보

### 1-2. Vercel 계정 (Hobby 무료)
- https://vercel.com 가입 (GitHub 연동)
- 무료 플랜에 포함:
  - 자동 배포
  - SSL 자동
  - Web Push 정상 동작
  - **Cron 1개 무료** (첨부 자동 삭제용)
  - 함수 실행 30초 제한 (충분)

### 1-3. Supabase 프로젝트 (Free 무료)
- https://supabase.com 가입
- 새 프로젝트 생성
  - Region: **ap-northeast-2 (Seoul)** 또는 **ap-northeast-1 (Tokyo)** 권장 (한국 사용자 기준)
  - DB 비밀번호 — **영문+숫자만** (특수문자 `@`, `!` 등 금지: URL 파싱 깨짐)
- 무료 한도:
  - DB 500MB (직원 30명·1년치 채팅 충분)
  - Realtime 200 동시 접속
  - Auth 50,000 MAU
- 프로젝트 생성 후 약 1~2분 대기

### 1-4. Cloudflare R2 (저장소, 권장)
- https://dash.cloudflare.com → R2
- 무료 한도 10GB + egress 무료
- 결제 정보 등록 필요 (10GB 초과 시 $0.015/GB)
- 버킷 생성: 이름 자유 (예: `myacademy-storage`), Region: `Asia-Pacific` 또는 `Auto`
- API 토큰 발급:
  - Account Home → R2 → Manage R2 API Tokens
  - "Create API token" → "Object Read & Write" → 해당 버킷만 선택
  - **Access Key ID** + **Secret Access Key** 메모 (다시 못 봄)

> 대안: Supabase Storage (1GB 무료) — 첨부 적으면 충분. R2 없이도 동작은 함.

### 1-5. Google Gemini API 키 (AI 비서용)
- https://aistudio.google.com → "Get API key"
- 무료 한도:
  - `gemini-3.1-flash-lite`: 일 1,000 RPD
  - `gemini-2.5-flash`: 일 100 RPD
- API 키 1개 발급 → 메모

### 1-6. 도메인 (선택)
- 한국 도메인: hosting.kr / 가비아 등 (`yourname.com` ~ 1.5만원/년)
- DNS 설정은 Vercel 가이드대로:
  - A 레코드: `76.76.21.21` (Vercel)
  - CNAME `www`: `cname.vercel-dns.com`
- 또는 도메인 없이 `your-app.vercel.app` 그대로 사용 가능

### 1-7. (선택) iOS PWA 아이콘 만들기
- `public/source.png` (512×512 이상) 두면 `scripts/generate-icons.ts`가 자동 생성

---

## 2. 코드 가져오기

```bash
git clone https://github.com/<your-username>/fpctalk.git
cd fpctalk
npm install
```

> Node.js 18+ 권장 (20+ 추천).

---

## 3. 환경변수 등록 (Vercel + 로컬 `.env`)

다음 13개를 **Vercel Settings → Environment Variables**에 등록 (로컬 `.env`도 동일):

```bash
# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ── DB (Prisma) ──
DATABASE_URL="postgresql://postgres.xxx:PASSWORD@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.xxx:PASSWORD@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"

# ── AI (Gemini) ──
GEMINI_API_KEY=AIza...
AI_MODEL_FAST=gemini-3.1-flash-lite
AI_MODEL_PRO=gemini-3.1-flash-lite
AI_PROVIDER=gemini

# ── 스토리지 (R2 권장) ──
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=myacademy-storage

# ── 앱 ──
NEXT_PUBLIC_APP_NAME=내학원
NEXT_PUBLIC_APP_URL=https://your-domain.com

# ── Web Push (VAPID) — 아래 명령으로 발급 ──
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@yourdomain.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...   # PUBLIC_KEY 와 동일

# ── Cron 보안 (선택) ──
CRON_SECRET=<openssl rand -hex 32 결과>

# ── 솔라피 문자 발송 (선택) — https://console.solapi.com ──
# 외부 사인 요청에 전화번호를 입력하면 사인 링크를 문자로 자동 발송.
# 없으면 문자만 건너뛰고 나머지는 정상 동작 (링크 수동 복사 방식).
SOLAPI_API_KEY=...        # 콘솔 → API Key 관리
SOLAPI_API_SECRET=...     # 생성 시 1회만 노출 — 즉시 저장
SOLAPI_SENDER=01012345678 # 솔라피에 사전 등록(본인인증)한 발신번호
```

### VAPID 키 발급
```bash
npx web-push generate-vapid-keys
```
- 결과의 `Public Key` → `VAPID_PUBLIC_KEY` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `Private Key` → `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`는 `mailto:` 으로 시작하는 본인 이메일

### Supabase 키 위치
- Project Settings → API
  - URL → `NEXT_PUBLIC_SUPABASE_URL`
  - `anon` `public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `service_role` `secret` → `SUPABASE_SERVICE_ROLE_KEY`
- Project Settings → Database → Connection string
  - **Transaction pooler** (port 6543) → `DATABASE_URL` (앱 런타임)
  - **Session pooler** (port 5432) → `DIRECT_URL` (Prisma 마이그레이션용)

---

## 4. 데이터베이스 셋업

### 4-1. Prisma 스키마 push
```bash
npx prisma db push
npx prisma generate
```

### 4-2. Realtime publication 활성화 (필수)
Supabase SQL Editor에서:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE "Message";
```

### 4-3. (Supabase Storage 사용 시) 버킷 생성
```sql
-- documents 버킷 (PDF 사인용)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT DO NOTHING;
-- MIME 제한 해제 (한글파일 등 자유 업로드)
UPDATE storage.buckets SET allowed_mime_types = NULL WHERE id = 'documents';

-- signatures 버킷 (서명 PNG)
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', false)
ON CONFLICT DO NOTHING;
```
(R2 사용 시는 불필요 — 버킷은 Cloudflare에서 이미 만듦)

### 4-4. 시스템 역할 + 첫 관리자 시드
```bash
npx tsx scripts/seed-roles.ts
npx tsx scripts/setup-admin.ts
```
- `setup-admin`이 출력하는 **임시 비밀번호**를 잘 적어두기
- 첫 로그인: `admin` / 출력된 비번
- 로그인 후 즉시 `/settings/password`에서 변경

---

## 5. Vercel 배포

```bash
git push origin main
```
- Vercel이 자동 감지·빌드·배포
- 처음 배포 후 **Settings → Domains**에 도메인 연결 + DNS 설정
- 약 5~30분 후 SSL 자동 발급

### 한 가지 더 — Cron 활성화
- `vercel.json`의 `crons`가 자동 등록됨
- Vercel UI: Project → Settings → Crons에서 확인
- 첫 실행은 다음 스케줄(매일 UTC 16:00 = KST 01:00)부터

---

## 6. 첫 관리자 셋업 후 바로 할 일

### 학원 정보 커스터마이징
- `app/(auth)/login/page.tsx` 등 학원명 표시 부분 수정
- 사이드바 로고/푸터 (`_components/sidebar.tsx`)
- AI 비서의 system prompt — `lib/ai.ts` `AI_GUARDRAIL` 안 학원명
- assistant prompt — `app/(main)/assistant/actions.ts` 학원명
- PWA manifest — `app/manifest.ts` 색상·이름·shortcuts

### PWA 아이콘
1. `public/source.png` 1024×1024 그라데이션·로고
2. `npx tsx scripts/generate-icons.ts`
3. `public/icons/*` 자동 생성 → 자동 배포

### 시스템 6개 역할 라벨 한국어로
- `npx tsx scripts/seed-roles.ts` 한 번 더 (이미 idempotent)
- 또는 `/admin/roles`에서 직접 라벨 수정

---

## 7. 운영 중 자주 쓰는 명령

### admin 비번 분실 시
```bash
npx tsx scripts/reset-admin-password.ts
```
출력된 새 비번으로 로그인.

### DB 백업 (Supabase free는 7일 자동 백업)
- Supabase Dashboard → Database → Backups에서 다운로드

### R2 사용량 모니터링
- Cloudflare Dashboard → R2 → 버킷별 GB
- 9.5GB 도달 시 channel·old image 정리 또는 plan 업

---

## 8. 자주 발생하는 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| 로그인 후 403 | Supabase Auth와 Prisma `User` 동기화 안 됨 → `setup-admin.ts` 다시 실행 |
| Realtime 채팅 안 옴 | publication 등록 안 됨 → 4-2 SQL 실행 |
| 푸시 알림 도착 안 함 | VAPID 환경변수 4개 모두 등록됐는지 확인 (특히 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) |
| iOS 홈 화면 추가 후 알림 안 됨 | iOS는 PWA 상태(standalone)에서만 푸시 가능 — Safari 브라우저로는 불가능 |
| 크롬에서 메시지 "전송 중..." 영영 | 광고 차단 확장 프로그램이 Realtime WebSocket 차단 — 사용자에게 차단 해제 또는 시크릿창 권유 |
| `prisma db push` 실패 | DB 비번에 특수문자 있음 → Supabase에서 영문+숫자 비번으로 재설정 |
| 한글 파일명 PDF 깨짐 | `lib/fonts.ts`가 jsDelivr CDN에서 Noto Sans KR 자동 fetch — 첫 호출만 느림 |
| AI 호출 한도 초과 | Vercel 환경변수 `AI_MODEL_FAST`/`AI_MODEL_PRO`를 `gemini-3.1-flash-lite`로 (1,000 RPD) |

---

## 9. 비용 시뮬레이션 (학원 30명, 1년)

| 항목 | 무료 한도 | 예상 사용량 | 비용 |
|---|---|---|---|
| Vercel Hobby | 100GB egress, 1 cron | < 5GB, cron 1개 | $0 |
| Supabase Free | DB 500MB, Realtime 200동시 | < 200MB, < 30 동시 | $0 |
| Cloudflare R2 | 10GB + egress 무료 | 첨부 누적 ~5GB | $0 |
| Gemini API | 1,000 RPD | 직원 50회/일 × 30명 = 1,500 | **$0.5~1** (paid) |
| 도메인 | — | `.com` | 1.5만원/년 |
| **합계** | | | **연 ~2.5만원** |

> Gemini는 30명 활발히 사용하면 무료 한도 살짝 초과. paid plan 활성화 권장 ($0~5/월).

---

## 10. 핵심 파일 한눈에 (학원별 커스터마이징)

```
app/manifest.ts                # PWA 이름·색상·shortcuts
public/source.png              # PWA 아이콘 원본 (1024×1024 권장)
lib/ai.ts                      # AI 비서 system prompt (학원명)
app/(main)/assistant/actions.ts # 학원장 비서 system prompt
app/(auth)/login/page.tsx      # 로그인 페이지 학원명
app/(main)/_components/sidebar.tsx # 사이드바 메뉴
prisma/schema.prisma           # DB 스키마 (역할·필드 추가 시)
.env                           # 환경변수
vercel.json                    # cron schedule
scripts/seed-roles.ts          # 시스템 역할 라벨
scripts/setup-admin.ts         # 첫 관리자 시드
```

---

## 11. 추가 참고

- 본 프로젝트는 Next.js 16 + Prisma 6 + Supabase + Tailwind 4 기반
- 기존 운영 인스턴스: https://www.fpctalk.com
- 기존 GitHub: https://github.com/cogogema86-cmd/fpctalk
- 작업 이력: `WORK_LOG.md`
- 관리 정책: `project_fpctalk.md` (Claude memory)

새 학원 셋업 후 첫 1주일은 admin이 직원 추가, 역할 셋업, 채팅 시범 운영하면서 익숙해지는 시간이 필요합니다. 그 후 노무사 엑셀 export, 사인 캠페인 등 본격 활용 권장.
