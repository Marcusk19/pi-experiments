import { ChangeNotifier } from "./coordination/notifier.js";

export class MonitorRevision {
  private revision = 0;
  private readonly notifier = new ChangeNotifier();

  current(): number {
    return this.revision;
  }

  changed(): number {
    this.revision += 1;
    this.notifier.notify("monitor");
    return this.revision;
  }

  async waitForChange(
    observed: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<number> {
    const clampedTimeout = Math.min(Math.max(timeoutMs, 0), 30_000);
    await this.notifier.wait("monitor", observed, clampedTimeout, signal);
    return this.revision;
  }

  close(): void {
    this.notifier.close();
  }
}
