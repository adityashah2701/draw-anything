import { Button } from "@/components/ui/button";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import React from "react";

export const CtaSection = () => {
  return (
    <section
      id="cta"
      className="scroll-mt-28 px-4 py-24 sm:px-6 lg:px-8 lg:py-32"
    >
      <div className="mx-auto max-w-7xl border-t border-border pt-14">
        <div className="relative grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8 lg:ml-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Final Call
            </p>
            <h2 className="mt-4 max-w-4xl text-[clamp(2.2rem,5.2vw,5.2rem)] font-black leading-[0.92] tracking-[-0.04em] text-foreground">
              Build the architecture once.
              <br />
              Keep every team aligned.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Give product, design, and engineering one shared system of truth
              from decisions to delivery.
            </p>
          </div>

          <div className="lg:col-span-4 lg:pt-10">
            <div className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-md">
              <SignUpButton mode="modal">
                <Button className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </SignUpButton>
              <SignInButton mode="modal">
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-md border-border bg-card text-sm font-semibold text-text-secondary hover:bg-surface-secondary hover:text-foreground"
                >
                  Open Workspace
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              </SignInButton>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              No credit card required • 14-day trial • Cancel anytime
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-0 border border-border bg-card md:grid-cols-3">
          <div className="border-b border-border px-5 py-4 md:border-b-0 md:border-r">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Layer 01
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              AI generates logical graph structures
            </p>
          </div>
          <div className="border-b border-border px-5 py-4 md:border-r md:border-b-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Layer 02
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              Layout engine enforces hierarchy and balance
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Layer 03
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              Canvas runtime delivers precise interactions
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
