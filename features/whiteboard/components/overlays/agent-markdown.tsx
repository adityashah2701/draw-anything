"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Raw HTML is never enabled (react-markdown skips it by default), and only http(s)/mailto links are kept.
const SAFE_URL = /^(https?:|mailto:|#|\/)/i;
const urlTransform = (url: string) => (SAFE_URL.test(url) ? url : "");

const components: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h3 className="mb-1 mt-3 text-[14px] font-semibold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-3 text-[14px] font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-2.5 text-[13px] font-semibold first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 className="mb-1 mt-2.5 text-[13px] font-semibold first:mt-0">{children}</h4>,
  h5: ({ children }) => <h4 className="mb-1 mt-2.5 text-[13px] font-semibold first:mt-0">{children}</h4>,
  h6: ({ children }) => <h4 className="mb-1 mt-2.5 text-[13px] font-semibold first:mt-0">{children}</h4>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="my-1.5 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-2 border-border" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  pre: ({ children }) => <pre className="my-1.5 overflow-x-auto rounded-md border border-border bg-muted/60 p-2.5 font-mono text-[11.5px] leading-snug">{children}</pre>,
  code: ({ className, children }) =>
    className?.startsWith("language-") ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11.5px]">{children}</code>
    ),
  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border bg-muted/50 px-2 py-1 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
};

/** Renders an assistant reply as Markdown. Safe on partial text, so it can be used while a reply streams. */
export const AgentMarkdown: React.FC<{ text: string }> = React.memo(({ text }) => (
  <div className="break-words" data-testid="agent-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
      {text}
    </ReactMarkdown>
  </div>
));
AgentMarkdown.displayName = "AgentMarkdown";
