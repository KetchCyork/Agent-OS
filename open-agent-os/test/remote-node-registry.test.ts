import assert from "node:assert";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { RemoteNodeRegistry } from "../src/cross-machine/nodes.js";

export async function runRemoteNodeRegistryTests(): Promise<void> {
  const tmp = join(tmpdir(), "open-agent-os-test", "registry");
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const file = join(tmp, "nodes.json");
  const registry = new RemoteNodeRegistry(file);

  await registry.set({ name: "node1", url: "http://127.0.0.1:0", type: "runner", apiKey: "secret" });
  const nodes = await registry.list();
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "node1");
  assert.ok(nodes[0].lastSeen);

  await registry.set({ name: "node1", url: "http://127.0.0.1:0", type: "runner", apiKey: "secret", description: "test node" });
  const node = await registry.get("node1");
  assert.equal(node?.description, "test node");

  const sockets = new Set<import("node:net").Socket>();
  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/command") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      assert.equal(body.command, "echo");
      res.writeHead(200, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify({ received: body }));
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
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("unexpected address");
  const port = address.port;
  await registry.set({ name: "node1", url: `http://127.0.0.1:${port}`, type: "runner", apiKey: "secret" });

  const result = await registry.forwardCommand("node1", { command: "echo", args: { foo: "bar" } });
  assert.equal(result.ok, true);
  assert.equal((result.result as any).received.command, "echo");

  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const socket of sockets) socket.destroy();

  const removed = await registry.remove("node1");
  assert.equal(removed, true);
  assert.equal((await registry.list()).length, 0);
}
