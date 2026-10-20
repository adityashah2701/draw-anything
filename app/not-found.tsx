import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/shared/logo-mark";
import { Button } from "@/components/ui/button";

// Next adds `noindex` to not-found pages itself.
export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <LogoMark className="size-8" />
        <p className="label-mono">404</p>
        <h1 className="text-xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="text-sm text-text-secondary">The link may be mistyped, or the page has moved.</p>
        <Button asChild>
          <Link href="/">Back to Draw Anything</Link>
        </Button>
      </div>
    </main>
  );
}
