import { documentFromParsedCode } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";

/**
 * A diagram as the app produced it (reported from the browser): request/response pairs make cycles
 * through the whole flow, three groups, and a 19-edge fan of labelled connectors. Kept verbatim as
 * code so it goes through the same parser and document builder as the real thing.
 */
export const AUTH_FLOW_CODE = `
type flowchart

Authentication Core {
  Authentication Service [kind: authentication]
  User Database [kind: database]
  Session Store [kind: cache]
  Error Handler [kind: service]
}
Infrastructure {
  CI/CD Pipeline [kind: cicd]
  Monitoring Service [kind: dashboard]
  Secrets Vault [kind: secrets]
}
Client Side {
  Client Application [kind: service]
  User [kind: user]
}
API Gateway [kind: gateway]
Rate Limiter [kind: service]
TLS Layer [kind: external]

User > Client Application: enter credentials
Client Application > TLS Layer: TLS encrypt
TLS Layer > API Gateway: secure transport
API Gateway > Rate Limiter: rate limit
Rate Limiter > Authentication Service: allow request
Authentication Service > User Database: validate credentials
Authentication Service > Session Store: store session
Authentication Service > Error Handler: invalid credentials
Error Handler > API Gateway: error response
Authentication Service > API Gateway: auth success
API Gateway > Client Application: return token
Client Application > User: display result
Monitoring Service > API Gateway: metrics
Monitoring Service > Authentication Service: metrics
Monitoring Service > Rate Limiter: metrics
CI/CD Pipeline > Authentication Service: deploy
Secrets Vault > Authentication Service: secret fetch
Secrets Vault > Client Application: secret fetch
API Gateway > Authentication Service: HTTP request
`;

export const authFlowFixture = documentFromParsedCode(parseDiagramCode(AUTH_FLOW_CODE), "auth-flow").document;
