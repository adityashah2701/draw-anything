import { GLYPHS } from "./glyphs";

export type IconCategory =
  | "compute"
  | "data"
  | "network"
  | "security"
  | "client"
  | "devops"
  | "ai"
  | "observability"
  | "hardware"
  | "flow"
  | "generic";

export interface IconDef {
  /** Stable id stored in boards (`ai.icon`). Never rename one; add an alias instead. */
  id: string;
  category: IconCategory;
  /** SVG path data, stroked, in a `viewBox` coordinate space. One string per shape (never joined: a relative `m` would continue the previous shape). */
  paths: string[];
  /** Width and height of the path's coordinate space; icons are fitted inside a square tile, aspect kept. */
  viewBox: { width: number; height: number };
  /** Short text shown when the icon cannot be drawn (no Path2D). */
  badge: string;
}

const registry = new Map<string, IconDef>();
const aliases = new Map<string, string>();

const key = (value: string) => value.trim().toLowerCase().replace(/[\s_./]+/g, "-");

/** Adds or replaces an icon. Vendor packs call this; nothing else needs to change. */
export const registerIcon = (def: IconDef, ...alsoKnownAs: string[]) => {
  registry.set(def.id, def);
  for (const alias of alsoKnownAs) aliases.set(key(alias), def.id);
};

const SQUARE = { width: 24, height: 24 };
const add = (id: string, category: IconCategory, glyph: string, badge: string, ...alsoKnownAs: string[]) => {
  const paths = GLYPHS[glyph];
  if (!paths) throw new Error(`icon glyph "${glyph}" is not in glyphs.ts`);
  registerIcon({ id, category, paths, viewBox: SQUARE, badge }, ...alsoKnownAs);
};

