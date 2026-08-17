import { FramePose, LM, Lm, RepSeg, ViewType } from './types';
import { mean, median } from '../utils';

export interface P2 {
  x: number;
  y: number;
}

const N = NaN;

/**
 * Per-frame computed biomechanics. Arrays are aligned with the sampled frames.
 * Missing values are NaN so detectors can skip cleanly.
 */
export interface Signals {
  t: number[];
  ok: boolean[];
  vis: number[];
  /** torso angle from vertical in degrees (image plane) */
  torso: number[];
  /** joint angles (deg). Weighted left/right merge except the L/R variants. */
  knee: number[];
  kneeL: number[];
  kneeR: number[];
  /** hip angle (shoulder-hip-knee) */
  hipAng: number[];
  hipAngL: number[];
  hipAngR: number[];
  elbow: number[];
  elbowL: number[];
  elbowR: number[];
  /** image-space positions (normalized 0..1), visibility-weighted left/right merge */
  shoulderI: P2[];
  hipI: P2[];
  kneeI: P2[];
  ankleI: P2[];
  wristI: P2[];
  elbowI: P2[];
  kneeLI: P2[];
  kneeRI: P2[];
  ankleLI: P2[];
  ankleRI: P2[];
  wristLI: P2[];
  wristRI: P2[];
  shoulderLI: P2[];
  shoulderRI: P2[];
  hipLI: P2[];
  hipRI: P2[];
  elbowLI: P2[];
  elbowRI: P2[];
  /** torso length in normalized units — our scale reference */
  scale: number[];
  /** shoulder span in normalized units (left-right distance) */
  shoulderSpan: number[];
  /** world-space key points (meters, hip-centered) */
  hipW: P2[];
  shoulderW: P2[];
  wristW: P2[];
  ankleW: P2[];
  view: ViewType;
  /** dominant (most visible) side — used for side-view joints */
  domSide: 'left' | 'right';
  scaleMed: number;
  shoulderSpanMed: number;
  frames: FramePose[];
}

