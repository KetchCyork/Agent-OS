import { randomUUID } from "node:crypto";

export type JobStatus = "pending" | "running" | "success" | "error";

export interface Job {
  id: string;
  nodeName: string;
  command: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
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

  update(id: string, patch: Partial<Pick<Job, "status" | "result" | "error">>): void {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, { ...patch, updatedAt: new Date().toISOString() });
  }
}
