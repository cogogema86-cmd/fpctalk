/**
 * 관리 기능별 세부 권한 (FPCTalk)
 *
 * 역할(StaffRole)의 isAdmin + 기능별 플래그(canManageX)로 접근을 제어한다.
 * 각 기능은 "isAdmin AND 해당 플래그" 둘 다 true여야 접근 가능.
 * (isAdmin=false면 애초에 관리자가 아니므로 모든 기능 false)
 *
 * 모든 관리자 페이지/서버 액션은 이 파일의 getMyPermissions()로 권한을 확인한다.
 */
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

export type AdminFeature =
  | "users"
  | "roles"
  | "leave"
  | "attendance"
  | "ai"
  | "storage";

export type MyPermissions = {
  userId: string;
  roleId: string;
  /** 관리자 역할인지 (관리 섹션 노출 기본 스위치) */
  isAdmin: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
  canApproveLeave: boolean;
  canManageAttendance: boolean;
  canManageAI: boolean;
  canViewStorage: boolean;
  /** 메뉴형 기능(직원/역할/연차/근태/AI) 중 하나라도 가능하면 true (관리 섹션 표시 여부) */
  hasAnyAdmin: boolean;
};

/**
 * 현재 로그인 사용자의 효과적 권한을 계산해 반환. 미로그인이면 null.
 */
export async function getMyPermissions(): Promise<MyPermissions | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const u = await prisma.user.findUnique({
    where: { authId: authUser.id },
    select: {
      id: true,
      roleId: true,
      role: {
        select: {
          isAdmin: true,
          canManageUsers: true,
          canManageRoles: true,
          canApproveLeave: true,
          canManageAttendance: true,
          canManageAI: true,
          canViewStorage: true,
        },
      },
    },
  });
  if (!u) return null;

  const r = u.role;
  const admin = r.isAdmin;
  const perms = {
    userId: u.id,
    roleId: u.roleId,
    isAdmin: admin,
    canManageUsers: admin && r.canManageUsers,
    canManageRoles: admin && r.canManageRoles,
    canApproveLeave: admin && r.canApproveLeave,
    canManageAttendance: admin && r.canManageAttendance,
    canManageAI: admin && r.canManageAI,
    canViewStorage: admin && r.canViewStorage,
  };
  return {
    ...perms,
    // 사이드바 '관리' 섹션 노출 기준 — 메뉴형 기능만(용량은 대시보드 카드라 제외)
    hasAnyAdmin:
      perms.canManageUsers ||
      perms.canManageRoles ||
      perms.canApproveLeave ||
      perms.canManageAttendance ||
      perms.canManageAI,
  };
}

/**
 * 특정 기능 접근 가능 여부만 빠르게 확인. 미로그인/권한없음이면 false.
 */
export async function canAccessFeature(feature: AdminFeature): Promise<boolean> {
  const p = await getMyPermissions();
  if (!p) return false;
  switch (feature) {
    case "users":
      return p.canManageUsers;
    case "roles":
      return p.canManageRoles;
    case "leave":
      return p.canApproveLeave;
    case "attendance":
      return p.canManageAttendance;
    case "ai":
      return p.canManageAI;
    case "storage":
      return p.canViewStorage;
  }
}
