import { AnalysisOutcome, AnalysisProgress, ExerciseType, FramePose, RepSeg } from './types';
import { detectFrame, getPoseRuntime, PoseUnavailableError } from './pose';
import { buildSignals, segmentReps, Signals } from './signals';
import { runDetectors } from './detectors';
import { quantile } from '../utils';
import { barKinematics, BarTracker } from './barTracker';
import { BarKinematics, LM } from './types';

/* adaptive thresholds: real camera angles compress joint-angle ranges, so
   derive the extended/flexed levels from the measured distribution */
function adaptiveParams(primary: number[], base: Params): Params | null {
  const hi = quantile(primary, 0.82);
  const lo = quantile(primary, 0.28);
  if (!isFinite(hi) || !isFinite(lo)) return null;
  const range = hi - lo;
  if (range < 16) return null; // genuinely no large movement in the clip
  return {
    high: hi - range * 0.08,
    low: lo + range * 0.15,
    minRepGap: base.minRepGap,
    swing: Math.max(6, range * 0.16),
  };
}

export interface AnalyzeArgs {
  videoUrl: string;
  exercise: ExerciseType;
  onProgress: (p: AnalysisProgress) => void;
  abort: { aborted: boolean };
}

const MAX_ANALYZE_SECONDS = 60;

type Params = { high: number; low: number; minRepGap: number; swing?: number };

function primarySignal(exercise: ExerciseType, sig: Signals): number[] {
  if (exercise === 'squat') return sig.knee;
  if (exercise === 'bench') return sig.elbow;
  return sig.hipAng;
}

function repParams(exercise: ExerciseType): Params {
  if (exercise === 'squat') return { high: 148, low: 135, minRepGap: 0.8, swing: 10 };
  if (exercise === 'bench') return { high: 138, low: 120, minRepGap: 0.6, swing: 9 };
  return { high: 146, low: 130, minRepGap: 0.8, swing: 10 };
}

function waitSeeked(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    video.addEventListener('seeked', finish);
    setTimeout(finish, 400); // safety
  });
}

/** Wait for the browser paint loop once — enough after a 'seeked' event. */
function waitVideoFrame(video: HTMLVideoElement): Promise<void> {
  void video;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 50);
  });
}

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;pointer-events:none;opacity:0.01;';
  document.body.appendChild(video);
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('Video metadata timed out')), 15000);
    video.onloadedmetadata = () => {
      clearTimeout(to);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(to);
      reject(new Error('The video file could not be decoded by this browser (unsupported codec?).'));
    };
  });
  return video;
}

