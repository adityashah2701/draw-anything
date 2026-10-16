/** Worked diagrams the prompt shows. Each is asserted to parse and lay out cleanly in a test. */
export interface WorkedExample {
  request: string;
  code: string;
}

/** The examples a request of this type learns from the most; the first is always enough on its own. */
export const examplesFor = (diagramType: string | undefined, prompt = ""): WorkedExample[] => {
  const pick = (...requests: string[]) => requests.map((r) => EXAMPLES.find((e) => e.request === r)!);
  if (diagramType === "flowchart" || diagramType === "workflow") return pick("Login flow");
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
];
