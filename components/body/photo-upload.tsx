"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus } from "lucide-react";
import { createPhotoUploadTarget, recordPhoto } from "@/app/actions/body";
import { createClient } from "@/lib/supabase/client";
import { toDateString } from "@/lib/dates";
import type { Pose } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const MAX_EDGE = 1600;

/**
 * Downscales to at most 1600px on the long edge and re-encodes as webp before
 * anything leaves the browser.
 *
 * Re-encoding through a canvas also drops EXIF, which is where phones put GPS
 * coordinates — these are photos of someone's body, so that matters more than
 * the bandwidth saving.
 */
async function toWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process that image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  if (!blob) throw new Error("Could not convert that image.");
  return blob;
}

export function PhotoUpload({ pose }: { pose: Pose }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const blob = await toWebp(file);

      const target = await createPhotoUploadTarget();
      if ("error" in target) throw new Error(target.error);

      // Straight from the browser to Storage with a one-time token — the image
      // never passes through the app server.
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("progress-photos")
        .uploadToSignedUrl(target.path, target.token, blob, {
          contentType: "image/webp",
        });
      if (uploadError) throw uploadError;

      startTransition(async () => {
        const result = await recordPhoto({
          storagePath: target.path,
          takenOn: toDateString(new Date()),
          pose,
          weightKg: null,
        });
        if (result.error) setError(result.error);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={`Add a ${pose} progress photo`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        disabled={busy || pending}
        onClick={() => input.current?.click()}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-[11px] border border-dashed border-stroke px-4 py-3 text-[12.5px] font-semibold text-fg-muted transition-colors",
          "hover:border-accent hover:text-accent disabled:opacity-60",
        )}
      >
        <ImagePlus className="size-4" strokeWidth={1.8} />
        {busy || pending ? "Uploading…" : `Add ${pose} photo`}
      </button>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      <p className="mt-2 text-[11px] leading-[1.5] text-fg-dim">
        Resized to 1600px and converted to webp in your browser. EXIF, including
        any location, is stripped in the process. Stored in a private bucket.
      </p>
    </div>
  );
}
