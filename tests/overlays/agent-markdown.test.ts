import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentMarkdown } from "@/features/whiteboard/components/overlays/agent-markdown";

const render = (text: string) => renderToStaticMarkup(React.createElement(AgentMarkdown, { text }));

describe("AgentMarkdown", () => {
  it("renders bold, inline code, lists and headings", () => {
    const html = render("## Plan\n\n**Done** with `fit_view`\n\n- one\n- two\n\n1. a\n2. b");
    expect(html).toContain("<h3");
    expect(html).toContain("<strong");
    expect(html).toContain("<code");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
  });

  it("renders fenced code blocks, including an unfinished one mid-stream", () => {
    expect(render("```ts\nconst a = 1;\n```")).toContain("<pre");
    expect(render("Here:\n\n```ts\nconst a =")).toContain("<pre");
  });

  it("opens links in a new tab with noopener", () => {
    const html = render("[docs](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
  });

  it("drops javascript: links and does not render raw HTML", () => {
    const html = render("[x](javascript:alert(1)) <script>alert(1)</script> <img src=x onerror=alert(1)>");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
  });

  it("renders plain text unchanged", () => {
    expect(render("Just text")).toContain("Just text");
  });
});
