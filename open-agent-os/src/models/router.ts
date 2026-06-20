/**
 * Model Router
 * ------------
 * One call site for every model, across three back ends:
 *   - openrouter : any cloud model (Claude, Gemini, GLM, Kimi, ...), pay-as-you-go
 *   - ollama     : local models on your machine (free, private)
 *   - anthropic  : Claude directly, if you'd rather use your Claude/Anthropic key
 *
 * Two things the video's system does that matter, both implemented here:
 *   1. Fallback chains  -> if a model is unavailable (e.g. a tier gets suspended),
 *                          the next model in the chain is tried automatically.
 *   2. "Fusion"         -> a panel of models answers in parallel, then a judge
 *                          model reads the answers and writes one verdict.
 *
 * No SDKs required: Node 18+ has global fetch. Keep it dependency-light so the
 * open-source install stays a single `npm install`.
 */

export type Role = "system" | "user" | "assistant";
export interface Message { role: Role; content: string; }

export type Backend = "openrouter" | "ollama" | "anthropic";

export interface ModelSpec {
  /** Friendly id used in profiles/config, e.g. "claude", "glm", "local-fast". */
  id: string;
  backend: Backend;
  /** Provider model string, e.g. "anthropic/claude-opus-4-8" (OpenRouter) or "llama3.1" (Ollama). */
  model: string;
  /** Optional ordered fallbacks (model ids) tried if this one errors. */
  fallback?: string[];
}

export interface RouterConfig {
  models: Record<string, ModelSpec>;
  openrouterKey?: string;
  anthropicKey?: string;
  ollamaUrl?: string; // default http://localhost:11434
}

export interface CallOptions {
  temperature?: number;
  maxTokens?: number;
  /** Add live web search on OpenRouter calls (the ":online" modifier). */
  online?: boolean;
}

export interface CallResult {
  text: string;
  modelUsed: string;   // the model id that actually answered
  backend: Backend;
  triedFallback: boolean;
}

const DEFAULT_OLLAMA = "http://localhost:11434";

export class ModelRouter {
  constructor(private cfg: RouterConfig) {}

  /** Resolve a model id to its spec, throwing a clear error if missing. */
  private spec(id: string): ModelSpec {
    const s = this.cfg.models[id];
    if (!s) throw new Error(`Unknown model id "${id}". Add it to config.models.`);
    return s;
  }

  /**
   * Call a single model id, walking its fallback chain on failure.
   * Returns which model actually answered so the UI can show it (Mission Control).
   */
  async call(id: string, messages: Message[], opts: CallOptions = {}): Promise<CallResult> {
    const chain = [id, ...(this.spec(id).fallback ?? [])];
    let lastErr: unknown;
    for (let i = 0; i < chain.length; i++) {
      const s = this.spec(chain[i]);
      try {
        const text = await this.raw(s, messages, opts);
        return { text, modelUsed: s.id, backend: s.backend, triedFallback: i > 0 };
      } catch (err) {
        lastErr = err;
        // Try the next model in the chain.
      }
    }
    throw new Error(
      `All models in fallback chain failed (${chain.join(" -> ")}): ${String(lastErr)}`
    );
  }

  /** Low-level dispatch to the right back end. No fallback here. */
  private async raw(s: ModelSpec, messages: Message[], opts: CallOptions): Promise<string> {
    switch (s.backend) {
      case "openrouter": return this.openrouter(s, messages, opts);
      case "ollama":     return this.ollama(s, messages, opts);
      case "anthropic":  return this.anthropic(s, messages, opts);
    }
  }

  private async openrouter(s: ModelSpec, messages: Message[], opts: CallOptions): Promise<string> {
    if (!this.cfg.openrouterKey) throw new Error("OPENROUTER_API_KEY not set.");
    const model = opts.online ? `${s.model}:online` : s.model;
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.cfg.openrouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 1024,
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  private async ollama(s: ModelSpec, messages: Message[], opts: CallOptions): Promise<string> {
    const base = this.cfg.ollamaUrl ?? DEFAULT_OLLAMA;
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: s.model,
        messages,
        stream: false,
        options: { temperature: opts.temperature ?? 0.7 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return data.message?.content ?? "";
  }

  private async anthropic(s: ModelSpec, messages: Message[], opts: CallOptions): Promise<string> {
    if (!this.cfg.anthropicKey) throw new Error("ANTHROPIC_API_KEY not set.");
    // Anthropic wants the system prompt separate from the turn list.
    const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const turns = messages.filter(m => m.role !== "system");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.cfg.anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: s.model,
        system: system || undefined,
        messages: turns,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.7,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  }

  /**
   * Fusion: ask a panel of models the same question in parallel, then have a
   * judge model read all answers and write a single verdict. Use it only for
   * high-stakes calls -- it costs N+1 model calls per question.
   */
  async fusion(
    prompt: string,
    panel: string[],
    judge: string,
    opts: CallOptions = {}
  ): Promise<{ verdict: string; panel: { model: string; answer: string }[] }> {
    const answers = await Promise.allSettled(
      panel.map(id => this.call(id, [{ role: "user", content: prompt }], opts))
    );
    const panelOut = answers.map((a, i) => ({
      model: panel[i],
      answer: a.status === "fulfilled" ? a.value.text : `(unavailable: ${String((a as PromiseRejectedResult).reason)})`,
    }));

    const judgePrompt: Message[] = [
      {
        role: "system",
        content:
          "You are the judge. Several models answered the same question. " +
          "Weigh them, resolve disagreements, and write ONE best answer. " +
          "Do not mention the other models or that you are judging.",
      },
      {
        role: "user",
        content:
          `Question:\n${prompt}\n\n` +
          panelOut.map((p, i) => `--- Answer ${i + 1} (${p.model}) ---\n${p.answer}`).join("\n\n") +
          `\n\nWrite the single best final answer.`,
      },
    ];
    const verdict = await this.call(judge, judgePrompt, opts);
    return { verdict: verdict.text, panel: panelOut };
  }
}
