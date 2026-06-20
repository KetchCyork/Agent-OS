import { randomUUID } from "node:crypto";

export type JobStatus = "pending" | "running" | "success" | "error";

export interface Job {
  id: string;
  nodeName: string;
  command: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  /** 0–100 completion percentage, reported by the executing node */
  progress?: number;
  /** Human-readable progress message from the executing node */
  progressMessage?: string;
  result?: unknown;
  error?: string;
}

export class JobStore {
  private jobs = new Map<string, Job>();

  create(nodeName: string, command: string): Job {
    const job: Job = {
      id: randomUUID(),
      nodeName,
      command,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending",
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(): Job[] {
    return [...this.jobs.values()];
  }

  updateProgress(id: string, progress: number, progressMessage?: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.progress = Math.min(100, Math.max(0, progress));
    if (progressMessage !== undefined) job.progressMessage = progressMessage;
    job.updatedAt = new Date().toISOString();
  }

  update(id: string, patch: Partial<Pick<Job, "status" | "result" | "error">>): void {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, { ...patch, updatedAt: new Date().toISOString() });
  }
}
