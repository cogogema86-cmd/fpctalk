"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCampaignAction } from "./actions";
import { useT } from "@/lib/i18n/client";

export function DeleteCampaignButton({
  documentId,
  campaignTitle,
}: {
  documentId: string;
  campaignTitle: string;
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`"${campaignTitle}"\n\n${t("documents.deleteCampaignConfirm")}`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await deleteCampaignAction(documentId);
      if (!r.ok) {
        setError(r.error ?? "삭제 실패");
        alert(r.error ?? "삭제 실패");
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      title={error ?? t("documents.deleteCampaign")}
      className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 shrink-0"
    >
      {isPending ? `${t("common.delete")}...` : t("documents.deleteCampaign")}
    </button>
  );
}
