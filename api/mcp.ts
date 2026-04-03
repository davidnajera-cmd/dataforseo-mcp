import { createServer } from "../src/server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// Session management: each session gets its own server + transport
const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

export default async function handler(
  req: IncomingMessage & { body?: unknown; method?: string; headers: Record<string, string | string[] | undefined> },
  res: ServerResponse
) {
  // Handle CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "POST") {
    // Read body if not already parsed
    let body = (req as any).body;
    if (!body) {
      body = await new Promise<string>((resolve) => {
        let data = "";
        req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        req.on("end", () => resolve(data));
      });
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { /* keep as string */ }
      }
    }

    // Check if this is an initialize request
    const isInitialize = Array.isArray(body)
      ? body.some((msg: any) => msg.method === "initialize")
      : body?.method === "initialize";

    if (isInitialize) {
      // Create a NEW server and transport per session
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport });
        },
      });

      transport.onclose = () => {
        const sid = (transport as any).sessionId;
        if (sid) sessions.delete(sid);
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    // Existing session
    if (sessionId && sessions.has(sessionId)) {
      const { transport } = sessions.get(sessionId)!;
      await transport.handleRequest(req, res, body);
      return;
    }

    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No valid session. Send an initialize request first." }));
    return;
  }

  if (req.method === "GET") {
    if (sessionId && sessions.has(sessionId)) {
      const { transport } = sessions.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No valid session for SSE." }));
    return;
  }

  if (req.method === "DELETE") {
    if (sessionId && sessions.has(sessionId)) {
      const { transport } = sessions.get(sessionId)!;
      await transport.handleRequest(req, res);
      sessions.delete(sessionId);
      return;
    }

    res.writeHead(200);
    res.end();
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}
