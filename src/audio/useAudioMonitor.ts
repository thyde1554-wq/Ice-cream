import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import {
  ChurnDoneDetector,
  configForSensitivity,
  DetectorSnapshot,
  Sensitivity,
} from '../dsp/detector';
import { ensureNotificationPermission, notifyChurnDone } from '../notifications/churnAlerts';

const METERING_POLL_MS = 250;

const RECORDING_OPTIONS = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
};

export type MonitorPhase = DetectorSnapshot['phase'];

export interface AudioMonitor {
  snapshot: DetectorSnapshot;
  isRecording: boolean;
  permissionDenied: boolean;
  error: string | null;
  sensitivity: Sensitivity;
  setSensitivity: (sensitivity: Sensitivity) => void;
  /** Begins a fresh session: recalibrates the baseline from scratch. */
  start: () => Promise<void>;
  /** Ends the session entirely and forgets the learned baseline. */
  stop: () => Promise<void>;
  /** Suspends listening (e.g. to check on the machine) without losing the baseline. */
  pause: () => Promise<void>;
  /** Restarts the mic and continues the same session (after a manual pause or an unexpected interruption). */
  resume: () => Promise<void>;
  /** Dismisses a "done" as a false alarm and goes back to monitoring with the same baseline. */
  dismissDone: () => void;
}

const IDLE_SNAPSHOT: DetectorSnapshot = {
  phase: 'idle',
  baselineMean: null,
  baselineStd: null,
  currentMean: null,
  currentStd: null,
  calibrationRemainingMs: 0,
  triggerHeldMs: 0,
  reason: null,
  pausedFrom: null,
};

/**
 * Wraps expo-audio's metering recorder with a `ChurnDoneDetector`, sampling
 * the live dB level on an interval and turning it into a phase the UI can
 * render (calibrating / monitoring / done).
 */
export function useAudioMonitor(initialSensitivity: Sensitivity = 'medium'): AudioMonitor {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, METERING_POLL_MS);

  const [sensitivity, setSensitivityState] = useState<Sensitivity>(initialSensitivity);
  const [snapshot, setSnapshot] = useState<DetectorSnapshot>(IDLE_SNAPSHOT);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectorRef = useRef(new ChurnDoneDetector(configForSensitivity(initialSensitivity)));

  const setSensitivity = useCallback((next: Sensitivity) => {
    setSensitivityState(next);
    detectorRef.current.updateConfig(configForSensitivity(next));
  }, []);

  const notifiedRef = useRef(false);

  // Feed each new metering reading into the detector while recording.
  useEffect(() => {
    if (!recorderState.isRecording || recorderState.metering == null) return;
    const next = detectorRef.current.addSample(recorderState.metering, Date.now());
    setSnapshot(next);
    if (next.phase === 'done' && !notifiedRef.current) {
      notifiedRef.current = true;
      notifyChurnDone(next.reason).catch(() => undefined);
    }
  }, [recorderState.isRecording, recorderState.metering]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      await ensureNotificationPermission();

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
      });

      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      recorder.record();

      detectorRef.current.updateConfig(configForSensitivity(sensitivity));
      detectorRef.current.start(Date.now());
      notifiedRef.current = false;
      setSnapshot(detectorRef.current.snapshot());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start listening.');
    }
  }, [recorder, sensitivity]);

  const stop = useCallback(async () => {
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stop listening.');
    } finally {
      detectorRef.current.reset();
      notifiedRef.current = false;
      setSnapshot(IDLE_SNAPSHOT);
    }
  }, [recorder]);

  const pause = useCallback(async () => {
    setError(null);
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to pause listening.');
    } finally {
      detectorRef.current.pause(Date.now());
      setSnapshot(detectorRef.current.snapshot());
    }
  }, [recorder]);

  const resume = useCallback(async () => {
    setError(null);
    try {
      if (detectorRef.current.getPhase() === 'paused') {
        detectorRef.current.resume(Date.now());
      }
      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      recorder.record();
      setSnapshot(detectorRef.current.snapshot());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resume listening.');
    }
  }, [recorder]);

  const dismissDone = useCallback(() => {
    detectorRef.current.dismissDone();
    notifiedRef.current = false;
    setSnapshot(detectorRef.current.snapshot());
  }, []);

  useEffect(() => {
    return () => {
      if (recorder.isRecording) {
        recorder.stop().catch(() => undefined);
      }
    };
  }, [recorder]);

  return {
    snapshot,
    isRecording: recorderState.isRecording,
    permissionDenied,
    error,
    sensitivity,
    setSensitivity,
    start,
    stop,
    pause,
    resume,
    dismissDone,
  };
}
