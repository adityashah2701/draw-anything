import React, { useState } from "react";
import { HeroSection } from "./landing/hero-section";
import { FeaturesSection } from "./landing/features-section";
import { CtaSection } from "./landing/cta-section";
import { FooterSection } from "./landing/footer-section";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { ArrowUpRight, Menu, X } from "lucide-react";

const Page = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navItems = [
    { label: "Overview", href: "#hero" },
    { label: "Capabilities", href: "#features" },
    { label: "Start", href: "#cta" },
    { label: "Contact", href: "#footer" },
  ];
  const scrollToSection = (href: string) => {
    if (typeof window === "undefined") return;
    const id = href.replace("#", "");
    const target = document.getElementById(id);
    if (!target) return;

    const headerOffset = 92;
    const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    window.scrollTo({
      top: Math.max(0, top),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden scroll-smooth bg-[#F6F7FB] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-300/80 bg-[#F6F7FB]/90 backdrop-blur-md">
        <div className="mx-auto flex h-[76px] w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-slate-300 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
              <Image src="/logo.svg" alt="Logo" height={20} width={20} />
            </div>
            <div className="leading-tight">
              <h1 className="text-[27px] font-bold tracking-tight text-slate-900">
                Draw Anything
              </h1>
              <p className="text-[11px] tracking-[0.08em] text-slate-500">
                Diagram Intelligence Platform
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 rounded-full border border-slate-300 bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] lg:flex">
            {navItems.map((item, index) => (
              <button
                key={item.label}
                type="button"
                className={
                  index === 0
                    ? "cursor-pointer rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-700 transition-colors"
                    : "cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800"
                }
                onClick={() => scrollToSection(item.href)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <SignInButton mode="modal">
              <Button
                variant="ghost"
                className="hidden h-10 rounded-md px-4 text-sm font-semibold text-slate-700 hover:bg-white sm:inline-flex"
              >
                Sign In
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(15,23,42,0.18)] hover:bg-slate-800">
                Get Started
                <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Button>
            </SignUpButton>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label="Toggle navigation"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {mobileNavOpen && (
          <div className="border-t border-slate-200 bg-[#F6F7FB] px-4 py-4 sm:px-6 lg:hidden">
            <div className="mx-auto max-w-7xl rounded-xl border border-slate-300 bg-white p-2 shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  onClick={() => {
                    scrollToSection(item.href);
                    setMobileNavOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
              <div className="mt-2 border-t border-slate-200 pt-2">
                <SignInButton mode="modal">
                  <Button
                    variant="ghost"
                    className="w-full justify-start rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    Sign In
                  </Button>
                </SignInButton>
              </div>
            </div>
          </div>
        )}
      </header>

      <HeroSection />
      <FeaturesSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
};

export default Page;
