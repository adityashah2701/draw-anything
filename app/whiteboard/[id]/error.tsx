"use client";

import Link from "next/link";
import { useEffect } from "react";

// Any failure while loading a board (a query that throws, a realtime
// connection that cannot be set up) lands here instead of a blank crash page.
export default function WhiteboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[whiteboard] failed to load:", error);
  }, [error]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 px-4 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          This whiteboard could not be loaded
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Something went wrong while opening it. Try again, or go back to your
          whiteboards.
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={reset}
            className="text-sm font-medium text-indigo-600 underline underline-offset-4"
          >
            Try again
          </button>
          <Link
            href="/"
            className="text-sm font-medium text-indigo-600 underline underline-offset-4"
          >
            Back to your whiteboards
          </Link>
        </div>
      </div>
    </div>
  );
}
