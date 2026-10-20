"use client";

import React from "react";
import { CtaSection } from "./landing/cta-section";
import { FeaturesSection } from "./landing/features-section";
import { FooterSection } from "./landing/footer-section";
import { HeroSection } from "./landing/hero-section";
import { HowSection } from "./landing/how-section";
import { LandingNav } from "./landing/landing-nav";

const Page = () => (
  <main className="relative min-h-screen w-full overflow-x-clip bg-background text-foreground">
    <LandingNav />
    <HeroSection />
    <HowSection />
    <FeaturesSection />
    <CtaSection />
    <FooterSection />
  </main>
);

export default Page;
