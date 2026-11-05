/**
 * How to approach "design WhatsApp": what a senior engineer decides before drawing a high-level design, and what
 * the drawing must contain. Only requests that `isSystemDesign` recognises get it, so other prompts stay small.
 */
export const SYSTEM_DESIGN_GUIDE = [
  "This is a SYSTEM DESIGN request (a product or platform). Think like a senior engineer before you draw:",
  "a. Requirements: name to yourself the 3-5 core use cases (for a chat app: send a message, deliver it to an offline user, see who is online, share media, group chats) and what drives the design (real time, millions of users, large files, global reach).",
  "b. One component per responsibility each use case needs, in 4-6 groups. Group by layer (Clients, Edge) and, after the edge, by use case or domain (Messaging, Media, Realtime, Payments), each holding its service, its queue and its stores:",
  "   Clients (mobile, web) | Edge (load balancer, API gateway for requests, a WebSocket or real-time server tier when there is live traffic, CDN for static files and media) | domain groups with their services (auth, users, messages, groups, media, presence, feed, matching, payments...) | async parts (a queue or stream for events, workers, notifications) | one store per kind of data (relational for accounts, a wide-column or NoSQL store for high-volume records like messages, a cache for hot data and sessions, object storage for media, a search index only if search is a use case) | External (push providers, payment, email, maps), usually outside the groups.",
  "c. Draw every component as a captioned icon: `Name [icon: <id>, shape: icon]`. Draw a horizontally scaled tier (chat servers, workers) as ONE node with a plural name (Chat Servers), not as copies.",
  "d. Start the code with `direction right` so the request path reads left to right. Connect the main path of each use case end to end: client > edge > service > store, plus the async path (service > queue --> worker or notifier > external). Every service talks to at least one store or queue; nothing floats.",
  "e. Label only what a reviewer needs: protocols at the edge (HTTPS, WebSocket, gRPC) and events on async paths (message sent). Dashed (-->) for async.",
  "f. 12-22 nodes. Names say the responsibility (Message Service, Media Storage), never generic (Service 1, Database). Leave out monitoring, logging and CI/CD unless asked. Write groups in the order of the flow (Clients first) and nodes inside each group in the order of the flow.",
].join("\n");
