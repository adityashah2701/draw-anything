// The Phase 1 baseline set from MASTER_PROMPT.md that features/ai/server/layout/fixtures does not already
// cover. Kept next to the browser tests that use them; the older five stay where they are.
import { fixtureDocument } from "@/features/ai/server/layout/fixtures/base";

export const simpleFlow = fixtureDocument({
  id: "simple-flow",
  diagramType: "flowchart",
  prompt: "Three step flow",
  nodes: [
    { id: "a", label: "Receive request", kind: "service" },
    { id: "b", label: "Validate input?", kind: "decision" },
    { id: "c", label: "Store result", kind: "database" },
  ],
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c", label: "valid" },
  ],
});

export const databaseSchema = fixtureDocument({
  id: "db-schema",
  diagramType: "entity-relationship",
  prompt: "Schema with long table and column names",
  nodes: [
    { id: "t1", label: "customer_subscription_billing_account\nid, customer_identifier, billing_contact_email_address", kind: "database" },
    { id: "t2", label: "organization_membership_role_assignments\nmembership_id, assigned_by_administrator_user_id", kind: "database" },
    { id: "t3", label: "invoice_line_item_tax_jurisdiction_rates\nline_item_id, jurisdiction_code, effective_from_date", kind: "database" },
    { id: "t4", label: "users", kind: "database" },
    { id: "t5", label: "payment_method_tokenised_card_reference\ntoken, last_four_digits, expiry_month", kind: "database" },
  ],
  edges: [
    { from: "t4", to: "t1", label: "has many" },
    { from: "t4", to: "t2", label: "belongs to" },
    { from: "t1", to: "t3", label: "is billed with" },
    { from: "t1", to: "t5", label: "pays using" },
  ],
});

const participants = ["Browser", "CDN", "API Gateway", "Auth Service", "Orders Service", "Payments Service", "Notification Service", "Data Warehouse"];
export const sequence = fixtureDocument({
  id: "sequence",
  diagramType: "sequence",
  prompt: "Checkout with many participants",
  direction: "left-to-right",
  nodes: participants.map((label, i) => ({ id: `p${i}`, label, kind: "service" as const })),
  edges: [
    ["p0", "p1", "GET /checkout"],
    ["p1", "p2", "forward"],
    ["p2", "p3", "verify token"],
    ["p3", "p2", "claims"],
    ["p2", "p4", "create order"],
    ["p4", "p5", "authorise payment"],
    ["p5", "p4", "approved"],
    ["p4", "p6", "order placed"],
    ["p4", "p7", "append event"],
    ["p4", "p2", "201 Created"],
  ].map(([from, to, label]) => ({ from, to, label })),
});

export const mixedIcons = fixtureDocument({
  id: "mixed-icons",
  diagramType: "architecture",
  prompt: "Many icons and node kinds",
  nodes: [
    ["user", "Customer", "user", "external"], ["dns", "DNS", "dns", "external"], ["cdn", "CDN", "external", "external"], ["waf", "WAF", "waf", "edge"], ["lb", "Load balancer", "load-balancer", "edge"],
    ["gw", "API gateway", "gateway", "edge"], ["auth", "Auth", "authentication", "application"], ["svc", "Orders", "service", "application"], ["queue", "Queue", "queue", "application"], ["worker", "Worker", "worker", "application"],
    ["cache", "Cache", "cache", "data"], ["db", "Primary DB", "database", "data"], ["store", "Object storage", "storage", "data"], ["k8s", "Kubernetes", "kubernetes", "application"],
    ["vec", "Vector store", "vector-store", "data"], ["llm", "Model", "ai-model", "application"], ["dash", "Dashboard", "dashboard", "observability"], ["alert", "Alerting", "alerting", "observability"], ["ci", "CI/CD", "cicd", "application"],
  ].map(([id, label, kind, layer]) => ({ id, label, kind: kind as never, layer: layer as never })),
  edges: [
    ["user", "dns"], ["dns", "cdn"], ["cdn", "waf"], ["waf", "lb"], ["lb", "gw"], ["gw", "auth"], ["gw", "svc"], ["svc", "queue"], ["queue", "worker"],
    ["svc", "cache"], ["svc", "db"], ["worker", "store"], ["svc", "llm"], ["llm", "vec"], ["k8s", "svc"], ["svc", "dash"], ["dash", "alert"], ["ci", "k8s"],
  ].map(([from, to]) => ({ from, to })),
});

