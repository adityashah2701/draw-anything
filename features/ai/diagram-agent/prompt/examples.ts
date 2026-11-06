import { isSystemDesign } from "./prompt-context";
/** Worked diagrams the prompt shows. Each is asserted to parse and lay out cleanly in a test. */
export interface WorkedExample {
  request: string;
  code: string;
}

/** The examples a request of this type learns from the most; the first is always enough on its own. */
export const examplesFor = (diagramType: string | undefined, prompt = ""): WorkedExample[] => {
  const pick = (...requests: string[]) => requests.map((r) => EXAMPLES.find((e) => e.request === r)!);
  if (diagramType === "entity-relationship") return pick("Library ER diagram");
  if (diagramType === "sequence") return pick("Login sequence");
  if (diagramType === "class") return pick("Payment classes");
  if (diagramType === "mind-map") return pick("Product launch mind map");
  if (diagramType === "flowchart" || diagramType === "workflow") return pick("Login flow");
  if (isSystemDesign(prompt) && (!diagramType || diagramType === "architecture")) return pick("Chat app system design (like WhatsApp)");
  if (diagramType === "architecture" && /ci\/cd|pipeline|deploy/i.test(prompt)) return pick("CI/CD pipeline with staging and production");
  return pick("Web app backend on AWS");
};

