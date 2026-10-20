import { Reveal } from "./reveal";
import { RoutingDemo } from "./routing-demo";

const capabilities = [
  {
    label: "Agent",
    title: "One canvas for you and the agent",
    body: "The agent works with the same shapes and connectors you do, so nothing it draws needs converting before you can edit it.",
  },
  {
    label: "Routing",
    title: "Connectors that stay out of the way",
    body: "Orthogonal connectors route around shapes and re-route when you move them. Yes and No branches stay readable.",
  },
  {
    label: "Multiplayer",
    title: "Edit together, live",
    body: "Presence and changes sync across the board, so a review can happen on the diagram itself.",
  },
  {
    label: "Scale",
    title: "Built for large boards",
    body: "Spatial indexing and cached bounds keep dragging and routing responsive as a board grows.",
  },
];

export const FeaturesSection = () => (
  <section id="features" className="scroll-mt-16 border-t border-border px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
    <div className="mx-auto max-w-7xl">
      <Reveal className="max-w-xl">
        <p className="label-mono mb-4">Capabilities</p>
        <h2 className="text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          A drawing tool first, with an agent inside it.
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-6" delay={60}>
          <RoutingDemo />
        </Reveal>

        <dl className="divide-y divide-border border-y border-border lg:col-span-6">
          {capabilities.map((item, index) => (
            <Reveal key={item.label} delay={index * 60 + 60} className="py-5 first:pt-4 last:pb-4">
              <dt className="flex items-baseline gap-3">
                <span className="label-mono w-20 shrink-0">{item.label}</span>
                <span className="text-base font-semibold tracking-tight text-foreground">{item.title}</span>
              </dt>
              <dd className="mt-1.5 pl-[5.75rem] text-sm leading-relaxed text-text-secondary">{item.body}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </div>
  </section>
);
