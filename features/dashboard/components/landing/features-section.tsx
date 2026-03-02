import {
  Bot,
  GitBranch,
  Hand,
  Lock,
  MousePointer2,
  Route,
  Sparkles,
  Workflow,
} from "lucide-react";
import React from "react";

export const FeaturesSection = () => {
  const sections = [
    {
      title: "Architecture Mapping Without Friction",
      description:
        "Generate production-grade architecture diagrams from natural language, then refine each component with direct manipulation on canvas.",
      bullets: [
        "AI graph generation with strict shape semantics",
        "Decision and merge-aware flowchart layout",
        "Orthogonal routing with clean branch readability",
      ],
      icon: <Workflow className="h-5 w-5 text-slate-700" />,
      preview: (
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-11 rounded-md border border-slate-300 bg-blue-50 px-3 py-2 text-sm font-medium text-slate-800">
            Prompt: Generate checkout decision flow
          </div>
          <div className="h-24 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs text-slate-600">
              <Bot className="h-3.5 w-3.5" />
              Layout Engine
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="h-8 rounded-md border border-slate-300 bg-white" />
              <div className="h-8 rounded-md border border-slate-300 bg-white" />
              <div className="h-8 rounded-md border border-slate-300 bg-white" />
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Interaction Model That Feels Precise",
      description:
        "Built for everyday editing speed with predictable behavior for move, resize, text editing, snapping, and connected arrows.",
      bullets: [
        "Canvas-native text editing and styling controls",
        "Smart snapping and connection-handle anchoring",
        "Consistent hit-testing and transform math",
      ],
      icon: <MousePointer2 className="h-5 w-5 text-slate-700" />,
      preview: (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <Hand className="h-3.5 w-3.5" />
            Interaction Layer
          </div>
          <div className="h-28 rounded-md border-2 border-dashed border-blue-200 bg-slate-50 p-3">
            <div className="mb-2 inline-flex rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700">
              Selected: Auth Service
            </div>
            <div className="h-10 w-full rounded-md border-2 border-slate-700 bg-blue-50" />
            <div className="mt-2 flex gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="h-2 w-2 rounded-full bg-blue-500" />
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Collaboration and Governance at Scale",
      description:
        "Use real-time multiplayer sync with controlled access, persistent state, and predictable behavior for teams and organizations.",
      bullets: [
        "Liveblocks presence with conflict-safe updates",
        "Convex persistence with autosave workflows",
        "Role-ready access patterns for enterprise teams",
      ],
      icon: <Lock className="h-5 w-5 text-slate-700" />,
      preview: (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            Live Session
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <GitBranch className="h-3.5 w-3.5" />
                Routing Engine
              </div>
              <div>Orthogonal invariants enforced</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <Route className="h-3.5 w-3.5" />
                Sync Status
              </div>
              <div>12 changes / sec, 0 conflicts</div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section className="bg-white px-4 py-24 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-20 max-w-3xl text-center">
          <h2 className="text-balance text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
            Built as a real diagram system, not a drawing toy
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            The platform combines graph intelligence, deterministic layout, and
            canvas-grade interaction so teams can model systems with confidence.
          </p>
        </div>

        <div className="space-y-28">
          {sections.map((section, index) => (
            <article
              key={section.title}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-8 md:px-10 md:py-10"
            >
              <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_1fr]">
                <div>
                  <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700">
                    {section.icon}
                    <span>0{index + 1}</span>
                  </div>
                  <h3 className="text-3xl font-bold tracking-tight text-slate-900">
                    {section.title}
                  </h3>
                  <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                    {section.description}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-start gap-2 text-sm text-slate-700"
                      >
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-blue-600" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>{section.preview}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
