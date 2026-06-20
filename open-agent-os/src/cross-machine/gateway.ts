import { RemoteNodeRegistry } from "./nodes.js";
import { JobStore } from "./jobs.js";

export const HQ_CAPABILITIES = [
  "status",
  "node.list",
  "node.health",
  "memory.retrieve",
  "model.call",
  "dispatch",
] as const;

export type HQCapability = (typeof HQ_CAPABILITIES)[number];

export interface InboundCommandRequest {
  command: string;
  args?: unknown;
  /** Optional caller-supplied correlation ID echoed back in the response. */
  requestId?: string;
}

export interface InboundCommandResult {
  ok: boolean;
  command: string;
  requestId?: string;
  result?: unknown;
  error?: string;
}

export interface GatewayServices {
  registry: RemoteNodeRegistry;
  jobStore: JobStore;
  nodeCount: () => Promise<number>;
  memoryServiceUrl?: string;
  gatewayAuthRequired?: boolean;
  /**
   * Optional: inject a memory retrieval function so the gateway can query the
   * local memory store without importing LanceDB directly (keeps tests light).
   */
  memoryRetrieve?: (query: string, topK: number) => Promise<unknown[]>;
  /**
   * Optional: inject a model-call function for the same reason.
   */
  modelCall?: (modelId: string, messages: unknown[], opts?: unknown) => Promise<unknown>;
}

export class InboundGatewayHandler {
  constructor(private svc: GatewayServices) {}

  async handle(req: InboundCommandRequest): Promise<InboundCommandResult> {
    const { command, args = {}, requestId } = req;
    try {
      const result = await this.route(command, args);
      return { ok: true, command, requestId, result };
    } catch (err) {
      return { ok: false, command, requestId, error: String(err) };
    }
  }

  private async route(command: string, args: unknown): Promise<unknown> {
    switch (command) {
      case "status":       return this.cmdStatus();
      case "node.list":    return this.cmdNodeList();
      case "node.health":  return this.cmdNodeHealth(args);
      case "memory.retrieve": return this.cmdMemoryRetrieve(args);
      case "model.call":   return this.cmdModelCall(args);
      case "dispatch":     return this.cmdDispatch(args);
      default:
        throw new Error(`Unknown command: ${command}. Supported: ${HQ_CAPABILITIES.join(", ")}`);
    }
  }

  private async cmdStatus(): Promise<unknown> {
    const nodeCount = await this.svc.nodeCount();
    const jobCount = this.svc.jobStore.list().length;
    return {
      service: "open-agent-os",
      capabilities: HQ_CAPABILITIES,
      nodeCount,
      jobCount,
      memoryServiceUrl: this.svc.memoryServiceUrl ?? null,
      memoryRetrieveAvailable: !!this.svc.memoryRetrieve,
      modelCallAvailable: !!this.svc.modelCall,
      gatewayAuthRequired: this.svc.gatewayAuthRequired ?? false,
    };
  }

  private async cmdNodeList(): Promise<unknown> {
    return this.svc.registry.list();
  }

  private async cmdNodeHealth(args: unknown): Promise<unknown> {
    const { name } = args as { name?: string };
    if (!name) throw new Error("args.name is required for node.health");
    const node = await this.svc.registry.get(name);
    if (!node) throw new Error(`Node not found: ${name}`);
    const health = await this.svc.registry.ping(node);
    return { name, ...health };
  }

  private async cmdMemoryRetrieve(args: unknown): Promise<unknown> {
    if (!this.svc.memoryRetrieve) {
      throw new Error("memory.retrieve is not available on this HQ node");
    }
    const { query, topK = 6 } = args as { query?: string; topK?: number };
    if (!query) throw new Error("args.query is required for memory.retrieve");
    return this.svc.memoryRetrieve(query, topK);
  }

  private async cmdModelCall(args: unknown): Promise<unknown> {
    if (!this.svc.modelCall) {
      throw new Error("model.call is not available on this HQ node");
    }
    const { model, messages, opts } = args as { model?: string; messages?: unknown[]; opts?: unknown };
    if (!model) throw new Error("args.model is required for model.call");
    if (!Array.isArray(messages)) throw new Error("args.messages must be an array for model.call");
    return this.svc.modelCall(model, messages, opts);
  }

  private async cmdDispatch(args: unknown): Promise<unknown> {
    const { nodeName, command, args: innerArgs, payload } =
      args as { nodeName?: string; command?: string; args?: unknown; payload?: unknown };
    if (!nodeName) throw new Error("args.nodeName is required for dispatch");
    if (!command) throw new Error("args.command is required for dispatch");
    const result = await this.svc.registry.forwardCommand(nodeName, { command, args: innerArgs, payload });
    return result;
  }
}
