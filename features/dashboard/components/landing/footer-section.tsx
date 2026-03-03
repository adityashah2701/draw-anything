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
    <footer
      id="footer"
      className="scroll-mt-28 relative overflow-hidden bg-[#0A1020] px-4 py-20 text-slate-100 sm:px-6 lg:px-8"
    >
      <div className="pointer-events-none absolute -bottom-12 left-4 text-[clamp(4rem,14vw,13rem)] font-black tracking-[-0.05em] text-white/5">
        DRAW ANYTHING
      </div>

      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700">
                <Grid3X3 className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-semibold tracking-tight text-white">
                Draw Anything
              </span>
            </div>
            <p className="max-w-md text-base leading-relaxed text-slate-300">
              If your system can&apos;t be seen, it can&apos;t be aligned. Draw
              Anything helps teams externalize complexity and move with
              confidence.
            </p>
            <div className="mt-8 space-y-2 text-sm text-slate-400">
              <p className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-300" />
                Enterprise security
              </p>
              <p className="inline-flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-300" />
                support@drawanything.app
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 lg:col-span-4 lg:translate-y-8">
            {Object.entries(links)
              .slice(0, 2)
              .map(([section, items]) => (
                <div key={section}>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {section}
                  </h4>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {items.map((item) => (
                      <li key={item}>
                        <a href="#" className="transition-colors hover:text-white">
                          {item}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>

          <div className="grid grid-cols-2 gap-8 lg:col-span-3 lg:-translate-y-3">
            {Object.entries(links)
              .slice(2)
              .map(([section, items]) => (
                <div key={section}>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {section}
                  </h4>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {items.map((item) => (
                      <li key={item}>
                        <a href="#" className="transition-colors hover:text-white">
                          {item}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>

        <div className="mt-12 border-t border-slate-800 pt-6">
          <div className="flex flex-col gap-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Draw Anything. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-4">
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
      </div>

      <div className="mt-10 overflow-hidden border-y border-slate-800 bg-slate-900/40 py-3">
        <div className="flex w-[200%] gap-6 text-xs uppercase tracking-[0.16em] text-slate-400 motion-safe:animate-[tickerSlide_24s_linear_infinite]">
          {Array.from({ length: 16 }).map((_, idx) => (
            <span key={idx} className="whitespace-nowrap">
              Architecture clarity at scale
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
};
