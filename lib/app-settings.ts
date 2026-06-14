/**
 * 앱 설정 (관리자가 런타임에 바꾸는 값) — DB 기반.
 * AI 모델명을 여기서 읽으면 재배포 없이 즉시 반영된다.
 * DB 값이 없으면 환경변수 → 코드 기본값으로 폴백.
 */
import { prisma } from "@/lib/db";
import { INFRA_SERVICES, type InfraService } from "@/lib/infra-info";

const KEY_FAST = "ai.modelFast";
const KEY_PRO = "ai.modelPro";
const KEY_API = "ai.geminiApiKey";
const KEY_INFRA = "infra.inventory";

// 코드 기본값 (DB·env 모두 비었을 때)
export const DEFAULT_AI_MODEL = "gemini-3.1-flash-lite";

export type AiModels = { fast: string; pro: string };

/** 현재 적용 중인 AI 모델 (DB → env → 기본값). AI 호출 시마다 읽어 실시간 반영. */
export async function getAiModels(): Promise<AiModels> {
  let rows: { key: string; value: string }[] = [];
  try {
    rows = await prisma.appSetting.findMany({
      where: { key: { in: [KEY_FAST, KEY_PRO] } },
      select: { key: true, value: true },
    });
  } catch {
    // DB 조회 실패 시 env/기본값으로 폴백
  }
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const pick = (k: string, env?: string) =>
    (map.get(k)?.trim() || env?.trim() || DEFAULT_AI_MODEL);
  return {
    fast: pick(KEY_FAST, process.env.AI_MODEL_FAST),
    pro: pick(KEY_PRO, process.env.AI_MODEL_PRO),
  };
}

// =====================================================
// Gemini API 키 (DB → env). 관리자 화면에서 교체 가능 (재배포 불필요).
// =====================================================

/** AI 호출에 쓸 API 키 (DB 우선, 없으면 환경변수). */
export async function getGeminiApiKey(): Promise<string | undefined> {
  let dbVal: string | undefined;
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: KEY_API },
      select: { value: true },
    });
    dbVal = row?.value?.trim() || undefined;
  } catch {
    // 폴백
  }
  return dbVal ?? (process.env.GEMINI_API_KEY?.trim() || undefined);
}

function maskKey(k: string): string {
  return k.length <= 4 ? "••••" : `••••${k.slice(-4)}`;
}

/** 관리자 화면 표시용 — 키 전체는 노출하지 않고 출처/마스킹만. */
export async function getGeminiApiKeyStatus(): Promise<{
  source: "db" | "env" | "none";
  hint: string;
}> {
  let dbVal: string | undefined;
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: KEY_API },
      select: { value: true },
    });
    dbVal = row?.value?.trim() || undefined;
  } catch {
    // ignore
  }
  if (dbVal) return { source: "db", hint: maskKey(dbVal) };
  const envVal = process.env.GEMINI_API_KEY?.trim();
  if (envVal) return { source: "env", hint: maskKey(envVal) };
  return { source: "none", hint: "" };
}

/** 관리자가 API 키 저장 (즉시 반영). */
export async function setGeminiApiKey(key: string): Promise<void> {
  const k = key.trim();
  await prisma.appSetting.upsert({
    where: { key: KEY_API },
    create: { key: KEY_API, value: k },
    update: { value: k },
  });
}

/** 저장된 DB 키 삭제 → 환경변수로 복귀. */
export async function clearGeminiApiKey(): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: KEY_API } });
}

// =====================================================
// 인프라 인벤토리 (대시보드 인프라 카드) — DB에 저장, 관리자 화면에서 편집(재배포 불필요).
// 🔴 비밀값(키·비번)은 저장 금지 — 비밀 아닌 정보만. 입력은 검증/클램프한다.
// =====================================================

/** 들어온 값을 안전한 InfraService[]로 정규화 (길이 제한 + URL 화이트리스트). */
function sanitizeInfra(input: unknown): InfraService[] {
  if (!Array.isArray(input)) return [];
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max).trim() : "";
  // loginUrl은 http(s)만 허용 (javascript: 등 XSS 차단)
  const safeUrl = (v: unknown) => {
    const s = str(v, 300);
    return /^https?:\/\//i.test(s) ? s : "";
  };
  return input
    .slice(0, 40)
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const identifiers = Array.isArray(o.identifiers)
        ? o.identifiers
            .slice(0, 20)
            .map((it) => {
              const x = (it ?? {}) as Record<string, unknown>;
              return { label: str(x.label, 60), value: str(x.value, 200) };
            })
            .filter((it) => it.label || it.value)
        : [];
      const envVars = Array.isArray(o.envVars)
        ? o.envVars.slice(0, 50).map((e) => str(e, 80)).filter(Boolean)
        : [];
      const secretNote = str(o.secretNote, 300);
      return {
        name: str(o.name, 60),
        icon: str(o.icon, 8),
        purpose: str(o.purpose, 200),
        loginUrl: safeUrl(o.loginUrl),
        identifiers,
        envVars,
        secretNote: secretNote || undefined,
      };
    })
    .filter((svc) => svc.name); // 이름 없는 항목 제거
}

/** 인프라 인벤토리 읽기 (DB → 코드 기본값). */
export async function getInfraInventory(): Promise<InfraService[]> {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: KEY_INFRA },
      select: { value: true },
    });
    if (row?.value) {
      const clean = sanitizeInfra(JSON.parse(row.value));
      if (clean.length) return clean;
    }
  } catch {
    // 폴백
  }
  return INFRA_SERVICES;
}

/** 인프라 인벤토리 저장 (즉시 반영). 검증 후 저장. */
export async function setInfraInventory(list: unknown): Promise<void> {
  const clean = sanitizeInfra(list);
  await prisma.appSetting.upsert({
    where: { key: KEY_INFRA },
    create: { key: KEY_INFRA, value: JSON.stringify(clean) },
    update: { value: JSON.stringify(clean) },
  });
}

/** 관리자가 모델명을 저장 (즉시 반영). */
export async function setAiModels(fast: string, pro: string): Promise<void> {
  const f = fast.trim();
  const p = pro.trim();
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: KEY_FAST },
      create: { key: KEY_FAST, value: f },
      update: { value: f },
    }),
    prisma.appSetting.upsert({
      where: { key: KEY_PRO },
      create: { key: KEY_PRO, value: p },
      update: { value: p },
    }),
  ]);
}
