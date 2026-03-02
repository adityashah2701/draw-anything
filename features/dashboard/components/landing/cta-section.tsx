import { Button } from "@/components/ui/button";
import { SignUpButton } from "@clerk/nextjs";
import { ArrowRight, Building2, CalendarDays } from "lucide-react";
import React from "react";

export const CtaSection = () => {
  return (
    <section className="bg-white px-4 py-24 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-slate-300 bg-slate-900 px-6 py-12 text-center md:px-12">
          <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200">
            <Building2 className="h-4 w-4" />
            Deployment-ready for teams of any size
          </div>
          <h2 className="text-balance text-4xl font-bold tracking-tight text-white md:text-5xl">
            Move from idea to executable architecture faster
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
            Replace scattered docs and brittle diagrams with a whiteboard system
            engineered for collaboration, clarity, and execution.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <SignUpButton mode="modal">
              <Button
                size="lg"
                className="h-12 rounded-md bg-blue-600 px-8 text-base font-semibold text-white hover:bg-blue-700"
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </SignUpButton>

            <Button
              variant="outline"
              size="lg"
              className="h-12 rounded-md border-slate-500 bg-slate-900 px-8 text-base font-semibold text-slate-100 hover:bg-slate-800"
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              Schedule Demo
            </Button>
          </div>

          <p className="mt-5 text-sm text-slate-400">
            No credit card required • 14-day trial • Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
};
