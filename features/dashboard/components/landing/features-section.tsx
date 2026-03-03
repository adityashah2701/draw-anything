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
          <article className="rounded-2xl border border-slate-300 bg-white p-6 shadow-[0_8px_20px_rgba(15,23,42,0.06)] lg:col-span-5 lg:p-8">
            <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <Bot className="h-3.5 w-3.5 text-blue-700" />
              AI Graph Intelligence
            </p>
            <h3 className="text-2xl font-black tracking-tight text-slate-900">
              AI outputs graph logic.
              <br />
              Engine outputs clean structure.
            </h3>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Prompt in natural language, then get deterministic node semantics,
              branch clarity, and merge behavior without manual cleanup.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Decision diamond rules
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Yes/No edge semantics
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-300 bg-[#0F172A] p-6 text-slate-100 shadow-[0_10px_24px_rgba(15,23,42,0.22)] lg:col-span-7 lg:p-8">
            <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Route className="h-3.5 w-3.5" />
              Layout + Routing Engine
            </p>
            <h3 className="text-3xl font-black tracking-tight">
              Orthogonal edges.
              <br />
              Balanced decisions.
            </h3>
            <div className="mt-6 h-40 rounded-xl border border-slate-700 bg-slate-900 p-4">
              <div className="relative h-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
                <div className="absolute inset-x-0 top-1/2 h-px bg-blue-800/70 motion-safe:animate-[sweepX_10s_linear_infinite]" />
                <div className="absolute left-8 top-8 h-10 w-24 rounded-md border border-slate-500 bg-slate-900" />
                <div className="absolute right-10 top-8 h-10 w-24 rounded-md border border-slate-500 bg-slate-900" />
                <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-slate-500 bg-slate-900" />
                <div className="absolute bottom-8 left-1/2 h-10 w-24 -translate-x-1/2 rounded-md border border-slate-500 bg-slate-900" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-300 bg-white p-6 lg:col-span-4 lg:translate-y-8">
            <p className="mb-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <Workflow className="h-3.5 w-3.5 text-blue-700" />
              Canvas UX
            </p>
            <h4 className="text-xl font-black tracking-tight text-slate-900">
              Interaction that feels precise.
            </h4>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Smart handles, text editing parity, snapping guides, and clean
              transform behavior in collaborative sessions.
            </p>
          </article>

          <article className="rounded-2xl border border-slate-300 bg-white p-6 lg:col-span-3 lg:translate-y-2">
            <p className="mb-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
              Reliability
            </p>
            <h4 className="text-xl font-black tracking-tight text-slate-900">
              Multiplayer by default.
            </h4>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Presence, persistence, and resilient updates across complex boards.
            </p>
          </article>

          <article className="rounded-2xl border border-slate-300 bg-white p-6 lg:col-span-5 lg:-translate-y-4">
            <p className="mb-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <ScanSearch className="h-3.5 w-3.5 text-blue-700" />
              Runtime Signals
            </p>
            <h4 className="text-xl font-black tracking-tight text-slate-900">
              Optimized for large architecture maps.
            </h4>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-700">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                Spatial indexing
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                Batched rendering
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                Cached bounds
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                Deterministic routing
              </div>
            </div>
          </article>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Pipeline
            </p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              Graph → Layout → Render
            </p>
          </div>
          <div className="rounded-xl border border-slate-300 bg-white p-4 md:translate-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Decision Semantics
            </p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              Yes/No branches as edge labels
            </p>
          </div>
          <div className="rounded-xl border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Canvas Runtime
            </p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              Fast editing with deterministic transforms
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
