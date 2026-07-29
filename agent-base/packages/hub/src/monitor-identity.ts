import { createHmac } from "node:crypto";

export class MonitorIdentity {
  constructor(private readonly key: Buffer) {}

  forSession(sessionId: string): string {
    return createHmac("sha256", this.key).update(sessionId).digest("hex").slice(0, 32);
  }

  resolve(monitorId: string, sessionIds: string[]): string | undefined {
    return sessionIds.find((id) => this.forSession(id) === monitorId);
  }
}
