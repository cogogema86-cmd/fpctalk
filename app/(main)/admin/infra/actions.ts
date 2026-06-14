"use server";

import { revalidatePath } from "next/cache";
import { canAccessFeature } from "@/lib/permissions";
import { setInfraInventory } from "@/lib/app-settings";
import type { InfraService } from "@/lib/infra-info";

/**
 * 인프라 인벤토리 저장 — '시스템 정보 보기'(canViewStorage) 권한 필요.
 * 값은 setInfraInventory가 검증/클램프(비밀값·잘못된 URL 등 정리)한다.
 */
export async function saveInfraInventoryAction(
  services: InfraService[],
): Promise<{ ok: boolean; error?: string }> {
  const allowed = await canAccessFeature("storage");
  if (!allowed) return { ok: false, error: "권한이 없습니다." };

  try {
    await setInfraInventory(services);
    revalidatePath("/dashboard");
    revalidatePath("/admin/infra");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "저장 실패",
    };
  }
}
