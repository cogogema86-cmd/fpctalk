# FPCTalk 작업 로그 (2026-05-10 세션)

다음 세션에서 이어 작업할 때 참고하세요. 모든 변경은 main 브랜치에 푸시되어 Vercel(www.fpctalk.com)에 자동 배포됨.

> **새 학원 재현이 필요하면**: 같은 위치의 `SETUP_GUIDE.md` 참고. 처음부터 셋업하는 단계별 안내.

---

## ✅ 2026-06-14 — 보안 점검 & 하드닝 (외부 해킹 대비) (`ab4e778`)
- **요청**: "외부에서 해킹등 보안에 철저했으면 좋겠습니다." → 4개 서브에이전트(authz/IDOR/시크릿·미들웨어/인젝션·XSS) 병렬 감사 + 코드 검증.
- **RLS 검증 (가장 중요·이상무)**: 공개 anon 키(클라 번들에 노출됨)로 Supabase REST(`/rest/v1/User` 등) 직접 조회 시도 → 모든 민감 테이블 **HTTP 401 / 42501(insufficient_privilege)**. Prisma 생성 테이블에 `anon` 역할 권한이 없어 외부 PostgREST 접근 원천 차단. 앱은 Prisma 직결로만 DB 접근. → **외부에서 데이터 직접 읽기 불가 확인**.
- **파일 서빙 권한 양호**: `/api/files`(uploader/signer), `/api/chat/file`(멤버/레벨), `/api/sign-files`(랜덤 토큰+만료+SIGNED차단) 모두 정상.
- **수정 4건 (배포됨)**:
  - `next.config.ts`: 전역 보안헤더(X-Content-Type-Options:nosniff, X-Frame-Options:SAMEORIGIN, HSTS 2y, Referrer-Policy, Permissions-Policy) + `poweredByHeader:false`(X-Powered-By 제거). 업로드 파일 라우트(`/api/files|chat/file|sign-files`)엔 **CSP `sandbox`**로 SVG/HTML 저장형 XSS(스크립트 실행) 차단. → 로컬 prod 서버 curl로 적용 확인.
  - `chat/actions.ts` `submitOrderResponseAction`: 채팅 접근권한 체크(`canAccessForPolling`) 추가 — **IDOR(비멤버가 messageId로 주문응답 주입) 방지**.
  - `login/actions.ts`: 인증 실패 메시지 일반화("아이디 또는 비밀번호가 올바르지 않습니다") — 계정 열거·Supabase 내부정보(status/email) 누출 차단. 상세는 서버 콘솔 로그로만.
  - `keepalive/route.ts`: 응답에서 `users`(사용자 수) 제거 — 공개 엔드포인트 정보누출 방지.
- **검증**: `tsc --noEmit` 0 에러, `next build` 성공, 로컬 prod 헤더 curl 확인.
- **사용자 조치 (2026-06-14 완료)**:
  - ① **CRON_SECRET 적용 완료** — Vercel 환경변수 설정 + keepalive 라우트에 `?key=` 쿼리 인증 추가(`661edbe`). 검증: 키없음/틀린키→401, 올바른키→200. cron-job.org "FPCTalk keepalive" 작업 URL을 `?key=<secret>` 포함으로 교체(테스트 200 OK). 시크릿 값은 Vercel 환경변수에만 보관(이 로그엔 미기재). Vercel/외부 cron 둘 다 정상.
  - ② **Supabase 무차별대입 방어 확인 — 추가조치 불필요**: Auth Rate Limits의 "sign-ups and sign-ins = 30 req/5min per IP"(시간당 360)가 기본 적용 중. 학원은 사무실 공유 IP라 더 낮추면 직원 로그인 막힘 → **현 기본값 유지**. Attack Protection의 Captcha는 **켜면 안 됨**(로그인 폼에 캡차 위젯 없어 전체 로그인 차단됨). leaked-password 차단은 무료면 켜기 선택.

### 후속: Next.js 16.2.4 → 16.2.9 보안 패치 업그레이드 (`f740674`)
- 미들웨어 관련 보안 권고 패치 포함. 같은 마이너 내 패치라 회귀 위험 낮음. 안전 위해 `chore/next-16.2.9` 브랜치 작업 후 ff-merge.
- **검증**: `tsc --noEmit` 0에러, `next build` 성공, 로컬 prod 스모크(로그인 200·보안헤더·keepalive DB조회), 배포 후 프로덕션 재확인 모두 통과.
- **남은 npm audit (의도적 미수정)**: esbuild/tmp/tsx(=dev server·빌드 도구), postcss/next(빌드타임 CSS) — 전부 **빌드/개발 시점 전용이라 라이브 사이트 외부 공격면 아님**. next의 안정 최신이 16.2.9이고 audit가 요구하는 수정본은 16.3 canary뿐. `npm audit fix --force`는 next를 9.x로 다운그레이드시키므로 **금지**.

## ✅ 2026-06-14 — 관리자 AI 모델 실시간 선택 (`9f169b2`)

- 배경: 제미나이 모델명이 자주 바뀌는데 env var(`AI_MODEL_FAST/PRO`)라 매번 재배포 필요. → 관리자 화면에서 바꿔 저장하면 재배포 없이 즉시 반영되게.
- 구현:
  - `AppSetting`(key-value) 모델 추가 (`@@map("app_settings")`), db push.
  - `lib/app-settings.ts`: `getAiModels()`(DB→env→기본값 폴백)/`setAiModels()`. 키 `ai.modelFast`·`ai.modelPro`. 기본값 `gemini-3.1-flash-lite`.
  - `lib/ai.ts callGemini`: 모델명을 env 직접 대신 `await getAiModels()`로 호출마다 읽음 → 실시간.
  - `/admin/ai` 페이지(`page.tsx`+`_form.tsx`+`actions.ts`): Fast/Pro 입력(추천 datalist) + **연결 테스트 버튼**(`testAiModelAction` — 실제 Gemini 호출로 ✅/❌) + 저장(`setAiModelsAction`, admin 가드).
  - 사이드바 관리 섹션 '🤖 AI 설정' + i18n `nav.adminAi`.
- 라이브 검증(2026-06-14): 화면 렌더 OK / 연결테스트 유효모델 ✅"안녕하세요." · 가짜모델 ❌오류 / 저장 후 DB row updatedAt 갱신 확인(즉시 반영). 현재 값=gemini-3.1-flash-lite(정상).
- **사용 안내(사용자)**: 모델 바뀌면 /admin/ai에서 새 모델명 입력 → 연결 테스트 ✅ 확인 → 저장. 끝(재배포 불필요). Vercel `AI_MODEL_*` env는 이제 폴백용일 뿐.
- **후속2(`0dd3bec`)**: 관리자 전용 **제미나이 API 키 관리** 추가. AppSetting `ai.geminiApiKey`. `getGeminiApiKey()`(DB→env), `set/clearGeminiApiKey`, `getGeminiApiKeyStatus`(source+마스킹). lib/ai.ts·actions가 process.env 직접 대신 `getGeminiApiKey()` 사용. /admin/ai에 '🔑 API 키' 섹션(`_api-key.tsx`): 출처/끝4자리만 표시, password 입력→저장(`setGeminiApiKeyAction`), 삭제(env 복귀). 키 전체 재노출 안 함. 유료 전환 대비 미리 구현. 라이브 검증: "현재 키: 환경변수 사용 중 (••••sGMs)" 표시 확인.
- **참고(무료 등급)**: gemini-3.1-pro-preview 등 **Pro/preview 모델은 무료 등급 할당량 0 → 첫 호출에 429**. Flash/Lite만 무료 동작. 사용자는 Fast/Pro 둘 다 flash-lite로 운영.
- **후속(`4b9ef8f`)**: 사용 가능 모델 **실시간 목록 조회** 추가. `listGeminiModelsAction`이 구글 ListModels API(`v1beta/models?key=`)로 generateContent 지원 gemini 모델 조회 → AI 설정 화면 진입 시 자동 로드 + '🔄 새로고침'. Fast/Pro 각 필드에 '목록에서 선택' 드롭다운(실시간) + 직접 입력칸 유지. 라이브 검증: 28개 모델 조회·표시 확인(gemini-3.5-flash, gemini-3.1-pro-preview, gemini-flash-latest 등).

