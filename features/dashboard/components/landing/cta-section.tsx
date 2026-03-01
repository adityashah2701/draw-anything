import { Button } from "@/components/ui/button";
import { SignUpButton } from "@clerk/nextjs";
import { ArrowRight, Target } from "lucide-react";
import React from "react";

export const CtaSection = () => {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-4xl mx-auto text-center">
        <div className="bg-gray-50 rounded-3xl p-12 border border-gray-200">
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            Ready to transform your teamwork?
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Join thousands of teams who have already discovered the power of
            visual collaboration.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            <SignUpButton mode="modal">
              <Button
                size="lg"
                className="px-10 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-xl shadow-sm transition-all duration-200"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </SignUpButton>

            <Button
              variant="outline"
              size="lg"
              className="px-10 py-4 border-gray-300 text-gray-700 hover:bg-gray-50 font-bold text-lg rounded-xl"
            >
              <Target className="w-5 h-5 mr-2" />
              Schedule Demo
            </Button>
          </div>

          <p className="text-sm text-gray-500">
            No credit card required • 14-day free trial • Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
};
