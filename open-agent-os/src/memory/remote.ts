export interface RemoteMemoryRetrievalHit {
  notePath: string;
  text: string;
  type: string;
  tags: string;
  source: string;
  updated: string;
  score: number;
}

export class RemoteMemoryClient {
  constructor(private serviceUrl: string, private apiKey?: string) {}

  async retrieve(query: string, topK = 6): Promise<RemoteMemoryRetrievalHit[]> {
    const url = this.serviceUrl.replace(/\/+$/, "") + "/memory/retrieve";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ query, topK }),
    });

    if (!res.ok) {
      throw new Error(`Remote memory service ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as { results?: RemoteMemoryRetrievalHit[] };
    if (!Array.isArray(body.results)) {
      throw new Error("Remote memory service returned unexpected response shape.");
    }

    return body.results;
  }
}
