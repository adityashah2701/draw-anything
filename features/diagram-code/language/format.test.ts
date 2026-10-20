import { describe, expect, it } from "vitest";
import { compileDiagramCode } from "./compile";
import { irFingerprint } from "./ir";
import { formatDiagramCode } from "./format";
import { LAYOUT_FIXTURES } from "@/features/ai/server/layout/fixtures";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { graphFromElements } from "../canvas";
import { serializeDiagramCode } from "../serialize";

/** The meaning of a program: the IR without positions. */
const meaning = (source: string) => irFingerprint(compileDiagramCode(source).ir);
const fmt = (source: string) => {
  const result = formatDiagramCode(source);
  expect(result.refused, JSON.stringify(result.refused)).toBeUndefined();
  return result.text;
};

describe("formatDiagramCode", () => {
  it("indents, spaces and orders properties canonically", () => {
    const messy = `type   flowchart
title   Shop


   Backend   {
 API[label:"Gateway",kind:api,x:10,   y:20]
      Workers {
Queue
   }
}
Web[color:blue , icon:browser]  >   API ,Queue :   HTTPS [to:left,color:red,from:right]
`;
    expect(fmt(messy)).toBe(`type flowchart
title Shop

Backend {
  API [kind: api, x: 10, y: 20, label: "Gateway"]
  Workers {
    Queue
  }
}
Web [icon: browser, color: blue] > API, Queue: HTTPS [color: red, from: right, to: left]
`);
  });

  it("keeps comments where they are, indented with their code", () => {
    const source = `// top
A > B // why
Team {
// inside
  C
  // last in team
}
# hash comment
`;
    expect(fmt(source)).toBe(`// top
A > B // why
Team {
  // inside
  C
  // last in team
}
# hash comment
`);
  });

  it("collapses runs of blank lines, drops leading and trailing ones, and ends with one newline", () => {
    expect(fmt("\n\nA\n\n\n\nB\n\n\n")).toBe("A\n\nB\n");
    expect(fmt("")).toBe("");
    expect(fmt("   \n\n")).toBe("");
  });

  it("formats frames, nested frames and inline empty blocks", () => {
    expect(fmt("frame   Edge[ padding:24,color:blue ]{\nWeb\n  frame Inner {}\n}")).toBe(`frame Edge [color: blue, padding: 24] {
  Web
  frame Inner {
  }
}
`);
  });

  it("never drops unknown or unsupported properties and keeps their order", () => {
    const out = fmt("A [wibble: 1, colorMode: bold, kind: api, zed: 2]");
    expect(out).toBe("A [kind: api, wibble: 1, colorMode: bold, zed: 2]\n");
    expect(meaning(out)).toBe(meaning("A [wibble: 1, colorMode: bold, kind: api, zed: 2]"));
  });

  it("copies names, labels and values exactly, including quotes and escapes", () => {
    const source = 'frame "Edge  tier" {\n  "A  B" [label: "Line 1\\nLine 2"]\n}\n"A  B" > C: "x\\ny"\n';
    expect(fmt(source)).toBe(source);
  });

  it("refuses code with errors and says why, leaving it untouched", () => {
    const source = "A [kind: api\nTeam {\n";
    const result = formatDiagramCode(source);
    expect(result.text).toBe(source);
    expect(result.changed).toBe(false);
    expect(result.refused?.diagnostics.length).toBeGreaterThan(0);
  });

  it("refuses to format when new spacing would turn part of a name into a connector", () => {
    const source = 'A ,> B: "hi"';
    const result = formatDiagramCode(source);
    expect(result.text).toBe(source);
    expect(result.refused?.reason).toMatch(/change what the code means/);
  });

  it("is idempotent and keeps the diagram's meaning for a spread of programs", () => {
    const programs = [
      "A>B",
      "A  <>  B,C  -->  D: hi",
      'title "My  title"\ntype erd\nA [kind: db]',
      "Team{\nA\n}\nTeam2 [label:\"T\"]{\n B\n}",
      "A > B: GET [v2]\nA > B: rows[0] [from: top]",
      "A [x:1.55,y:-3,w:100,h:50]\n\n\nB",
      "frame F {\n A > B\n}\nC",
      "// only a comment",
      "A\r\nB > C\r\n",
    ];
    for (const program of programs) {
      const once = fmt(program);
      expect(fmt(once), program).toBe(once);
      expect(meaning(once), program).toBe(meaning(program));
    }
  });

  it("leaves the serializer's own output unchanged", () => {
    for (const [name, doc] of Object.entries(LAYOUT_FIXTURES)) {
      const code = serializeDiagramCode(graphFromElements(compileAIDiagramToCanvas(doc, "f"), { layout: true }).graph);
      expect(fmt(code), name).toBe(code);
    }
  });

  it("formats random edits of a program that stay error-free without changing their meaning", () => {
    const seed = 'title T\ntype flowchart\nfrontend [kind: user] {\n  A [kind: api, x: 1, y: 2]\n}\nframe F [padding: 8] {\n  B\n}\nA > B: "hi" [color: red, from: top]\nA <> B, C -- D // c\n# note\n';
    let state = 99;
    const random = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const alphabet = [" ", "  ", "\n", ",", " [kind: api]", " // x", "\t"];
    let checked = 0;
    for (let round = 0; round < 600; round += 1) {
      let text = seed;
      for (let m = 0; m < 1 + Math.floor(random() * 5); m += 1) {
        const at = Math.floor(random() * text.length);
        const piece = alphabet[Math.floor(random() * alphabet.length)];
        text = text.slice(0, at) + piece + text.slice(at);
      }
      const result = formatDiagramCode(text);
      if (result.refused) {
        // Refusing is allowed; changing meaning is not.
        expect(result.text).toBe(text);
        continue;
      }
      checked += 1;
      expect(formatDiagramCode(result.text).text, JSON.stringify(text)).toBe(result.text);
      expect(meaning(result.text), JSON.stringify(text)).toBe(meaning(text));
    }
    expect(checked).toBeGreaterThan(100);
  });
});
