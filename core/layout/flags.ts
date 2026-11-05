/**
 * `NEXT_PUBLIC_LAYOUT_ENGINES` (client) or `AI_LAYOUT_ENGINES` (server): `new` turns the layout engines on (layout
 * records for new diagrams, the Layout command and the `layout_diagram` tool), `legacy` leaves everything as it
 * was. Unset: on in development and tests, off in production until the foundations are accepted. The placement
 * stamp is not behind this flag: it only records who placed what and changes no behaviour.
 *
 * Each `process.env.X` is written out in full so Next can inline it in the browser bundle, and guarded so a
 * bundle without a `process` (the browser tests') reads them as unset instead of throwing.
 */
const read = (): { value: string | undefined; nodeEnv: string | undefined } => {
  if (typeof process === "undefined") return { value: undefined, nodeEnv: undefined };
  return { value: process.env.NEXT_PUBLIC_LAYOUT_ENGINES ?? process.env.AI_LAYOUT_ENGINES, nodeEnv: process.env.NODE_ENV };
};

export const layoutEnginesEnabled = (value?: string, nodeEnv?: string): boolean => {
  const env = read();
  const v = value ?? env.value;
  const n = nodeEnv ?? env.nodeEnv;
  if (v === "new") return true;
  if (v === "legacy") return false;
  return n !== "production";
};
