import { ChurnDoneDetector, DEFAULT_CONFIG, configForSensitivity } from './detector';

const CONFIG = {
  ...DEFAULT_CONFIG,
  calibrationMs: 5_000,
  shortWindowMs: 2_000,
  sustainMs: 3_000,
  riseThresholdDb: 4,
  dropThresholdDb: 6,
  varianceRatioThreshold: 1.8,
};

/** Feeds `db` samples at a fixed cadence starting at `startMs`, returning the final snapshot. */
function feed(
  detector: ChurnDoneDetector,
  db: number | (() => number),
  startMs: number,
  durationMs: number,
  stepMs = 250
) {
  let snapshot = detector.snapshot(startMs);
  for (let t = startMs; t <= startMs + durationMs; t += stepMs) {
    const value = typeof db === 'function' ? db() : db;
    snapshot = detector.addSample(value, t);
  }
  return snapshot;
}

describe('ChurnDoneDetector', () => {
  it('stays idle until started', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    expect(detector.getPhase()).toBe('idle');
    detector.addSample(-20, 0);
    expect(detector.getPhase()).toBe('idle');
  });

  it('moves from calibrating to monitoring once calibrationMs elapses', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    detector.start(0);
    expect(detector.getPhase()).toBe('calibrating');

    const snapshot = feed(detector, -20, 0, CONFIG.calibrationMs);
    expect(detector.getPhase()).toBe('monitoring');
    expect(snapshot.baselineMean).toBeCloseTo(-20, 0);
  });

  it('stays in monitoring on steady-state noise (no false positive)', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    detector.start(0);
    let t = 0;
    feed(detector, -20, t, CONFIG.calibrationMs);
    t += CONFIG.calibrationMs;

    // small jitter around baseline, well within thresholds, for a long time
    let toggle = 0;
    const snapshot = feed(detector, () => -20 + (toggle++ % 2 === 0 ? 0.5 : -0.5), t, 30_000);
    expect(snapshot.phase).toBe('monitoring');
  });

  it('fires "done" on a sustained level rise (motor straining)', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    detector.start(0);
    let t = 0;
    feed(detector, -20, t, CONFIG.calibrationMs);
    t += CONFIG.calibrationMs;

    // sustained rise beyond riseThresholdDb for longer than sustainMs (plus time for the
    // short window to fill with post-rise samples before the trigger can even start)
    const snapshot = feed(
      detector,
      -20 + CONFIG.riseThresholdDb + 2,
      t,
      CONFIG.shortWindowMs + CONFIG.sustainMs + 1000
    );
    expect(snapshot.phase).toBe('done');
    expect(snapshot.reason).toBe('level-rise');
  });

  it('fires "done" on a sustained drop (machine went quiet / auto shutoff)', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    detector.start(0);
    let t = 0;
    feed(detector, -20, t, CONFIG.calibrationMs);
    t += CONFIG.calibrationMs;

    const snapshot = feed(
      detector,
      -20 - CONFIG.dropThresholdDb - 2,
      t,
      CONFIG.shortWindowMs + CONFIG.sustainMs + 1000
    );
    expect(snapshot.phase).toBe('done');
    expect(snapshot.reason).toBe('level-drop');
  });

  it('does not fire on a brief transient rise shorter than sustainMs', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    detector.start(0);
    let t = 0;
    feed(detector, -20, t, CONFIG.calibrationMs);
    t += CONFIG.calibrationMs;

    // spike lasts less than sustainMs, then returns to baseline
    feed(detector, -20 + CONFIG.riseThresholdDb + 2, t, CONFIG.sustainMs - 1000);
    t += CONFIG.sustainMs - 1000;
    const snapshot = feed(detector, -20, t, 5_000);
    expect(snapshot.phase).toBe('monitoring');
  });

  it('resets back to idle and clears state', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    detector.start(0);
    feed(detector, -20, 0, CONFIG.calibrationMs);
    detector.reset();
    expect(detector.getPhase()).toBe('idle');
    expect(detector.snapshot(0).baselineMean).toBeNull();
  });

  it('high sensitivity uses smaller thresholds than low sensitivity', () => {
    const low = configForSensitivity('low');
    const high = configForSensitivity('high');
    expect(high.riseThresholdDb).toBeLessThan(low.riseThresholdDb);
    expect(high.dropThresholdDb).toBeLessThan(low.dropThresholdDb);
  });

  it('pause/resume during monitoring preserves the baseline across a long gap', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    detector.start(0);
    let t = 0;
    feed(detector, -20, t, CONFIG.calibrationMs);
    t += CONFIG.calibrationMs;
    const beforePause = detector.snapshot(t);

    detector.pause(t);
    expect(detector.getPhase()).toBe('paused');

    // a long real-world gap while the user checks on the machine
    const resumeAt = t + 5 * 60_000;
    detector.resume(resumeAt);

    expect(detector.getPhase()).toBe('monitoring');
    const afterResume = detector.snapshot(resumeAt);
    expect(afterResume.baselineMean).toBe(beforePause.baselineMean);
    expect(afterResume.baselineStd).toBe(beforePause.baselineStd);
  });

  it('pause/resume during calibration preserves remaining calibration time across the gap', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    detector.start(0);
    let t = 0;
    // partway through calibration
    feed(detector, -20, t, CONFIG.calibrationMs / 2);
    t += CONFIG.calibrationMs / 2;
    const remainingBeforePause = detector.snapshot(t).calibrationRemainingMs;
    expect(remainingBeforePause).toBeGreaterThan(0);

    detector.pause(t);
    const pausedSnapshot = detector.snapshot(t + 60_000);
    // the countdown should be frozen while paused, not still ticking down
    expect(pausedSnapshot.calibrationRemainingMs).toBeCloseTo(remainingBeforePause, -2);

    const resumeAt = t + 60_000;
    detector.resume(resumeAt);
    expect(detector.getPhase()).toBe('calibrating');
    expect(detector.snapshot(resumeAt).calibrationRemainingMs).toBeCloseTo(remainingBeforePause, -2);

    // finishing the remaining calibration should still land on monitoring with a good baseline
    const finalSnapshot = feed(detector, -20, resumeAt, remainingBeforePause + 500);
    expect(finalSnapshot.phase).toBe('monitoring');
    expect(finalSnapshot.baselineMean).toBeCloseTo(-20, 0);
  });

  it('pause clears an in-progress trigger hold so resuming does not instantly fire done', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    detector.start(0);
    let t = 0;
    feed(detector, -20, t, CONFIG.calibrationMs);
    t += CONFIG.calibrationMs;

    // rise starts but hasn't been sustained long enough to trigger yet
    feed(detector, -20 + CONFIG.riseThresholdDb + 2, t, CONFIG.shortWindowMs + 500);
    t += CONFIG.shortWindowMs + 500;
    expect(detector.snapshot(t).reason).toBe('level-rise');

    detector.pause(t);
    const resumeAt = t + 10 * 60_000; // long gap
    detector.resume(resumeAt);

    // one fresh sample after resuming should not instantly satisfy sustainMs
    // from the stale pre-pause trigger timestamp
    const snapshot = detector.addSample(-20 + CONFIG.riseThresholdDb + 2, resumeAt + 250);
    expect(snapshot.phase).toBe('monitoring');
  });

  it('pause() is a no-op when idle or done; resume() is a no-op when not paused', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    detector.pause(0);
    expect(detector.getPhase()).toBe('idle');

    detector.resume(0);
    expect(detector.getPhase()).toBe('idle');
  });

  it('dismissDone() returns to monitoring with the same baseline, not recalibrated', () => {
    const detector = new ChurnDoneDetector(CONFIG);
    detector.start(0);
    let t = 0;
    feed(detector, -20, t, CONFIG.calibrationMs);
    t += CONFIG.calibrationMs;
    const baseline = detector.snapshot(t).baselineMean;

    const doneSnapshot = feed(
      detector,
      -20 + CONFIG.riseThresholdDb + 2,
      t,
      CONFIG.shortWindowMs + CONFIG.sustainMs + 1000
    );
    expect(doneSnapshot.phase).toBe('done');

    detector.dismissDone();
    const afterDismiss = detector.snapshot(t + 1);
    expect(afterDismiss.phase).toBe('monitoring');
    expect(afterDismiss.baselineMean).toBe(baseline);
    expect(afterDismiss.reason).toBeNull();
  });
});
