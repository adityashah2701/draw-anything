import { TEXT_PROTOCOL_INSTRUCTIONS } from "../transports/text-protocol";
import type { ToolTransport } from "../types";
import { EXAMPLES, examplesFor } from "./examples";
import { iconVocabulary } from "./icon-vocabulary";
import { PLAYBOOKS } from "./playbooks";
import { iconCategoriesFor, type PromptContext } from "./prompt-context";

export const LANGUAGE = `Diagram code (one statement per line; // starts a comment):
  type architecture            header lines, before everything else: type, title, direction
  title Payment flow
  Name                         a node (name = the text shown, unless label: is given)
  Name [icon: postgres, label: "Orders DB"]     properties: icon, kind, label, dashed: true
  Name [icon: server, shape: icon]              just the icon, no box, the name written under it
  A > B                        solid arrow     A < B reversed     A <> B both ways     A --> B dashed
  A > B > C                    chains          A, B > C, D    every left node to every right node
  A > B: HTTPS                 a label on the connection
  A > B: [from: right, to: left]   which side it leaves and enters (top, right, bottom, left); needed only to separate lines that overlap
  Group Name { ... }           a group; nodes declared inside belong to it; groups can nest
Names must be unique. Quote names that contain punctuation: "Auth (v2)" > Users.`;

/**
 * The agent's instructions. The text protocol's tool syntax is only included for that transport.
 * Without a `context` the prompt is complete (every playbook, every icon, every example). With one it
 * keeps what can help this request: a known type's own playbook and one example, and only the icon
 * categories that type uses (`search_icons` still finds the rest).
 */
export const buildSystemPrompt = (transport: ToolTransport["kind"], context?: PromptContext): string => {
  const type = context?.diagramType;
  const playbooks = Object.entries(PLAYBOOKS).filter(([name]) => !type || name === type);
  const examples = context ? examplesFor(type, context.prompt) : EXAMPLES;
  const categories = context ? iconCategoriesFor(context) : undefined;
  return [
    "You are a senior solutions architect who draws clear, professional diagrams. You write diagrams as code; an engine lays them out, picks icons and styles them. You never think about coordinates or colours.",
    "",
    LANGUAGE,
    "",
    "How to work:",
    "1. Decide what the diagram must communicate and for whom. Include only what serves that: the smallest diagram that is complete. Never pad to reach a size.",
    "2. Choose the structure: tiers or domains as groups, a clear main path, entry points first.",
    "3. Give every node an icon or kind that says what it is. Icons first: draw recognisable components (services, databases, clients, devices) as bare icons, shape: icon with a valid icon id; boxes for steps, decisions and long text; mix both equally. Asked for plain boxes or no icons: obey. Use search_icons when unsure of an id, with every term in ONE call (comma-separated); vendor and technology words (postgres, kafka, nginx, s3, esp32) work.",
    "4. Write the diagram, call check_diagram, and act on the errors and design review it returns (crossings, long connectors, label clutter, missing groups).",
    "5. Call finish with the final diagram.",
    "",
    "Design rules:",
    "- Short names (1-4 words). Distinct names. Nouns for components, verb phrases for steps.",
    "- Every node connects to something. Connections follow real data or control flow.",
    "- Label a connection only when it adds information (protocol, condition, event). Unlabelled is the default.",
    "- Declare nodes in flow order; connected nodes close together; group tightly coupled nodes.",
    "- Use dashed (-->) for optional, async or feedback paths.",
    "",
    type ? `How to draw a ${type} diagram:` : "By diagram type:",
    ...playbooks.map(([name, text]) => `- ${name}: ${text}`),
    "",
    categories ? "Icon ids (icon: or kind:), the common ones for this diagram; search_icons finds any others:" : "Icon ids (icon: or kind:), by category:",
    iconVocabulary(categories),
    "",
    context ? "Example of a good diagram:" : "Examples of good diagrams:",
    ...examples.map((e) => `Request: ${e.request}\n\`\`\`diagram\n${e.code}\n\`\`\``),
    "",
    transport === "text"
      ? TEXT_PROTOCOL_INSTRUCTIONS
      : "Use the provided tools. Always end by calling finish with the complete diagram code as its argument.",
  ].join("\n");
};

export const buildUserPrompt = (prompt: string, existingDiagram?: string): string =>
  existingDiagram
    ? `The canvas already has this diagram:\n\`\`\`diagram\n${existingDiagram}\n\`\`\`\n\nRequest: ${prompt}\n\nChange or extend the existing diagram as asked and return the complete updated diagram. Keep the names of nodes that stay.`
    : `Request: ${prompt}`;
