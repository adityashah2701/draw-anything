import { z } from "zod";
import { normalizeColor } from "@/core/color/named-colors";

/** Shared argument pieces. Every tool object is `.strict()`, so a misspelt or invented argument is an error, never ignored. */

/** Token that stands for the editor's current selection wherever a list of ids is expected. */
export const SELECTION_TOKEN = "@selection";

export const MAX_IDS = 500;
export const MAX_LABEL_CHARS = 2000;
export const MAX_POINTS = 2000;
export const MAX_ELEMENTS_PER_CALL = 100;
export const MAX_ELEMENTS_ON_BOARD = 5000;

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/** One element id, as the board stores it. */
export const elementId = z.string().regex(ID, "an element id: letters, digits and _ . : - only, up to 128 characters");

/** A caller-chosen id for something that is about to be created: a plan can create and connect in one turn. */
export const newElementId = z
  .string()
  .regex(ID, "letters, digits and _ . : - only, up to 128 characters")
  .describe("Optional id to give the new element (unique on the board). Use it to refer to the element in later calls of the same turn.");

/** A list of existing element ids; `"@selection"` stands for the current selection. */
export const targetIds = z
  .array(z.string().regex(new RegExp(`^(${SELECTION_TOKEN}|[A-Za-z0-9_.:-]{1,128})$`), `an element id or "${SELECTION_TOKEN}"`))
  .min(1)
  .max(MAX_IDS)
  .describe(`Element ids (from find_elements / get_document_state). "${SELECTION_TOKEN}" means the current selection.`);

export const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
export const length = z.number().finite().min(1).max(100_000);
export const point = z.object({ x: coordinate, y: coordinate }).strict();

/** A colour as `#rgb`, `#rrggbb` or a common name; stored as `#rrggbb`. */
export const color = z
  .string()
  .max(32)
  .transform((value, ctx) => {
    const normalized = normalizeColor(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: 'a colour as "#rrggbb", "#rgb" or a name such as "red", "blue", "gray"' });
      return z.NEVER;
    }
    return normalized;
  });

/** A fill: a colour, or `null` for no fill. */
export const fill = z.union([color, z.null()]).describe("A colour, or null for no fill.");

export const label = z.string().max(MAX_LABEL_CHARS).describe("Text; use \\n for line breaks.");

/** The guard every write tool accepts: fail instead of editing a board someone changed since it was read. */
export const expectedRevision = z
  .string()
  .regex(/^[0-9a-f]{8}$/)
  .optional()
  .describe("Optional. The `revision` from a previous result; the call fails with stale_document if the board has changed since.");

export const confirmFlag = z.literal(true).describe("Must be true. The person at the keyboard is asked to approve before anything happens.");

/** Turns a zod failure into at most a handful of short lines a model can act on. */
export const describeIssues = (error: z.ZodError, limit = 6): string => {
  const lines = error.issues.slice(0, limit).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "arguments";
    if (issue.code === "unrecognized_keys") return `${path}: unknown argument(s) ${issue.keys.map((k) => `"${k}"`).join(", ")}`;
    return `${path}: ${issue.message}`;
  });
  const more = error.issues.length > limit ? ` (+${error.issues.length - limit} more)` : "";
  return `${lines.join("; ")}${more}`;
};

/** The JSON Schema a provider is given for a tool's parameters (draft-07 style, no `$schema`). */
export const toParameters = (schema: z.ZodType): Record<string, unknown> => {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any", target: "draft-7" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
};
