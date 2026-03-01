import CleanNavbar from "@/components/layout/navbar/navbar";
import React from "react";
import { HeroSection } from "./landing/hero-section";
import { FeaturesSection } from "./landing/features-section";
import { CtaSection } from "./landing/cta-section";
import { FooterSection } from "./landing/footer-section";

const Page = () => {
  return (
    <main className="w-full min-h-screen relative bg-white">
      {/* Clean Navbar */}
      <div className="relative z-50 h-20 w-full flex items-center bg-white border-b border-gray-100">
        <CleanNavbar />
      </div>

      <HeroSection />
      <FeaturesSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
};

export default Page;
