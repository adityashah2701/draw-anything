import { Grid } from "lucide-react";
import React from "react";

export const FooterSection = () => {
  return (
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
                {["Features", "Pricing", "Security", "Support"].map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="hover:text-white transition-colors duration-200"
                    >
                      {item}
                    </a>
                  </li>
                ))}
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
  );
};
