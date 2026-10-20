"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export const CtaSection = () => (
  <section id="cta" className="scroll-mt-16 border-t border-border px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
    <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
      <Reveal className="max-w-2xl">
        <p className="label-mono mb-4">Start</p>
        <h2 className="text-[clamp(1.75rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground">
          Start with a sentence.
          <br />
          Finish with a diagram.
        </h2>
      </Reveal>
      <Reveal delay={60} className="flex flex-wrap items-center gap-2">
        <SignUpButton mode="modal">
          <Button size="lg">
            Start drawing
            <ArrowUpRight />
          </Button>
        </SignUpButton>
        <SignInButton mode="modal">
          <Button size="lg" variant="outline">
            Sign in
          </Button>
        </SignInButton>
      </Reveal>
    </div>
  </section>
);
