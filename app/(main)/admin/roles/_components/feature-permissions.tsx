"use client";

import { useT } from "@/lib/i18n/client";

/** 역할에 부여할 세부 관리 권한 5종 (역할 생성/편집 폼 공용). */
export const ROLE_FEATURES = [
  { name: "canManageUsers", key: "admin.roles.field.canManageUsers" },
  { name: "canManageRoles", key: "admin.roles.field.canManageRoles" },
  { name: "canApproveLeave", key: "admin.roles.field.canApproveLeave" },
  { name: "canManageAttendance", key: "admin.roles.field.canManageAttendance" },
  { name: "canManageAI", key: "admin.roles.field.canManageAI" },
] as const;

export type FeatureFlags = Partial<
  Record<(typeof ROLE_FEATURES)[number]["name"], boolean>
>;

/**
 * 세부 권한 체크박스 묶음. isAdmin이 켜졌을 때만 실제 적용됨(서버 액션에서 처리).
 * defaults 미지정 시 전부 체크(신규 관리자 역할 기본값).
 */
export function FeaturePermissions({
  defaults,
  disabled,
}: {
  defaults?: FeatureFlags;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <fieldset className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
      <legend className="text-xs font-medium px-1 text-zinc-500">
        {t("admin.roles.field.featuresLegend")}
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {ROLE_FEATURES.map((f) => (
          <label key={f.name} className="flex items-center gap-2 text-sm">
            <input
              name={f.name}
              type="checkbox"
              defaultChecked={defaults ? (defaults[f.name] ?? true) : true}
              disabled={disabled}
            />
            <span>{t(f.key)}</span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-zinc-400">
        {t("admin.roles.field.featuresHint")}
      </p>
    </fieldset>
  );
}