---

## ✅ 2026-06-13 오후 — 디지털 사인: 우측 하단 고정 합성 + 이미지 양식 지원

| 커밋 | 내용 |
|---|---|
| `8141ef8` | **사인을 문서 우측 하단에 직접 합성 + 이미지 양식 지원** — `lib/documents.ts submitSignature` 재작성. ① 기존 'PDF 맨 뒤 새 페이지(좌측)'→ **마지막 페이지 우측 하단 고정** 합성(서명자·날짜 캡션 + 흰 반투명 배경, IP/UA는 DB 보존) ② 이미지(jpg/png/webp)는 `sharp`로 PNG 정규화(1654px) → PDF 페이지로 변환 후 그 위에 사인 ③ 사인 화면 미리보기 이미지 `<img>` 렌더(외부 `/sign/[token]`, 내부 `_lang-viewer.tsx`) ④ HWP/DOCX 등 렌더 불가 포맷만 기존 증명서 PDF 유지 |
| `fa83916` | 업로드 안내문구 갱신 (PDF·이미지 우측 하단 합성) |

- **진단**: 이미지 업로드는 원래 막히지 않았음(폼·서버·R2 제한 없음). 사장님이 "안 된다"고 느낀 건 이미지에 사인하면 문서에 안 찍히고 별도 증명서만 생성됐기 때문 + 사인 화면에서 이미지 미리보기가 안 됐기 때문.
- **라이브 e2e 검증 (Playwright, 2026-06-13)**: 테스트 JPG 양식 업로드 → 외부 사인 토큰 → 캔버스 사인 → 합성 성공 → **사인본 PDF 우측 하단에 사인 정상 표시 확인**(스크린샷). 테스트 데이터·임시파일 모두 정리 완료.
- **사인 위치 상수** (`lib/documents.ts`): `rightMargin=36, bottomMargin=28, maxW=min(200, pw*0.42)`. 위치/크기 조정 요청 시 여기 수정.

### 후속: 이미지 업로드 "This page couldn't load" 수정 (`17042fe`, `8868dfa`)
- **진짜 원인 (재현·확정)**: 양식 업로드가 **서버 액션**으로 파일 전송 → Next 기본 본문 제한 **1MB** 초과 시 400(`This page couldn't load`). PDF 양식은 보통 1MB 미만이라 됐고, **사진(JPG)은 1MB↑라 실패**. (1.82MB JPG로 재현 → 수정 후 성공 재검증)
- 수정: ① `next.config.ts` `experimental.serverActions.bodySizeLimit="20mb"` ② 업로드 폼(`upload/_form.tsx`)에서 이미지 클라이언트 축소(긴 변 2200px, JPEG 0.85) 후 전송 — 큰 폰 사진도 안전. gif/svg·비이미지·HEIC 디코드 실패는 원본 유지.
- 교훈: **파일 업로드를 서버 액션으로 받으면 기본 1MB 제한**에 막힌다. 큰 파일은 bodySizeLimit 상향 + 클라 압축, 또는 route handler 사용.

### 후속3: 한글 글자 깨짐/흩어짐 최종 해결 — `6d2824c`
- 증상(사용자 실폰 크롬 PDF 뷰어): 사인 박스의 날짜·IP·서명자 글자가 흩어지고 깨짐. (pdf.js getTextContent 추출은 정상이었으나 PDFium 시각 렌더가 깨짐 → 글리프 폭 문제)
- 원인: `pdf-lib`의 **TrueType subset 임베드**가 PDFium/크롬에서 advance width/glyph 매핑이 깨짐.
- 수정: `embedFont(ko, {subset:true})` → `embedFont(ko)` **전체 임베드** (composite·cert 양쪽). 사인본 PDF +~700KB~1MB(폰트 전체)이나 정확성 우선.
- **최종 검증 (2026-06-14, pdf.js 캔버스 렌더 크롭)**: 직전 subset은 pdf.js가 아예 못 그렸는데, 전체 임베드 후 정상 렌더 확인 → "서명자: 이학부모 (외부) / 연락처: 010-2222-3333 / 일시: 2026-06-14 02:41:11 KST / IP: 218.38.214.85" 좌측 정렬 한 열로 깔끔히 표시. 크롬 뷰어도 동일 정상. 테스트 데이터·임시파일 정리.

### 후속2: 외부사인 404 수정 + 연락처 포함 + 한글폰트 나눔고딕 (최종 검증) — `2753109`→`70ae409`
- **외부 사인 후 404**: 사인 완료 시 accessToken을 null로 지워서, 서버액션 후 자동 RSC 새로고침 때 토큰 조회 null→notFound(404). 수정: 토큰 유지(재사인은 status로 차단) → 링크 재방문 시 "이미 사인 완료" 친절 페이지 정상 표시. (`2753109`)
- **외부 사인자 연락처**: 사인 박스에 `서명자` + `연락처(전화/이메일)` 줄 추가 (관리자 입력값 기반 식별). `signerContact = [externalPhone, externalEmail]`. (`2753109`)
- **🔴 한글 폰트 = 나눔고딕 전체본** (`70ae409`): 직전 번들한 notofonts `NotoSansKR-Regular.otf`가 **SubsetOTF(부분 글리프)**라 일부 한글만 렌더(일시/연락처 라벨·이름 깨짐, pdf.js로 발견). → `assets/NanumGothic-Regular.ttf`(2.05MB, 현대 한글 11,172자 전부)로 교체. lib/fonts.ts·next.config·CDN폴백 갱신. **notofonts SubsetOTF 절대 쓰지 말 것.**
- **최종 라이브 e2e + PDF 텍스트 추출 검증 (2026-06-14)**: 외부사인(김보호자/010-9876-5432) → 사인본 PDF의 pdf.js getTextContent로 추출 = `["서명자: 김보호자 (외부)","연락처: 010-9876-5432","일시: 2026-06-14 02:18:42 KST","IP: 218.38.214.85"]` — 한글 완벽, 404 없음, 완료 화면 정상. (pdf.js 캔버스 렌더는 이 폰트를 화면에 안 그리는 버그 있으나 PDF 텍스트는 정상 → 크롬 뷰어선 정상 표시). 테스트 데이터·임시파일 정리 완료.

### 후속: 사인+증빙정보를 문서 우측 하단에 통합 (최종) — `fc52cad`→`b212d2c`→`a3b2907`
- 진행: ① 감사 페이지를 별도로 붙임(`fc52cad`) → ② 라이브 테스트 중 **감사 페이지 한글 깨짐 발견** (한글 폰트 CDN fetch 실패 → ASCII 스트립) → ③ **한글 폰트 로컬 번들**로 수정(`b212d2c`): `assets/NotoSansKR-Regular.otf`(4.6MB) repo 포함, `lib/fonts.ts` 로컬 우선 로드, `next.config.ts outputFileTracingIncludes`로 Vercel 함수 번들 포함 → ④ 사용자 재요청 "별도 페이지 말고 우측 하단에 사인+날짜+IP 통합" → **별도 감사페이지 제거하고 우측 하단 박스에 [사인+서명자+일시(KST)+IP] 통합**(`a3b2907`).
- **최종 사인본 = 1페이지**: 원본 문서(이미지는 PDF변환) 마지막 페이지 우측 하단 흰 박스에 사인 이미지 + "서명자: …" + "일시: YYYY-MM-DD HH:MM:SS KST" + "IP: …". 서명자/IP/UA는 DB에도 보존.
- **라이브 e2e + PDF 파싱 검증 (2026-06-14)**: 1.2MB 사진 양식 업로드→외부사인→사인본 PDF 파싱 결과 `pages:1`, BaseFonts에 `NotoSansKR-Regular`(한글 폰트 임베드됨), FontFile 스트림 1개 → 한글 정상 렌더 확정. 테스트 데이터·임시파일 정리 완료.
- 위치/크기 상수(`lib/documents.ts`): rightMargin=28, bottomMargin=24, maxSigW=min(190,pw*0.45), maxSigH=64, metaSize=7.5.

