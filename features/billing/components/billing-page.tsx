import { PricingModal } from "@/features/billing/components/pricing-modal";

export function BillingPage() {
  return (
    <div className="flex h-full w-full flex-col bg-background overflow-y-auto">
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-extrabold text-foreground sm:text-4xl text-balance">
            Simple, Transparent Pricing
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Get the tools you need to collaborate effectively. Upgrade to Pro to
            bypass limitations and unleash your creativity.
          </p>
        </div>

        <PricingModal />
      </div>
    </div>
  );
}
