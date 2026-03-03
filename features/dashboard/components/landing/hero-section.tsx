"use client";

import { Button } from "@/components/ui/button";
import { SignUpButton } from "@clerk/nextjs";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import React from "react";

const boardItems = [
  "Login Validation Flow",
  "Retry Login Path",
  "Account Lockout Branch",
  "Session Start Flow",
];

export const HeroSection = () => {
  const reduceMotion = useReducedMotion();
  const ease = [0.22, 1, 0.36, 1] as const;
  const cycleDuration = 9.5;
  const hideStart = 0.94;
  const hideEnd = 0.99;

  const shell = {
    hidden: { opacity: 0, y: 18, scale: 0.99 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: reduceMotion ? 0 : 0.55,
        ease,
        when: "beforeChildren" as const,
        staggerChildren: reduceMotion ? 0 : 0.08,
      },
    },
  };

  const panel = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduceMotion ? 0 : 0.42,
        ease,
      },
    },
  };

  const itemStagger = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.08,
      },
    },
  };

  const itemReveal = {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduceMotion ? 0 : 0.32,
        ease,
      },
    },
  };

  const nodeAnim = (startAt: number) => {
    const revealAt = Math.min(startAt + 0.06, 0.9);
    if (reduceMotion) {
      return {
        initial: false,
        animate: { opacity: 1, y: 0, scale: 1 },
        transition: { duration: 0 },
      };
    }
    return {
      initial: { opacity: 0, y: 8, scale: 0.97 },
      animate: {
        opacity: [0, 0, 1, 1, 0, 0],
        y: [8, 8, 0, 0, -2, -2],
        scale: [0.97, 0.97, 1, 1, 1, 1],
      },
      transition: {
        duration: cycleDuration,
        ease: "linear" as const,
        repeat: Infinity,
        times: [0, startAt, revealAt, hideStart, hideEnd, 1],
      },
    };
  };

  const lineYAnim = (startAt: number) => {
    const revealAt = Math.min(startAt + 0.06, 0.9);
    if (reduceMotion) {
      return {
        initial: false,
        animate: { opacity: 1, scaleY: 1 },
        transition: { duration: 0 },
      };
    }
    return {
      initial: { opacity: 0, scaleY: 0 },
      animate: {
        opacity: [0, 0, 1, 1, 0, 0],
        scaleY: [0, 0, 1, 1, 0, 0],
      },
      transition: {
        duration: cycleDuration,
        ease: "linear" as const,
        repeat: Infinity,
        times: [0, startAt, revealAt, hideStart, hideEnd, 1],
      },
    };
  };

  const lineXAnim = (startAt: number) => {
    const revealAt = Math.min(startAt + 0.06, 0.9);
    if (reduceMotion) {
      return {
        initial: false,
        animate: { opacity: 1, scaleX: 1 },
        transition: { duration: 0 },
      };
    }
    return {
      initial: { opacity: 0, scaleX: 0 },
      animate: {
        opacity: [0, 0, 1, 1, 0, 0],
        scaleX: [0, 0, 1, 1, 0, 0],
      },
      transition: {
        duration: cycleDuration,
        ease: "linear" as const,
        repeat: Infinity,
        times: [0, startAt, revealAt, hideStart, hideEnd, 1],
      },
    };
  };

  return (
    <section
      id="hero"
      className="scroll-mt-28 px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pb-24 lg:pt-16"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
              <Sparkles className="h-3.5 w-3.5 text-blue-700" />
              Diagram intelligence for modern teams
            </p>
            <h1 className="max-w-4xl text-[clamp(2.25rem,5.8vw,5rem)] font-black leading-[0.95] tracking-[-0.04em] text-[#0F172A]">
              Architecture that stays aligned.
            </h1>
            <p className="mt-1 text-[clamp(1.7rem,4.4vw,3.6rem)] font-semibold leading-[0.96] tracking-[-0.03em] text-slate-500">
              Signals. Intent. Action.
            </p>
          </div>

          <div className="lg:col-span-4 lg:flex lg:justify-end">
            <SignUpButton mode="modal">
              <Button className="h-12 rounded-md bg-blue-700 px-6 text-base font-semibold text-white hover:bg-blue-800">
                Set up your workspace
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </SignUpButton>
          </div>
        </div>

        <motion.div
          className="mt-10 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.12)]"
          variants={shell}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
        >
          <motion.div
            className="border-b border-slate-200 bg-slate-100 px-4 py-3"
            variants={panel}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                <div className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              </div>
              <p className="text-xs font-medium text-slate-600">
                Draw Anything Workspace
              </p>
              <Image src="/logo.svg" alt="Logo" width={16} height={16} />
            </div>
          </motion.div>

          <div className="relative bg-slate-50 p-4 sm:p-6">
            <motion.div
              className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:22px_22px]"
              variants={panel}
            />
            <motion.div
              className="relative rounded-xl border border-slate-300 bg-white shadow-sm"
              variants={panel}
            >
              <div className="grid min-h-[320px] grid-cols-1 lg:min-h-[380px] lg:grid-cols-[210px_1fr]">
                <motion.aside
                  className="border-b border-slate-200 bg-slate-50 p-4 lg:border-r lg:border-b-0"
                  variants={panel}
                >
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Flows
                  </p>
                  <motion.div className="space-y-2 text-sm" variants={itemStagger}>
                    {boardItems.map((item, index) => (
                      <motion.div
                        key={item}
                        variants={itemReveal}
                        className={
                          index === 0
                            ? "rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-800"
                            : "rounded-md px-3 py-2 text-slate-600"
                        }
                      >
                        {item}
                      </motion.div>
                    ))}
                  </motion.div>
                </motion.aside>

                <motion.div className="p-4 sm:p-6" variants={panel}>
                  <motion.div
                    className="mb-4 flex items-center justify-between gap-3"
                    variants={panel}
                  >
                    <div>
                      <h3 className="text-xl font-bold tracking-tight text-slate-900">
                        AI Login Flow Generation
                      </h3>
                      <p className="text-sm text-slate-500">
                        Prompt: Create user login validation flow with retry
                        branch
                      </p>
                    </div>
                    <motion.div
                      className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{
                        duration: reduceMotion ? 0 : 0.3,
                        delay: reduceMotion ? 0 : 0.1,
                      }}
                    >
                      <motion.span
                        className="h-2 w-2 rounded-full bg-blue-600"
                        animate={
                          reduceMotion
                            ? undefined
                            : { opacity: [1, 0.35, 1], scale: [1, 0.9, 1] }
                        }
                        transition={{
                          repeat: Infinity,
                          duration: 1.1,
                          ease: "easeInOut",
                        }}
                      />
                      Generating...
                    </motion.div>
                  </motion.div>

                  <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-[#f8fafc] p-3 sm:p-5">
                    <div className="relative hidden h-[500px] md:block">
                      <motion.div
                        className="absolute left-1/2 top-[20px] z-10 flex h-[68px] w-[68px] -translate-x-1/2 items-center justify-center rounded-full border-2 border-slate-700 bg-amber-100 text-sm font-semibold text-slate-800"
                        {...nodeAnim(0.06)}
                      >
                        Start
                      </motion.div>

                      <motion.div
                        className="absolute left-1/2 top-[88px] z-0 h-[34px] w-0.5 -translate-x-1/2 origin-top bg-slate-500"
                        {...lineYAnim(0.12)}
                      />

                      <motion.div
                        className="absolute left-1/2 top-[122px] z-10 flex h-[54px] w-[180px] -translate-x-1/2 items-center justify-center rounded-md border-2 border-slate-700 bg-white text-base font-semibold text-slate-800"
                        {...nodeAnim(0.18)}
                      >
                        Login
                      </motion.div>

                      <motion.div
                        className="absolute left-1/2 top-[176px] z-0 h-[44px] w-0.5 -translate-x-1/2 origin-top bg-slate-500"
                        {...lineYAnim(0.24)}
                      />

                      <motion.div
                        className="absolute left-1/2 top-[220px] z-10 h-[64px] w-[64px] -translate-x-1/2 rotate-45 border-2 border-slate-700 bg-rose-100"
                        {...nodeAnim(0.3)}
                      >
                        <div className="flex h-full w-full -rotate-45 items-center justify-center text-sm font-semibold text-slate-800">
                          Valid?
                        </div>
                      </motion.div>

                      <motion.div
                        className="absolute left-1/2 top-[284px] z-0 h-[24px] w-0.5 -translate-x-1/2 origin-top bg-slate-500"
                        {...lineYAnim(0.36)}
                      />
                      <motion.div
                        className="absolute left-[30%] right-[30%] top-[308px] z-0 h-0.5 origin-left bg-slate-500"
                        {...lineXAnim(0.42)}
                      />
                      <motion.div
                        className="absolute left-[30%] top-[308px] z-0 h-[12px] w-0.5 origin-top bg-slate-500"
                        {...lineYAnim(0.48)}
                      />
                      <motion.div
                        className="absolute right-[30%] top-[308px] z-0 h-[12px] w-0.5 origin-top bg-slate-500"
                        {...lineYAnim(0.48)}
                      />

                      <motion.div
                        className="absolute left-[29.2%] top-[288px] text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                        {...nodeAnim(0.5)}
                      >
                        No
                      </motion.div>
                      <motion.div
                        className="absolute right-[29.2%] top-[288px] text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                        {...nodeAnim(0.52)}
                      >
                        Yes
                      </motion.div>

                      <motion.div
                        className="absolute left-[18%] top-[320px] z-10 flex h-[50px] w-[170px] items-center justify-center rounded-md border-2 border-slate-700 bg-white text-base font-semibold text-slate-800"
                        {...nodeAnim(0.58)}
                      >
                        Show Error
                      </motion.div>
                      <motion.div
                        className="absolute right-[18%] top-[320px] z-10 flex h-[50px] w-[170px] items-center justify-center rounded-md border-2 border-slate-700 bg-white text-base font-semibold text-slate-800"
                        {...nodeAnim(0.58)}
                      >
                        Dashboard
                      </motion.div>

                      <motion.div
                        className="absolute left-[30%] top-[370px] z-0 h-[16px] w-0.5 origin-top bg-slate-500"
                        {...lineYAnim(0.68)}
                      />
                      <motion.div
                        className="absolute right-[30%] top-[370px] z-0 h-[16px] w-0.5 origin-top bg-slate-500"
                        {...lineYAnim(0.68)}
                      />
                      <motion.div
                        className="absolute left-[30%] right-[30%] top-[386px] z-0 h-0.5 origin-left bg-slate-500"
                        {...lineXAnim(0.74)}
                      />
                      <motion.div
                        className="absolute left-1/2 top-[386px] z-0 h-[34px] w-0.5 -translate-x-1/2 origin-top bg-slate-500"
                        {...lineYAnim(0.8)}
                      />

                      <motion.div
                        className="absolute left-1/2 top-[420px] z-10 flex h-[60px] w-[60px] -translate-x-1/2 items-center justify-center rounded-full border-2 border-slate-700 bg-amber-100 text-sm font-semibold text-slate-800"
                        {...nodeAnim(0.86)}
                      >
                        End
                      </motion.div>
                    </div>

                    <motion.div
                      className="space-y-2 md:hidden"
                      variants={itemStagger}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, amount: 0.2 }}
                    >
                      {["Start", "Login", "Valid? (Decision)", "Show Error / Dashboard", "End"].map(
                        (step) => (
                          <motion.div
                            key={step}
                            variants={itemReveal}
                            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                          >
                            {step}
                          </motion.div>
                        ),
                      )}
                    </motion.div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