---

## ✅ 2026-06-13 오후 — Supabase 7일 자동정지 방지 (keepalive cron)

| 커밋 | 내용 |
|---|---|
| `18d1e43` | **`/api/cron/keepalive`** — 매일 09:00 KST(UTC 00:00) 가벼운 `SELECT 1` + user.count로 Supabase 활성 신호. 메시지 미생성. 외부 핑(cron-job.org)도 호출 가능하도록 읽기전용·무해. vercel.json crons에 추가 |
| `96e22fc` | **🔑 진짜 근본 원인 수정** — 미들웨어 matcher가 `/api/cron/*`도 잡아서, 세션 없는 cron 호출이 `/login`으로 **307 리다이렉트**됨 → 기존 cleanup cron도 **DB 조회를 한 번도 못 했음**. `/api/cron`을 PUBLIC_PATHS에 추가해 해결 |

- **원인 확정 (사용자 확인)**: 7일 무활동 시 **전체 앱 정지(로그인·채팅 전부 안 됨)** → Supabase 무료 플랜 7일 비활성 자동 일시정지.
- **진짜 원인**: cleanup cron이 존재했는데도 정지가 계속된 이유 = 미들웨어가 cron 호출을 `/login`으로 튕겨 DB에 도달 못 함. (curl로 307 확인 → middleware 수정 → 200 `{ok:true, users:5}` 확인)
- **검증 완료 (2026-06-13)**: `curl https://www.fpctalk.com/api/cron/keepalive` → `{"ok":true,"users":5}` HTTP 200. DB 조회 정상.
- ⚠️ **남은 액션 (사용자, 권장)**: ① cron-job.org 등 외부 핑에 `https://www.fpctalk.com/api/cron/keepalive` 매일 1회 등록 (Vercel Hobby cron 불안정 대비 이중 안전망) ② Vercel 대시보드에서 cron 실행 기록 확인. 근본해결은 Supabase Pro($25/월, 자동정지 없음)이나 비용상 보류.

---

## ✅ 2026-06-13 — 기능 묶음 5건 (#2 행사수정 / #3 메시지검색 / #5 직원비활성화 / #6 결근지각조퇴 / #7 일반파일첨부) + #4 검증

| 커밋 | 내용 |
|---|---|
| `56280b3` | **#6 결근/지각/조퇴 LeaveType + User.active** — LeaveType enum에 ABSENT/TARDY/EARLY_LEAVE 추가(연차 차감 0). 관리자 매트릭스(`_grid.tsx`)·엑셀 export·휴가목록·승인페이지 라벨/색상. 엑셀 결근 컬럼 자동 카운트. 직원 자가신청 폼은 6종 유지(`ADMIN_LEAVE_TYPES` 분리). User.active Boolean 추가 + db push |
| `a661816` | **#5 직원 비활성화/재활성화** — `setStaffActiveAction`(본인 비활성화 방지). 직원목록 비활성 배지+토글(`_components/active-toggle.tsx`). 로그인 차단: login action + 메인 레이아웃 active 체크 후 signOut. 선택목록(DM/그룹/매트릭스/엑셀/사인대상/레벨채팅 멘션·unread)에서 비활성 제외 |
| `2c229e3` | **#7 일반 파일 첨부** — 업로드 라우트 image/video 외 일반파일 허용(최대 20MB, 보관 90일). 클라 accept 해제·크기검증. 렌더(다운로드 링크)·만료 cron은 기존 file 처리 재사용 |
| `0540e02` | **#3 메시지 검색** — `searchMessagesAction`(content 부분일치, 대소문자무시, 최신 100건). `_chat-room` 헤더 🔍 토글+입력+결과패널. 결과 클릭 시 해당 메시지로 스크롤+amber ring (로드 안 된 옛 메시지는 안내) |
| `88013de` | **#2 행사 수정** — `updateEventAction`(관리자, 제목/기간/장소 + sourceMessage metadata 동기화 + ack멤버 변경 푸시). 캘린더 월별 목록에 ✏️수정 버튼 + 모달(`EventEditModal`). 삭제는 기존 `deleteEventAction` 이미 존재 |

### #4 그룹 멤버 추가/삭제 — 검증 결과 (구현 안 함, 사용자 결정)
- **레벨 채팅**: 멤버 관리 불필요 — `User.role.defaultLevel >= Chat.levelRequired`로 자동 보임/숨김. **레벨 수정으로 자동 처리됨(사용자 추측 정확)**.
- **명시적 그룹**: 레벨 무관. 만든 뒤 멤버 추가 불가, 삭제는 본인 나가기만. → 사용자가 "안 만든다(레벨로 충분)" 선택. 코드 변경 0.

### 기본값 결정 (사용자 위임)
- #6: ABSENT/TARDY/EARLY_LEAVE 모두 연차 차감 0
- #7: 일반 파일 최대 20MB, 보관 90일

### 검증
- 전 기능 `tsc --noEmit` 통과. Vercel 빌드 통과 후 라이브 점검 예정.
- 스키마 변경: `User.active Boolean @default(true)`, LeaveType +3종. `prisma db push` 완료.

---

## ✅ 2026-06-12 — 채팅 날짜 구분선

| 커밋 | 내용 |
|---|---|
| `c2d39b5` | **카카오톡 스타일 날짜 구분선** — `_chat-room.tsx`에 `DateDivider` 컴포넌트 + `isSameLocalDay()` 헬퍼. 날짜가 바뀌는 첫 메시지(맨 첫 메시지 포함) 위에 가운데 둥근 칩으로 "2026년 6월 12일 금요일" 표시. locale 토글 따라 ko/en 자동 전환. 기존 "여기서부터 안 읽음" 빨간 구분선과 공존 |
| `fb89103` | **스크롤 중 우측 상단 떠다니는 날짜 칩** — 각 메시지를 `data-msg-date` div로 감싸고, onScroll(rAF 스로틀)에서 화면 상단에 걸친 첫 메시지의 날짜를 찾아 sticky `h-0` 칩(레이아웃 영향 없음)에 표시. 스크롤 멈추면 1.2초 후 opacity transition으로 사라짐. `formatDateLabel()` 헬퍼로 DateDivider와 포맷 공유 |
| `a3fa9a3` | **칩 짜부라짐 수정 + 디자인 개선** — 실폰에서 칩 높이가 0으로 눌려 글자가 배경 밖으로 넘침 (`h-0` flex 컨테이너의 기본 stretch 정렬 탓) → `items-start`로 자연 높이 복원. 검은 반투명 → 흰 배경 95% + 회색 테두리 + 진한 글씨 12px medium (가운데 날짜 구분선과 톤 통일) |

- 배경: 메시지에 시각(오후 4:15)만 있고 날짜가 없어 언제 글인지 확인 어려움 (사용자 카톡 스크린샷 2장 참고 요청)
- 라이브 검증 (Playwright): 날짜 구분선 8개 지점 정상 삽입 ✅ / 스크롤 시 칩 opacity 1 표시 → 멈춤 후 opacity 0 사라짐 ✅ / 모바일 390×844 칩 높이 30px·뷰포트 안 ✅
- **사용자 실폰 확인 완료 (2026-06-12)** — "잘 나옵니다"
- ⚠️ 교훈: `h-0` flex 컨테이너 안에 칩 띄울 땐 `items-start` 필수 — 기본 stretch가 자식 높이를 0으로 누름. Playwright 데스크탑 검증에선 opacity/텍스트만 봐서 못 잡았음 → 시각 요소는 실기기 스크린샷 검증까지

