"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { UnitSystem } from "@/lib/database.types";
import { scanHealthExport, type BodyMassScan } from "@/lib/import/apple-health";
import { readBackupFromZip } from "@/lib/import/backup";
import { Card } from "@/components/kit/card";
import { Message } from "@/components/profile/controls";
import { cn } from "@/lib/utils";
import { HistoryReview } from "./history-review";
import { ProgressBar } from "./progress";
import { WeightsReview } from "./weights-review";

type Stage =
  | { kind: "idle"; error?: string }
  | { kind: "reading"; fileName: string; progress: number | null }
  | { kind: "history"; fileName: string; text: string }
  | { kind: "weights"; fileName: string; scan: BodyMassScan };

/** Over this, a CSV is almost certainly not a workout export. */
const MAX_CSV_BYTES = 100 * 1024 * 1024;

/**
 * Profile → Data & privacy → "Bring your history".
 *
 * Everything up to the final write happens in the browser: the file is read
 * and parsed here, matched against the library, and reviewed before a single
 * row is sent. A Health export can be most of a gigabyte, which no server
 * action would accept anyway.
 */
export function ImportCard({ system }: { system: UnitSystem }) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const input = useRef<HTMLInputElement>(null);

  async function choose(file: File) {
    setStage({ kind: "reading", fileName: file.name, progress: null });
    try {
      const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
      const isZip = head[0] === 0x50 && head[1] === 0x4b;
      const headText = new TextDecoder().decode(head).replace(/^﻿/, "").trimStart();
      const isXml = /\.xml$/i.test(file.name) || headText.startsWith("<");

      // This app's own export ZIP carries its JSON beside the photos.
      if (isZip) {
        const backup = await readBackupFromZip(file);
        if (backup != null) {
          setStage({ kind: "history", fileName: file.name, text: backup });
          return;
        }
      }

      if (isZip || isXml) {
        const scan = await scanHealthExport(file, (progress) =>
          setStage({ kind: "reading", fileName: file.name, progress }),
        );
        setStage({ kind: "weights", fileName: file.name, scan });
        return;
      }

      if (file.size > MAX_CSV_BYTES) {
        setStage({
          kind: "idle",
          error: "That file is too big to be a workout export. Choose the CSV the app exported, or this app's JSON backup.",
        });
        return;
      }
      setStage({ kind: "history", fileName: file.name, text: await file.text() });
    } catch (error) {
      setStage({
        kind: "idle",
        error: error instanceof Error ? error.message : "We couldn't read that file.",
      });
    }
  }

  const reset = () => {
    setStage({ kind: "idle" });
    if (input.current) input.current.value = "";
  };

  const reviewing = stage.kind === "history" || stage.kind === "weights";

  return (
    <Card className={cn(reviewing && "lg:col-span-2")}>
      {stage.kind === "history" ? (
        <HistoryReview fileName={stage.fileName} text={stage.text} system={system} onClose={reset} />
      ) : stage.kind === "weights" ? (
        <WeightsReview fileName={stage.fileName} scan={stage.scan} system={system} onClose={reset} />
      ) : (
        <>
          <h2 className="text-[15px] font-bold">Bring your history</h2>
          <p className="mt-1 mb-3.5 text-[12.5px] leading-[1.5] text-fg-soft">
            Import the CSV that <strong className="font-semibold text-fg-2">Strong</strong>,{" "}
            <strong className="font-semibold text-fg-2">Hevy</strong> or{" "}
            <strong className="font-semibold text-fg-2">FitNotes</strong> exports, or body weight from an{" "}
            <strong className="font-semibold text-fg-2">Apple Health</strong> export (the export.zip, or the
            export.xml inside it). To restore a <strong className="font-semibold text-fg-2">JLIKA backup</strong>,
            choose the JSON or ZIP from Export your data — workouts, your own exercises and weigh-ins come back,
            and nothing already logged is doubled. You&apos;ll check every exercise before anything is saved.
          </p>

          <input
            ref={input}
            type="file"
            accept=".csv,.txt,.xml,.zip,.json,text/csv,application/zip,text/xml,application/xml,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void choose(file);
            }}
          />

          {stage.kind === "reading" ? (
            stage.progress == null ? (
              <p className="font-mono text-[11px] text-fg-dim uppercase">Reading {stage.fileName}…</p>
            ) : (
              <ProgressBar value={stage.progress} label={`Scanning ${stage.fileName} for weigh-ins`} />
            )
          ) : (
            <div className="flex flex-col gap-3">
              {stage.error ? <Message error={stage.error} /> : null}
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="inline-flex w-fit items-center gap-2 rounded-[11px] border border-stroke bg-ghost px-4 py-3 text-[13px] font-semibold text-fg-2 hover:bg-hover"
              >
                <Upload className="size-3.5" strokeWidth={2.2} />
                Choose a file
              </button>
              <p className="text-[11.5px] leading-[1.5] text-fg-dim">
                Each app keeps its export in its settings. In Health, tap your picture, then Export All
                Health Data, and share the zip to wherever you&apos;re opening this.
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
