import { expect, it } from "vitest";
import { elementsFromDiagramCode } from "@/features/diagram-code/canvas";
const code = `type architecture
direction right
frame Clients {
  MobileApp [icon: mobile, shape: icon]
  WebApp [icon: browser, shape: icon]
}
frame Edge {
  LoadBalancer [icon: load-balancer, shape: icon]
  ChatServers [icon: server, shape: icon]
}
frame Messaging {
  MessageQueue [icon: queue, shape: icon]
  MessageService [icon: server, shape: icon]
  MessageDB [icon: database, shape: icon]
  NotificationService [icon: bell, shape: icon]
}
frame Media {
  MediaService [icon: server, shape: icon]
  BlobStorage [icon: storage, shape: icon]
  CDN [icon: cdn, shape: icon]
}
frame Realtime {
  PresenceService [icon: server, shape: icon]
  Cache [icon: redis, shape: icon]
}
PushProvider [icon: cloud, shape: icon]
MobileApp > LoadBalancer: WebSocket
WebApp > LoadBalancer: WebSocket
LoadBalancer > ChatServers: HTTPS
ChatServers > MessageQueue: message sent
MessageQueue > MessageService
MessageService > MessageDB
MessageQueue > NotificationService
NotificationService > PushProvider: APNs / FCM
ChatServers > MediaService: media upload
MediaService > BlobStorage
BlobStorage > CDN
ChatServers > PresenceService
PresenceService > Cache`;
it("sibling frames of a packed system design never overlap", () => {
  const { elements } = elementsFromDiagramCode(code, { generationId: "g", frameId: "f", familyEngine: true });
  const boxes = elements.filter((e) => e.type === "frame").map((e) => {
    const xs = e.points.map((p) => p.x), ys = e.points.map((p) => p.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  });
  expect(boxes).toHaveLength(5);
  for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
    const [a, b] = [boxes[i], boxes[j]];
    expect(a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY, `frames ${i} and ${j}`).toBe(false);
  }
});
