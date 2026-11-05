import { describe, expect, it } from "vitest";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { EXAMPLES } from "../prompt/examples";
import { lintDiagram } from "./lint";

const rules = (code: string) => lintDiagram(parseDiagramCode(code)).map((f) => f.rule);

describe("family rules", () => {
  it("passes the worked ER, sequence and class examples", () => {
    for (const request of ["Library ER diagram", "Login sequence", "Payment classes"]) {
      const found = rules(EXAMPLES.find((e) => e.request === request)!.code);
      expect(found.filter((r) => /^(er|sequence|flow)-|family-shapes|generic-icons/.test(r)), request).toEqual([]);
    }
  });

  it("asks for tables, keys, cardinality and a junction in an ER diagram", () => {
    const found = rules(`type entity-relationship
Users [icon: user]
Teams [shape: entity, rows: "name text"]
Tags [shape: entity, rows: "id int pk"]
Users > Teams
Teams > Tags [relation: er-relationship, from: many, to: many]`);
    expect(found).toEqual(expect.arrayContaining(["family-shapes", "er-no-primary-key", "er-missing-cardinality", "er-many-to-many"]));
  });

  it("spots a cardinality written against the foreign key", () => {
    const code = (rel: string) => `type entity-relationship\nBranch [shape: entity, rows: "id int pk"]\nBook [shape: entity, rows: "id int pk; branch_id int -> branch.id"]\n${rel}`;
    expect(rules(code("Book > Branch [relation: er-relationship, from: one, to: zero-or-many]"))).toContain("er-cardinality-against-key");
    expect(rules(code("Branch > Book [relation: er-relationship, from: one, to: zero-or-many]"))).not.toContain("er-cardinality-against-key");
    expect(rules(code("Book > Branch [relation: er-relationship, from: many, to: one]"))).not.toContain("er-cardinality-against-key");
  });

  it("passes the system-design example and flags a design nobody uses with idle services", () => {
    const example = rules(EXAMPLES.find((e) => e.request.startsWith("Chat app system design"))!.code);
    expect(example.filter((r) => r.startsWith("hld-"))).toEqual([]);
    const found = rules(`type architecture\nGateway [icon: gateway]\nOrders Service [icon: service]\nBilling Service [icon: service]\nUsers DB [icon: postgres]\nCache [icon: redis]\nQueue [icon: kafka]\nSearch Service [icon: service]\nMedia Service [icon: service]\nGateway > Orders Service, Billing Service, Search Service, Media Service\nOrders Service > Users DB, Queue\nBilling Service > Cache`);
    expect(found).toEqual(expect.arrayContaining(["hld-no-entry", "hld-idle-service"]));
  });

  it("asks for the return of a synchronous call", () => {
    expect(rules(`type sequence\nA [shape: lifeline]\nB [shape: lifeline]\nA > B: call [relation: sync]`)).toContain("sequence-no-return");
    expect(rules(`type sequence\nA [shape: lifeline]\nB [shape: lifeline]\nA > B: call [relation: sync]\nB > A: ok [relation: return]`)).not.toContain("sequence-no-return");
  });

  it("wants one start and no dead ends in a flowchart", () => {
    const found = rules(`type flowchart\nOpen [kind: start]\nCheck\nDone [kind: end]\nOpen > Check\nOpen > Done`);
    expect(found).toContain("flow-dead-end");
    expect(found).not.toContain("flow-one-start");
  });
});
