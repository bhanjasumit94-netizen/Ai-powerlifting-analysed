import type { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { FramePose, KEY_JOINTS } from './types';

type PoseLandmarkerType = PoseLandmarker;
type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

/** The vision SDK (~0.5MB) is code-split and fetched on first analysis. */
async function loadSdk() {
  return import('@mediapipe/tasks-vision');
}

/**
 * Modular AI-analysis service: wraps the MediaPipe BlazePose pose-estimation
 * runtime with a multi-source fallback chain (bundled WASM/model first, then
 * CDNs). If every source fails we throw PoseUnavailableError and the UI shows
 * an honest "analysis unavailable" state — never fabricated results.
 */

export const SDK_VERSION = '1.0.1';

const WASM_SOURCES = [
  '/mediapipe/wasm',
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${SDK_VERSION}/wasm`,
  `https://unpkg.com/@mediapipe/tasks-vision@${SDK_VERSION}/wasm`,
];

const MODEL_SOURCES = [
  { name: 'BlazePose Full 33pt (bundled)', url: '/models/pose_landmarker_full.task' },
  {
    name: 'BlazePose Full 33pt',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  },
  {
    name: 'BlazePose Lite 33pt',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  },
];

export class PoseUnavailableError extends Error {
  detail: string;
  constructor(message: string, detail: string) {
    super(message);
    this.name = 'PoseUnavailableError';
    this.detail = detail;
  }
}

export interface PoseRuntime {
  landmarker: PoseLandmarkerType;
  modelName: string;
  delegate: string;
}

let cached: Promise<PoseRuntime> | null = null;

export function getPoseRuntime(): Promise<PoseRuntime> {
  if (!cached) {
    lastTs = -1; // timestamps must restart when a new landmarker is created
    cached = initRuntime();
  }
  return cached;
}

/** Force re-init (used by the Retry button on the unavailable screen). */
export function resetPoseRuntime(): void {
  cached?.then((r) => r.landmarker.close()).catch(() => undefined);
  cached = null;
}

async function initRuntime(): Promise<PoseRuntime> {
  if (typeof WebAssembly === 'undefined') {
    throw new PoseUnavailableError(
      'WebAssembly is not supported by this browser.',
      'The on-device vision model needs WebAssembly (SIMD). Try a recent version of Chrome, Edge, Firefox or Safari.',
    );
  }

  const attempts: string[] = [];

  let sdk: Awaited<ReturnType<typeof loadSdk>>;
  try {
    sdk = await loadSdk();
  } catch (e) {
    throw new PoseUnavailableError(
      'The AI vision SDK could not be downloaded.',
      `A network connection is required the first time analysis runs. ${errText(e)}`,
    );
  }

  for (const wasmBase of WASM_SOURCES) {
    let vision: VisionFileset | null = null;
    try {
      vision = await sdk.FilesetResolver.forVisionTasks(wasmBase);
    } catch (e) {
      attempts.push(`wasm ${wasmBase}: ${errText(e)}`);
      continue;
    }
    for (const model of MODEL_SOURCES) {
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          const landmarker = await sdk.PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: model.url, delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.4,
            minPosePresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
            outputSegmentationMasks: false,
          });
          return { landmarker, modelName: model.name, delegate };
        } catch (e) {
          attempts.push(`${model.url} [${delegate}]: ${errText(e)}`);
        }
      }
    }
  }

  throw new PoseUnavailableError(
    'The on-device pose-estimation model could not be loaded.',
    `Tried ${attempts.length} runtime/model combinations. ` +
      'This usually means the device is offline (the model is downloaded once) or the browser blocked the download. ' +
      attempts.slice(0, 3).join(' · '),
  );
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 120);
  return String(e).slice(0, 120);
}

let lastTs = -1;

/** Run pose detection on a video element (or canvas holding the current frame) at time t (seconds). */
export function detectFrame(lm: PoseLandmarkerType, source: HTMLVideoElement | HTMLCanvasElement, t: number): FramePose {
  try {
    let tsMs = Math.max(0, Math.round(t * 1000));
    if (tsMs <= lastTs) tsMs = lastTs + 1; // API requires strictly increasing timestamps
    lastTs = tsMs;
    const res = lm.detectForVideo(source, tsMs);
    const pose = res.landmarks?.[0];
    if (!pose || pose.length < 33) {
      return { t, ok: false, vis: 0, img: null, world: null };
    }
    const img = pose.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 }));
    const worldRaw = res.worldLandmarks?.[0];
    const world =
      worldRaw && worldRaw.length >= 33
        ? worldRaw.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 }))
        : null;
    let vis = 0;
    for (const j of KEY_JOINTS) vis += img[j].visibility;
    vis /= KEY_JOINTS.length;
    return { t, ok: true, vis, img, world };
  } catch {
    return { t, ok: false, vis: 0, img: null, world: null };
  }
}
