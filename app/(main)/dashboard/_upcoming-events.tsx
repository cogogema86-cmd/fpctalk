"use client";

import { useTransition } from "react";
import { ackEventAction } from "@/app/(main)/events/actions";
import { useT } from "@/lib/i18n/client";

type Event = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string | null;
  daysFromNow: number;
  acked: boolean;
};

export function UpcomingEvents({
  events,
  locale,
}: {
  events: Event[];
  locale: "ko" | "en";
}) {
  const t = useT();

  if (events.length === 0) return null;

  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        🎉 {t("dashboard.upcomingTitle")}
      </h2>
      <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
        {events.map((ev) => (
          <EventRow
            key={ev.id}
            event={ev}
            dateLabel={`${dateFmt.format(new Date(ev.startDate))}${
              new Date(ev.startDate).toDateString() !==
              new Date(ev.endDate).toDateString()
                ? ` ~ ${dateFmt.format(new Date(ev.endDate))}`
                : ""
            }`}
          />
        ))}
      </ul>
    </section>
  );
}

function EventRow({
  event,
  dateLabel,
}: {
  event: Event;
  dateLabel: string;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const dDay =
    event.daysFromNow === 0
      ? t("dashboard.today")
      : `D-${event.daysFromNow}`;

  return (
    <li
      className={`px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${
        event.acked
          ? "bg-white dark:bg-zinc-950"
          : "bg-amber-50/40 dark:bg-amber-950/10"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{event.title}</span>
          <span
            className={`text-[11px] rounded px-1.5 py-0.5 ${
              event.daysFromNow <= 1
                ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"
                : "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200"
            }`}
          >
            {dDay}
          </span>
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">
          📅 {dateLabel}
          {event.location && <> · 📍 {event.location}</>}
        </div>
      </div>
      <div className="shrink-0">
        {event.acked ? (
          <span className="text-xs text-green-700 dark:text-green-400 font-medium">
            ✓ {t("dashboard.acked")}
          </span>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await ackEventAction(event.id);
              })
            }
            className="text-xs rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 disabled:opacity-50"
          >
            {isPending ? t("dashboard.acking") : t("dashboard.ack")}
          </button>
        )}
      </div>
    </li>
  );
}
