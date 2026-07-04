import { RollingWindow } from './rollingWindow';

export type DetectorPhase = 'idle' | 'calibrating' | 'monitoring' | 'paused' | 'done';

export type DetectionReason = 'level-rise' | 'level-drop' | 'variance-shift' | null;

export interface DetectorConfig {
  /** How long to listen at the start to learn the machine's baseline sound. */
  calibrationMs: number;
  /** Sliding window used to compute the "current" sound level/character. */
  shortWindowMs: number;
  /** How long a trigger condition must hold continuously before firing "done". */
  sustainMs: number;
  /** dB increase over baseline that indicates a straining/loaded motor. */
  riseThresholdDb: number;
  /** dB decrease under baseline that indicates the machine went quiet/stopped. */
  dropThresholdDb: number;
  /** Ratio of current stddev to baseline stddev that indicates a texture change. */
  varianceRatioThreshold: number;
  /** Floor applied to the measured baseline stddev to avoid divide-by-near-zero noise. */
  minBaselineStd: number;
}

export const DEFAULT_CONFIG: DetectorConfig = {
  calibrationMs: 45_000,
  shortWindowMs: 8_000,
  sustainMs: 20_000,
  riseThresholdDb: 4,
  dropThresholdDb: 6,
  varianceRatioThreshold: 1.8,
  minBaselineStd: 0.5,
};

export type Sensitivity = 'low' | 'medium' | 'high';

const SENSITIVITY_SCALE: Record<Sensitivity, number> = {
  low: 1.35,
  medium: 1,
  high: 0.7,
};

/** Scales the rise/drop/variance thresholds so "high" sensitivity fires sooner/smaller. */
export function configForSensitivity(
  sensitivity: Sensitivity,
  base: DetectorConfig = DEFAULT_CONFIG
): DetectorConfig {
  const scale = SENSITIVITY_SCALE[sensitivity];
  return {
    ...base,
    riseThresholdDb: base.riseThresholdDb * scale,
    dropThresholdDb: base.dropThresholdDb * scale,
    varianceRatioThreshold: 1 + (base.varianceRatioThreshold - 1) * scale,
  };
}

export interface DetectorSnapshot {
  phase: DetectorPhase;
  baselineMean: number | null;
  baselineStd: number | null;
  currentMean: number | null;
  currentStd: number | null;
  calibrationRemainingMs: number;
  triggerHeldMs: number;
  reason: DetectionReason;
  /** The phase that a `paused` session will return to on `resume()`. */
  pausedFrom: DetectorPhase | null;
}

/**
 * Tracks the ice cream maker's ambient sound and flags "done" once the
 * motor's sound level or texture has sustained a meaningful shift away
 * from the calibrated baseline for `sustainMs`.
 */
export class ChurnDoneDetector {
  private phase: DetectorPhase = 'idle';
  private baseline = new RollingWindow(Number.POSITIVE_INFINITY);
  private shortWindow: RollingWindow;
  private calibrationStartedAt: number | null = null;
  private baselineMean: number | null = null;
  private baselineStd: number | null = null;
  private triggerSince: number | null = null;
  private reason: DetectionReason = null;
  private pausedFrom: DetectorPhase | null = null;
  private pausedAt: number | null = null;

  constructor(private config: DetectorConfig = DEFAULT_CONFIG) {
    this.shortWindow = new RollingWindow(config.shortWindowMs);
  }

  updateConfig(config: DetectorConfig): void {
    this.config = config;
    this.shortWindow = new RollingWindow(config.shortWindowMs);
  }

  start(now: number = Date.now()): void {
    this.phase = 'calibrating';
    this.calibrationStartedAt = now;
    this.baseline.clear();
    this.shortWindow.clear();
    this.baselineMean = null;
    this.baselineStd = null;
    this.triggerSince = null;
    this.reason = null;
  }

  reset(): void {
    this.phase = 'idle';
    this.calibrationStartedAt = null;
    this.baseline.clear();
    this.shortWindow.clear();
    this.baselineMean = null;
    this.baselineStd = null;
    this.triggerSince = null;
    this.reason = null;
    this.pausedFrom = null;
    this.pausedAt = null;
  }

