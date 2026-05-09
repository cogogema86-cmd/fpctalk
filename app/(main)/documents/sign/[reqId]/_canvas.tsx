"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { submitSignatureAction, type SignSubmitState } from "../../actions";
import { useT } from "@/lib/i18n/client";

const initialState: SignSubmitState = {};

export function SignCanvas({ requestId }: { requestId: string }) {
  const router = useRouter();
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [state, formAction, isPending] = useActionState(
    submitSignatureAction,
    initialState,
  );

  // 캔버스 초기화
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 흰 배경
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  // 성공 시 목록으로
  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => {
        router.push("/documents");
        router.refresh();
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [state.ok, router]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const drawingRef = useRef(false);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (state.ok || isPending) return;
    drawingRef.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const handleEnd = () => {
    drawingRef.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasDrawn) {
      alert(t("sign.alertEmpty"));
      return;
    }
    if (!confirm(t("sign.confirmSubmit"))) {
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    const fd = new FormData();
    fd.set("requestId", requestId);
    fd.set("signature", dataUrl);
    formAction(fd);
  };

  if (state.ok) {
    return (
      <div className="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-4 text-sm text-green-800 dark:text-green-200">
        {t("sign.successRedirect")}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="rounded-md border-2 border-zinc-300 dark:border-zinc-700 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full cursor-crosshair touch-none"
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={clear}
          disabled={isPending}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
        >
          {t("sign.clear")}
        </button>
        <button
          type="submit"
          disabled={isPending || !hasDrawn}
          className="rounded-md bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {isPending ? t("sign.processing") : t("sign.submit")}
        </button>
      </div>

      {state.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </div>
      )}
    </form>
  );
}
