"use client";

import { ArrowUpRight } from "lucide-react";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { HeroDemo } from "./hero-demo";

const rise = (delay: number) => ({ "--d": `${delay}ms` }) as CSSProperties;

export const HeroSection = () => (
  <section id="hero" className="scroll-mt-16 px-4 pb-20 pt-12 sm:px-6 lg:px-8 lg:pb-28 lg:pt-20">
    <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:items-center lg:gap-10">
      <div className="lg:col-span-5">
        <p className="landing-rise label-mono mb-5" style={rise(0)}>
          AI-assisted diagramming
        </p>
        <h1
          className="landing-rise text-[clamp(2rem,3.2vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground"
          style={rise(40)}
        >
          Describe it.
          <br />
          Watch it get drawn.
        </h1>
        <p className="landing-rise mt-5 max-w-md text-base leading-relaxed text-text-secondary" style={rise(100)}>
          Type what the diagram should show. An agent draws it on your canvas, and everything it draws is an ordinary
          shape you can move, restyle and connect.
        </p>
        <div className="landing-rise mt-8 flex flex-wrap items-center gap-2" style={rise(160)}>
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
        </div>
      </div>

      <div className="landing-rise lg:col-span-7" style={rise(200)}>
        <HeroDemo />
      </div>
    </div>
  </section>
);
