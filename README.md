# Churn Watch

A React Native (Expo) app that listens to your ice cream maker and tells
you when it's done, based on how the machine's sound changes over time —
no cloud services, no ML model, works fully offline.

## How detection works

Most home ice cream makers (canister churns and compressor machines alike)
have a motor whose sound changes character as the mixture thickens: it
often gets louder/strains as the load increases, goes quiet if the machine
auto-shuts-off, or its texture (steadiness) changes as it starts knocking
against thickened mixture. Churn Watch listens for that shift instead of
requiring a specific machine model or a trained classifier:

1. **Calibrate** (~45s): when you tap Start, the app first listens and
   records a baseline — the mean and variability of the sound level (dB)
   while the machine is running normally.
2. **Monitor**: it then tracks a short rolling window (last ~8s) of sound
   level and compares it to the baseline continuously.
3. **Confirm**: if the current sound sustains a meaningful rise, drop, or
   texture change from baseline for ~20 seconds straight (configurable via
   the sensitivity control), it's flagged done and you get a notification,
   haptic buzz, and sound.

All of this runs on live microphone metering (`expo-audio`'s `metering`
value, in dB) — no audio files are analyzed or uploaded anywhere.

Sensitivity (Low / Medium / High) scales how large a change is required
and how it maps to detection thresholds; if your machine tends to give
false alarms, drop to Low. If it's not catching the change, but you're
also watching a sudden slow shutoff, try High.

### Code map

- `src/dsp/rollingWindow.ts` — sliding-window mean/stddev over timestamped
  samples.
- `src/dsp/detector.ts` — `ChurnDoneDetector`, the calibrate → monitor →
  done state machine. Pure logic, no React/audio dependency, unit tested
  with synthetic dB sequences in `detector.test.ts`.
- `src/audio/useAudioMonitor.ts` — hook wiring `expo-audio`'s metering
  recorder into the detector and exposing start/stop/sensitivity/snapshot
  to the UI.
- `src/notifications/churnAlerts.ts` — local notification + haptic fired
  once when the detector reaches `done`.
- `src/components/` — `LevelMeter`, `StatusCard`, `SensitivityControl`.
- `App.tsx` — screen composition.

## Running it

```sh
npm install
npm run ios      # or: npm run android
```

Requires a physical device (or simulator with a working mic passthrough)
since it needs a real microphone signal. Microphone and notification
permissions are requested on first "Start listening".

## Testing

```sh
npm test         # jest unit tests for the DSP/detector logic
npm run typecheck
```

The detector's state machine is fully covered by synthetic-signal unit
tests (steady baseline → no false positive, sustained rise/drop →
triggers, brief transient → doesn't trigger). The audio plumbing itself
can't be exercised by a headless test — it needs a live mic and a real
ice cream maker — so **manually verify on a device with an actual machine
run** before relying on it, and tune sensitivity per-machine.

## Known limitations / roadmap

- **Heuristic, not learned**: this is a dB-level/variance heuristic, not a
  trained model. It works well for motors with an audible strain/shutoff
  signature, but a very quiet or acoustically insulated machine may need
  Low sensitivity or may not trigger reliably.
- **No pitch/spectral analysis yet**: Expo's cross-platform recording API
  doesn't expose raw PCM samples, only an overall dB "metering" level, so
  the current detector can't do FFT-based pitch tracking (which would
  likely be a stronger signal — motor RPM tends to drop under load). A v2
  could add this via a native audio-streaming module (e.g.
  `@siteed/expo-audio-stream`) with a custom dev client, computing
  autocorrelation-based pitch and feeding it into the same detector as a
  fourth signal.
- **Background operation**: recording is configured to continue if the
  app is backgrounded, but iOS/Android may still suspend microphone
  access after a while in the background — keep the app in the foreground
  for a run.
- **Per-machine tuning**: thresholds in `src/dsp/detector.ts`
  (`DEFAULT_CONFIG`) are reasonable defaults; if you find your machine
  consistently over/under-triggers, tune `riseThresholdDb`,
  `dropThresholdDb`, `varianceRatioThreshold`, or `sustainMs`.
