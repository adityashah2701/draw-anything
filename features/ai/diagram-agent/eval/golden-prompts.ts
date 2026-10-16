export interface GoldenPrompt {
  id: string;
  prompt: string;
  type: string;
  /** A sensible node count for the request: a range, not a target. */
  nodes: [min: number, max: number];
  /** Words (case-insensitive) a good answer's labels should cover. */
  mentions: string[];
}

/** Fixed on purpose: results are compared across runs and pipelines. */
export const GOLDEN_PROMPTS: GoldenPrompt[] = [
  { id: "login-flow", type: "flowchart", prompt: "Flowchart for a user login process with MFA and a failure path", nodes: [6, 12], mentions: ["login", "mfa", "error"] },
  { id: "web-backend", type: "architecture", prompt: "Architecture of a web app backend on AWS with a CDN, API gateway, auth, orders service, Postgres and a cache", nodes: [8, 16], mentions: ["cdn", "gateway", "auth", "cache"] },
  { id: "ci-cd", type: "architecture", prompt: "CI/CD pipeline from developer push to staging and production with secrets management and monitoring", nodes: [8, 16], mentions: ["pipeline", "staging", "production", "secret"] },
  { id: "microservices-events", type: "architecture", prompt: "Event-driven microservices: orders, payments, inventory and notifications communicating over Kafka", nodes: [7, 14], mentions: ["kafka", "payment", "inventory", "notification"] },
  { id: "iot-sensor", type: "architecture", prompt: "IoT temperature sensor network: sensors with an ESP32 gateway sending over MQTT to a cloud ingestion service, a time-series database and a dashboard", nodes: [6, 12], mentions: ["sensor", "gateway", "dashboard"] },
  { id: "embedded-block", type: "architecture", prompt: "Block diagram of an embedded system: a microcontroller with a power supply, I2C sensors, SPI flash, a UART debug port and a Bluetooth module", nodes: [6, 12], mentions: ["microcontroller", "i2c", "uart", "bluetooth"] },
  { id: "k8s-deploy", type: "architecture", prompt: "Kubernetes deployment: ingress, three services in a cluster, a managed database outside the cluster and Prometheus monitoring", nodes: [7, 14], mentions: ["ingress", "cluster", "prometheus"] },
  { id: "oauth", type: "sequence", prompt: "OAuth 2.0 authorization code flow between user, browser app, authorization server and API", nodes: [4, 10], mentions: ["authorization", "token", "api"] },
  { id: "er-shop", type: "entity-relationship", prompt: "Entity relationship diagram for an online shop: customers, orders, order items, products and payments", nodes: [5, 9], mentions: ["customer", "order", "product", "payment"] },
  { id: "mind-map", type: "mind-map", prompt: "Mind map of the main areas of a software product launch", nodes: [8, 20], mentions: ["launch", "marketing"] },
  { id: "network-zones", type: "network", prompt: "Corporate network with internet, firewall, DMZ web servers, internal app servers, a database tier and a VPN for remote staff", nodes: [7, 14], mentions: ["firewall", "dmz", "vpn"] },
  { id: "rag-app", type: "architecture", prompt: "RAG chatbot: web UI, API, embedding model, vector store, LLM, document ingestion pipeline and object storage", nodes: [7, 14], mentions: ["vector", "llm", "ingestion"] },
];
