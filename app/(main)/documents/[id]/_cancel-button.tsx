"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  cancelSignatureRequestAction,
  type CancelSignState,
} from "../actions";

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
  const [state, formAction, isPending] = useActionState(
    cancelSignatureRequestAction,
    initial,
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (
      !confirm(
        `${signerLabel} 님의 사인 요청을 취소하시겠습니까?\n취소 후에는 되돌릴 수 없습니다.`,
      )
    ) {
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
        title={state.error || "사인 요청 취소"}
        className="text-xs rounded border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-2 py-1 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
      >
        {isPending ? "취소 중..." : "취소"}
      </button>
    </form>
  );
}
