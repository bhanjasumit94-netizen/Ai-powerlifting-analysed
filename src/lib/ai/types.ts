export type ExerciseType = 'squat' | 'bench' | 'deadlift';

export const EXERCISE_LABEL: Record<ExerciseType, string> = {
  squat: 'Squat',
  bench: 'Bench Press',
  deadlift: 'Deadlift',
};

/** A single pose landmark. Image landmarks are normalized [0..1], world landmarks are meters. */
export interface Lm {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface FramePose {
  /** seconds from video start */
  t: number;
  ok: boolean;
  /** mean visibility across key joints, 0..1 */
  vis: number;
  /** normalized image-space landmarks (33) */
  img: Lm[] | null;
  /** real-world 3D landmarks in meters, origin at hip center */
  world: Lm[] | null;
}

export interface RepSeg {
  index: number;
  /** seconds */
  start: number;
  end: number;
  /** timestamp of the bottom / reversal point */
  bottom: number;
  /** index into the sampled frame array for the bottom point */
  bottomIdx: number;
  startIdx: number;
  endIdx: number;
  /** range of motion of the primary signal, degrees */
  rom: number;
  /** false when the clip boundary stood in for an extended top (partial rep) */
  startIsTop: boolean;
  endIsTop: boolean;
}

export type Zone = 'torso' | 'hips' | 'knees' | 'bar' | 'elbows' | 'full';
export type Severity = 'low' | 'medium' | 'high';

/** IPF RULE RISK = measurable technical-fault risk from the IPF rulebook;
 *  COACHING = technique observation that is not automatically a fault. */
export type ErrorCategory = 'ipf' | 'coaching';

export interface BarTrackPoint {
  t: number;
  x: number;
  y: number;
  confident: boolean;
}

export interface BarKinematics {
  points: BarTrackPoint[];
  /** horizontal / vertical velocity, normalized-units per second */
  vx: number[];
  vy: number[];
  speed: number[];
  /** fraction of frames where the visual tracker was confident */
  trackQuality: number;
}

export interface DetectedError {
  id: string;
  exercise: ExerciseType;
  checkId: string;
  category: ErrorCategory;
  title: string;
  /** exact video timestamp in seconds (sub-sample refined) */
  timestamp: number;
  rep: number | null;
  zone: Zone;
  severity: Severity;
  /** deterministic 0..1 confidence from signal quality + threshold exceedance */
  confidence: number;
  explanation: string;
  cue: string;
  /** formatted measurement that backs the finding */
  metric: string;
}

export interface SkippedCheck {
  checkId: string;
  label: string;
  reason: string;
}

export type ViewType = 'front' | 'side' | 'three-quarter' | 'unknown';

export interface AnalysisMeta {
  exercise: ExerciseType;
  duration: number;
  analyzedDuration: number;
  truncated: boolean;
  sampledFps: number;
  framesAnalyzed: number;
  detectionRate: number;
  view: ViewType;
  model: string;
}

export interface AnalysisResult {
  frames: FramePose[];
  reps: RepSeg[];
  errors: DetectedError[];
  skipped: SkippedCheck[];
  /** checkId -> count of errors found, for the checks panel */
  checkOutcomes: { checkId: string; label: string; found: number }[];
  bar: BarKinematics;
  meta: AnalysisMeta;
}

export type AnalysisOutcome =
  | { kind: 'ok'; result: AnalysisResult }
  | { kind: 'unavailable'; reason: string; detail: string }
  | { kind: 'insufficient'; detectionRate: number; framesAnalyzed: number }
  | { kind: 'no-reps'; detectionRate: number; framesAnalyzed: number }
  | { kind: 'aborted' };

export interface AnalysisProgress {
  stage: 'model' | 'sampling' | 'signals' | 'detecting' | 'done';
  /** 0..1 overall */
  fraction: number;
  message: string;
}

/* BlazePose 33-landmark indices */
export const LM = {
  nose: 0,
  leftEyeInner: 1, leftEye: 2, leftEyeOuter: 3,
  rightEyeInner: 4, rightEye: 5, rightEyeOuter: 6,
  leftEar: 7, rightEar: 8,
  mouthLeft: 9, mouthRight: 10,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftPinky: 17, rightPinky: 18,
  leftIndex: 19, rightIndex: 20,
  leftThumb: 21, rightThumb: 22,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
  leftHeel: 29, rightHeel: 30,
  leftFootIndex: 31, rightFootIndex: 32,
} as const;

/** Joints we require to be visible for a frame to count as "tracked". */
export const KEY_JOINTS = [
  LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip,
  LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle,
  LM.leftWrist, LM.rightWrist, LM.leftElbow, LM.rightElbow,
];
