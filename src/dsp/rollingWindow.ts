/** A single timestamped audio-level sample (decibels). */
export interface Sample {
  t: number;
  v: number;
}

/**
 * Keeps samples from the last `windowMs` milliseconds and exposes basic
 * statistics (mean, standard deviation) over that sliding window.
 */
export class RollingWindow {
  private samples: Sample[] = [];

  constructor(private windowMs: number) {}

  push(value: number, now: number = Date.now()): void {
    this.samples.push({ t: now, v: value });
    this.trim(now);
  }

  private trim(now: number): void {
    if (!Number.isFinite(this.windowMs)) return;
    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < this.samples.length && this.samples[i].t < cutoff) i++;
    if (i > 0) this.samples.splice(0, i);
  }

  get count(): number {
    return this.samples.length;
  }

  mean(): number | null {
    if (this.samples.length === 0) return null;
    const sum = this.samples.reduce((acc, s) => acc + s.v, 0);
    return sum / this.samples.length;
  }

  stddev(): number | null {
    if (this.samples.length < 2) return null;
    const m = this.mean()!;
    const variance =
      this.samples.reduce((acc, s) => acc + (s.v - m) ** 2, 0) / this.samples.length;
    return Math.sqrt(variance);
  }

  clear(): void {
    this.samples = [];
  }
}
