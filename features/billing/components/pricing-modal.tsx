"use client";

import { PricingTable } from "@clerk/nextjs";

export function PricingModal() {
  return (
    <div className="w-full max-w-5xl mx-auto flex justify-center">
      <PricingTable />
    </div>
  );
}