### 다음 작업 후보 (사용자와 논의 예정)
1. 직원에게도 D-7 행사 알림 (대시보드가 admin 전용이라 직원이 못 봄)
2. 행사 수정/삭제 화면
3. 메시지 검색
4. 그룹 멤버 추가/삭제
5. 직원 비활성화/삭제
6. 결근/지각/조퇴 LeaveType 추가
7. 채팅 일반 파일 첨부 (현재 이미지/동영상만)

---

## ✅ 2026-05-18 — AdSense 사이트 검증 (이전 세션, 로그 누락분 보충)

| 커밋 | 내용 |
|---|---|
| `edf55bf` | AdSense **메타 태그** 추가 — `<meta name="google-adsense-account" content="ca-pub-2976423366068371">` (SSR로 head에 즉시 들어가 크롤러 인식 보장) |
| `6b7f0a1` | AdSense `adsbygoogle.js` 스크립트 스니펫 (next/script afterInteractive — 실제 광고 노출용) |
| `0e8c8ff` | fix(ai/chat): 날짜 필터 — 명시 없으면 오늘 발화만 인용 |
| `0057763` | 진행 중 사인 캠페인 카드에 사인자 이름 표시 |

**교훈**: `next/script` + afterInteractive는 정적 HTML head에 실제 `<script>`가 안 들어가 AdSense 크롤러가 인식 못 함 → 3rd-party 검증 토큰(naver, GSC 등)은 메타 태그로 처리할 것.

---

## ✅ 2026-05-11 저녁 — QuickPhrases (자주 쓰는 문구 칩)

| 커밋 | 내용 |
|---|---|
| `46e0df9` | **채팅 입력창 위 빠른 문구 칩** — `_quick-phrases.tsx` 신규. 가로 스크롤 chip + 우측 ✏️ 관리 모달. 클릭/터치 시 textarea 커서 위치에 즉시 삽입(앞 공백 자동). 화면 너비에 자연 fit (모바일 2~3개, PC 6~7개 viewport에 노출 + 가로 스크롤). |

### 저장 정책
- **localStorage per-device** (`fpctalk:quickPhrases:v1`) — 폰/PC가 각각 다른 phrase를 가질 수 있어 자연스러움. DB 동기화는 차후 필요 시.
- **시드** (처음 진입 시 7개, locale별):
  - ko: 확인했습니다 👍 / 감사합니다 / 잠시만요 / 수고하셨습니다 / 오늘 결근입니다 / 회의 중입니다 / 이따 답변드릴게요
  - en: Got it 👍 / Thanks / One moment / Good work / Out today / In a meeting / Will reply later

### 관리 모달 (✏️ 버튼)
- 추가 (Enter or [추가] 버튼) — 200자 제한, 중복 무시
- 인라인 편집 / 삭제 / ▲▼ 순서 이동
- ESC로 닫기

### 삽입 동작
- `inputRef.current` (uncontrolled textarea) — native `value` setter + `input` 이벤트 dispatch로 React state와 무관하게 동작
- 커서 앞에 공백이 없으면 자동으로 공백 한 칸 prepend (단어 붙기 방지)
- 삽입 후 커서를 삽입 끝으로 + textarea focus

### 라이브 검증 (Playwright)
- 데스크탑 1280×800: 시드 7개 + ✏️ 버튼 노출, 칩 클릭 시 `"오늘"` → `"오늘 확인했습니다 👍"` 정상 삽입
- 모바일 390×844: viewport에 3개 노출 + `isScrollable: true` 가로 스크롤 ✅
- 모달 추가/삭제 흐름 정상 — localStorage round-trip 검증

i18n: `chat.quickPhrases.*` 8개 키 (ko/en).

---

## ✅ 2026-05-11 오후 — 개인 일정 + AI 자동응답 + 채팅 관리 묶음

### A. 개인 일정 (PersonalEvent — 본인만 보는 비공개 일정)

| 커밋 | 내용 |
|---|---|
| `22ce48b` | **Prisma + helpers + actions** — `PersonalEvent` 모델(userId/title/startAt/endAt/allDay/note) + db push. `lib/personal-events.ts`(getMonthlyPersonalEvents, getUpcomingPersonalEvents, getPersonalEventsForAiContext). `attendance/personal-actions.ts`(add/update/delete, userId 가드) |
| `25ca3b5` | **캘린더 셀 클릭 모달 + 4번째 토글 + D-7 카드** — `_personal-event-modal.tsx`(목록+추가/편집/삭제), 캘린더에 보라색 📌 일정 셀 노출, 4번째 카테고리 토글 "내 일정", `/attendance`+`/dashboard` 상단에 `UpcomingPersonal` D-7 카드. localStorage 토글 영속화 |
| `cb27d26` | **AI 비서가 본인 일정 인지** — `/assistant` system prompt에 PERSONAL_EVENTS + 오늘 날짜 주입. D-day 임박 시 능동 안내 가능. **그룹 채팅 @AI는 미주입**(다른 직원 노출 방지) |

**정책**: 본인 일정은 본인만 노출. AI 비서는 학원장(레벨 3+)만 사용 가능하므로 안전. 일반 직원은 본인 캘린더 + 본인 D-7 카드로만 확인.

### B. 채팅 관리 강화

| 커밋 | 내용 |
|---|---|
| `6ef2c11` | **관리자 전용 "방 삭제" 버튼** — `deleteChatAction` + `DeleteChatButton`(빨간 🗑). 레벨 자동 공개 채팅도 admin이면 삭제 가능. prisma cascade로 ChatMember/Message 일괄 정리 |
| `b4bc485` | **채팅방별 "AI 자동 응답" 토글 (관리자 전용)** — `Chat.aiAutoReply` 필드 + db push. `setChatAiAutoReplyAction`. 헤더에 admin 전용 토글(`_ai-autoreply-toggle.tsx`). `isQuestionLike()`(?/`어떻게/뭐/언제/누가/왜/얼마/어느/할까/하나요/되나요` + how/what/where/when/who/why/which) → @AI prefix 없어도 AI 자동 답변. 켜진 방엔 emerald banner 노출 |
| `e759079` | **AI 답변 포맷 개선** — system prompt에 항목별 한 줄 + `→` 한 줄 요약 가이드 + 예시. 시간 `MM-DD HH:MM` 짧은 형식. 전체 6줄 이내. 채팅 @AI(triggerChatAi) + /assistant(askAssistant) 둘 다 적용 |

**자동 응답 흐름 (라이브 검증 ✅)**:
> A 선생님 오전: "김신 개별하원합니다"
> 오후에 누가: "오늘 누가 개별 하원?"
> AI: 한 줄씩 인용 + 마지막에 "→ 오늘 개별 하원: 김신"

### C. 캘린더 토글 + PWA 안정화

| 커밋 | 내용 |
|---|---|
| `2290b24` | **캘린더 카테고리 체크박스 토글** — `_calendar.tsx`를 client로 전환. 내 휴가/동료 휴가/학원 행사 각각 끄기 가능. localStorage 영속화(`fpctalk:calendar:visible`). 관리자만 "동료 휴가" 토글 노출 |
| `d81a4b1` | **middleware: PWA manifest/sw.js 매처 제외** — 인증 미들웨어에 `manifest.webmanifest`/`sw.js` 추가해 미인증 브라우저도 manifest fetch 가능. PWA 설치 prompt 정상화 (이전 307 → 200) |
| `d0ac39d` | **InstallBanner "나중에" 24h 견고화** — `dismissedRef` in-memory flag + localStorage **+** sessionStorage 양쪽 저장 + `beforeinstallprompt` 핸들러 시점 재체크. 라이브 검증(데스크탑/모바일 viewport): dismiss 후 페이지 이동/새로고침 X, 23h 안 X, 25h 후 다시 ✅ |

