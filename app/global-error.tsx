"use client";

/**
 * Last resort: the root layout itself failed, so this must render its own
 * html and body and cannot rely on globals.css having loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08090a",
          color: "#f2f4f2",
          fontFamily: "system-ui, sans-serif",
          padding: 30,
        }}
      >
        <div
          style={{
            maxWidth: 460,
            border: "1px solid #1d2124",
            background: "#101214",
            borderRadius: 20,
            padding: 32,
          }}
        >
          <h1 style={{ fontSize: 26, margin: "0 0 10px", letterSpacing: "-0.03em" }}>
            JLIKA Gym could not start.
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: "#98a29c", margin: 0 }}>
            Something failed before the app could render. Reloading usually clears it.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: "#5d6763", marginTop: 16 }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              background: "#c9f24d",
              color: "#0a0c0d",
              border: "none",
              borderRadius: 11,
              padding: "13px 22px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