  /**
   * Suspends an in-progress calibration or monitoring session (e.g. while
   * the user stops the machine to check on it) without losing the learned
   * baseline. Any in-progress trigger hold is cleared so a stale gap in
   * samples can't be counted as a sustained change once resumed.
   */
  pause(now: number = Date.now()): void {
    if (this.phase !== 'calibrating' && this.phase !== 'monitoring') return;
    this.pausedFrom = this.phase;
    this.pausedAt = now;
    this.triggerSince = null;
    this.reason = null;
    this.phase = 'paused';
  }

  /**
   * Continues a paused session. If it was paused mid-calibration, the
   * calibration clock is shifted forward by the paused duration so the
   * remaining time is preserved rather than elapsing instantly.
   */
  resume(now: number = Date.now()): void {
    if (this.phase !== 'paused' || this.pausedFrom == null) return;
    if (
      this.pausedFrom === 'calibrating' &&
      this.calibrationStartedAt != null &&
      this.pausedAt != null
    ) {
      this.calibrationStartedAt += now - this.pausedAt;
    }
    this.phase = this.pausedFrom;
    this.pausedFrom = null;
    this.pausedAt = null;
  }

  /**
   * Call when a "done" flag was a false alarm (e.g. triggered by noise
   * while checking on the machine). Returns to monitoring using the same
   * baseline, without recalibrating.
   */
  dismissDone(): void {
    if (this.phase !== 'done') return;
    this.phase = 'monitoring';
    this.triggerSince = null;
    this.reason = null;
  }

  getPhase(): DetectorPhase {
    return this.phase;
  }

  addSample(db: number, now: number = Date.now()): DetectorSnapshot {
    if (this.phase === 'calibrating') {
      this.baseline.push(db, now);
      this.shortWindow.push(db, now);
      const elapsed = now - (this.calibrationStartedAt ?? now);
      if (elapsed >= this.config.calibrationMs) {
        this.baselineMean = this.baseline.mean();
        this.baselineStd = Math.max(this.baseline.stddev() ?? 0, this.config.minBaselineStd);
        this.phase = 'monitoring';
      }
    } else if (this.phase === 'monitoring') {
      this.shortWindow.push(db, now);
      this.evaluateTrigger(now);
    }

    return this.snapshot(now);
  }

  private evaluateTrigger(now: number): void {
    const currentMean = this.shortWindow.mean();
    const currentStd = this.shortWindow.stddev();

    let triggered: DetectionReason = null;
    if (currentMean != null && this.baselineMean != null) {
      if (currentMean - this.baselineMean >= this.config.riseThresholdDb) {
        triggered = 'level-rise';
      } else if (this.baselineMean - currentMean >= this.config.dropThresholdDb) {
        triggered = 'level-drop';
      }
    }
    if (!triggered && currentStd != null && this.baselineStd) {
      if (currentStd / this.baselineStd >= this.config.varianceRatioThreshold) {
        triggered = 'variance-shift';
      }
    }

    if (triggered) {
      if (this.triggerSince == null || this.reason !== triggered) {
        this.triggerSince = now;
        this.reason = triggered;
      }
      if (now - this.triggerSince >= this.config.sustainMs) {
        this.phase = 'done';
      }
    } else {
      this.triggerSince = null;
      this.reason = null;
    }
  }

  snapshot(now: number = Date.now()): DetectorSnapshot {
    const calibrationClock =
      this.phase === 'paused' && this.pausedFrom === 'calibrating' && this.pausedAt != null
        ? this.pausedAt
        : now;
    const isCalibrationPhase =
      this.phase === 'calibrating' ||
      (this.phase === 'paused' && this.pausedFrom === 'calibrating');

    return {
      phase: this.phase,
      baselineMean: this.baselineMean,
      baselineStd: this.baselineStd,
      currentMean: this.shortWindow.mean(),
      currentStd: this.shortWindow.stddev(),
      calibrationRemainingMs:
        isCalibrationPhase && this.calibrationStartedAt != null
          ? Math.max(0, this.config.calibrationMs - (calibrationClock - this.calibrationStartedAt))
          : 0,
      triggerHeldMs: this.triggerSince != null ? now - this.triggerSince : 0,
      reason: this.reason,
      pausedFrom: this.pausedFrom,
    };
  }
}
