export interface GoldenPrompt {
  id: string;
  prompt: string;
  type: string;
  /** A sensible node count for the request: a range, not a target. */
  nodes: [min: number, max: number];
  /** Words (case-insensitive) a good answer's labels should cover. */
  mentions: string[];
}

/** The six diagram families the evaluation covers; `type` values map onto them with `familyOf`. */
export const GOLDEN_FAMILIES = ["architecture", "flowchart", "er", "uml", "sequence", "mind-map"] as const;
export type GoldenFamily = (typeof GOLDEN_FAMILIES)[number];

export const familyOf = (type: string): GoldenFamily => {
  switch (type) {
    case "flowchart":
    case "workflow":
    case "bpmn":
      return "flowchart";
    case "entity-relationship":
      return "er";
    case "class":
    case "uml":
    case "component":
      return "uml";
    case "sequence":
      return "sequence";
    case "mind-map":
      return "mind-map";
    default:
      return "architecture";
  }
};

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
  // Flowchart and BPMN
  { id: "checkout-flow", type: "flowchart", prompt: "Flowchart of an online checkout: cart review, address, payment, a card-declined retry loop and order confirmation", nodes: [7, 14], mentions: ["cart", "payment", "declined", "confirmation"] },
  { id: "support-triage", type: "flowchart", prompt: "Flowchart for triaging a support ticket: classify severity, escalate critical ones to on-call, answer simple ones from the knowledge base, otherwise assign to a team", nodes: [7, 14], mentions: ["severity", "escalate", "knowledge", "assign"] },
  { id: "bpmn-leave", type: "bpmn", prompt: "BPMN process for employee leave approval with employee and manager lanes, a manager decision, an HR notification and a rejection path", nodes: [6, 14], mentions: ["leave", "manager", "approve", "reject"] },
  { id: "deploy-gate", type: "flowchart", prompt: "Release gate flowchart: run tests, security scan in parallel with a performance test, a manual approval, then deploy or roll back", nodes: [7, 14], mentions: ["test", "security", "approval", "deploy"] },
  { id: "invoice-bpmn", type: "bpmn", prompt: "BPMN invoice handling: receive invoice, validate, a timer event for overdue payment, pay, and archive", nodes: [6, 14], mentions: ["invoice", "validate", "pay", "archive"] },
  // ER
  { id: "er-library", type: "entity-relationship", prompt: "Entity relationship diagram for a library: books, authors, members, loans and reservations, with the key columns", nodes: [5, 9], mentions: ["book", "author", "member", "loan"] },
  { id: "er-school", type: "entity-relationship", prompt: "ER diagram for a school: students, courses, teachers and enrolments (a many-to-many between students and courses)", nodes: [4, 9], mentions: ["student", "course", "teacher", "enrol"] },
  { id: "er-saas", type: "entity-relationship", prompt: "ER diagram for a multi-tenant SaaS: organisations, users, roles, projects and audit events", nodes: [5, 9], mentions: ["organi", "user", "role", "project"] },
  { id: "er-hospital", type: "entity-relationship", prompt: "ER diagram for a hospital: patients, doctors, appointments, prescriptions and medications", nodes: [5, 9], mentions: ["patient", "doctor", "appointment", "prescription"] },
  { id: "er-social", type: "entity-relationship", prompt: "ER diagram for a social app: users, posts, comments, likes and follows", nodes: [5, 9], mentions: ["user", "post", "comment", "follow"] },
  // UML and low-level design
  { id: "uml-payments", type: "class", prompt: "UML class diagram of a payment module: an abstract PaymentMethod with CardPayment and WalletPayment subclasses, an Order that uses it and a Receipt", nodes: [4, 9], mentions: ["payment", "card", "wallet", "order"] },
  { id: "uml-parking", type: "class", prompt: "Class diagram for a parking lot: ParkingLot, Level, Spot, Vehicle (Car, Motorcycle) and Ticket", nodes: [5, 10], mentions: ["parking", "spot", "vehicle", "ticket"] },
  { id: "uml-observer", type: "class", prompt: "Class diagram of the observer pattern with a Subject interface, a ConcreteSubject and two observers", nodes: [4, 8], mentions: ["subject", "observer"] },
  { id: "uml-components", type: "component", prompt: "UML component diagram of a web shop: storefront, catalogue service, order service and payment gateway connected through provided and required interfaces", nodes: [4, 9], mentions: ["storefront", "catalogue", "order", "payment"] },
  { id: "uml-state", type: "uml", prompt: "UML state diagram of an order: created, paid, shipped, delivered and cancelled, with initial and final states", nodes: [5, 10], mentions: ["created", "paid", "shipped", "cancel"] },
  { id: "uml-repository", type: "class", prompt: "Class diagram for a repository pattern: a UserService depending on an IUserRepository interface implemented by SqlUserRepository and InMemoryUserRepository", nodes: [4, 8], mentions: ["service", "repository", "interface"] },
  // Sequence
  { id: "seq-login", type: "sequence", prompt: "Sequence diagram of a user logging in with a password and a one-time code against a web app, an auth service and a database", nodes: [4, 8], mentions: ["user", "auth", "database", "code"] },
  { id: "seq-checkout", type: "sequence", prompt: "Sequence diagram of checkout between a browser, an order service, a payment provider and an email service, including a payment failure", nodes: [4, 8], mentions: ["order", "payment", "email"] },
  { id: "seq-cache", type: "sequence", prompt: "Sequence diagram of a cache-aside read: client, API, cache and database, showing a hit and a miss", nodes: [4, 7], mentions: ["cache", "database", "api"] },
  { id: "seq-webhook", type: "sequence", prompt: "Sequence diagram of a webhook delivery with retries: a producer, a delivery queue, a worker and a customer endpoint", nodes: [4, 8], mentions: ["queue", "worker", "retry"] },
  { id: "seq-saga", type: "sequence", prompt: "Sequence diagram of a booking saga across booking, payment and inventory services with a compensating cancel", nodes: [4, 8], mentions: ["booking", "payment", "inventory", "cancel"] },
  // Mind maps
  { id: "mm-study", type: "mind-map", prompt: "Mind map for planning a year of study for a computer science degree", nodes: [8, 22], mentions: ["study", "course"] },
  { id: "mm-startup", type: "mind-map", prompt: "Mind map of everything needed to start a small online business", nodes: [8, 22], mentions: ["business", "marketing", "legal"] },
  { id: "mm-security", type: "mind-map", prompt: "Mind map of web application security topics", nodes: [8, 22], mentions: ["authentication", "injection", "encryption"] },
  { id: "mm-trip", type: "mind-map", prompt: "Mind map for organising a two-week trip to Japan", nodes: [8, 22], mentions: ["japan", "transport", "food"] },
  { id: "mm-onboarding", type: "mind-map", prompt: "Mind map of an engineering onboarding programme for new hires", nodes: [8, 22], mentions: ["onboarding", "tools", "mentor"] },
];
