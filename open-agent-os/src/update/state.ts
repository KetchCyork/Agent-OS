import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface PendingCommit {
  hash: string;
  message: string;
}

export interface UpdateState {
  lastCheckedAt: string | null;
  lastAppliedCommit: string | null;
  pendingCommits: PendingCommit[];
  upToDate: boolean;
}

const DEFAULT_STATE: UpdateState = {
  lastCheckedAt: null,
  lastAppliedCommit: null,
  pendingCommits: [],
  upToDate: true,
};

export class UpdateStateStore {
  constructor(private filePath: string) {
    mkdirSync(dirname(this.filePath), { recursive: true });
  }

  read(): UpdateState {
    if (!existsSync(this.filePath)) return { ...DEFAULT_STATE };
    try {
      return JSON.parse(readFileSync(this.filePath, "utf8")) as UpdateState;
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  write(state: UpdateState): void {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  }
}
