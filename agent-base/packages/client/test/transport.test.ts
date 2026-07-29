import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { HubClientError, HubTransport } from "../src/transport.js";

function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const url = `http://127.0.0.1:${address.port}`;
        resolve({
          url,
          close: () =>
            new Promise<void>((closeResolve) => {
              server.close(() => closeResolve());
            }),
        });
      }
    });
  });
}

describe("HubTransport", () => {
  const token = "test-token";

  it("sends registration requests and validates responses", async () => {
    const server = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/v2/sessions") {
        expect(req.headers.authorization).toBe(`Bearer ${token}`);
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          const parsed = JSON.parse(body);
          expect(parsed.metadata?.adapter).toBe("pi");
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ sessionId: "123e4567-e89b-12d3-a456-426614174000", leaseExpiresAt: 10, taskCapability: "ab".repeat(32) }));
        });
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    const transport = new HubTransport({ baseUrl: server.url, token });
    try {
      const result = await transport.register({
        metadata: {
          adapter: "pi",
          adapterVersion: "0.1.0",
          harnessSessionId: "one",
          cwd: "/repo",
          processId: 1,
          startedAt: 0,
          state: "idle",
          acceptsTaskDelivery: false,
        },
        snapshot: { lastSequence: 0, events: [] },
      });
      expect(result.sessionId).toBe("123e4567-e89b-12d3-a456-426614174000");
      expect(result.leaseExpiresAt).toBe(10);
    } finally {
      await server.close();
    }
  });

  it("maps API errors to typed client errors", async () => {
    const server = await startServer((req, res) => {
      if (req.method === "POST" && req.url?.startsWith("/v2/sessions/")) {
        res.statusCode = 409;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: { code: "SEQUENCE_GAP", message: "gap" } }));
      } else if (req.method === "POST" && req.url === "/v2/sessions") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ sessionId: "123e4567-e89b-12d3-a456-426614174000", leaseExpiresAt: 10, taskCapability: "ab".repeat(32) }));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    const transport = new HubTransport({ baseUrl: server.url, token });
    try {
      await transport.register({
        metadata: {
          adapter: "pi",
          adapterVersion: "0.1.0",
          cwd: "/repo",
          processId: 1,
          startedAt: 0,
          state: "idle",
          acceptsTaskDelivery: false,
        },
        snapshot: { lastSequence: 0, events: [] },
      });
      await expect(
        transport.append("123e4567-e89b-12d3-a456-426614174000", {
          expectedSequence: 0,
          events: [
            { type: "message.user", eventId: "u1", sequence: 1, timestamp: 1, text: "hi" },
          ],
        }),
      ).rejects.toMatchObject({ code: "SEQUENCE_GAP", status: 409, retryable: false });
    } finally {
      await server.close();
    }
  });

  it("rejects invalid responses", async () => {
    const server = await startServer((req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ leaseExpiresAt: 10, taskCapability: "ab".repeat(32) }));
    });
    const transport = new HubTransport({ baseUrl: server.url, token });
    try {
      await expect(
        transport.register({
          metadata: {
            adapter: "pi",
            adapterVersion: "0.1.0",
            cwd: "/repo",
            processId: 1,
            startedAt: 0,
            state: "idle",
          },
          snapshot: { lastSequence: 0, events: [] },
        }),
      ).rejects.toBeInstanceOf(HubClientError);
    } finally {
      await server.close();
    }
  });

  it("treats timeouts as retryable unavailability", async () => {
    const server = await startServer((_req, _res) => {
      // never respond
    });
    const transport = new HubTransport({ baseUrl: server.url, token, timeoutMs: 50 });
    try {
      await expect(transport.health()).rejects.toMatchObject({ code: "HUB_UNAVAILABLE", retryable: true });
    } finally {
      await server.close();
    }
  });
});
