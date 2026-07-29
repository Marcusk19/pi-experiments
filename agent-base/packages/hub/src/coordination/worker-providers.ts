import type { JsonValue } from "./types.js";
import { CoordinationError } from "./errors.js";
export interface WorkerStartRequest { taskId: string; launchToken: string; cwd: string; options: Record<string, JsonValue>; deadlineAt: number }
export interface WorkerProvider { readonly name: string; start(request: WorkerStartRequest): Promise<{ launchId: string }>; cancel(launchId: string): Promise<void> }
export class WorkerProviderCatalog {
  private readonly providers: Map<string, WorkerProvider>;
  constructor(providers: WorkerProvider[] = []) {
    for (const provider of providers) if (!/^[a-z0-9_-]{1,64}$/.test(provider.name)) throw new Error("Invalid worker provider name");
    this.providers = new Map(providers.map((provider) => [provider.name, provider]));
    if (this.providers.size !== providers.length) throw new Error("Duplicate worker provider name");
  }
  names(): string[] { return [...this.providers.keys()].sort(); }
  async start(name: string, request: WorkerStartRequest): Promise<{ launchId: string }> {
    const provider = this.providers.get(name);
    if (!provider) throw new CoordinationError("WORKER_PROVIDER_NOT_FOUND", "Worker provider is unavailable", 400);
    return provider.start(request);
  }
  async cancel(name: string, launchId: string): Promise<void> { const provider = this.providers.get(name); if (provider) await provider.cancel(launchId); }
}
