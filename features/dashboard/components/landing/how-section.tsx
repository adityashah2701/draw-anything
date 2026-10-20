"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Reveal, useInView } from "./reveal";

const steps = [
  {
    n: "01",
    who: "you",
    title: "Describe it",
    body: "Say what the diagram should show: a login flow, a deploy pipeline, an approval process.",
  },
  {
    n: "02",
    who: "agent",
    title: "The agent draws",
    body: "It adds shapes and connectors to your canvas step by step, so you see the structure form.",
  },
  {
    n: "03",
    who: "you",
    title: "You refine",
    body: "Move, restyle and reconnect. Connectors re-route as you drag, and everyone on the board sees it live.",
  },
] as const;

const STEP_MS = 120;

export const HowSection = () => {
  const [ref, inView] = useInView<HTMLOListElement>({ threshold: 0.2 });

  return (
    <section id="how" className="scroll-mt-16 border-t border-border px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal className="max-w-xl">
          <p className="label-mono mb-4">How it works</p>
          <h2 className="text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            You steer. The agent does the drawing.
          </h2>
        </Reveal>

        <ol ref={ref} className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((step, index) => {
            const delay = index * STEP_MS;
            return (
              <li key={step.n}>
                <div className="reveal flex items-center gap-3" data-in={inView} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
                  <span
                    className={cn(
                      "label-mono flex size-8 items-center justify-center rounded-md border bg-card text-foreground",
                      step.who === "agent" ? "border-agent" : "border-primary",
                    )}
                  >
                    {step.n}
                  </span>
                  {index < steps.length - 1 && (
                    <span className="relative hidden h-px flex-1 md:block" aria-hidden="true">
                      <span className="absolute inset-0 bg-border" />
                      <span
                        className="draw-x absolute inset-0 bg-primary/60"
                        data-in={inView}
                        style={{ "--reveal-delay": `${delay + 100}ms` } as CSSProperties}
                      />
                    </span>
                  )}
                </div>
                <div className="reveal mt-5" data-in={inView} style={{ "--reveal-delay": `${delay + 60}ms` } as CSSProperties}>
                  <p className="label-mono mb-2">{step.who === "agent" ? "Agent" : "You"}</p>
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">{step.title}</h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};
