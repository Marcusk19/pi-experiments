export class ChangeNotifier {
  private readonly generations = new Map<string, number>();
  private readonly waiters = new Map<string, Set<() => void>>();
  generation(key: string): number { return this.generations.get(key) ?? 0; }
  notify(key: string): void {
    this.generations.set(key, this.generation(key) + 1);
    for (const wake of this.waiters.get(key) ?? []) wake();
    this.waiters.delete(key);
  }
  async wait(key: string, observed: number, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    if (this.generation(key) !== observed || timeoutMs <= 0 || signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const set = this.waiters.get(key) ?? new Set<() => void>();
      let timer: NodeJS.Timeout | undefined;
      const done = () => { if (timer) clearTimeout(timer); set.delete(done); signal?.removeEventListener("abort", done); resolve(); };
      set.add(done); this.waiters.set(key, set); timer = setTimeout(done, timeoutMs); timer.unref?.();
      signal?.addEventListener("abort", done, { once: true });
    });
  }
  close(): void { for (const key of [...this.waiters.keys()]) this.notify(key); }
}
