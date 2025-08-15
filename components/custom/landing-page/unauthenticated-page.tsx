import { Button } from "@/components/ui/button";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle,
  Globe,
  Grid,
  Layers,
  Play,
  Shield,
  Star,
  Target,
  Users,
  Zap,
} from "lucide-react";
import Image from "next/image";
import React from "react";
import CleanNavbar from "../../../app/(main-page)/_components/_navbar/navbar";

const Page = () => {
  return (
    <main className="w-full min-h-screen relative bg-white">
      {/* Clean Navbar */}
      <div className="relative z-50 h-20 w-full flex items-center bg-white border-b border-gray-100">
        <CleanNavbar />
      </div>

      {/* Hero Section */}
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
                    <Image
                      src={"/logo.svg"}
                      alt="Logo"
                      height={40}
                      width={40}
                    />

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

      {/* Features Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-20">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Everything you need to collaborate effectively
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Professional-grade tools designed for modern teams who demand
              excellence in their collaborative workflow.
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Brain className="w-8 h-8" />,
                title: "Smart Templates",
                description:
                  "Pre-built templates for common workflows, from brainstorming to project planning, ready to use instantly.",
              },
              {
                icon: <Users className="w-8 h-8" />,
                title: "Real-time Collaboration",
                description:
                  "Work together seamlessly with live cursors, instant updates, and synchronized changes across all devices.",
              },
              {
                icon: <Layers className="w-8 h-8" />,
                title: "Infinite Canvas",
                description:
                  "Never run out of space. Zoom, pan, and organize your ideas across an unlimited workspace.",
              },
              {
                icon: <Shield className="w-8 h-8" />,
                title: "Enterprise Security",
                description:
                  "Bank-level encryption, SSO integration, and compliance certifications to keep your data secure.",
              },
              {
                icon: <Globe className="w-8 h-8" />,
                title: "Universal Access",
                description:
                  "Access your work from any device, anywhere. Native apps for desktop, tablet, and mobile.",
              },
              {
                icon: <BarChart3 className="w-8 h-8" />,
                title: "Advanced Analytics",
                description:
                  "Track engagement, measure collaboration patterns, and optimize your team's creative process.",
              },
            ].map((feature, index) => (
              <div key={index} className="group">
                <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300">
                  {/* Icon */}
                  <div className="w-16 h-16 bg-white rounded-2xl border border-gray-200 flex items-center justify-center text-gray-700 mb-6 group-hover:border-blue-200 group-hover:text-blue-600 transition-all duration-300">
                    {feature.icon}
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-bold text-gray-900 mb-4">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}

      {/* Final CTA */}
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

      {/* Clean Footer */}
      <footer className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                  <Grid className="h-5 w-5 text-white" />
                </div>
                <span className="text-2xl font-bold">Draw Anything</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                Professional whiteboard platform for modern teams who value
                efficient collaboration.
              </p>
            </div>

            {["Product", "Company", "Resources"].map((section) => (
              <div key={section}>
                <h4 className="font-semibold text-white mb-4">{section}</h4>
                <ul className="space-y-3 text-sm text-gray-400">
                  {["Features", "Pricing", "Security", "Support"].map(
                    (item) => (
                      <li key={item}>
                        <a
                          href="#"
                          className="hover:text-white transition-colors duration-200"
                        >
                          {item}
                        </a>
                      </li>
                    )
                  )}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-800 pt-8 text-center">
            <p className="text-gray-400 text-sm">
              © 2025 Draw Anything. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
};

export default Page;
