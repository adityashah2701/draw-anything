import { Button } from "@/components/ui/button";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import {
  ArrowRight,
  CheckCircle,
  Play,
  Shield,
  Star,
  Users,
  Zap,
} from "lucide-react";
import Image from "next/image";
import React from "react";

export const HeroSection = () => {
  return (
    <section className="relative py-20 lg:py-5 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full border border-gray-200">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700">
                Trusted by 50,000+ teams
              </span>
            </div>

            {/* Main headline */}
            <div className="space-y-6">
              <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 leading-tight">
                Visual
                <br />
                <span className="text-gray-600">Collaboration</span>
                <br />
                <span className="text-blue-600">Reimagined</span>
              </h1>

              <p className="text-xl lg:text-2xl text-gray-600 leading-relaxed max-w-lg">
                The professional whiteboard platform that transforms how teams
                ideate, plan, and execute together.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <SignUpButton mode="modal">
                <Button
                  size="lg"
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg rounded-xl shadow-sm transition-all duration-200"
                >
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </SignUpButton>

              <SignInButton mode="modal">
                <Button
                  variant="outline"
                  size="lg"
                  className="px-8 py-4 border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold text-lg rounded-xl transition-all duration-200"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Watch Demo
                </Button>
              </SignInButton>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center gap-6 pt-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>14-day free trial</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" />
                <span>Enterprise security</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" />
                <span>4.8/5 customer rating</span>
              </div>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="relative">
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 p-8">
              <div className="aspect-video bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-center relative overflow-hidden">
                {/* Simulated whiteboard elements */}
                <div className="absolute top-6 left-6 w-16 h-12 bg-blue-100 border-2 border-blue-300 rounded-lg"></div>
                <div className="absolute top-6 right-6 w-12 h-12 bg-green-100 border-2 border-green-300 rounded-full"></div>
                <div className="absolute bottom-6 left-8 w-24 h-2 bg-gray-300 rounded-full"></div>
                <div className="absolute bottom-12 left-8 w-16 h-2 bg-gray-300 rounded-full"></div>
                <div className="absolute bottom-6 right-6 w-8 h-8 bg-yellow-100 border-2 border-yellow-300 rounded"></div>

                {/* Center focus */}
                <div className="text-center flex justify-center flex-col items-center">
                  <Image src={"/logo.svg"} alt="Logo" height={40} width={40} />

                  <p className="text-gray-600 font-medium">
                    Interactive Workspace
                  </p>
                </div>
              </div>
            </div>

            {/* Floating elements */}
            <div className="absolute -top-4 -right-4 w-12 h-12 bg-white rounded-xl shadow-lg border border-gray-200 flex items-center justify-center">
              <Users className="w-6 h-6 text-gray-600" />
            </div>
            <div className="absolute -bottom-4 -left-4 w-12 h-12 bg-white rounded-xl shadow-lg border border-gray-200 flex items-center justify-center">
              <Zap className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
