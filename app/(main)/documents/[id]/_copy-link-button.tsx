"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";

export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs rounded-md bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1 font-medium shrink-0"
    >
      {copied ? `✓ ${t("docDetail.copied")}` : `📋 ${t("docDetail.copyLink")}`}
    </button>
  );
}
