"use client";

import { Printer } from "lucide-react";

/** Opens the browser's print dialog, where "Save as PDF" lives too. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="ml-auto flex flex-none items-center gap-2 rounded-[10px] border border-[#111] px-3.5 py-2 text-[13px] font-semibold print:hidden"
    >
      <Printer className="size-3.5" strokeWidth={2} />
      Print or save PDF
    </button>
  );
}
