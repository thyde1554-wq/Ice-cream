import { RollingWindow } from './rollingWindow';

describe('RollingWindow', () => {
  it('reports null stats when empty', () => {
    const w = new RollingWindow(1000);
    expect(w.mean()).toBeNull();
    expect(w.stddev()).toBeNull();
    expect(w.count).toBe(0);
  });

  it('computes mean and stddev over pushed samples', () => {
    const w = new RollingWindow(10_000);
    w.push(10, 0);
    w.push(20, 1);
    w.push(30, 2);
    expect(w.mean()).toBe(20);
    expect(w.stddev()).toBeCloseTo(Math.sqrt(((10 - 20) ** 2 + 0 + (30 - 20) ** 2) / 3));
  });

  it('drops samples older than the window', () => {
    const w = new RollingWindow(1000);
    w.push(0, 0);
    w.push(100, 500);
    w.push(200, 1600); // cutoff = 600, drops samples at t=0 and t=500
    expect(w.count).toBe(1);
    expect(w.mean()).toBe(200);
  });

  it('keeps all samples when windowMs is infinite', () => {
    const w = new RollingWindow(Number.POSITIVE_INFINITY);
    w.push(1, 0);
    w.push(2, 100_000);
    expect(w.count).toBe(2);
  });

  it('clear() empties the window', () => {
    const w = new RollingWindow(1000);
    w.push(5, 0);
    w.clear();
    expect(w.count).toBe(0);
    expect(w.mean()).toBeNull();
  });
});
