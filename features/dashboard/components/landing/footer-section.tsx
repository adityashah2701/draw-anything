import { Grid3X3, Mail, ShieldCheck } from "lucide-react";
import React from "react";

export const FooterSection = () => {
  const links = {
    Product: ["Whiteboard", "AI Diagrams", "Flowcharts", "Templates"],
    Platform: ["Security", "Performance", "Collaboration", "Integrations"],
    Company: ["About", "Careers", "Contact", "Terms"],
    Resources: ["Documentation", "Guides", "Support", "Status"],
  };

  return (
    <footer className="bg-slate-950 px-4 py-16 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 border-b border-slate-800 pb-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-600">
                <Grid3X3 className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-semibold tracking-tight text-white">
                Draw Anything
              </span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-slate-400">
              Professional diagram and whiteboard platform for teams that need
              structure, speed, and reliability.
            </p>
            <div className="mt-6 flex flex-col gap-2 text-sm text-slate-400">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-300" />
                Enterprise security posture
              </span>
              <span className="inline-flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-300" />
                support@drawanything.app
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {Object.entries(links).map(([section, items]) => (
              <div key={section}>
                <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
                  {section}
                </h4>
                <ul className="space-y-3 text-sm text-slate-400">
                  {items.map((item) => (
                    <li key={item}>
                      <a
                        href="#"
                        className="transition-colors duration-200 hover:text-white"
                      >
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 pt-6 text-sm text-slate-500 sm:flex-row sm:items-center">
          <p>© 2026 Draw Anything. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-slate-200">
              Privacy
            </a>
            <a href="#" className="hover:text-slate-200">
              Terms
            </a>
            <a href="#" className="hover:text-slate-200">
              Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