// Ids are neutral technology names. Vendor words (postgres, s3, kafka...) are aliases for them: no
// trademarked logos are bundled, so a "postgres" node shows the database glyph.
add("generic", "generic", "box", "·", "default", "component", "block");
add("service", "compute", "boxes", "SVC", "microservice", "app", "application", "backend");
add("server", "compute", "server", "SRV", "host", "node", "instance", "ec2", "compute-engine");
add("vm", "compute", "cpu", "VM", "virtual-machine");
add("lambda", "compute", "zap", "λ", "function", "serverless", "cloud-function", "azure-function");
add("worker", "compute", "cpu", "WK", "job", "cron", "batch");
add("container", "devops", "container", "CTR", "docker", "pod", "podman");
add("kubernetes", "devops", "boxes", "K8S", "k8s", "eks", "gke", "aks");
add("cluster", "devops", "layers", "CLU");
add("deployment", "devops", "rocket", "DEP", "release");
add("namespace", "devops", "layers", "NS");
add("cicd", "devops", "git-branch", "CI", "ci", "cd", "pipeline", "jenkins", "github-actions", "gitlab-ci");
add("terminal", "devops", "terminal", ">_", "cli", "shell");
add("repository", "devops", "git-fork", "GIT", "git", "github", "gitlab", "repo");
add("database", "data", "database", "DB", "db", "sql", "postgres", "postgresql", "mysql", "mariadb", "sqlite", "mongodb", "dynamodb", "rds", "datastore", "data-store", "oracle");
add("cache", "data", "gauge", "CA", "redis", "memcached", "elasticache");
add("storage", "data", "hard-drive", "STG", "s3", "bucket", "object-storage", "blob", "gcs", "disk", "volume", "filesystem");
add("archive", "data", "archive", "ARC", "backup", "data-lake", "warehouse");
add("queue", "data", "rows-3", "Q", "sqs", "message-queue", "mq", "rabbitmq");
add("message-broker", "data", "radio-tower", "MQ", "broker", "kafka", "pubsub", "pub-sub", "sns", "nats");
add("event-bus", "data", "waypoints", "EV", "eventbridge", "event-stream", "stream", "kinesis");
add("memory", "ai", "memory-stick", "MEM", "ram");
add("api", "network", "webhook", "API", "rest", "graphql", "grpc", "endpoint", "webhook", "http");
add("gateway", "network", "signpost", "GW", "api-gateway", "ingress", "reverse-proxy", "proxy", "nginx", "envoy");
add("load-balancer", "network", "scale", "LB", "lb", "loadbalancer", "alb", "elb", "haproxy");
add("cdn", "network", "globe", "CDN", "cloudfront", "cloudflare", "edge");
add("dns", "network", "signpost", "DNS", "route53", "nameserver");
add("internet", "network", "globe", "WWW", "web", "wan", "public");
add("network", "network", "network", "NET", "lan", "vpc", "subnet", "vpn");
add("router", "network", "router", "RTR", "switch", "modem");
add("service-mesh", "network", "waypoints", "SM", "istio", "linkerd");
add("region", "network", "cloud", "REG", "cloud", "aws", "gcp", "azure");
add("availability-zone", "network", "cloud-cog", "AZ", "az", "zone", "datacenter");
add("firewall", "security", "brick-wall", "FW", "security-group", "iptables");
add("waf", "security", "shield", "WAF", "shield");
add("authentication", "security", "key-round", "ID", "auth", "authn", "authz", "identity", "oauth", "sso", "iam", "login", "clerk", "auth0", "cognito", "okta");
add("secrets", "security", "lock", "SEC", "vault", "kms", "secret", "encryption", "password");
add("security", "security", "shield-check", "SEC", "compliance", "audit");
add("user", "client", "user", "U", "person", "actor", "customer", "admin");
add("users", "client", "users", "USR", "team", "group-of-users", "audience");
add("browser", "client", "monitor", "WEB", "frontend", "web-app", "spa", "react", "nextjs", "client");
add("mobile", "client", "smartphone", "APP", "phone", "ios", "android", "app-mobile");
add("email", "client", "mail", "@", "mail", "smtp", "ses", "sendgrid");
add("notification", "client", "message-square", "MSG", "chat", "sms", "push", "slack");
add("ai-model", "ai", "brain", "AI", "model", "llm", "ml", "gpt", "ai");
add("agent", "ai", "bot", "AG", "bot", "assistant");
add("tool", "ai", "wrench", "TL", "plugin", "utility");
add("knowledge-base", "ai", "book-open", "KB", "docs", "documentation", "wiki");
add("vector-store", "ai", "database", "VS", "vector-db", "embeddings", "pinecone");
add("dashboard", "observability", "layout-dashboard", "DASH", "monitoring", "grafana", "observability", "analytics", "metrics", "logging", "logs");
add("alerting", "observability", "bell", "AL", "alert", "pagerduty", "alarm");
add("metrics", "observability", "activity", "MET", "prometheus", "telemetry", "tracing");
add("config", "devops", "settings", "CFG", "settings", "configuration", "feature-flags");
add("microcontroller", "hardware", "microchip", "MCU", "mcu", "arduino", "esp32", "stm32", "chip", "soc", "fpga");
add("cpu", "hardware", "cpu", "CPU", "processor");
add("circuit", "hardware", "circuit-board", "PCB", "pcb", "board");
add("sensor", "hardware", "radio", "SNS", "sensors", "thermometer-sensor", "imu");
add("temperature-sensor", "hardware", "thermometer", "TMP", "thermometer");
add("power", "hardware", "battery", "PWR", "battery", "power-supply", "regulator");
add("connector", "hardware", "plug", "CON", "plug", "gpio", "header");
add("bus", "hardware", "cable", "BUS", "cable", "i2c", "spi", "uart", "can", "can-bus");
add("usb", "hardware", "usb", "USB");
add("wifi", "hardware", "wifi", "WiFi", "wireless", "wlan");
add("bluetooth", "hardware", "bluetooth", "BT", "ble");
add("radio", "hardware", "radio-tower", "RF", "lora", "zigbee", "antenna");
add("workflow", "flow", "workflow", "WF", "process", "step");
add("decision", "flow", "split", "?", "branch", "condition", "if");
add("parallel", "flow", "git-fork", "PAR", "fork", "concurrent");
add("retry", "flow", "rotate-cw", "RT", "retry-loop");
add("loop", "flow", "repeat", "LP", "repeat", "iterate");
add("external", "flow", "external-link", "EXT", "third-party", "saas", "vendor", "stripe", "payment");
add("package", "devops", "package", "PKG", "library", "module", "npm", "sdk");

export const GENERIC_ICON_ID = "generic";

/** Registry id for any id, alias or vendor word; `undefined` when nothing matches. */
export const resolveIconId = (reference: unknown): string | undefined => {
  if (typeof reference !== "string") return undefined;
  const k = key(reference);
  if (!k) return undefined;
  if (registry.has(k)) return k;
  return aliases.get(k);
};

/** Never undefined: unknown references draw the generic block icon. */
export const getIcon = (reference: unknown): IconDef => registry.get(resolveIconId(reference) ?? GENERIC_ICON_ID)!;

/**
 * The icon for a node: its explicit reference when valid, else its kind (so every board stored
 * before icons existed gets one with no migration), else generic.
 */
export const iconForNode = (ai: { icon?: string; semanticKind?: string } | undefined): IconDef =>
  getIcon(resolveIconId(ai?.icon) ?? resolveIconId(ai?.semanticKind));

export const listIcons = (): IconDef[] => [...registry.values()];

/** Ids the model may use in `icon`, for prompts. Compact on purpose. */
export const ICON_IDS_FOR_PROMPT = (): string =>
  listIcons()
    .map((i) => i.id)
    .filter((id) => id !== GENERIC_ICON_ID)
    .join(", ");

const CATEGORY_TINT: Record<IconCategory, string> = {
  compute: "#2563eb",
  data: "#7c3aed",
  network: "#0891b2",
  security: "#dc2626",
  client: "#475569",
  devops: "#ea580c",
  ai: "#c026d3",
  observability: "#16a34a",
  hardware: "#b45309",
  flow: "#4f46e5",
  generic: "#64748b",
};

export const categoryTint = (category: IconCategory) => CATEGORY_TINT[category];
