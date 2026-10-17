import { beforeAll, describe, expect, it } from "vitest";
import { GLYPHS } from "./glyphs";
import { GLYPHS_EXTRA } from "./glyphs-extra";
import { getIcon, iconLibraryVersion, listCoreIcons, listIcons, loadIconLibrary, needsIconLibrary, resolveIconId, searchIcons, subscribeIconLibrary } from "./registry";

// What every alias and vendor word resolved to before the library existed: it must never change.
const BEFORE = {
  postgres: "database", docker: "container", kubernetes: "kubernetes", k8s: "kubernetes", kafka: "message-broker", s3: "storage",
  redis: "cache", nginx: "gateway", cloud: "region", aws: "region", github: "repository", slack: "notification", react: "browser",
  stripe: "external", openai: "ai-model", home: undefined,
} as Record<string, string | undefined>;

const vendored = new Set([...Object.values(GLYPHS), ...Object.values(GLYPHS_EXTRA)]);

describe("icon library (loaded on demand)", () => {
  const coreBefore = listIcons().map((i) => i.id);
  const resolvedBefore = Object.fromEntries(Object.keys(BEFORE).map((k) => [k, resolveIconId(k)]));

  it("starts with only the curated icons and says what needs the library", () => {
    expect(iconLibraryVersion()).toBe(0);
    expect(listIcons().length).toBe(listCoreIcons().length);
    expect(needsIconLibrary([{ ai: { icon: "bolt" } }])).toBe(true);
    expect(needsIconLibrary([{ ai: { icon: "database" } }])).toBe(false);
    expect(needsIconLibrary([{ ai: { icon: "bolt", customIcon: {} } }])).toBe(false);
    expect(needsIconLibrary([{}])).toBe(false);
  });

  it("loads once, notifies subscribers and is idempotent", async () => {
    let calls = 0;
    const off = subscribeIconLibrary(() => (calls += 1));
    await Promise.all([loadIconLibrary(), loadIconLibrary()]);
    await loadIconLibrary();
    off();
    expect(calls).toBe(1);
    expect(iconLibraryVersion()).toBe(1);
    expect(needsIconLibrary([{ ai: { icon: "bolt" } }])).toBe(false);
  });

  describe("after loading", () => {
    beforeAll(loadIconLibrary);

    it("adds hundreds of icons, in the new categories too, and keeps every curated one", () => {
      const all = listIcons();
      expect(all.length).toBeGreaterThan(650);
      for (const category of ["business", "media", "devices", "logo"]) expect(all.some((i) => i.category === category), category).toBe(true);
      for (const id of coreBefore) expect(all.some((i) => i.id === id), id).toBe(true);
    });

    it("never changes what an existing id, alias or vendor word resolves to", () => {
      for (const [word, before] of Object.entries(resolvedBefore)) {
        if (before !== undefined) expect(resolveIconId(word), word).toBe(before);
      }
    });

    it("every library icon has drawable path data starting with a move", () => {
      for (const icon of listIcons()) {
        expect(icon.paths.length, icon.id).toBeGreaterThan(0);
        for (const d of icon.paths) expect(d, icon.id).toMatch(/^\s*[Mm]/);
        if (icon.category !== "logo") expect(vendored.has(icon.paths), icon.id).toBe(true); // a lucide glyph, not invented
      }
    });

    it("finds library icons by name, alias and title", () => {
      expect(resolveIconId("bolt")).toBe("bolt");
      expect(searchIcons("homepage")[0].id).toBe("house");
      expect(searchIcons("pull request").map((m) => m.id)).toContain("git-pull-request");
    });

    it("ships a large set of filled brand marks with a title and a readable colour", () => {
      const logos = listIcons().filter((icon) => icon.category === "logo");
      expect(logos.length).toBeGreaterThan(150);
      for (const logo of logos) {
        expect(logo.id).toMatch(/^logo-/);
        expect(logo.style).toBe("logo");
        expect(logo.title).toBeTruthy();
        expect(logo.color).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it("never hijacks a vendor word: docker still resolves to the neutral container glyph", () => {
      expect(getIcon("docker").id).toBe("container");
      expect(getIcon("logo-docker").style).toBe("logo");
    });

    it("has no duplicate ids", () => {
      const ids = listIcons().map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
