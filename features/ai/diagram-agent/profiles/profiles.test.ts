import { describe, expect, it } from "vitest";
import { aiDiagramTypeSchema } from "@/features/ai/schemas";
import { PLAYBOOKS } from "../prompt/playbooks";
import { PROFILES, profileFor } from "./index";

describe("diagram profiles", () => {
  it("has a profile for every diagram type, each with guidance, a direction and a connector style", () => {
    for (const type of aiDiagramTypeSchema.options) {
      const profile = PROFILES[type];
      expect(profile, type).toBeDefined();
      expect(profile.guidance.length, type).toBeGreaterThan(40);
      expect(["top-to-bottom", "left-to-right"]).toContain(profile.direction);
      expect(["elbow", "straight", "curved"]).toContain(profile.connector);
    }
  });

  it("falls back to the architecture profile for an unknown or missing type", () => {
    expect(profileFor("underwater-basket-weaving")).toBe(PROFILES.architecture);
    expect(profileFor(undefined)).toBe(PROFILES.architecture);
    expect(profileFor("flowchart")).toBe(PROFILES.flowchart);
  });

  it("is where the prompt's playbooks come from", () => {
    for (const type of aiDiagramTypeSchema.options) expect(PLAYBOOKS[type]).toBe(PROFILES[type].guidance);
  });

  it("groups types into the six families the evaluation uses", () => {
    expect(new Set(Object.values(PROFILES).map((p) => p.family))).toEqual(new Set(["architecture", "flowchart", "er", "uml", "sequence", "mind-map"]));
  });
});
