"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/shared/logo-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "How it works", id: "how" },
  { label: "Capabilities", id: "features" },
  { label: "Start", id: "cta" },
];

const HEADER_OFFSET = 64;

function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET + 1;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
}

/**
 * The section the reader is in: whichever section overlaps the band between just under the header
 * and 40% down the viewport (the newest one, when two overlap). Percent margins keep it correct
 * through resizes. The footer counts as the last section, so the page bottom never reads as nothing.
 */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const footer = document.getElementById("footer");
    const visible = new Set<string>();
    let footerVisible = false;
    const publish = () => {
      if (footerVisible) return setActive(ids[ids.length - 1]);
      setActive([...ids].reverse().find((id) => visible.has(id)) ?? null);
    };
    const band = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        publish();
      },
      { rootMargin: `-${HEADER_OFFSET + 8}px 0px -60% 0px` },
    );
    const bottom = new IntersectionObserver((entries) => {
      footerVisible = entries.some((entry) => entry.isIntersecting);
      publish();
    });
    elements.forEach((el) => band.observe(el));
    if (footer) bottom.observe(footer);
    return () => {
      band.disconnect();
      bottom.disconnect();
    };
  }, [ids]);
  return active;
}

const sectionIds = navItems.map((item) => item.id);

export function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const active = useActiveSection(sectionIds);
  const headerRef = useRef<HTMLElement>(null);
  const close = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) close();
    };
    const wide = window.matchMedia("(min-width: 1024px)");
    wide.addEventListener("change", close);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      wide.removeEventListener("change", close);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen, close]);

  const go = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    close();
    scrollToSection(id);
  };

  return (
    <header ref={headerRef} className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="relative mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          href="#hero"
          onClick={(event) => {
            event.preventDefault();
            close();
            window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          }}
          className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <LogoMark className="size-6" />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Draw Anything</span>
        </a>

        <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={go(item.id)}
              aria-current={active === item.id ? "true" : undefined}
              className="group relative rounded-md px-3 py-2 text-[13px] font-medium text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:text-foreground"
            >
              {item.label}
              <span
                aria-hidden="true"
                className="absolute inset-x-3 -bottom-[9px] h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-200 ease-out-strong group-aria-[current=true]:scale-x-100"
              />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <SignInButton mode="modal">
            <Button variant="ghost" className="hidden sm:inline-flex">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button>
              Get started
              <ArrowUpRight />
            </Button>
          </SignUpButton>
          <Button
            variant="outline"
            size="icon"
            className="relative lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
          >
            <Menu className={cn("absolute transition-[opacity,transform] duration-150 ease-out-strong", menuOpen ? "scale-90 opacity-0" : "scale-100 opacity-100")} />
            <X className={cn("absolute transition-[opacity,transform] duration-150 ease-out-strong", menuOpen ? "scale-100 opacity-100" : "scale-90 opacity-0")} />
          </Button>
        </div>

        <div
          id="landing-menu"
          data-open={menuOpen}
          inert={!menuOpen}
          className="landing-menu absolute right-4 top-[calc(100%+6px)] w-56 rounded-lg border border-border bg-popover p-1 shadow-popover sm:right-6 lg:hidden"
        >
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={go(item.id)}
              className="block rounded-md px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.label}
            </a>
          ))}
          <div className="mt-1 border-t border-border pt-1 sm:hidden">
            <SignInButton mode="modal">
              <Button variant="ghost" className="w-full justify-start" onClick={close}>
                Sign in
              </Button>
            </SignInButton>
          </div>
        </div>
      </div>
    </header>
  );
}