export async function analyzeLift({ videoUrl, exercise, onProgress, abort }: AnalyzeArgs): Promise<AnalysisOutcome> {
  /* ---- 1. load the pose model ---- */
  onProgress({ stage: 'model', fraction: 0.02, message: 'Loading on-device AI pose model…' });
  let runtime;
  try {
    runtime = await getPoseRuntime();
  } catch (e) {
    if (e instanceof PoseUnavailableError) {
      return { kind: 'unavailable', reason: e.message, detail: e.detail };
    }
    return {
      kind: 'unavailable',
      reason: 'Unexpected failure while initializing the AI runtime.',
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  if (abort.aborted) return { kind: 'aborted' };
  onProgress({ stage: 'model', fraction: 0.1, message: `${runtime.modelName} ready (${runtime.delegate})` });

  /* ---- 2. open the video ---- */
  let video: HTMLVideoElement;
  try {
    video = await loadVideo(videoUrl);
  } catch (e) {
    return {
      kind: 'unavailable',
      reason: 'Could not decode this video file.',
      detail: (e instanceof Error ? e.message : String(e)) + ' — try MP4 (H.264) or WebM footage.',
    };
  }
  const duration = video.duration;
  if (!isFinite(duration) || duration < 1) {
    video.remove();
    return { kind: 'unavailable', reason: 'This clip is too short to analyze (under 1 second).', detail: 'Record at least a few seconds covering one full repetition.' };
  }
  const analyzed = Math.min(duration, MAX_ANALYZE_SECONDS);
  const truncated = duration > MAX_ANALYZE_SECONDS;
  let fps = analyzed <= 12 ? 18 : analyzed <= 30 ? 15 : 12;

  // downscaled detection surface — pose models run on a ~192px input anyway,
  // so feeding a 640px canvas loses nothing and is dramatically faster on
  // software-rendered devices than pushing a 1080p video texture.
  const dw = Math.min(640, video.videoWidth || 640);
  const dh = Math.max(2, Math.round((dw / Math.max(1, video.videoWidth || 640)) * (video.videoHeight || 480)));
  const surface = document.createElement('canvas');
  surface.width = dw;
  surface.height = dh;
  const sctx = surface.getContext('2d', { willReadFrequently: false })!;

  /* ---- 3. frame-by-frame pose + bar sampling (adaptive rate) ---- */
  const tracker = new BarTracker();
  tracker.attach(surface);
  const barHint = (f: FramePose | null): { x: number; y: number } => {
    if (!f || !f.ok || !f.img) return { x: NaN, y: NaN };
    const im = f.img;
    // bench/deadlift: the bar sits in the hands; squat: on the shoulders
    const a = exercise === 'squat' ? im[LM.leftShoulder] : im[LM.leftWrist];
    const b = exercise === 'squat' ? im[LM.rightShoulder] : im[LM.rightWrist];
    const wl = Math.max(0, a.visibility);
    const wr = Math.max(0, b.visibility);
    if (wl + wr < 0.3) return { x: NaN, y: NaN };
    return { x: (a.x * wl + b.x * wr) / (wl + wr), y: (a.y * wl + b.y * wr) / (wl + wr) };
  };
  const frames: FramePose[] = [];
  const barPts: { t: number; x: number; y: number; confident: boolean }[] = [];
  const n0 = Math.max(24, Math.round(analyzed * fps));
  let times: number[] = Array.from({ length: n0 }, (_v, i) =>
    Math.min((i / (n0 - 1)) * analyzed, Math.max(0, duration - 0.04)),
  );
  let msPerFrame = 0;
  let done = 0;
  const BUDGET_MS = 75000;
  const startedAt = performance.now();
  try {
    for (let i = 0; i < times.length; i++) {
      if (abort.aborted) {
        video.remove();
        return { kind: 'aborted' };
      }
      const t = times[i];
      const m0 = performance.now();
      video.currentTime = t;
      await waitSeeked(video);
      await waitVideoFrame(video);
      sctx.drawImage(video, 0, 0, dw, dh);
      const fp = detectFrame(runtime.landmarker, surface, t);
      frames.push(fp);
      const hint = barHint(fp);
      barPts.push(tracker.track(t, hint.x, hint.y));
      done++;
      const m1 = performance.now();
      msPerFrame = msPerFrame === 0 ? m1 - m0 : msPerFrame * 0.6 + (m1 - m0) * 0.4;

      // adaptive throttle: keep total analysis near the time budget by
      // thinning the REMAINING timeline (uniform coverage is preserved —
      // timestamps stay truthful, there are just fewer samples).
      if (i === 11 && msPerFrame > 120) {
        const remaining = analyzed - t;
        const allowedFrames = Math.max(10, Math.floor((BUDGET_MS - (m1 - startedAt)) / msPerFrame));
        const wanted = Math.floor(remaining * fps);
        if (allowedFrames < wanted) {
          const ng = Math.max(10, allowedFrames);
          const rest: number[] = Array.from({ length: ng }, (_v, k) => t + ((k + 1) / ng) * remaining);
          times = [...times.slice(0, i + 1), ...rest];
          fps = Math.max(4, Math.round(times.length / analyzed));
        }
      }

      if (done % 5 === 0 || i === times.length - 1) {
        onProgress({
          stage: 'sampling',
          fraction: 0.1 + 0.78 * (i / (times.length - 1)),
          message: `Scanning frame ${i + 1} / ${times.length} — tracking 33 body landmarks`,
        });
      }
    }
  } finally {
    video.pause();
    video.remove();
    tracker.release();
  }

  /* ---- 4. quality gate: was the lifter actually visible? ---- */
  const tracked = frames.filter((f) => f.ok && f.vis >= 0.45);
  const detectionRate = tracked.length / frames.length;
  if (detectionRate < 0.35) {
    return { kind: 'insufficient', detectionRate, framesAnalyzed: frames.length };
  }

  onProgress({ stage: 'signals', fraction: 0.9, message: 'Building joint-angle & bar-path signals…' });
  const sig = buildSignals(frames);
  const kin = barKinematics(barPts);
  const trackedCount = barPts.filter((p) => isFinite(p.x)).length;
  const bar: BarKinematics = {
    points: barPts,
    vx: kin.vx,
    vy: kin.vy,
    speed: kin.speed,
    trackQuality: frames.length ? barPts.filter((p) => p.confident).length / frames.length : 0,
  };
  void trackedCount;

  /* ---- 5. rep segmentation (multi-signal fallback) ---- */
  const p = repParams(exercise);
  const primary = primarySignal(exercise, sig);
  let reps: RepSeg[] = [];
  for (const series of [primary, sig.knee, sig.hipAng, sig.elbow]) {
    reps = segmentReps(sig.t, series, p);
    if (reps.length === 0) {
      reps = segmentReps(sig.t, series, { high: p.high - 10, low: p.low + 14, minRepGap: p.minRepGap, swing: (p.swing ?? 10) - 2 });
    }
    if (reps.length === 0) {
      const ap = adaptiveParams(series, p);
      if (ap) reps = segmentReps(sig.t, series, ap);
    }
    if (reps.length > 0) break;
  }
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as Record<string, unknown>).__lg_debug = {
      t: sig.t,
      primary: Array.from(primary),
      hipAng: sig.hipAng,
      knee: sig.knee,
      elbow: sig.elbow,
      torso: sig.torso,
      view: sig.view,
      reps: reps.map((r) => ({ start: r.start, end: r.end, bottom: r.bottom, rom: r.rom })),
      detectionRate,
      framesAnalyzed: frames.length,
    };
  }
  if (reps.length === 0) {
    return { kind: 'no-reps', detectionRate, framesAnalyzed: frames.length };
  }

  onProgress({ stage: 'detecting', fraction: 0.95, message: `Running ${exercise} fault & IPF-rule detectors…` });
  await new Promise((r) => setTimeout(r, 30));

  const det = runDetectors(exercise, { exercise, sig, reps, bar });

  onProgress({ stage: 'done', fraction: 1, message: 'Analysis complete' });

  return {
    kind: 'ok',
    result: {
      frames,
      reps,
      errors: det.errors,
      skipped: det.skipped,
      checkOutcomes: det.checkOutcomes,
      bar,
      meta: {
        exercise,
        duration,
        analyzedDuration: analyzed,
        truncated,
        sampledFps: fps,
        framesAnalyzed: frames.length,
        detectionRate,
        view: sig.view,
        model: runtime.modelName,
      },
    },
  };
}

