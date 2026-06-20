import { RemoteNodeRegistry, type RemoteNodeConfig, type RemoteNodeType } from "./nodes.js";

export interface NodeStatus {
  name: string;
  type: RemoteNodeType;
  url: string;
  description?: string;
  lastSeen?: string;
  reachable: boolean;
  latencyMs?: number;
  details?: unknown;
}

export interface MeshStatus {
  checkedAt: string;
  nodes: NodeStatus[];
  memoryServiceReachable: boolean;
  memoryServiceUrl?: string;
  summary: { total: number; reachable: number; unreachable: number };
}

export class MeshStatusChecker {
  constructor(
    private registry: RemoteNodeRegistry,
    private memoryServiceUrl?: string,
  ) {}

  async check(): Promise<MeshStatus> {
    const nodes = await this.registry.list();

    const nodeStatuses = await Promise.all(nodes.map((node) => this.probeNode(node)));

    let memoryServiceReachable = false;
    if (this.memoryServiceUrl) {
      try {
        const t0 = Date.now();
        const res = await fetch(this.memoryServiceUrl.replace(/\/+$/, "") + "/health", {
          method: "GET",
          headers: { connection: "close" },
          signal: AbortSignal.timeout(5000),
        });
        memoryServiceReachable = res.ok;
        void (Date.now() - t0);
      } catch {
        memoryServiceReachable = false;
      }
    }

    const reachable = nodeStatuses.filter((n) => n.reachable).length;
    return {
      checkedAt: new Date().toISOString(),
      nodes: nodeStatuses,
      memoryServiceReachable,
      memoryServiceUrl: this.memoryServiceUrl,
      summary: { total: nodeStatuses.length, reachable, unreachable: nodeStatuses.length - reachable },
    };
  }

  private async probeNode(node: RemoteNodeConfig): Promise<NodeStatus> {
    const t0 = Date.now();
    try {
      const health = await this.registry.ping(node);
      const latencyMs = Date.now() - t0;
      return {
        name: node.name,
        type: node.type,
        url: node.url,
        description: node.description,
        lastSeen: node.lastSeen,
        reachable: health.ok,
        latencyMs,
        details: health.details,
      };
    } catch {
      return {
        name: node.name,
        type: node.type,
        url: node.url,
        description: node.description,
        lastSeen: node.lastSeen,
        reachable: false,
      };
    }
  }
}
