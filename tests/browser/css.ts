import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** The app's real stylesheet (Tailwind scanned over the source), so a browser test sees the panel as users do. */
export const appCss = async (): Promise<string> => {
  const from = `${root}app/globals.css`;
  const result = await postcss([tailwind({ base: root })]).process(readFileSync(from, "utf8"), { from });
  return result.css;
};
