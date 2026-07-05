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
    <main className="relative min-h-screen w-full overflow-x-hidden scroll-smooth bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-[76px] w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-border bg-card p-2 shadow-sm">
              <Image src="/logo.svg" alt="Logo" height={20} width={20} className="dark:invert" />
            </div>
            <div className="leading-tight">
              <h1 className="text-[27px] font-bold tracking-tight text-foreground">
                Draw Anything
              </h1>
              <p className="text-[11px] tracking-[0.08em] text-muted-foreground">
                Diagram Intelligence Platform
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 rounded-full border border-border bg-card p-1.5 shadow-sm lg:flex">
            {navItems.map((item, index) => (
              <button
                key={item.label}
                type="button"
                className={
                  index === 0
                    ? "cursor-pointer rounded-full bg-surface-secondary px-4 py-1.5 text-sm font-medium text-text-secondary transition-colors"
                    : "cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
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
                className="hidden h-10 rounded-md px-4 text-sm font-semibold text-text-secondary hover:bg-surface-secondary sm:inline-flex"
              >
                Sign In
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">
                Get Started
                <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Button>
            </SignUpButton>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-md border border-border bg-card text-text-secondary hover:bg-surface-secondary lg:hidden"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label="Toggle navigation"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {mobileNavOpen && (
          <div className="border-t border-border bg-background px-4 py-4 sm:px-6 lg:hidden">
            <div className="mx-auto max-w-7xl rounded-xl border border-border bg-card p-2 shadow-md">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
                  onClick={() => {
                    scrollToSection(item.href);
                    setMobileNavOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
              <div className="mt-2 border-t border-border pt-2">
                <SignInButton mode="modal">
                  <Button
                    variant="ghost"
                    className="w-full justify-start rounded-lg px-3 text-sm font-semibold text-text-secondary hover:bg-surface-secondary"
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
