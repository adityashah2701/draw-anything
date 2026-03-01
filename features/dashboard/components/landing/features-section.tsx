import { BarChart3, Brain, Globe, Layers, Shield, Users } from "lucide-react";
import React from "react";

export const FeaturesSection = () => {
  return (
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
  );
};