### D. 라이브 검증 (Playwright)

- AI 자동응답 ON 상태에서 "오늘 개별 하원하는 친구 누구인가요?" → AI가 채팅 컨텍스트에서 "김파커님이 05-11 04:56에 '김신 개별하원합니다'..." 인용 + "→ 오늘 개별 하원: 김신" 요약. `hasNewline: true`, `hasArrow: true` ✅
- InstallBanner 모바일(390×844): 배너 bottom=780px(모바일 nav top 789 바로 위), dismiss + 24h 시뮬레이션 모두 정상

---

## ✅ 2026-05-11 (UX 묶음: 모바일 nav + PWA 아이콘 + 이미지 압축 + 매트릭스 검색 + i18n 폴리시)

| 항목 | 내용 |
|---|---|
| 모바일 하단 nav 축소 | `mobile-nav.tsx` — `min-w-[6.75rem] py-3 px-4` → `flex-1 min-w-[3.4rem] py-2 px-1` + 아이콘/라벨 폰트 축소. 한 화면에 6개 메뉴(채팅·문서·캘린더·홈·설치·AI) 모두 보임 |
| PWA 폴백 아이콘 재디자인 | `scripts/generate-icons.ts` brandSvg를 녹색 그라데이션 + 흰 말풍선 + 진녹색 "FPC" + 골드 타이핑 점 3개로. source.png 없을 때 폴백 |
| 아이콘 8종 재생성 | icon-192/-512/-maskable-512, apple-touch-icon 5종, favicon. `npx tsx scripts/generate-icons.ts` 1회 실행 |
| 채팅 이미지 자동 압축 | `/api/chat/[chatId]/upload`에 sharp 압축 추가 — JPEG/PNG/WebP/HEIC/AVIF 등 → 긴 변 1920px, JPEG 85% (mozjpeg). GIF/SVG는 그대로. 압축 결과가 원본보다 크면 원본 유지 (이미 작은 이미지). EXIF rotate 자동 적용. R2 비용·네트워크 절감 |
| 근태 매트릭스 검색/필터 | `/admin/attendance` `_grid.tsx`에 직원 이름/아이디 search + 역할 select 추가. 결과 카운트 표시. 직원 늘어나도 빠른 탐색 |
| 남은 i18n 폴리시 | 사전(dictionary.ts)에 ~90개 키 추가(ko/en). 적용: `/attendance/_leave-form.tsx`, `_leave-list.tsx`, `/admin/roles/page.tsx`, `_components/create-role-form.tsx`, `_components/roles-table.tsx`, `/admin/users/new/page.tsx`, `_form.tsx`, `/admin/users/[id]/edit/page.tsx`, `_form.tsx`. 로케일 toggle로 즉시 전환 |

### 답변 (사용자 추가 질문)
- **홈 아이콘 숫자 배지**: 이미 `badge-sync.tsx`가 `navigator.setAppBadge()` 호출 중. iOS 16.4+ (2023.3 이후)는 알림 권한 받으면 OS가 빨간 배지 표시. Android Chrome도 API는 OK지만 **런처 의존**(Pixel/Nova OK, Samsung One UI는 일부, MIUI/EMUI는 거의 안 됨) — 사용자 합의로 현재 구조 유지
- **자동 아이콘**: 학원 로고 PNG를 `public/icons/source.png`로 두면 `generate-icons.ts`가 8 사이즈 자동 변환. 로고 없으면 새 폴백(말풍선 + FPC + 골드점) 사용

### 다음 작업 후보
- 결근/지각/조퇴 LeaveType 추가 (매트릭스/엑셀 컬럼은 이미 있음, enum에만 없음)
- 채팅 일반 파일 첨부 (현재 이미지/동영상만)
- 메시지 검색
- 그룹 멤버 추가/삭제
- 직원 비활성화/삭제
- 외부 사인 SMS (사업자 결정 + 결제 등록 필요)

---

## ✅ 2026-05-11 (D — 채팅 첨부 + 자동 삭제 cron)

| 커밋 | 내용 |
|---|---|
| `a009f9f` | **Phase 1 — 채팅 첨부 핵심 흐름** — 입력창 📎 버튼 + 드래그·드롭 + R2 업로드 + 인라인 미리보기. 이미지 10MB·동영상 30MB 제한, 만료일 metadata에 박힘 (이미지 365일/동영상 60일) |
| `ca6b2eb` | **Phase 2 — 자동 삭제 cron** — `vercel.json` cron 매일 KST 01:00 (`0 16 * * *`), `/api/cron/cleanup-attachments` 만료된 첨부 R2 파일 삭제 + DB 메시지는 보존(metadata expired 마커 + content="[만료된 첨부파일]") |
| `a3a429c` | TS18048 가드 (attachment.size optional) |

### 신규 파일
- `app/api/chat/[chatId]/upload/route.ts` (multipart 업로드)
- `app/api/chat/file/[messageId]/route.ts` (signed URL 302 redirect, ?download=1)
- `app/api/cron/cleanup-attachments/route.ts` (만료 자동 삭제)

### lib/chat.ts 확장
- `AttachmentMeta` 타입 추가
- `SendMessageOptions.attachment` 추가
- `sendMessage`가 첨부 있으면 빈 본문 허용, type=IMAGE/FILE 자동, content fallback=파일명

### MessageBubble
- `attachment.kind === image` → `<img>` (max 320px, 클릭 시 새 탭)
- `video` → `<video controls preload=metadata>`
- 만료된 첨부 (`expired: true`) → 회색 점선 박스 placeholder
- 사이즈 + 다운로드 링크

### 사용자 액션 (선택)
- Vercel Settings → Environment Variables → `CRON_SECRET=<openssl rand -hex 32>` 등록 → Redeploy
- 미설정이어도 cron 동작은 함 (외부 호출 가능 — 보안 약함)