export const EXAMPLES: WorkedExample[] = [
  {
    request: "CI/CD pipeline with staging and production",
    code: `type architecture
title CI/CD pipeline

Developer [icon: user]
Repository [icon: repository]
Build [icon: cicd]
Test [icon: cicd]
Artifacts [icon: archive]
Secrets [icon: secrets]

Environments {
  Staging {
    Staging App [icon: container]
    Staging DB [icon: postgres]
  }
  Production {
    Production App [icon: container]
    Production DB [icon: postgres]
  }
}

Monitoring [icon: dashboard]

Developer > Repository: push
Repository > Build
Build > Test
Build > Artifacts
Secrets > Build
Test > Staging App: deploy
Staging App > Staging DB
Staging App > Production App: promote
Production App > Production DB
Production App > Monitoring
Staging App > Monitoring`,
  },
  {
    request: "Web app backend on AWS",
    code: `type architecture
title Web application

Users [icon: user]
CDN [icon: cdn]

Edge {
  Load Balancer [icon: load-balancer]
  API Gateway [icon: gateway]
}

Services {
  Auth Service [icon: authentication]
  Orders Service [icon: service]
  Payments Service [icon: service]
}

Data {
  Orders DB [icon: postgres]
  Session Cache [icon: redis]
  Event Bus [icon: kafka]
}

Stripe [icon: external]

Users > CDN > Load Balancer > API Gateway
API Gateway > Auth Service, Orders Service
Auth Service > Session Cache
Orders Service > Orders DB
Orders Service > Event Bus: order placed
Event Bus > Payments Service
Payments Service > Stripe: charge`,
  },
  {
    request: "Login flow",
    code: `type flowchart
title Login

Start [kind: start]
Enter Credentials [kind: workflow]
Valid? [kind: decision]
MFA Required? [kind: decision]
Create Session [kind: workflow]
Show Error [kind: alerting]
Dashboard [kind: end]

Start > Enter Credentials > Valid?
Valid? > MFA Required?: yes
Valid? > Show Error: no
Show Error > Enter Credentials: retry
MFA Required? > Create Session: no
Create Session > Dashboard`,
  },
  {
    request: "Library ER diagram",
    code: `type entity-relationship
title Library

Members [shape: entity, rows: "id int pk; email text uq; name text"]
Loans [shape: entity, rows: "id int pk; member_id int fk -> members.id; copy_id int fk -> copies.id; due_on date; returned_on date nullable"]
Copies [shape: entity, rows: "id int pk; book_id int fk -> books.id; branch_id int fk -> branches.id"]
Books [shape: entity, rows: "id int pk; isbn text uq; title text"]
Book Authors [shape: entity, variant: junction, rows: "book_id int pk fk -> books.id; author_id int pk fk -> authors.id"]
Authors [shape: entity, rows: "id int pk; name text"]
Branches [shape: entity, rows: "id int pk; name text; city text"]

Members > Loans [relation: er-relationship, from: one, to: zero-or-many]
Copies > Loans [relation: er-relationship, from: one, to: zero-or-many]
Books > Copies [relation: er-relationship, from: one, to: one-or-many]
Branches > Copies [relation: er-relationship, from: one, to: zero-or-many]
Books > Book Authors [relation: er-relationship, from: one, to: one-or-many]
Authors > Book Authors [relation: er-relationship, from: one, to: zero-or-many]`,
  },
  {
    request: "Login sequence",
    code: `type sequence
title Login

User [shape: lifeline]
Web App [shape: lifeline]
Auth Service [shape: lifeline]
Database [shape: lifeline]

User > Web App: Submit credentials [relation: sync]
Web App > Auth Service: Verify [relation: sync]
Auth Service > Database: Find user [relation: sync]
Database > Auth Service: User record [relation: return]
Auth Service > Web App: Token [relation: return]
Web App > User: Show dashboard [relation: return]`,
  },
  {
    request: "Payment classes",
    code: `type class
title Payments

PaymentMethod [shape: class, variant: abstract, attributes: "#id: int", operations: "+pay(amount: Money): Receipt"]
CreditCard [shape: class, attributes: "-number: string; -expiry: date", operations: "+pay(amount: Money): Receipt"]
BankTransfer [shape: class, attributes: "-iban: string", operations: "+pay(amount: Money): Receipt"]
Order [shape: class, attributes: "-id: int; -total: Money", operations: "+checkout(): void"]
OrderItem [shape: class, attributes: "-sku: string; -qty: int"]

CreditCard > PaymentMethod [relation: generalization]
BankTransfer > PaymentMethod [relation: generalization]
Order > PaymentMethod [relation: association, to: 1]
Order > OrderItem [relation: composition, from: 1, to: 1..*]`,
  },
  {
    request: "Product launch mind map",
    code: `type mind-map
title Product launch

Product Launch [shape: topic]
Product [shape: topic]
Marketing [shape: topic]
Sales [shape: topic]
Support [shape: topic]
Roadmap [shape: topic]
Pricing [shape: topic]
Landing Page [shape: topic]
Launch Event [shape: topic]
Demos [shape: topic]
Partners [shape: topic]
Help Center [shape: topic]
On-call [shape: topic]

Product Launch > Product, Marketing, Sales, Support
Product > Roadmap, Pricing
Marketing > Landing Page, Launch Event
Sales > Demos, Partners
Support > Help Center, On-call`,
  },
  {
    request: "Chat app system design (like WhatsApp)",
    code: `type architecture
title Chat messaging system
direction right

frame Clients {
  Mobile App [icon: mobile, shape: icon]
  Web App [icon: browser, shape: icon]
}

frame Edge {
  Load Balancer [icon: load-balancer, shape: icon]
  Chat Servers [icon: server, shape: icon]
}

frame Realtime {
  Presence Service [icon: service, shape: icon]
  Connection Cache [icon: redis, shape: icon]
}

frame Messaging {
  Message Queue [icon: kafka, shape: icon]
  Message Service [icon: service, shape: icon]
  Message DB [icon: database, shape: icon]
  Notification Service [icon: notification, shape: icon]
}

frame Media {
  Media Service [icon: service, shape: icon]
  Blob Storage [icon: s3, shape: icon]
  CDN [icon: cdn, shape: icon]
}

Push Provider [icon: external, shape: icon]

Mobile App, Web App > Load Balancer: WebSocket
Load Balancer > Chat Servers
Chat Servers > Presence Service > Connection Cache
Chat Servers > Message Queue: message sent
Message Queue > Message Service > Message DB
Message Queue --> Notification Service
Notification Service > Push Provider: APNs / FCM
Chat Servers > Media Service: media upload
Media Service > Blob Storage > CDN`,
  },
];
