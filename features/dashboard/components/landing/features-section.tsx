import {
  Bot,
  Route,
  ScanSearch,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import React from "react";

export const FeaturesSection = () => {
  return (
    <section
      id="features"
      className="scroll-mt-28 px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-7 lg:grid-cols-12">
          <article className="rounded-2xl border border-border bg-card p-6 shadow-md lg:col-span-5 lg:p-8">
            <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Bot className="h-3.5 w-3.5 text-primary" />
              AI Graph Intelligence
            </p>
            <h3 className="text-2xl font-black tracking-tight text-foreground">
              AI outputs graph logic.
              <br />
              Engine outputs clean structure.
            </h3>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Prompt in natural language, then get deterministic node semantics,
              branch clarity, and merge behavior without manual cleanup.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                Decision diamond rules
              </div>
              <div className="rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                Yes/No edge semantics
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-border bg-surface-secondary p-6 text-foreground shadow-lg lg:col-span-7 lg:p-8">
            <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Route className="h-3.5 w-3.5 text-primary" />
              Layout + Routing Engine
            </p>
            <h3 className="text-3xl font-black tracking-tight">
              Orthogonal edges.
              <br />
              Balanced decisions.
            </h3>
            <div className="mt-6 h-40 rounded-xl border border-border bg-surface p-4">
              <div className="relative h-full overflow-hidden rounded-lg border border-border bg-background">
                <div className="absolute inset-x-0 top-1/2 h-px bg-primary/70 motion-safe:animate-[sweepX_10s_linear_infinite]" />
                <div className="absolute left-8 top-8 h-10 w-24 rounded-md border border-border bg-surface" />
                <div className="absolute right-10 top-8 h-10 w-24 rounded-md border border-border bg-surface" />
                <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-border bg-surface" />
                <div className="absolute bottom-8 left-1/2 h-10 w-24 -translate-x-1/2 rounded-md border border-border bg-surface" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-border bg-card p-6 lg:col-span-4 lg:translate-y-8">
            <p className="mb-3 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Workflow className="h-3.5 w-3.5 text-primary" />
              Canvas UX
            </p>
            <h4 className="text-xl font-black tracking-tight text-foreground">
              Interaction that feels precise.
            </h4>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Smart handles, text editing parity, snapping guides, and clean
              transform behavior in collaborative sessions.
            </p>
          </article>

          <article className="rounded-2xl border border-border bg-card p-6 lg:col-span-3 lg:translate-y-2">
            <p className="mb-3 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Reliability
            </p>
            <h4 className="text-xl font-black tracking-tight text-foreground">
              Multiplayer by default.
            </h4>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Presence, persistence, and resilient updates across complex boards.
            </p>
          </article>

          <article className="rounded-2xl border border-border bg-card p-6 lg:col-span-5 lg:-translate-y-4">
            <p className="mb-3 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ScanSearch className="h-3.5 w-3.5 text-primary" />
              Runtime Signals
            </p>
            <h4 className="text-xl font-black tracking-tight text-foreground">
              Optimized for large architecture maps.
            </h4>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-foreground">
              <div className="rounded-md border border-border bg-background px-3 py-2">
                Spatial indexing
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                Batched rendering
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                Cached bounds
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                Deterministic routing
              </div>
            </div>
          </article>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Pipeline
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              Graph → Layout → Render
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 md:translate-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Decision Semantics
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              Yes/No branches as edge labels
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Canvas Runtime
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              Fast editing with deterministic transforms
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