### 다음 작업 후보
- 결근/지각/조퇴 LeaveType 추가
- 매트릭스 검색/필터 (직원 많아질 때)
- 파일·문서 첨부 (현재 image/video만, image/* 외 파일 415 거부)
- 이미지 자동 압축 (현재 원본 그대로 R2 저장)

---

## ✅ 2026-05-10/11 (관리자 근태 관리 시스템 구축)

배경: 학원에서 사용 중이던 엑셀(`2403-2502 근태관리현황.xlsx`)을 시스템으로 옮김.
노무사에게 매월 전달용 자료 자동 생성까지.

| 커밋 | 내용 |
|---|---|
| `f2211fc` | 캘린더 헤더 month picker를 📅 이모지 버튼으로 (input 투명 오버레이, 라벨 중복 제거) |
| `cce71c7` | **근태 관리 매트릭스 페이지 신규** — `/admin/attendance` 사이드바 메뉴 + 직원×1~31일 표 + 빈 셀 클릭 등록/채워진 셀 클릭 삭제 + 우측 합계(반차/연차/차감일/잔여) + 색상 범례 |
| `a58d32b` | **다수 직원 × 다중 일자 일괄 등록** — `_bulk-add-modal.tsx` + `addLeavesBulkByAdminAction` (최대 100명, 부분 성공 허용) |
| `361b84f` | **채워진 셀 클릭 시 메모 편집 모달** — `_cell-detail-modal.tsx` + `updateLeaveNoteByAdminAction` (사유 textarea 2000자, 저장/삭제 한 곳) |
| `f3c0b15` | 메모 있는 셀 우측 하단 빨간 **+1** indicator (text-[8px], pointer-events-none) |
| `8d238b6` | 월간 근태 엑셀 다운로드 — 처음엔 SheetJS(xlsx) |
| `b6ca201` | **xlsx → exceljs 전환** — 학원 양식 색감 적용. 시트3개 (매트릭스/메모/잔여연차), 토일 회색·연차 파랑·병가 분홍·공가 보라·차감일 초록·잔여 빨강. freeze 좌측2열+첫행, thin border, numFmt 0.0 |

### 주요 결정
- **휴가 종류·기간 변경 안 함**: 메모 편집 모달에서는 `reason`만 갱신. 종류/기간 변경 시 차감 보정이 복잡해서 "삭제 후 재등록" 안내.
- **결근(ABSENT) 컬럼**: 엑셀 호환 위해 컬럼은 살려뒀지만 LeaveType에는 미포함. 0으로 표시. 추후 필요 시 enum 추가.
- **xlsx 제거 → exceljs**: SheetJS community는 셀 스타일 제한이 커서 학원 양식 못 맞춤. exceljs로 전환하며 보안 vulnerability도 해소.

### 신규 파일
- `app/(main)/admin/attendance/page.tsx`
- `app/(main)/admin/attendance/_grid.tsx`
- `app/(main)/admin/attendance/_bulk-add-modal.tsx`
- `app/(main)/admin/attendance/_cell-detail-modal.tsx`
- `app/api/admin/attendance/export/route.ts`

### 신규 server action (attendance/actions.ts)
- `addLeaveByAdminAction` — 단일 셀 등록
- `addLeavesBulkByAdminAction` — 다수 직원 × 기간 일괄
- `updateLeaveNoteByAdminAction` — 메모만 갱신
- `deleteLeaveByAdminAction` — 기존 (재사용)

### 다음 작업 후보 (사용자 의사결정 대기)
- **D** — 채팅 첨부 (이미지 1년 / 동영상 60일 + 미리보기 + 자동 삭제 cron)
- 결근/지각/조퇴 LeaveType 추가
- 매트릭스 검색/필터 (직원 많아질 경우)

---

## ✅ 2026-05-10 저녁 (운영 편의 기능 묶음 8건)

| 커밋 | 내용 |
|---|---|
| `87d2d70` | **채팅방 나가기** — DM + 명시적 그룹만, 레벨 자동 채팅은 ❌. 그룹은 SYSTEM "XX 님이 나갔습니다" 전송 |
| `4803f72` | **진행 캠페인 삭제** — `/documents` 페이지 캠페인 라인 우측 삭제 버튼. 사인 결과 PDF/이미지 R2 정리, 양식 원본은 보존 |
| `761f44d` | **레벨 채팅 unread 정확 계산** — `User.level >= levelRequired` 인 직원 전체를 잠재 독자로. 들어와본 사람만 카운트하던 버그 수정 |
| `72905bf` | **크롬에서 메시지 "전송 중..." 영영 안 풀리던 버그** — 광고 차단이 Realtime WebSocket 막음. 폴링 핸들러를 in-place 갱신으로 변경 + 1.5초 fallback 타임아웃 |
| `dfa3d29` | **모든 메시지에 unread 표시 (카톡 스타일)** — `isMine` 조건 제거. 본인/타인/AI 모두 노란 카운트. API/SSR 모두 전체 메시지 대상 |
| `32eef08` | **행사 삭제 + "📋 이번 달 일정" 접기 섹션** — `_month-events-list.tsx` 신규. 캘린더 셀이 일정 많아도 화면 안 깨짐, 관리자에게 행사 🗑 |
| `de81189` | **관리자 휴가 삭제 + 연차 사용량 자동 보정** — APPROVED 휴가 삭제 시 `User.annualLeaveUsed` 차감 + LeaveAdjustment 감사로그 동시 트랜잭션. 흔적 보존 (status=CANCELLED) |
| `8415d30` | **채팅방 초기화 실시간 반영** — `clearChatRoomAction`이 SYSTEM 메시지(`metadata.kind="ROOM_CLEARED"`) INSERT → 클라이언트 핸들러가 그것 감지 시 `setMessages([only])`로 비움. **캘린더 월/년 이동** — `_calendar-nav.tsx` 신규, ◀ 라벨 picker ▶ 형태, `?ym=YYYY-MM` URL state |

### 마이그레이션 / 신규 모델
- `LeaveAdjustment` (이전 a8fa98c) — 휴가 삭제 시 자동 기록되는 감사 로그
- `User.joinDate`, `annualLeaveTotal/Used Float` (이전 a8fa98c)

### 신규 컴포넌트 위치 메모
- `app/(main)/chat/[id]/_leave-chat-button.tsx`
- `app/(main)/documents/_delete-campaign-button.tsx`
- `app/(main)/admin/users/[id]/edit/_leave-adjust-panel.tsx`
- `app/(main)/attendance/_month-events-list.tsx`
- `app/(main)/attendance/_calendar-nav.tsx`

### 다음 작업 후보
- **D** — 채팅 첨부 (이미지 1년 / 동영상 60일 보관, 미리보기, 자동 삭제 cron)
- **C** — 월간 근태 매트릭스 페이지 (엑셀과 같은 직원행 × 일자열 표)

---

## ✅ 2026-05-10 추가 (입사일 + 연차 직접 조정 — A·B 완료)

배경: 학원에서 사용 중인 근태 엑셀(`C:\Users\cogog\OneDrive\Desktop\2403-2502 근태관리현황.xlsx`) 분석.
- 시트 구조: 월별(1~12) + 정산 시트, 컬럼 = `사원정보 | 입사일자 | 1..31일 | 반차 | 연차 | 결근 | 차감일 | 잔여연차(전월/당월)`
- 정산 시트는 운영 중 잔여연차를 수동 정산/이월/육아휴직/퇴사 처리한 흔적 → 사용자 요청과 일치

### A — 입사일자 (joinDate)
- **`a8fa98c`** feat(admin): 입사일자 + 연차 잔여 직접 조정 (감사 로그)
- prisma `User.joinDate DateTime?` 추가
- `/admin/users/new` 폼에 date picker + 연차 한도 초기 입력
- `/admin/users/[id]/edit` 폼에 입사일자 입력 (빈 값으로 저장하면 null로 클리어)

### B — 연차 잔여 직접 조정 (관리자 전용)
- prisma `LeaveAdjustment` 모델 + `LeaveAdjustmentField` enum (TOTAL / USED)
- `User.annualLeaveTotal/Used`: **Int → Float** 변경 (반차 0.5단위가 Int에 increment되던 잠재 버그 해결)
- `adjustLeaveAction(userId, field, newValue, reason)` — 트랜잭션으로 User 업데이트 + 감사로그 동시 생성
- 편집 페이지 하단에 amber `LeaveAdjustPanel`:
  - 카드 3개: 한도 / 사용 / 잔여 (PENDING 예약 일수 차감 표시)
  - field 선택(USED/TOTAL) → 새 값(0.5 step) → 사유 입력 → 저장
  - 최근 10건 변경 이력 (날짜·필드·before→after·사유·관리자명)
- 변경된 파일: `prisma/schema.prisma`, `app/(main)/admin/users/actions.ts`, `app/(main)/admin/users/new/_form.tsx`, `app/(main)/admin/users/[id]/edit/page.tsx`, `app/(main)/admin/users/[id]/edit/_form.tsx`, **신규** `app/(main)/admin/users/[id]/edit/_leave-adjust-panel.tsx`

DB: `prisma db push` 완료 (Int→Float 무손실 변환).

### 다음 작업 후보 (사용자 의사 결정 대기)
- **D** — 채팅 첨부: 이미지 1년 / 동영상 60일 보관, 미리보기, 자동 삭제 (Vercel cron)
- **C** — 월간 근태 매트릭스 페이지 (엑셀과 같은 직원행 × 일자열 표)

---

## ✅ 2026-05-10 후속 (채팅 안정화 마지막)

- **`d345718`** fix(chat): 번역 원복 회귀 + ✕ 항상 표시
  - 5초 ORDER 폴링이 동일 metadata도 새 reference로 교체 → ActiveOrderBar `useEffect([message.metadata])` fire → `setTranslation(null)`
  - 폴링: JSON.stringify 구조적 동일성 검사 → 같으면 m reference 유지
  - useEffect dep을 metaSig(JSON.stringify)로 변경 — 이중 안전장치
  - 5개 버블(MessageBubble / AiMessageBubble / ActiveOrderBar / ClosedOrderBubble / EventProposalBubble)에서 ✕ 항상 렌더 + `disabled={!translation}` + opacity-30
- **`ee47689`** chore(ai): default 모델을 `gemini-3.1-flash-lite`로 변경 (무료 일일 1,000 RPD)
  - **사용자 액션**: Vercel 환경변수 `AI_MODEL_FAST` / `AI_MODEL_PRO`도 `gemini-3.1-flash-lite`로 변경 후 Redeploy
- **`b558b4e`** fix(ai): quota 초과 등 AI 에러를 친절한 메시지로 변환 (`friendlyAiError`)

→ **번역·ORDER·실시간 동기화·할루시네이션 가드까지 모두 사용자 검증 완료 (2026-05-10)**

---

## 🚀 이번 세션에서 끝낸 큰 줄기

### 1. 디지털 사인 보강
- **비-PDF 파일 사인 시 별도 "Signature Certificate" PDF 생성** — 한글 파일·HWP·DOCX 등에 사인하면 원본은 보존하고 사인자/시간/IP/사인 이미지가 담긴 증명 PDF가 만들어짐
- **사인 요청 취소 기능** — 관리자가 PENDING 상태 요청을 취소 가능 (직원/외부 모두)
- **사인본 미리보기 모달** — 다운로드 외에 iframe으로 즉시 PDF 확인. 관리자 캠페인 페이지 + 직원 본인 사인본
- **한글 폰트 임베딩 (Noto Sans KR)** — `lib/fonts.ts`가 jsDelivr CDN에서 OTF를 fetch + 모듈 캐시. `pdf-lib + @pdf-lib/fontkit` + subset 임베드라 PDF 용량 작게 유지. fetch 실패 시 ASCII 치환 fallback.

### 2. 다국어 (KO/EN)
- **lib/i18n** 인프라 — flat dictionary + 서버 `getT()`/`getLocale()` + 클라이언트 `useT()`/`LocaleProvider` + `setLocaleAction` cookie
- **우측 상단 KO/EN 토글** — 모든 페이지 헤더 + 외부 사인 페이지 + 로그인 페이지
- **번역 적용 페이지**: 사이드바·모바일nav·헤더, 대시보드, /documents 일체, /chat 일체, /attendance, /assistant, /settings/password, /admin/users(목록), /admin/leave, /install, /sign/[token]
- **HTML lang 속성 + 날짜 포맷** locale에 따라 자동 전환
- **남은 폴리시**: `/admin/users/new`+`/[id]/edit` 폼, `/admin/roles`, attendance 서브 컴포넌트 (LeaveForm/LeaveList/Calendar 라벨), `/admin/leave _pending-row`, 채팅 그룹 폼 일부 inline 텍스트 — 전부 admin이 한국어로 쓰는 화면이라 후순위

### 3. 일반 직원 대시보드 제거
- 사이드바·모바일 nav에서 admin 아니면 대시보드 메뉴 숨김
- `/dashboard` 직접 접근 시 admin 아니면 `/chat`으로 redirect
- 헤더 로고: admin이면 `/dashboard`, 아니면 `/chat`

### 4. 카카오톡 같은 PWA + 푸시 + 배지
- **인앱 배지** — 사이드바 채팅·문서 메뉴, 브라우저 탭 title (N) FPCTalk, favicon에 빨간 숫자 dot, 10초 폴링 + visibilitychange 즉시 갱신, 카운트 변경 시 router.refresh로 사이드바 SSR 동기화
- **PWA 인프라** — `app/manifest.ts` (start_url=/chat, theme=#0F4D3A), `public/sw.js` (install/activate/fetch/push/notificationclick), `public/icons/*` 자동 생성 (`scripts/generate-icons.ts` + sharp)
- **Web Push** — `web-push` + `@pdf-lib/fontkit`/`@fontsource/noto-sans-kr` 패키지, prisma `PushSubscription` 모델, VAPID 키 발급, `lib/push.ts` (`sendPushToUser` + stale prune), 메시지 전송/사인 요청 시 자동 발송
- **App Badge** — `navigator.setAppBadge(n)` — Android Chrome / iOS 16.4+ / Edge / Safari macOS 16.4+
- **/install 3카드** — 🍏 iPhone / 🤖 Android / 💻 Windows·macOS 자동 OS 감지 + 추천 카드 강조
  - Android/Desktop: `beforeinstallprompt` → 1탭 설치
  - iOS: 4단계 가이드 + 인앱 브라우저 감지 + 알림 차단 시 iOS 설정 안내 (자동 이동 불가 명시)
  - 카드 안에서 알림 허용 결과 ✅/❌ 메시지 표시
- **🔍 시스템 진단 패널** — HTTPS, SW 등록·active, Push API, Notification API, 알림 권한, 푸시 구독, **VAPID env 등록 여부**, setAppBadge 지원, installable, standalone — 사용자가 어디서 막혔는지 즉시 진단 가능
- **자동 설치 배너** — 진입 시 화면 하단 카드 자동 노출, 1일 dismiss, /install 페이지에선 표시 안 함

### 5. 근태 → 캘린더 전환
- 메뉴 라벨 "근태" → **"📅 캘린더"** (모든 직원 접근 가능)
- 출퇴근 체크 카드 제거
- 직원: 본인 휴가 신청 + 본인 승인된 휴가 캘린더 표시
- 관리자: 전 직원 승인된 휴가 + 학원 행사 모두 캘린더 표시 (다른 사람은 회색, 본인은 파란색, 학원 행사는 amber)
- `/admin/leave`는 그대로 — 관리자가 승인하는 화면

### 6. AI 학원 행사 자동 등록
- **prisma**: `Event`, `EventAcknowledgement`, `MessageType.EVENT_PROPOSAL`, `EventSource(MANUAL/CHAT_AI)`
- **`lib/event-extract.ts`** — Gemini Flash JSON 모드로 메시지에서 일정 추출
  - 짧거나 날짜·행사 키워드 없으면 즉시 false (비용 절감 prefilter)
  - KST 타임존 ISO, 1년 미래/24h 과거 거부
- **흐름**: 관리자가 채팅에 일정 메시지 → AI 자동 추출 → 같은 채팅에 amber `EVENT_PROPOSAL` 메시지 추가 → 작성자만 [✓ 등록]/[취소] 보임 → 등록 시 채팅 멤버 전원에게 푸시 + 캘린더 amber로 표시
- **대시보드 D-7 행사 카드** + 미확인 카운트 강조 ("🔔 놓치지 마세요" 빨간 카드) + [확인] 버튼 (EventAcknowledgement)

### 7. 자동 로그인
- 로그인 폼에 **자동 로그인** 체크박스 (기본 ON) + 안내
- 체크 ON → `fpctalk-rememberMe=1` cookie + Supabase auth cookie maxAge **30일**
- 체크 OFF → cookie 삭제 + Supabase auth cookie를 **session cookie**로 강제 (브라우저 닫으면 로그아웃, 공용 PC 안전)
- 마지막 username을 localStorage에 저장 → 다음 방문 시 자동 입력 (rememberMe ON일 때만)
- 로그아웃 시 rememberMe 쿠키 명시적 제거
- 구현: `lib/supabase/server.ts` `applyRememberMe` 헬퍼, middleware도 동일 처리

### 8. 모바일 nav 가로 스크롤
- 항목 6개일 때 (학원장: 채팅·문서·캘린더·홈·설치·AI) 화면 초과 시 가로 스와이프
- 페이지 진입 시 활성 메뉴 자동 가운데 스크롤
- 우측 페이드 그라디언트로 "더 있음" 시각 힌트
- iOS Safari `touch-pan-x` 보장

---

## ⚠️ 사용자 작업 필요

### Vercel 환경변수 (필수 — 푸시 알림 동작 조건)
Vercel → 프로젝트 → Settings → Environment Variables → 4개 추가 + Redeploy:

```
VAPID_PUBLIC_KEY=BJ11WgnItGMN9gay4jQqkhe3wy8LzFJlIiJhmOkTlGO88xTexSZfADD5OOvUTioIt95ylLqnZGdinL6x0723nz0
VAPID_PRIVATE_KEY=k7ALaTJNTTr-gQeNkf_9GUvvWtnSPLc8L-k9uxfokR4
VAPID_SUBJECT=mailto:cogogema86@gmail.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BJ11WgnItGMN9gay4jQqkhe3wy8LzFJlIiJhmOkTlGO88xTexSZfADD5OOvUTioIt95ylLqnZGdinL6x0723nz0
```

검증: `https://www.fpctalk.com/install` → 🔍 시스템 진단 펼치기 → "VAPID 공개키 (env): 🟢 configured"

### 학원 로고로 아이콘 교체 (선택)
현재는 단순 "FPC" 녹색 배경 + 흰 글자. Francis Parker Collegiate 로고로 바꾸려면:
1. 사용자 컴퓨터의 `Z:\HDD1\K\bi\동그라미로고.png`를 프로젝트의 `public/icons/source.png`로 복사
2. 터미널: `npx tsx scripts/generate-icons.ts`
3. `git add public/ && git commit -m "chore: update icons" && git push`

---

## 🟢 현재 시스템 상태 (커밋 1d2c399 기준)

| 카테고리 | 상태 |
|---|---|
| 인증 | username 합성 이메일 + Supabase Auth + 자동 로그인 체크박스 |
| 채팅 | 1:1, 그룹, 레벨 자동 채팅, AI 호출(@AI/@비서), 번역, 미서명 배지 |
| AI 비서 | 학원장(level≥3) 전용, Flash/Pro 자동 라우팅, 30일 채팅 메모리 |
| 디지털 사인 | PDF 합성 + 비-PDF 증명서, 한글 폰트, 미리보기, 취소, 외부 사인 토큰 |
| 캘린더 | 모든 직원 접근, 휴가 + 행사, AI 자동 일정 등록 |
| 근태/연차 | 신청 (모두) + 승인 (관리자) — 출퇴근은 제거 |
| 다국어 | KO/EN 토글, 핵심 화면 완성, 일부 admin 폼 폴리시 남음 |
| PWA | manifest, SW, 아이콘, 자동 설치 배너, 3-OS 카드 |
| 푸시 알림 | VAPID, 메시지·사인 자동 발송, setAppBadge — Vercel env 4개 등록 필요 |
| 인앱 배지 | 사이드바·탭·favicon·홈 아이콘 모두 10초 폴링 + 즉시 router.refresh |
| 다국어 외부 사인 | 학부모용 페이지에 KO/EN 토글 |

---

## 🛣️ 다음 작업 후보 (우선순위 순)

### 가치 큼
1. **직원에게도 D-7 행사 알림** — 지금 대시보드는 admin 전용이라 직원이 못 봄. /chat 또는 /attendance 상단에 배너 또는 별도 위치
2. **외부 사인자 자동 알림** — 학부모 링크를 카톡/문자/이메일 자동 발송 (현재는 관리자가 수동 복사)
3. **행사 수정/삭제** — 등록한 학원 행사를 나중에 편집할 수 있는 화면
4. **AI 추출 정확도 튜닝** — 한국어 메시지에서 false positive/negative 모니터링하면서 prompt 조정
5. **HWP/Word → PDF 자동 변환** — CloudConvert/ConvertAPI 외부 서비스로 본문에 사인 박힌 PDF 생성

### 폴리시
6. 남은 i18n: `/admin/users/new+edit`, `/admin/roles`, attendance 서브, `/admin/leave _pending-row`
7. 관리자가 다른 직원 출근 직접 입력 (현재 출근 기능 자체가 제거됨 — 필요하면 다시 추가)
8. 메시지 검색
9. 정확한 unread 카운트 (지금은 polling)
10. 그룹 멤버 추가/삭제
11. PDF 안 특정 위치에 사인 배치
12. 직원 비활성화/삭제
13. 메시지 첨부 (이미지/파일)

---

## 📁 주요 파일 위치

```
fpctalk/
├── lib/
│   ├── i18n/                        # 다국어 인프라
│   │   ├── dictionary.ts            # KO/EN 사전 (수정 시 양쪽 모두)
│   │   ├── server.ts                # 서버용 getT, getLocale
│   │   └── client.tsx               # 클라이언트 useT, LocaleProvider
│   ├── push.ts                      # web-push 발송 헬퍼 (sendPushToUser)
│   ├── fonts.ts                     # Noto Sans KR fetch + 캐시
│   ├── event-extract.ts             # Gemini로 메시지 → 일정 추출
│   ├── events.ts                    # 다가오는 행사 + ack
│   ├── supabase/server.ts           # applyRememberMe + REMEMBER_ME_COOKIE
│   ├── documents.ts                 # 사인 + 증명 PDF + 한글 폰트
│   ├── attendance.ts                # 휴가 + getMonthlyApprovedLeaves
│   └── chat.ts                      # 채팅 + countChatUnread
├── app/
│   ├── manifest.ts                  # PWA manifest
│   ├── (auth)/login/                # 자동 로그인 체크박스 추가됨
│   ├── (main)/
│   │   ├── _components/
│   │   │   ├── badge-sync.tsx       # 탭 title + favicon + setAppBadge
│   │   │   ├── install-banner.tsx   # 자동 노출 설치 배너
│   │   │   ├── locale-toggle.tsx
│   │   │   ├── mobile-nav.tsx       # 가로 스크롤 + scrollIntoView
│   │   │   ├── sidebar.tsx
│   │   │   └── sw-register.tsx
│   │   ├── attendance/              # 캘린더 (출퇴근 제거)
│   │   ├── chat/                    # EventProposalBubble 추가됨
│   │   ├── dashboard/_upcoming-events.tsx
│   │   ├── documents/[id]/_preview-button.tsx, _cancel-button.tsx
│   │   ├── events/actions.ts        # 행사 ack/approve/cancel
│   │   └── install/                 # 3카드 + 진단 패널
│   ├── _actions/
│   │   ├── locale.ts
│   │   └── push.ts                  # subscribePushAction
│   └── api/
│       ├── badges/route.ts          # /api/badges 폴링 엔드포인트
│       └── files/[id]/route.ts      # 다운로드 프록시
├── public/
│   ├── sw.js                        # service worker (fetch + push)
│   ├── icons/                       # 자동 생성된 PWA 아이콘
│   └── favicon.ico, favicon-16/32.png
├── scripts/
│   ├── generate-icons.ts            # PWA 아이콘 빌더 (sharp)
│   └── generate-vapid.ts            # VAPID 키 발급 (1회)
└── prisma/schema.prisma             # PushSubscription, Event, EventAcknowledgement 추가됨
```

## 🔑 첫 관리자 계정
```
아이디: admin
비밀번호: Fpctalk2026
이름: 김태규
역할: 원장 (PRINCIPAL, level 3, isAdmin)
```

## 🔗 핵심 URL
- 프로덕션: https://www.fpctalk.com
- 백업: https://fpctalk.vercel.app
- 진단: https://www.fpctalk.com/install (🔍 시스템 진단 펼치기)
- GitHub: https://github.com/cogogema86-cmd/fpctalk

## 📝 메모
- DB 비번: 영문+숫자만 (URL 파싱 이슈 주의)
- Supabase Realtime publication에 Message 테이블 등록되어 있음
- R2 버킷: `fpctalk` (Asia-Pacific) — `STORAGE_PROVIDER=r2`
- VAPID 키 분실 시 `npx tsx scripts/generate-vapid.ts` 새로 발급 (단 모든 클라이언트 푸시 구독은 무효화됨)
