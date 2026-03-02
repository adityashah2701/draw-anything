import { Button } from "@/components/ui/button";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import {
  ArrowRight,
  Dot,
  MoveRight,
  Shield,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import React from "react";

export const HeroSection = () => {
  return (
    <section className="bg-slate-50 px-4 py-24 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <div className="mb-7 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <span>Built for product, design, and engineering teams</span>
          </div>

          <h1 className="text-balance text-5xl font-bold tracking-tight text-slate-900 md:text-6xl lg:text-7xl">
            Visual Collaboration
            <br />
            Built for Serious Teams
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-slate-600 md:text-xl">
            Plan architecture, map workflows, and align execution in one shared
            workspace designed for precision and scale.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <SignUpButton mode="modal">
              <Button
                size="lg"
                className="h-12 rounded-md bg-blue-600 px-7 text-base font-semibold text-white hover:bg-blue-700"
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </SignUpButton>
            <SignInButton mode="modal">
              <Button
                variant="outline"
                size="lg"
                className="h-12 rounded-md border-slate-300 bg-white px-7 text-base font-semibold text-slate-700 hover:bg-slate-100"
              >
                Open Workspace
                <MoveRight className="ml-2 h-4 w-4" />
              </Button>
            </SignInButton>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
              <Shield className="mr-1.5 h-4 w-4 text-slate-700" />
              Enterprise-ready security
            </span>
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
              <Dot className="h-4 w-4 text-blue-600" />
              14-day free trial
            </span>
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
              <Dot className="h-4 w-4 text-blue-600" />
              Real-time collaboration
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <div className="h-2.5 w-2.5 rounded-full bg-slate-200" />
            </div>
            <div className="text-xs font-medium text-slate-600">
              Draw Anything Workspace
            </div>
            <Image src="/logo.svg" alt="Logo" height={20} width={20} />
          </div>

          <div className="grid min-h-[360px] grid-cols-1 gap-0 bg-white lg:grid-cols-[240px_1fr]">
            <aside className="border-b border-slate-200 bg-slate-50 p-4 lg:border-r lg:border-b-0">
              <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Boards
              </div>
              <div className="space-y-2 text-sm">
                <div className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-800">
                  Checkout Flow
                </div>
                <div className="rounded-md px-3 py-2 text-slate-600">
                  System Design
                </div>
                <div className="rounded-md px-3 py-2 text-slate-600">
                  Sprint Mapping
                </div>
              </div>
            </aside>

            <div className="relative bg-slate-50 p-6">
              <div className="relative mx-auto mt-4 max-w-2xl space-y-6">
                <div className="mx-auto h-16 w-48 rounded-md border-2 border-slate-700 bg-blue-50 px-3 py-4 text-center text-lg font-semibold text-slate-800">
                  API Gateway
                </div>
                <div className="mx-auto h-8 w-0.5 bg-slate-500" />
                <div className="grid grid-cols-2 gap-6">
                  <div className="h-14 rounded-md border-2 border-slate-700 bg-white px-3 py-3 text-center font-medium text-slate-800">
                    Auth Service
                  </div>
                  <div className="h-14 rounded-md border-2 border-slate-700 bg-white px-3 py-3 text-center font-medium text-slate-800">
                    Order Service
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="h-14 rounded-full border-2 border-slate-700 bg-amber-100 px-3 py-3 text-center font-medium text-slate-800">
                    Session Store
                  </div>
                  <div className="h-14 rounded-full border-2 border-slate-700 bg-amber-100 px-3 py-3 text-center font-medium text-slate-800">
                    Inventory DB
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