export const nestedGroups = fixtureDocument({
  id: "nested-groups",
  diagramType: "architecture",
  prompt: "Nested containers",
  nodes: [
    { id: "u", label: "Users", kind: "user", layer: "external" },
    { id: "lb", label: "Load balancer", kind: "load-balancer", layer: "edge" },
    { id: "web1", label: "Web 1", kind: "service", layer: "application" },
    { id: "web2", label: "Web 2", kind: "service", layer: "application" },
    { id: "api1", label: "API 1", kind: "api", layer: "application" },
    { id: "api2", label: "API 2", kind: "api", layer: "application" },
    { id: "pg", label: "Postgres", kind: "database", layer: "data" },
    { id: "redis", label: "Redis", kind: "cache", layer: "data" },
  ],
  edges: [
    { from: "u", to: "lb" }, { from: "lb", to: "web1" }, { from: "lb", to: "web2" },
    { from: "web1", to: "api1" }, { from: "web2", to: "api2" },
    { from: "api1", to: "pg" }, { from: "api2", to: "pg" }, { from: "api1", to: "redis" }, { from: "api2", to: "redis" },
  ],
  groups: [
    { id: "cloud", label: "Cloud", nodeIds: ["lb", "web1", "web2", "api1", "api2", "pg", "redis"] },
    { id: "region", label: "eu-west-1", nodeIds: ["web1", "web2", "api1", "api2", "pg", "redis"] },
    { id: "app", label: "App tier", nodeIds: ["web1", "web2", "api1", "api2"] },
    { id: "data", label: "Data tier", nodeIds: ["pg", "redis"] },
  ],
});

export const unicode = fixtureDocument({
  id: "unicode",
  diagramType: "concept",
  prompt: "Unusual characters",
  nodes: [
    { id: "n1", label: "日本語のラベル", kind: "generic" },
    { id: "n2", label: "مرحبا بالعالم", kind: "generic" },
    { id: "n3", label: "Deploy 🚀 to production ✅", kind: "generic" },
    { id: "n4", label: "Pneumonoultramicroscopicsilicovolcanoconiosis_and_other_unbroken_words", kind: "generic" },
    { id: "n5", label: "café – naïve — “quoted” & <tagged> 'single'", kind: "generic" },
    { id: "n6", label: "A > B - C -- D", kind: "generic" },
  ],
  edges: [
    { from: "n1", to: "n2", label: "→" }, { from: "n2", to: "n3", label: "emoji 👍" }, { from: "n3", to: "n4" },
    { from: "n4", to: "n5", label: "a – b" }, { from: "n5", to: "n6" }, { from: "n6", to: "n1", dashed: true },
  ],
});

export const bidirectional = fixtureDocument({
  id: "bidirectional",
  diagramType: "architecture",
  prompt: "Request and response between the same pair, plus a shared hub",
  nodes: [
    { id: "a", label: "Client", kind: "browser" },
    { id: "b", label: "Server", kind: "service" },
    { id: "c", label: "Hub", kind: "event-bus" },
  ],
  edges: [
    { from: "a", to: "b", label: "request" }, { from: "b", to: "a", label: "response" },
    { from: "a", to: "c", bidirectional: true }, { from: "b", to: "c", bidirectional: true, dashed: true },
  ],
});

export const BASELINE_NAMES = ["simpleFlow", "databaseSchema", "sequence", "mixedIcons", "nestedGroups", "unicode", "bidirectional"] as const;
