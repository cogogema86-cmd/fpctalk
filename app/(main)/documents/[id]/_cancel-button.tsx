"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  cancelSignatureRequestAction,
  type CancelSignState,
} from "../actions";
import { useT } from "@/lib/i18n/client";

const initial: CancelSignState = {};

export function CancelSignButton({
  requestId,
  documentId,
  signerLabel,
}: {
  requestId: string;
  documentId: string;
  signerLabel: string;
}) {
  const router = useRouter();
  const t = useT();
  const [state, formAction, isPending] = useActionState(
    cancelSignatureRequestAction,
    initial,
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!confirm(`${signerLabel} ${t("docDetail.cancelConfirm")}`)) {
      e.preventDefault();
    }
  };

  return (
    <form action={formAction} onSubmit={onSubmit} className="inline">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="documentId" value={documentId} />
      <button
        type="submit"
        disabled={isPending}
        title={state.error || t("docDetail.cancel")}
        className="text-xs rounded border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-2 py-1 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
      >
        {isPending ? t("docDetail.cancelling") : t("docDetail.cancel")}
      </button>
    </form>
  );
}
