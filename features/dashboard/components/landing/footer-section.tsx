import { LogoMark } from "@/components/shared/logo-mark";

const links = [
  { label: "How it works", href: "#how" },
  { label: "Capabilities", href: "#features" },
  { label: "Start", href: "#cta" },
];

export const FooterSection = () => (
  <footer id="footer" className="border-t border-border px-4 py-8 sm:px-6 lg:px-8">
    <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <LogoMark className="size-5" />
        <span className="text-sm font-semibold tracking-tight text-foreground">Draw Anything</span>
        <span className="label-mono ml-2">© 2026</span>
      </div>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded-sm text-sm text-text-secondary transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {link.label}
          </a>
        ))}
      </nav>
    </div>
  </footer>
);
