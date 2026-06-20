import assert from "node:assert";
import http from "node:http";
import { RemoteMemoryClient } from "../src/memory/remote.js";

export async function runRemoteMemoryTests(): Promise<void> {
  const sockets = new Set<import("node:net").Socket>();

  // --- Mock memory service ---
  const mockResults = [
    { notePath: "notes/foo.md", text: "relevant chunk", type: "note", tags: "ai,memory", source: "vault", updated: "2026-06-01", score: 0.95 },
    { notePath: "notes/bar.md", text: "another chunk", type: "note", tags: "ai", source: "vault", updated: "2026-06-02", score: 0.80 },
  ];

  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/memory/retrieve") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      // Echo back topK sliced results so we can verify the param
      const topK = body.topK ?? 6;
      res.writeHead(200, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify({ results: mockResults.slice(0, topK) }));
      return;
    }
    if (req.method === "POST" && req.url === "/memory/retrieve-auth") {
      const auth = req.headers.authorization ?? "";
      if (auth !== "Bearer secret-key") {
        res.writeHead(401, { "content-type": "application/json", connection: "close" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify({ results: mockResults }));
      return;
    }
    res.writeHead(404, { connection: "close" });
    res.end();
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setKeepAlive(false);
  });
  server.keepAliveTimeout = 0;
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as import("node:net").AddressInfo;
  const base = `http://127.0.0.1:${addr.port}`;

  // Basic retrieval — returns results array
  const client = new RemoteMemoryClient(base);
  const results = await client.retrieve("test query");
  assert.ok(Array.isArray(results));
  assert.equal(results.length, 2);
  assert.equal(results[0].notePath, "notes/foo.md");
  assert.ok(results[0].score > 0);

  // topK is respected
  const top1 = await client.retrieve("test query", 1);
  assert.equal(top1.length, 1);
  assert.equal(top1[0].notePath, "notes/foo.md");

  // API key is forwarded in Authorization header
  // (use a dedicated path on the mock server that checks the header)
  const authClient = new RemoteMemoryClient(`${base}-auth-unreachable`, "secret-key");
  // Rewrite to hit the auth path by pointing at a manually constructed URL
  // We test the auth forwarding by hitting our mock's /memory/retrieve-auth path directly
  // via a second client pointed at a base URL that — due to trailing-path concatenation
  // in RemoteMemoryClient — won't reach /memory/retrieve.  Instead we verify by
  // inspecting the Authorization header via the mock path trick below.
  const authClient2 = new RemoteMemoryClient(`${base}/memory/retrieve-auth/..`, "secret-key");
  // Simpler: just call retrieve on a client that uses the correct base and confirm
  // the header by using a path-specific mock.
  // We'll do this by temporarily registering the check in a fresh server.
  const authSockets = new Set<import("node:net").Socket>();
  const authServer = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/memory/retrieve") {
      const auth = req.headers.authorization ?? "";
      if (auth !== "Bearer my-api-key") {
        res.writeHead(401, { "content-type": "application/json", connection: "close" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify({ results: mockResults }));
      return;
    }
    res.writeHead(404, { connection: "close" });
    res.end();
  });
  authServer.on("connection", (s) => { authSockets.add(s); s.on("close", () => authSockets.delete(s)); s.setKeepAlive(false); });
  authServer.keepAliveTimeout = 0;
  await new Promise<void>((resolve) => authServer.listen(0, resolve));
  const authAddr = authServer.address() as import("node:net").AddressInfo;

  const keyedClient = new RemoteMemoryClient(`http://127.0.0.1:${authAddr.port}`, "my-api-key");
  const keyedResults = await keyedClient.retrieve("query with key");
  assert.equal(keyedResults.length, 2);

  // Without key → throws (server returns 401)
  const noKeyClient = new RemoteMemoryClient(`http://127.0.0.1:${authAddr.port}`);
  await assert.rejects(
    () => noKeyClient.retrieve("unauthorized query"),
    (err: Error) => err.message.includes("401"),
  );

  // Service returns unexpected shape → throws
  const badSockets = new Set<import("node:net").Socket>();
  const badServer = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify({ notResults: "oops" }));
  });
  badServer.on("connection", (s) => { badSockets.add(s); s.on("close", () => badSockets.delete(s)); s.setKeepAlive(false); });
  badServer.keepAliveTimeout = 0;
  await new Promise<void>((resolve) => badServer.listen(0, resolve));
  const badAddr = badServer.address() as import("node:net").AddressInfo;

  const badClient = new RemoteMemoryClient(`http://127.0.0.1:${badAddr.port}`);
  await assert.rejects(
    () => badClient.retrieve("bad shape query"),
    (err: Error) => err.message.includes("unexpected response shape"),
  );

  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const s of sockets) s.destroy();
  await new Promise<void>((resolve) => authServer.close(() => resolve()));
  for (const s of authSockets) s.destroy();
  await new Promise<void>((resolve) => badServer.close(() => resolve()));
  for (const s of badSockets) s.destroy();
}
