"use client";

import { useState, useTransition } from "react";
import { deleteTemplateAction } from "./template-actions";
import { useT } from "@/lib/i18n/client";

export function DeleteTemplateButton({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    if (!confirm(`"${templateName}" — ${t("tpl.deleteConfirm")}`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteTemplateAction(templateId);
      if (r.error) setError(r.error);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
      >
        {isPending ? `${t("common.delete")}...` : t("common.delete")}
      </button>
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400 ml-2">
          {error}
        </span>
      )}
    </>
  );
}
