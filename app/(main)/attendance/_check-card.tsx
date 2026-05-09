"use client";

import { useState, useTransition } from "react";
import { checkInAction, checkOutAction } from "./actions";
import { useT, useLocale } from "@/lib/i18n/client";

type Props = {
  checkInTime: string | null;
  checkOutTime: string | null;
};

export function CheckCard({ checkInTime, checkOutTime }: Props) {
  const t = useT();
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCheckIn = () => {
    setError(null);
    startTransition(async () => {
      const r = await checkInAction();
      if (r.error) setError(r.error);
    });
  };

  const handleCheckOut = () => {
    setError(null);
    startTransition(async () => {
      const r = await checkOutAction();
      if (r.error) setError(r.error);
    });
  };

  const dateLocale = locale === "en" ? "en-US" : "ko-KR";
  const todayLabel = new Date().toLocaleDateString(dateLocale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-4">
      <div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {t("att.todayDate")}
        </div>
        <div className="text-lg font-semibold">{todayLabel}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TimeBox
          label={t("att.checkIn")}
          time={checkInTime}
          color="blue"
          onClick={handleCheckIn}
          disabled={!!checkInTime || isPending}
          buttonLabel={t("att.checkInBtn")}
          doneLabel={t("att.done")}
        />
        <TimeBox
          label={t("att.checkOut")}
          time={checkOutTime}
          color="orange"
          onClick={handleCheckOut}
          disabled={!checkInTime || !!checkOutTime || isPending}
          buttonLabel={t("att.checkOutBtn")}
          doneLabel={t("att.done")}
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

function TimeBox({
  label,
  time,
  color,
  onClick,
  disabled,
  buttonLabel,
  doneLabel,
}: {
  label: string;
  time: string | null;
  color: "blue" | "orange";
  onClick: () => void;
  disabled: boolean;
  buttonLabel: string;
  doneLabel: string;
}) {
  if (time) {
    const dt = new Date(time);
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return (
      <div
        className={`rounded-md p-3 ${
          color === "blue"
            ? "bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100"
            : "bg-orange-50 dark:bg-orange-950/40 text-orange-900 dark:text-orange-100"
        }`}
      >
        <div className="text-xs opacity-70">{label}</div>
        <div className="text-2xl font-bold mt-1">
          {hh}:{mm}
        </div>
        <div className="text-xs opacity-70 mt-0.5">{doneLabel}</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-3 text-center transition-colors ${
        disabled
          ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 cursor-not-allowed"
          : color === "blue"
            ? "bg-blue-500 hover:bg-blue-600 text-white"
            : "bg-orange-500 hover:bg-orange-600 text-white"
      }`}
    >
      <div className="text-xs opacity-90">{label}</div>
      <div className="text-base font-semibold mt-1">{buttonLabel}</div>
    </button>
  );
}
