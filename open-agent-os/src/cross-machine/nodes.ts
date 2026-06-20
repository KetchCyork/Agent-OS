import { dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export type RemoteNodeType = "memory" | "runner" | "connector" | "generic";

export interface RemoteNodeConfig {
  name: string;
  url: string;
  type: RemoteNodeType;
  apiKey?: string;
  description?: string;
  lastSeen?: string;
}

export interface RemoteNodeHealth {
  ok: boolean;
  status: string;
  details?: unknown;
}

export class RemoteNodeRegistry {
  constructor(private filePath: string) {}

  async load(): Promise<RemoteNodeConfig[]> {
    try {
      const json = await readFile(this.filePath, "utf8");
      return JSON.parse(json) as RemoteNodeConfig[];
    } catch (err) {
      return [];
    }
  }

  async save(nodes: RemoteNodeConfig[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(nodes, null, 2), "utf8");
  }

  async list(): Promise<RemoteNodeConfig[]> {
    return await this.load();
  }

  async get(name: string): Promise<RemoteNodeConfig | undefined> {
    const nodes = await this.load();
    return nodes.find((node) => node.name === name);
  }

  async set(node: RemoteNodeConfig): Promise<void> {
    const nodes = await this.load();
    const existing = nodes.findIndex((item) => item.name === node.name);
    const now = new Date().toISOString();
    const merged = { ...node, lastSeen: node.lastSeen ?? now };
    if (existing !== -1) {
      nodes[existing] = merged;
    } else {
      nodes.push(merged);
    }
    await this.save(nodes);
  }

  async remove(name: string): Promise<boolean> {
    const nodes = await this.load();
    const updated = nodes.filter((node) => node.name !== name);
    if (updated.length === nodes.length) return false;
    await this.save(updated);
    return true;
  }

  async ping(node: RemoteNodeConfig): Promise<RemoteNodeHealth> {
    const url = node.url.replace(/\/+$/, "") + "/health";
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (node.apiKey) {
      headers["authorization"] = `Bearer ${node.apiKey}`;
    }

    try {
      const res = await fetch(url, { method: "GET", headers });
      const contentType = res.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json") ? await res.json() : await res.text();
      return {
        ok: res.ok,
        status: `${res.status} ${res.statusText}`,
        details: body,
      };
    } catch (err) {
      return {
        ok: false,
        status: "unreachable",
        details: String(err),
      };
    }
  }
}