function angle3(a: Lm, b: Lm, c: Lm): number {
  const abx = a.x - b.x, aby = a.y - b.y, abz = a.z - b.z;
  const cbx = c.x - b.x, cby = c.y - b.y, cbz = c.z - b.z;
  const dot = abx * cbx + aby * cby + abz * cbz;
  const m1 = Math.hypot(abx, aby, abz);
  const m2 = Math.hypot(cbx, cby, cbz);
  if (m1 < 1e-9 || m2 < 1e-9) return N;
  const cos = Math.min(1, Math.max(-1, dot / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function angle2(a: P2, b: P2, c: P2): number {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const m1 = Math.hypot(abx, aby);
  const m2 = Math.hypot(cbx, cby);
  if (m1 < 1e-9 || m2 < 1e-9) return N;
  const cos = Math.min(1, Math.max(-1, dot / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** visibility-weighted merge of a left/right landmark pair */
function merge(l: Lm, r: Lm): P2 {
  const wl = Math.max(0, l.visibility);
  const wr = Math.max(0, r.visibility);
  if (wl < 0.15 && wr < 0.15) return { x: N, y: N };
  const s = wl + wr;
  if (s <= 0) return { x: N, y: N };
  return { x: (l.x * wl + r.x * wr) / s, y: (l.y * wl + r.y * wr) / s };
}

function mergeAngle(al: number, ar: number, wl: number, wr: number): number {
  const a = isFinite(al) ? Math.max(0, wl) : 0;
  const b = isFinite(ar) ? Math.max(0, wr) : 0;
  if (a + b <= 0) return N;
  return ((isFinite(al) ? al * a : 0) + (isFinite(ar) ? ar * b : 0)) / (a + b);
}

/** simple centered moving average, NaN-aware */
export function smooth(xs: number[], win: number): number[] {
  const out = new Array<number>(xs.length).fill(N);
  const half = Math.floor(win / 2);
  for (let i = 0; i < xs.length; i++) {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(xs.length - 1, i + half); j++) {
      if (isFinite(xs[j])) {
        s += xs[j];
        n++;
      }
    }
    if (n >= Math.max(1, Math.ceil(win / 2))) out[i] = s / n;
    else if (isFinite(xs[i])) out[i] = xs[i];
  }
  return out;
}

export function buildSignals(frames: FramePose[]): Signals {
  const n = frames.length;
  const arr = <T,>(f: () => T) => Array.from({ length: n }, f);

  const t = arr(() => 0);
  const ok = arr(() => false);
  const vis = arr(() => 0);
  const torsoRaw = arr(() => N);
  const kneeL = arr(() => N);
  const kneeR = arr(() => N);
  const hipL = arr(() => N);
  const hipR = arr(() => N);
  const elbL = arr(() => N);
  const elbR = arr(() => N);
  const shoulderI = arr<P2>(() => ({ x: N, y: N }));
  const hipI = arr<P2>(() => ({ x: N, y: N }));
  const kneeI = arr<P2>(() => ({ x: N, y: N }));
  const ankleI = arr<P2>(() => ({ x: N, y: N }));
  const wristI = arr<P2>(() => ({ x: N, y: N }));
  const elbowI = arr<P2>(() => ({ x: N, y: N }));
  const kneeLI = arr<P2>(() => ({ x: N, y: N }));
  const kneeRI = arr<P2>(() => ({ x: N, y: N }));
  const ankleLI = arr<P2>(() => ({ x: N, y: N }));
  const ankleRI = arr<P2>(() => ({ x: N, y: N }));
  const wristLI = arr<P2>(() => ({ x: N, y: N }));
  const wristRI = arr<P2>(() => ({ x: N, y: N }));
  const shoulderLI = arr<P2>(() => ({ x: N, y: N }));
  const shoulderRI = arr<P2>(() => ({ x: N, y: N }));
  const hipLI = arr<P2>(() => ({ x: N, y: N }));
  const hipRI = arr<P2>(() => ({ x: N, y: N }));
  const elbowLI = arr<P2>(() => ({ x: N, y: N }));
  const elbowRI = arr<P2>(() => ({ x: N, y: N }));
  const scale = arr(() => N);
  const shoulderSpan = arr(() => N);
  const hipW = arr<P2>(() => ({ x: N, y: N }));
  const shoulderW = arr<P2>(() => ({ x: N, y: N }));
  const wristW = arr<P2>(() => ({ x: N, y: N }));
  const ankleW = arr<P2>(() => ({ x: N, y: N }));

  let visL = 0;
  let visR = 0;
  let visN = 0;

  for (let i = 0; i < n; i++) {
    const f = frames[i];
    t[i] = f.t;
    ok[i] = f.ok;
    vis[i] = f.vis;
    if (!f.ok || !f.img) continue;
    const im = f.img;

    const ls = im[LM.leftShoulder], rs = im[LM.rightShoulder];
    const lh = im[LM.leftHip], rh = im[LM.rightHip];
    const lk = im[LM.leftKnee], rk = im[LM.rightKnee];
    const la = im[LM.leftAnkle], ra = im[LM.rightAnkle];
    const le = im[LM.leftElbow], re = im[LM.rightElbow];
    const lw = im[LM.leftWrist], rw = im[LM.rightWrist];

    visL += ls.visibility + lh.visibility + lk.visibility + la.visibility + lw.visibility;
    visR += rs.visibility + rh.visibility + rk.visibility + ra.visibility + rw.visibility;
    visN += 5;

    shoulderI[i] = merge(ls, rs);
    hipI[i] = merge(lh, rh);
    kneeI[i] = merge(lk, rk);
    ankleI[i] = merge(la, ra);
    wristI[i] = merge(lw, rw);
    elbowI[i] = merge(le, re);
    kneeLI[i] = { x: lk.x, y: lk.y };
    kneeRI[i] = { x: rk.x, y: rk.y };
    ankleLI[i] = { x: la.x, y: la.y };
    ankleRI[i] = { x: ra.x, y: ra.y };
    wristLI[i] = { x: lw.x, y: lw.y };
    wristRI[i] = { x: rw.x, y: rw.y };
    shoulderLI[i] = { x: ls.x, y: ls.y };
    shoulderRI[i] = { x: rs.x, y: rs.y };
    hipLI[i] = { x: lh.x, y: lh.y };
    hipRI[i] = { x: rh.x, y: rh.y };
    elbowLI[i] = { x: le.x, y: le.y };
    elbowRI[i] = { x: re.x, y: re.y };

    // torso angle from vertical (image plane)
    const s = shoulderI[i], h = hipI[i];
    if (isFinite(s.x) && isFinite(h.x)) {
      const dx = s.x - h.x;
      const dy = s.y - h.y; // negative when shoulders above hips (image y down)
      torsoRaw[i] = (Math.atan2(Math.abs(dx), Math.max(1e-6, -dy)) * 180) / Math.PI;
      scale[i] = Math.hypot(dx, dy);
    }
    shoulderSpan[i] =
      ls.visibility > 0.2 && rs.visibility > 0.2 ? Math.hypot(ls.x - rs.x, ls.y - rs.y) : N;

    // joint angles — prefer 3D world landmarks, fall back to image plane
    const w = f.world;
    if (w) {
      kneeL[i] = angle3(w[LM.leftHip], w[LM.leftKnee], w[LM.leftAnkle]);
      kneeR[i] = angle3(w[LM.rightHip], w[LM.rightKnee], w[LM.rightAnkle]);
      hipL[i] = angle3(w[LM.leftShoulder], w[LM.leftHip], w[LM.leftKnee]);
      hipR[i] = angle3(w[LM.rightShoulder], w[LM.rightHip], w[LM.rightKnee]);
      elbL[i] = angle3(w[LM.leftShoulder], w[LM.leftElbow], w[LM.leftWrist]);
      elbR[i] = angle3(w[LM.rightShoulder], w[LM.rightElbow], w[LM.rightWrist]);
      hipW[i] = merge(w[LM.leftHip], w[LM.rightHip]);
      shoulderW[i] = merge(w[LM.leftShoulder], w[LM.rightShoulder]);
      wristW[i] = merge(w[LM.leftWrist], w[LM.rightWrist]);
      ankleW[i] = merge(w[LM.leftAnkle], w[LM.rightAnkle]);
    } else {
      kneeL[i] = lk.visibility > 0.3 ? angle2(hipLI[i], kneeLI[i], ankleLI[i]) : N;
      kneeR[i] = rk.visibility > 0.3 ? angle2(hipRI[i], kneeRI[i], ankleRI[i]) : N;
      hipL[i] = angle2(shoulderLI[i], hipLI[i], kneeLI[i]);
      hipR[i] = angle2(shoulderRI[i], hipRI[i], kneeRI[i]);
      elbL[i] = angle2(shoulderLI[i], elbowLI[i], wristLI[i]);
      elbR[i] = angle2(shoulderRI[i], elbowRI[i], wristRI[i]);
    }
  }

  const wl = visN ? visL / visN : 0;
  const wr = visN ? visR / visN : 0;
  const domSide: 'left' | 'right' = wl >= wr ? 'left' : 'right';

  const kneeRaw = kneeL.map((v, i) =>
    mergeAngle(v, kneeR[i], frames[i]?.img?.[LM.leftKnee]?.visibility ?? 0, frames[i]?.img?.[LM.rightKnee]?.visibility ?? 0),
  );
  const hipRaw = hipL.map((v, i) =>
    mergeAngle(v, hipR[i], frames[i]?.img?.[LM.leftHip]?.visibility ?? 0, frames[i]?.img?.[LM.rightHip]?.visibility ?? 0),
  );
  const elbRaw = elbL.map((v, i) =>
    mergeAngle(v, elbR[i], frames[i]?.img?.[LM.leftElbow]?.visibility ?? 0, frames[i]?.img?.[LM.rightElbow]?.visibility ?? 0),
  );

  // classify camera view from median shoulder span relative to torso length
  const spanMed = median(shoulderSpan);
  const scaleMed = median(scale);
  let view: ViewType = 'unknown';
  if (isFinite(spanMed) && isFinite(scaleMed) && scaleMed > 0.01) {
    const r = spanMed / scaleMed;
    if (r > 0.62) view = 'front';
    else if (r < 0.34) view = 'side';
    else view = 'three-quarter';
  }

  return {
    t, ok, vis,
    torso: smooth(torsoRaw, 3),
    knee: smooth(kneeRaw, 3),
    kneeL: smooth(kneeL, 3), kneeR: smooth(kneeR, 3),
    hipAng: smooth(hipRaw, 3),
    hipAngL: smooth(hipL, 3), hipAngR: smooth(hipR, 3),
    elbow: smooth(elbRaw, 3),
    elbowL: smooth(elbL, 3), elbowR: smooth(elbR, 3),
    shoulderI, hipI, kneeI, ankleI, wristI, elbowI,
    kneeLI, kneeRI, ankleLI, ankleRI, wristLI, wristRI,
    shoulderLI, shoulderRI, hipLI, hipRI, elbowLI, elbowRI,
    scale, shoulderSpan,
    hipW, shoulderW, wristW, ankleW,
    view, domSide, scaleMed, shoulderSpanMed: spanMed,
    frames,
  };
}

export interface RepDetectParams {
  /** signal considered "extended/standing" above this */
  high: number;
  /** signal must dip below this to count as a rep */
  low: number;
  /** min seconds between reps */
  minRepGap: number;
  /** zigzag reversal deadband, degrees */
  swing?: number;
}

interface ExtremumPt {
  i: number;
  v: number;
}

/** ZigZag extrema extraction: alternating local minima/maxima with a deadband. */
function extrema(sig: number[], swing: number): { mins: ExtremumPt[]; maxs: ExtremumPt[] } {
  const mins: ExtremumPt[] = [];
  const maxs: ExtremumPt[] = [];
  const n = sig.length;
  let i = 0;
  while (i < n && !isFinite(sig[i])) i++;
  if (i >= n) return { mins, maxs };

  let curIdx = i;
  let curVal = sig[i];
  let mode: 'either' | 'max' | 'min' = 'either';

  for (; i < n; i++) {
    const v = sig[i];
    if (!isFinite(v)) continue;
    if (mode === 'either') {
      if (v - curVal > swing) {
        mins.push({ i: curIdx, v: curVal });
        mode = 'max';
        curIdx = i;
        curVal = v;
      } else if (curVal - v > swing) {
        maxs.push({ i: curIdx, v: curVal });
        mode = 'min';
        curIdx = i;
        curVal = v;
      } else {
        curIdx = i;
        curVal = v;
      }
    } else if (mode === 'max') {
      if (v > curVal) {
        curVal = v;
        curIdx = i;
      } else if (curVal - v > swing) {
        maxs.push({ i: curIdx, v: curVal });
        mode = 'min';
        curIdx = i;
        curVal = v;
      }
    } else {
      if (v < curVal) {
        curVal = v;
        curIdx = i;
      } else if (v - curVal > swing) {
        mins.push({ i: curIdx, v: curVal });
        mode = 'max';
        curIdx = i;
        curVal = v;
      }
    }
  }
  // flush pending
  if (mode === 'max') maxs.push({ i: curIdx, v: curVal });
  else if (mode === 'min') mins.push({ i: curIdx, v: curVal });
  return { mins, maxs };
}

/**
 * Rep segmentation from zigzag extrema. A rep is a valley below `low` bounded by
 * "extended" tops (above `high`). Boundary valleys are allowed (clips that start
 * at the bottom, e.g. deadlift setup) and flagged via startIsTop / endIsTop.
 */
export function segmentReps(t: number[], sig: number[], p: RepDetectParams): RepSeg[] {
  const swing = p.swing ?? 10;
  const { mins, maxs } = extrema(sig, swing);
  const tops = maxs.filter((m) => m.v > p.high - 6);
  const bottoms = mins.filter((m) => m.v < p.low);
  const reps: RepSeg[] = [];
  const n = sig.length;

  const topBefore = (idx: number) => {
    let b: ExtremumPt | null = null;
    for (const tp of tops) if (tp.i < idx) b = tp;
    return b;
  };
  const topAfter = (idx: number) => tops.find((tp) => tp.i > idx) ?? null;

  for (const b of bottoms) {
    const prev = topBefore(b.i);
    const next = topAfter(b.i);
    if (!prev && !next) continue;
    const sIdx = prev ? prev.i : 0;
    const eIdx = next ? next.i : n - 1;
    const dur = t[eIdx] - t[sIdx];
    if (dur < 0.5 || dur > 14) continue;
    // range of motion within the rep window
    let hi = -Infinity;
    for (let i = sIdx; i <= eIdx; i++) if (isFinite(sig[i]) && sig[i] > hi) hi = sig[i];
    const rom = hi - b.v;
    if (rom < 22) continue;
    // gap vs previous accepted rep (avoid double-counting the same valley)
    const last = reps[reps.length - 1];
    if (last && b.i - last.bottomIdx >= 0 && t[b.i] - last.bottom < p.minRepGap) continue;
    reps.push({
      index: reps.length,
      start: t[sIdx],
      end: t[eIdx],
      bottom: t[b.i],
      bottomIdx: b.i,
      startIdx: sIdx,
      endIdx: eIdx,
      rom,
      startIsTop: !!prev,
      endIsTop: !!next,
    } as RepSeg);
  }
  return reps;
}

/** mean visibility of given landmarks across frames[i0..i1] */
export function windowVis(frames: FramePose[], i0: number, i1: number, lms: number[]): number {
  let s = 0;
  let n = 0;
  for (let i = Math.max(0, i0); i <= Math.min(frames.length - 1, i1); i++) {
    const f = frames[i];
    if (!f.ok || !f.img) continue;
    for (const j of lms) {
      s += f.img[j].visibility;
      n++;
    }
  }
  return n ? s / n : 0;
}

export interface Extremum {
  i: number;
  t: number;
  v: number;
}

/** arg-max/min within [i0,i1], with parabolic sub-sample timestamp refinement */
export function argExtremum(t: number[], xs: number[], i0: number, i1: number, kind: 'max' | 'min'): Extremum | null {
  let best = -1;
  let bestV = kind === 'max' ? -Infinity : Infinity;
  for (let i = Math.max(0, i0); i <= Math.min(xs.length - 1, i1); i++) {
    const v = xs[i];
    if (!isFinite(v)) continue;
    if ((kind === 'max' && v > bestV) || (kind === 'min' && v < bestV)) {
      bestV = v;
      best = i;
    }
  }
  if (best < 0) return null;
  // parabolic refinement around the extremum for sub-sample precision
  let tt = t[best];
  if (best > 0 && best < xs.length - 1 && isFinite(xs[best - 1]) && isFinite(xs[best + 1])) {
    const denom = xs[best - 1] - 2 * xs[best] + xs[best + 1];
    if (Math.abs(denom) > 1e-9) {
      const dt = (t[best + 1] - t[best - 1]) / 2;
      const off = (0.5 * (xs[best - 1] - xs[best + 1])) / denom;
      if (Math.abs(off) <= 1) tt = t[best] + off * dt;
    }
  }
  return { i: best, t: tt, v: bestV };
}

/** visibility-weighted mean of a position series over a window */
export function winAvgPt(pts: P2[], i0: number, i1: number): P2 {
  let sx = 0, sy = 0, n2 = 0;
  for (let i = Math.max(0, i0); i <= Math.min(pts.length - 1, i1); i++) {
    if (isFinite(pts[i].x) && isFinite(pts[i].y)) {
      sx += pts[i].x;
      sy += pts[i].y;
      n2++;
    }
  }
  return n2 ? { x: sx / n2, y: sy / n2 } : { x: N, y: N };
}

export function finiteCount(xs: number[], i0: number, i1: number): number {
  let c = 0;
  for (let i = Math.max(0, i0); i <= Math.min(xs.length - 1, i1); i++) if (isFinite(xs[i])) c++;
  return c;
}

export function idxAtTime(t: number[], time: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < t.length; i++) {
    const d = Math.abs(t[i] - time);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export { mean };
