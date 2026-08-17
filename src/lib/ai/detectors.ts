import {
  BarKinematics,
  DetectedError,
  ErrorCategory,
  ExerciseType,
  LM,
  RepSeg,
  Severity,
  SkippedCheck,
  Zone,
} from './types';
import { clamp01, mean, std } from '../utils';
import { argExtremum, Signals, windowVis } from './signals';

export interface DetectorContext {
  exercise: ExerciseType;
  sig: Signals;
  reps: RepSeg[];
  bar: BarKinematics;
}

export interface DetectorResult {
  errors: DetectedError[];
  skipped: SkippedCheck[];
  checkOutcomes: { checkId: string; label: string; found: number }[];
  checksTotal: number;
}

interface Cand {
  checkId: string;
  category: ErrorCategory;
  title: string;
  timestamp: number;
  rep: number | null;
  zone: Zone;
  exceed: number;
  quality: number;
  explanation: string;
  cue: string;
  metric: string;
}

function severityOf(exceed: number): Severity {
  return exceed > 0.7 ? 'high' : exceed > 0.3 ? 'medium' : 'low';
}

function confidenceOf(exceed: number, quality: number): number {
  const base = 0.55 + 0.38 * clamp01(exceed);
  const q = 0.55 + 0.45 * clamp01(quality);
  return Math.round(Math.min(0.97, base * q + 0.06) * 100) / 100;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const deg = (v: number) => `${v.toFixed(1)}°`;

class Emitter {
  errors: DetectedError[] = [];
  skipped: SkippedCheck[] = [];
  outcomes = new Map<string, { checkId: string; label: string; found: number }>();

  constructor(
    private exercise: ExerciseType,
    private sig: Signals,
  ) {}

  check(id: string, label: string) {
    this.outcomes.set(id, { checkId: id, label, found: 0 });
  }

  skip(id: string, label: string, reason: string) {
    this.check(id, label);
    this.skipped.push({ checkId: id, label, reason });
  }

  push(c: Cand, cap = 2) {
    const o = this.outcomes.get(c.checkId);
    if (o && o.found >= cap) return;
    if (o) o.found++;
    this.errors.push({
      id: `pending-${this.errors.length}`,
      exercise: this.exercise,
      checkId: c.checkId,
      category: c.category,
      title: c.title,
      timestamp: Math.max(0, Math.min(c.timestamp, this.sig.t[this.sig.t.length - 1] ?? 0)),
      rep: c.rep,
      zone: c.zone,
      severity: severityOf(c.exceed),
      confidence: confidenceOf(c.exceed, c.quality),
      explanation: c.explanation,
      cue: c.cue,
      metric: c.metric,
    });
  }
}

/* ---------------- helpers ---------------- */

function scaleAt(sig: Signals, i: number): number {
  return isFinite(sig.scale[i]) ? sig.scale[i] : sig.scaleMed || 0.3;
}

function depthSeries(sig: Signals): number[] {
  return sig.t.map((_, i) => {
    const h = sig.hipI[i],
      k = sig.kneeI[i];
    if (!isFinite(h.y) || !isFinite(k.y)) return NaN;
    return (h.y - k.y) / scaleAt(sig, i);
  });
}

function sMin(t: number[], xs: number[], i0: number, i1: number) {
  return argExtremum(t, xs, i0, i1, 'min');
}
function sMax(t: number[], xs: number[], i0: number, i1: number) {
  return argExtremum(t, xs, i0, i1, 'max');
}

function winAvgVal(xs: number[], i0: number, i1: number): number {
  let s = 0,
    n = 0;
  for (let i = Math.max(0, i0); i <= Math.min(xs.length - 1, i1); i++) {
    if (isFinite(xs[i])) {
      s += xs[i];
      n++;
    }
  }
  return n ? s / n : NaN;
}

/**
 * Largest sustained DOWNWARD bar excursion (image y grows downward, so positive
 * net Δy) inside [i0..i1]. Returns normalized drop + timestamp of its end.
 */
function maxBarDrop(bar: BarKinematics, t: number[], i0: number, i1: number) {
  let bestDrop = 0;
  let bestI = -1;
  let runStart = -1;
  let runBase = NaN;
  for (let i = Math.max(0, i0); i <= Math.min(t.length - 1, i1); i++) {
    const y = bar.points[i]?.y;
    if (!isFinite(y)) {
      runStart = -1;
      continue;
    }
    if (runStart < 0) {
      runStart = i;
      runBase = y;
      continue;
    }
    // extend the run only while the bar keeps sinking
    if (y > (bar.points[i - 1]?.y ?? y) - 0.0004) {
      const drop = y - runBase;
      if (drop > bestDrop) {
        bestDrop = drop;
        bestI = i;
      }
    } else {
      runStart = i;
      runBase = y;
    }
  }
  return bestI >= 0 ? { drop: bestDrop, i: bestI, t: t[bestI] } : null;
}

function repAscent(r: RepSeg): [number, number] {
  return [r.bottomIdx, r.endIdx];
}

/* ============================= SQUAT ============================= */

function squatDetectors(ctx: DetectorContext, em: Emitter) {
  const { sig, reps, bar } = ctx;
  const t = sig.t;
  const Q = (i: number, lms: number[]) => windowVis(sig.frames, Math.max(0, i - 2), Math.min(t.length - 1, i + 2), lms);

  /* ---- IPF: insufficient depth ---- */
  {
    const id = 'ipf-depth';
    const label = 'IPF — squat depth (hip below knee)';
    em.check(id, label);
    const depth = depthSeries(sig);
    const bodyQ = Math.max(...reps.map((r) => Q(r.bottomIdx, [LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee])), 0);
    if (bodyQ < 0.45 || !reps.length) {
      em.skip(id, label, 'Hip and knee landmarks not reliable enough at the bottom to judge legal depth.');
    } else {
      const perRep = reps.map((r) => sMax(t, depth, Math.max(0, r.bottomIdx - 4), Math.min(t.length - 1, r.bottomIdx + 4)));
      const valid = perRep.filter((x): x is NonNullable<typeof x> => !!x && isFinite(x.v));
      if (valid.length) {
        let shallow = valid[0];
        for (const v of valid) if (v.v < shallow.v) shallow = v;
        const margin = 0.015;
        if (shallow.v < margin) {
          const ri = reps[perRep.indexOf(shallow)];
          em.push({
            checkId: id,
            category: 'ipf',
            title: 'Possible insufficient squat depth',
            timestamp: shallow.t,
            rep: ri ? ri.index + 1 : null,
            zone: 'hips',
            exceed: (margin - shallow.v) / 0.06,
            quality: bodyQ,
            explanation:
              'At the bottom of this rep the hip joint stayed above the top of the knee. IPF rules require the top surface of the legs at the hip joint to pass below the top of the knees — this attempt would likely receive red lights.',
            cue: 'Open the stance slightly, sit deeper between the hips, and film from the side at hip height to judge depth.',
            metric: `Hip was ${pct(-shallow.v)} of torso ABOVE the knee line at the bottom`,
          });
        }
      } else em.skip(id, label, 'Depth was not measurable from this camera angle.');
    }
  }

  /* ---- IPF: downward bar movement during ascent ---- */
  {
    const id = 'ipf-descent-reversal';
    const label = 'IPF — no downward bar movement during ascent';
    em.check(id, label);
    if (bar.trackQuality < 0.3) {
      em.skip(id, label, 'Bar tracking was too unreliable to judge bar-motion continuity.');
    } else {
      for (const r of reps) {
        const [a0, a1] = repAscent(r);
        const hit = maxBarDrop(bar, t, a0 + 1, a1);
        if (!hit) continue;
        const THR = 0.012;
        if (hit.drop > THR && hit.i - a0 > 2) {
          em.push({
            checkId: id,
            category: 'ipf',
            title: 'Bar moved downward during the ascent',
            timestamp: hit.t,
            rep: r.index + 1,
            zone: 'bar',
            exceed: (hit.drop - THR) / THR,
            quality: Math.min(0.9, bar.trackQuality + 0.2),
            explanation:
              'After the bar started rising it sank back down by a measurable amount mid-ascent (double movement). Under IPF rules any downward bar movement during the ascending phase is cause for failure.',
            cue: 'Commit to one drive out of the hole — if you miss the groove, don’t re-dip; keep pressure up through the sticking point.',
            metric: `Bar re-descended ${pct(hit.drop)} of frame height during the ascent`,
          });
        }
      }
    }
  }

  /* ---- coaching: depth consistency ---- */
  {
    const id = 'depth-consistency';
    const label = 'Depth consistency';
    if (reps.length < 2) em.skip(id, label, 'Needs at least 2 complete reps to compare.');
    else {
      em.check(id, label);
      const depth = depthSeries(sig);
      const perRep = reps.map((r) => sMax(t, depth, Math.max(0, r.bottomIdx - 4), Math.min(t.length - 1, r.bottomIdx + 4)));
      const valid = perRep.filter((x): x is NonNullable<typeof x> => !!x && isFinite(x.v));
      if (valid.length >= 2) {
        const vals = valid.map((x) => x.v);
        const spread = Math.max(...vals) - Math.min(...vals);
        const THR = 0.12;
        if (spread > THR) {
          let worst = valid[0];
          for (const v of valid) if (v.v < worst.v) worst = v;
          const ri = reps[perRep.indexOf(worst)];
          em.push({
            checkId: id,
            category: 'coaching',
            title: 'Depth inconsistent between reps',
            timestamp: worst.t,
            rep: ri ? ri.index + 1 : null,
            zone: 'hips',
            exceed: (spread - THR) / THR,
            quality: Q(worst.i, [LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee]),
            explanation: `Hip depth varied by ${pct(spread)} of your torso length across ${valid.length} reps — this rep was the shallowest. Changing range of motion rep to rep changes the training stimulus.`,
            cue: 'Squat to the same target every rep — a box or fixed visual marker calibrates depth.',
            metric: `Depth spread ${pct(spread)} of torso across reps`,
          });
        }
      } else em.skip(id, label, 'Hip/knee landmarks were not visible enough at the bottom of reps.');
    }
  }

  /* ---- coaching: knee cave (front view) ---- */
  {
    const id = 'knee-cave';
    const label = 'Knee cave';
    if (sig.view !== 'front') em.skip(id, label, `Requires a front-facing camera angle — detected view: ${sig.view}.`);
    else {
      em.check(id, label);
      const ratio = sig.t.map((_, i) => {
        const kl = sig.kneeLI[i], kr = sig.kneeRI[i], al = sig.ankleLI[i], ar = sig.ankleRI[i];
        if (![kl, kr, al, ar].every((p) => isFinite(p.x))) return NaN;
        const aw = Math.abs(al.x - ar.x);
        return aw > 1e-4 ? Math.abs(kl.x - kr.x) / aw : NaN;
      });
      const topFrames = sig.knee.map((v, i) => (v > 150 ? ratio[i] : NaN)).filter(isFinite);
      const baseline = topFrames.length ? mean(topFrames) : NaN;
      if (!isFinite(baseline) || baseline <= 0) em.skip(id, label, 'Knee/ankle landmarks were not stable enough to measure stance width.');
      else {
        for (const r of reps) {
          const w = sMin(t, ratio, r.startIdx, r.endIdx);
          if (!w) continue;
          const drop = (baseline - w.v) / baseline;
          const THR = 0.18;
          if (drop > THR) {
            em.push({
              checkId: id,
              category: 'coaching',
              title: 'Possible knee cave',
              timestamp: w.t,
              rep: r.index + 1,
              zone: 'knees',
              exceed: (drop - THR) / THR,
              quality: Q(w.i, [LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle]),
              explanation: `Knee width narrowed to ${pct(w.v / baseline)} of your standing baseline at this point — the knees are collapsing inward relative to the feet under load.`,
              cue: 'Drive the knees out over the second toe; screw your feet into the floor to engage the glutes.',
              metric: `Knee width ${pct(w.v / baseline)} of baseline (−${pct(drop)})`,
            });
          }
        }
      }
    }
  }

  /* ---- coaching: hip shift (front view) ---- */
  {
    const id = 'hip-shift';
    const label = 'Hip shift';
    if (sig.view !== 'front') em.skip(id, label, `Requires a front-facing camera angle — detected view: ${sig.view}.`);
    else {
      em.check(id, label);
      const shift = sig.t.map((_, i) => {
        const h = sig.hipI[i], al = sig.ankleLI[i], ar = sig.ankleRI[i];
        if (![h, al, ar].every((p) => isFinite(p.x))) return NaN;
        const span = sig.shoulderSpan[i] > 1e-4 ? sig.shoulderSpan[i] : sig.shoulderSpanMed || 0.2;
        return (h.x - (al.x + ar.x) / 2) / span;
      });
      for (const r of reps) {
        const startV = winAvgVal(shift, Math.max(0, r.startIdx - 2), r.startIdx + 2);
        const ex = sMax(t, shift.map((v) => (isFinite(v) && isFinite(startV) ? Math.abs(v - startV) : NaN)), r.startIdx, r.endIdx);
        if (!ex) continue;
        const THR = 0.28;
        if (ex.v > THR) {
          const side = shift[ex.i] > startV ? 'right' : 'left';
          em.push({
            checkId: id,
            category: 'coaching',
            title: 'Possible hip shift',
            timestamp: ex.t,
            rep: r.index + 1,
            zone: 'hips',
            exceed: (ex.v - THR) / THR,
            quality: Q(ex.i, [LM.leftHip, LM.rightHip, LM.leftAnkle, LM.rightAnkle]),
            explanation: `Your hips drifted ${pct(ex.v)} of shoulder width toward the ${side} during rep ${r.index + 1} compared with your setup — load is moving onto one side.`,
            cue: 'Root both feet evenly before unracking; check stance symmetry and single-leg strength balance.',
            metric: `Lateral hip drift ${pct(ex.v)} of shoulder width (${side})`,
          });
        }
      }
    }
  }

  /* ---- coaching: forward torso movement ---- */
  {
    const id = 'forward-torso';
    const label = 'Forward torso movement';
    em.check(id, label);
    for (const r of reps) {
      const a0 = sig.torso[r.bottomIdx];
      if (!isFinite(a0)) continue;
      const rise = sig.torso.map((v, i) => (i >= r.bottomIdx && i <= r.endIdx && isFinite(v) ? v - a0 : NaN));
      const ex = sMax(t, rise, r.bottomIdx, r.endIdx);
      if (!ex) continue;
      const THR = 11;
      if (ex.v > THR && ex.i > r.bottomIdx + 1) {
        em.push({
          checkId: id,
          category: 'coaching',
          title: 'Possible excessive forward torso movement',
          timestamp: ex.t,
          rep: r.index + 1,
          zone: 'torso',
          exceed: (ex.v - THR) / THR,
          quality: Q(ex.i, [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip]),
          explanation: `Your torso angle increased significantly during the ascent compared with the bottom of the repetition — from ${deg(a0)} to ${deg(sig.torso[ex.i])} from vertical (+${deg(ex.v)}). Load shifts toward the lower back.`,
          cue: 'Brace harder before descending and drive your upper back into the bar through the ascent.',
          metric: `Torso angle ${deg(a0)} → ${deg(sig.torso[ex.i])} (+${deg(ex.v)})`,
        });
      }
    }
  }

  /* ---- coaching: early hip rise ---- */
  {
    const id = 'early-hip-rise';
    const label = 'Hip rise vs shoulders';
    em.check(id, label);
    for (const r of reps) {
      const wEnd = r.bottomIdx + Math.max(2, Math.round((r.endIdx - r.bottomIdx) * 0.5));
      const hipY0 = sig.hipI[r.bottomIdx].y,
        shY0 = sig.shoulderI[r.bottomIdx].y;
      if (!isFinite(hipY0) || !isFinite(shY0)) continue;
      const diff = sig.t.map((_, i) => {
        if (i < r.bottomIdx || i > wEnd) return NaN;
        const sc = scaleAt(sig, i);
        const hipUp = (hipY0 - sig.hipI[i].y) / sc;
        const shUp = (shY0 - sig.shoulderI[i].y) / sc;
        if (hipUp < 0.04) return NaN;
        return hipUp - 1.6 * Math.max(0, shUp);
      });
      const ex = sMax(t, diff, r.bottomIdx, wEnd);
      if (!ex || !isFinite(ex.v) || ex.v <= 0) continue;
      const hipUpN = (hipY0 - sig.hipI[ex.i].y) / scaleAt(sig, ex.i);
      const shUpN = (shY0 - sig.shoulderI[ex.i].y) / scaleAt(sig, ex.i);
      em.push({
        checkId: id,
        category: 'coaching',
        title: 'Hips rising faster than shoulders',
        timestamp: ex.t,
        rep: r.index + 1,
        zone: 'hips',
        exceed: (hipUpN - 1.6 * Math.max(0, shUpN)) / 0.06,
        quality: Q(ex.i, [LM.leftHip, LM.rightHip, LM.leftShoulder, LM.rightShoulder]),
        explanation: `In the first half of the ascent your hips rose ${pct(hipUpN)} of torso length while the shoulders rose only ${pct(Math.max(0, shUpN))} — the “stripper squat” pattern that dumps the torso forward.`,
        cue: 'Push the floor away and keep chest and hips rising at the same speed out of the hole.',
        metric: `Hip rise ${pct(hipUpN)} vs shoulder rise ${pct(Math.max(0, shUpN))} of torso`,
      });
    }
  }

  /* ---- coaching: bar path deviation (tracked bar) ---- */
  {
    const id = 'bar-path';
    const label = 'Bar path deviation';
    em.check(id, label);
    const barX = bar.points.map((p) => p.x);
    const dev = sig.t.map((_, i) => {
      const a = sig.ankleI[i], bx = barX[i];
      if (!isFinite(a.x) || !isFinite(bx)) return NaN;
      return bx - a.x;
    });
    let anyValid = false;
    for (const r of reps) {
      const w = dev.slice(r.startIdx, r.endIdx + 1).filter(isFinite);
      if (w.length < 4) continue;
      anyValid = true;
      const base = mean(w);
      const ex = sMax(t, dev.map((v, i) => (i >= r.startIdx && i <= r.endIdx && isFinite(v) ? Math.abs(v - base) : NaN)), r.startIdx, r.endIdx);
      if (!ex) continue;
      const THR = 0.045;
      if (ex.v > THR) {
        em.push({
          checkId: id,
          category: 'coaching',
          title: 'Bar path deviation',
          timestamp: ex.t,
          rep: r.index + 1,
          zone: 'bar',
          exceed: (ex.v - THR) / THR,
          quality: Math.min(0.9, bar.trackQuality + 0.25),
          explanation: `The tracked bar drifted ${pct(ex.v)} of frame width horizontally away from its mean path over the mid-foot during rep ${r.index + 1}. An efficient squat keeps the bar stacked over mid-foot.`,
          cue: 'Keep the bar over the middle of your foot for the whole rep — straight line down, straight line up.',
          metric: `Bar drift ${pct(ex.v)} of frame width from mean path`,
        });
      }
    }
    if (!anyValid) em.skip(id, label, 'Bar could not be tracked long enough to map its path.');
  }

  /* ---- coaching: rep consistency ---- */
  {
    const id = 'rep-consistency';
    const label = 'Rep consistency (ROM & tempo)';
    if (reps.length < 3) em.skip(id, label, 'Needs at least 3 reps to measure consistency.');
    else {
      em.check(id, label);
      const roms = reps.map((r) => r.rom);
      const durs = reps.map((r) => r.end - r.start);
      const romCv = std(roms) / Math.max(1e-6, mean(roms));
      const durCv = std(durs) / Math.max(1e-6, mean(durs));
      const THR = 0.16;
      if (romCv > THR || durCv > 0.25) {
        let worstI = 0,
          worstD = -1;
        reps.forEach((r, i) => {
          const d =
            Math.abs(r.rom - mean(roms)) / Math.max(1e-6, std(roms) || 1) +
            Math.abs(durs[i] - mean(durs)) / Math.max(1e-6, std(durs) || 1);
          if (d > worstD) {
            worstD = d;
            worstI = i;
          }
        });
        const r = reps[worstI];
        em.push({
          checkId: id,
          category: 'coaching',
          title: 'Inconsistent range of motion / tempo',
          timestamp: r.bottom,
          rep: worstI + 1,
          zone: 'full',
          exceed: Math.max((romCv - THR) / THR, (durCv - 0.25) / 0.25),
          quality: Q(r.bottomIdx, [LM.leftHip, LM.leftKnee, LM.rightHip, LM.rightKnee]),
          explanation: `Rep-to-rep ROM varied by ${pct(romCv)} (CV) and tempo by ${pct(durCv)} across ${reps.length} reps. Rep ${worstI + 1} deviated most (${r.rom.toFixed(0)}° ROM, ${(r.end - r.start).toFixed(1)}s).`,
          cue: 'Standardize one setup routine and a tempo target (e.g. 3-count descent) for every rep.',
          metric: `ROM CV ${pct(romCv)} · tempo CV ${pct(durCv)} over ${reps.length} reps`,
        });
      }
    }
  }
}

/* ============================= BENCH ============================= */

function benchDetectors(ctx: DetectorContext, em: Emitter) {
  const { sig, reps, bar } = ctx;
  const t = sig.t;
  const Q = (i: number, lms: number[]) => windowVis(sig.frames, Math.max(0, i - 2), Math.min(t.length - 1, i + 2), lms);

  const touchIdxOf = (r: RepSeg) => sMax(t, bar.points.map((p) => p.y).map((y, i) => (i >= r.startIdx && i <= r.endIdx && isFinite(y) ? y : NaN)), r.startIdx, r.endIdx);

  /* ---- IPF: bar motionless on the chest (pause) ---- */
  {
    const id = 'ipf-pause';
    const label = 'IPF — bar motionless on chest';
    em.check(id, label);
    if (bar.trackQuality < 0.3) em.skip(id, label, 'Bar tracking too unreliable to judge motionlessness.');
    else {
      let any = false;
      for (const r of reps) {
        const touch = touchIdxOf(r);
        if (!touch) continue;
        any = true;
        // dwell window: frames near the touch depth
        let j0 = touch.i;
        while (j0 > r.startIdx && isFinite(bar.points[j0 - 1]?.y) && Math.abs(bar.points[j0 - 1].y - touch.v) < 0.012) j0--;
        let j1 = touch.i;
        while (j1 < r.endIdx && isFinite(bar.points[j1 + 1]?.y) && Math.abs(bar.points[j1 + 1].y - touch.v) < 0.012) j1++;
        let maxSpeed = 0;
        let maxI = touch.i;
        for (let i = j0; i <= j1; i++) {
          const s2 = bar.speed[i];
          if (isFinite(s2) && s2 > maxSpeed) {
            maxSpeed = s2;
            maxI = i;
          }
        }
        const dwell = t[j1] - t[j0];
        const THR = 0.085;
        if (dwell > 0.12 && maxSpeed > THR) {
          em.push({
            checkId: id,
            category: 'ipf',
            title: 'Bar not motionless on the chest',
            timestamp: t[maxI],
            rep: r.index + 1,
            zone: 'bar',
            exceed: (maxSpeed - THR) / THR,
            quality: Math.min(0.9, bar.trackQuality + 0.2),
            explanation: `During the chest pause of rep ${r.index + 1} the bar kept moving (peak speed ${maxSpeed.toFixed(2)} frame-heights/s while at chest level). IPF rules require the bar to be visibly motionless before the press — heaving or sinking the bar into the chest is a technical fault.`,
            cue: 'Let the bar settle fully on the chest, own a real pause, then press.',
            metric: `Peak bar speed during pause ${maxSpeed.toFixed(2)}/s over ${dwell.toFixed(2)}s dwell`,
          });
        }
      }
      if (!any) em.skip(id, label, 'Bottom position could not be isolated to time the pause.');
    }
  }

  /* ---- IPF: heaving the bar into the chest ---- */
  {
    const id = 'ipf-heave';
    const label = 'IPF — no heaving/bounce off chest';
    em.check(id, label);
    if (bar.trackQuality < 0.3) em.skip(id, label, 'Bar tracking too unreliable to measure descent speed.');
    else {
      for (const r of reps) {
        const touch = touchIdxOf(r);
        if (!touch || touch.i - r.startIdx < 3) continue;
        // fastest downward speed in the 0.4s before touch
        let peakDrop = 0;
        let peakI = touch.i;
        for (let i = touch.i; i > r.startIdx + 1; i--) {
          if (t[touch.i] - t[i] > 0.45) break;
          const v = bar.vy[i];
          if (isFinite(v) && v > peakDrop) {
            peakDrop = v;
            peakI = i;
          }
        }
        const THR = 0.5;
        if (peakDrop > THR) {
          em.push({
            checkId: id,
            category: 'ipf',
            title: 'Bar dropped fast into the chest (heave risk)',
            timestamp: t[peakI],
            rep: r.index + 1,
            zone: 'bar',
            exceed: (peakDrop - THR) / THR,
            quality: Math.min(0.9, bar.trackQuality + 0.2),
            explanation: `The bar’s downward speed spiked to ${peakDrop.toFixed(2)} frame-heights/s just before the touch — a fast, uncontrolled descent that ends as a heave/bounce off the chest is an IPF technical fault.`,
            cue: 'Lower under control (2–3 seconds), stay tight at the touch, and let the bar settle.',
            metric: `Peak descent speed ${peakDrop.toFixed(2)}/s before touch`,
          });
        }
      }
    }
  }

  /* ---- IPF: buttocks off the bench ---- */
  {
    const id = 'ipf-hips';
    const label = 'IPF — buttocks stay on bench';
    em.check(id, label);
    const hipY = sig.hipI.map((p, i) => (isFinite(p.y) ? p.y / scaleAt(sig, i) : NaN));
    let anyData = false;
    for (const r of reps) {
      const w = hipY.slice(r.startIdx, r.endIdx + 1).filter(isFinite);
      if (w.length < 4) continue;
      anyData = true;
      const range = Math.max(...w) - Math.min(...w);
      let minI = r.startIdx;
      for (let i = r.startIdx; i <= r.endIdx; i++) if (isFinite(hipY[i]) && hipY[i] < hipY[minI]) minI = i;
      const THR = 0.045;
      if (range > THR) {
        em.push({
          checkId: id,
          category: 'ipf',
          title: 'Buttocks lifting off the bench',
          timestamp: t[minI],
          rep: r.index + 1,
          zone: 'hips',
          exceed: (range - THR) / THR,
          quality: Q(minI, [LM.leftHip, LM.rightHip]),
          explanation: `Your hips moved vertically by ${pct(range)} of torso length during rep ${r.index + 1} — the glutes left the bench to lever the weight. Buttocks losing contact with the bench is a direct IPF fault.`,
          cue: 'Squeeze the glutes into the bench and drive the feet through the floor instead of bridging.',
          metric: `Hip lift range ${pct(range)} of torso`,
        });
      }
    }
    if (!anyData) em.skip(id, label, 'Hip landmarks were not visible (bench or camera blocked them).');
  }

  /* ---- IPF: uneven lockout ---- */
  {
    const id = 'ipf-lockout';
    const label = 'IPF — even, complete arm lockout';
    const fullReps = reps.filter((r) => r.endIsTop);
    if (!fullReps.length) em.skip(id, label, 'Clip ends before a full lockout — no completed press to inspect.');
    else {
      em.check(id, label);
      let anyData = false;
      for (const r of fullReps) {
        const ex = sMax(
          t,
          sig.t.map((_, i) =>
            i >= Math.max(0, r.endIdx - 3) && i <= r.endIdx && isFinite(sig.elbowL[i]) && isFinite(sig.elbowR[i])
              ? Math.abs(sig.elbowL[i] - sig.elbowR[i])
              : NaN,
          ),
          Math.max(0, r.endIdx - 3),
          r.endIdx,
        );
        if (!ex) continue;
        anyData = true;
        const THR = 10;
        const weakElbow = Math.min(sig.elbowL[r.endIdx] || 180, sig.elbowR[r.endIdx] || 180);
        if (ex.v > THR || weakElbow < 150) {
          const weaker = (sig.elbowL[ex.i] || 180) < (sig.elbowR[ex.i] || 180) ? 'left' : 'right';
          em.push({
            checkId: id,
            category: 'ipf',
            title: weakElbow < 150 ? 'Incomplete lockout' : 'Uneven lockout',
            timestamp: ex.t,
            rep: r.index + 1,
            zone: 'elbows',
            exceed: weakElbow < 150 ? (150 - weakElbow) / 12 : (ex.v - THR) / THR,
            quality: Q(ex.i, [LM.leftElbow, LM.rightElbow]),
            explanation:
              weakElbow < 150
                ? `The ${weaker} arm reached only ${deg(weakElbow)} of elbow extension at the finish of rep ${r.index + 1}. IPF rules require both arms evenly and fully extended at completion.`
                : `At lockout of rep ${r.index + 1} the elbows differed by ${deg(ex.v)} — the ${weaker} arm is lagging. Uneven extension of the arms at competition completion is an IPF fault.`,
            cue: 'Set an even grip, wedge both shoulders equally, and press both arms through together to full extension.',
            metric: `Elbow angles at lockout: L ${deg(sig.elbowL[ex.i] || NaN)} / R ${deg(sig.elbowR[ex.i] || NaN)}`,
          });
        }
      }
      if (!anyData) em.skip(id, label, 'Both elbows must be visible near lockout — camera angle hid one arm.');
    }
  }

  /* ---- coaching: bar path ---- */
  {
    const id = 'bar-path';
    const label = 'Bar path deviation';
    em.check(id, label);
    let anyValid = false;
    for (const r of reps) {
      const touch = touchIdxOf(r);
      if (!touch) continue;
      const a = bar.points[r.startIdx], b = bar.points[r.endIdx];
      if (!isFinite(a?.x) || !isFinite(b?.x)) continue;
      anyValid = true;
      const span = r.endIdx - touch.i;
      const ex = sMax(
        t,
        bar.points.map((p, i) => {
          if (i < touch.i || i > r.endIdx || !isFinite(p.x)) return NaN;
          const f = span > 0 ? (i - touch.i) / span : 0;
          const lineX = bar.points[touch.i].x + (b.x - bar.points[touch.i].x) * f;
          return Math.abs(p.x - lineX);
        }),
        touch.i,
        r.endIdx,
      );
      if (!ex) continue;
      const THR = 0.04;
      if (ex.v > THR) {
        em.push({
          checkId: id,
          category: 'coaching',
          title: 'Bar path deviation',
          timestamp: ex.t,
          rep: r.index + 1,
          zone: 'bar',
          exceed: (ex.v - THR) / THR,
          quality: Math.min(0.9, bar.trackQuality + 0.25),
          explanation: `The tracked bar wandered ${pct(ex.v)} of frame width off a straight press line during rep ${r.index + 1}. Efficient benching repeats one slight arc — not a wobble.`,
          cue: 'Lock the lats down, press the bar back over the shoulders, repeat the same arc every rep.',
          metric: `Lateral bar drift ${pct(ex.v)} of frame width`,
        });
      }
    }
    if (!anyValid) em.skip(id, label, 'Bar could not be tracked long enough to map its path.');
  }

  /* ---- coaching: touch point consistency ---- */
  {
    const id = 'touch-point';
    const label = 'Touch point consistency';
    if (reps.length < 2) em.skip(id, label, 'Needs at least 2 reps to compare touch points.');
    else {
      em.check(id, label);
      const touches = reps
        .map((r, k) => {
          const tt = touchIdxOf(r);
          return tt ? { t0: tt.t, x: bar.points[tt.i].x, rep: k + 1, i: tt.i } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x && isFinite(x.x));
      if (touches.length >= 2) {
        const xs = touches.map((v) => v.x);
        const sd = std(xs);
        const THR = 0.018;
        if (sd > THR) {
          const m = mean(xs);
          let worst = touches[0];
          for (const v of touches) if (Math.abs(v.x - m) > Math.abs(worst.x - m)) worst = v;
          em.push({
            checkId: id,
            category: 'coaching',
            title: 'Inconsistent bar touch point',
            timestamp: worst.t0,
            rep: worst.rep,
            zone: 'bar',
            exceed: (sd - THR) / THR,
            quality: Q(worst.i, [LM.leftWrist, LM.rightWrist]),
            explanation: `The bar touched ${pct(Math.abs(worst.x - m))} of frame width away from your average touch point across ${touches.length} reps — groove and moment arm change every rep.`,
            cue: 'Pick one spot on the lower chest and touch it every rep; keep arch and leg drive consistent.',
            metric: `Touch point σ ${pct(sd)} of frame width over ${touches.length} reps`,
          });
        }
      } else em.skip(id, label, 'Bar was not tracked reliably at chest level.');
    }
  }

  /* ---- coaching: elbow flare ---- */
  {
    const id = 'elbow-flare';
    const label = 'Elbow flare';
    em.check(id, label);
    const flare = sig.t.map((_, i) => {
      const f = sig.frames[i];
      if (!f.ok || !f.world) return NaN;
      const w = f.world;
      const use = sig.domSide === 'left' ? { s: LM.leftShoulder, e: LM.leftElbow, h: LM.leftHip } : { s: LM.rightShoulder, e: LM.rightElbow, h: LM.rightHip };
      const sw = w[use.s], ew = w[use.e], hw = w[use.h];
      const ux = ew.x - sw.x, uy = ew.y - sw.y, uz = ew.z - sw.z;
      const vx = hw.x - sw.x, vy = hw.y - sw.y, vz = hw.z - sw.z;
      const m1 = Math.hypot(ux, uy, uz), m2 = Math.hypot(vx, vy, vz);
      if (m1 < 1e-9 || m2 < 1e-9) return NaN;
      return (Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy + uz * vz) / (m1 * m2)))) * 180) / Math.PI;
    });
    let skipped = true;
    for (const r of reps) {
      const ex = sMax(t, flare.map((v, i) => (i >= r.startIdx && i <= r.endIdx && isFinite(v) ? v : NaN)), r.startIdx, r.endIdx);
      if (!ex) continue;
      skipped = false;
      const THR = 82;
      if (ex.v > THR) {
        em.push({
          checkId: id,
          category: 'coaching',
          title: 'Possible excessive elbow flare',
          timestamp: ex.t,
          rep: r.index + 1,
          zone: 'elbows',
          exceed: (ex.v - THR) / THR,
          quality: Q(ex.i, [LM.leftShoulder, LM.leftElbow, LM.rightShoulder, LM.rightElbow]),
          explanation: `Your upper arm reached ${deg(ex.v)} from the torso line during rep ${r.index + 1}. Beyond ~80° of flare the shoulders take over and injury risk climbs.`,
          cue: 'Tuck the elbows to roughly 45–70° from the torso — think “bend the bar” on the way down.',
          metric: `Max upper-arm/torso angle ${deg(ex.v)}`,
        });
      }
    }
    if (skipped) em.skip(id, label, 'Needs reliable shoulder/elbow tracking at the bottom position.');
  }

  /* ---- coaching: pause consistency ---- */
  {
    const id = 'pause-consistency';
    const label = 'Pause consistency';
    if (reps.length < 2) em.skip(id, label, 'Needs at least 2 reps to compare pauses.');
    else {
      em.check(id, label);
      const dwells: { d: number; t0: number; rep: number }[] = [];
      for (const r of reps) {
        const touch = touchIdxOf(r);
        if (!touch) continue;
        let j0 = touch.i;
        while (j0 > r.startIdx && isFinite(bar.points[j0 - 1]?.y) && Math.abs(bar.points[j0 - 1].y - touch.v) < 0.012) j0--;
        let j1 = touch.i;
        while (j1 < r.endIdx && isFinite(bar.points[j1 + 1]?.y) && Math.abs(bar.points[j1 + 1].y - touch.v) < 0.012) j1++;
        dwells.push({ d: t[j1] - t[j0], t0: t[touch.i], rep: r.index + 1 });
      }
      if (dwells.length >= 2) {
        const ds = dwells.map((x) => x.d);
        const sd = std(ds);
        const THR = 0.3;
        if (sd > THR) {
          const m = mean(ds);
          let worst = dwells[0];
          for (const d of dwells) if (Math.abs(d.d - m) > Math.abs(worst.d - m)) worst = d;
          em.push({
            checkId: id,
            category: 'coaching',
            title: 'Inconsistent pause length',
            timestamp: worst.t0,
            rep: worst.rep,
            zone: 'bar',
            exceed: (sd - THR) / THR,
            quality: 0.7,
            explanation: `Bottom pauses ranged over ${(Math.max(...ds) - Math.min(...ds)).toFixed(2)}s (mean ${m.toFixed(2)}s). Rep ${worst.rep} held ${worst.d.toFixed(2)}s — bounce vs pause changes the lift.`,
            cue: 'Count the pause in your head and keep it identical every rep.',
            metric: `Pause σ ${sd.toFixed(2)}s · range ${(Math.max(...ds) - Math.min(...ds)).toFixed(2)}s`,
          });
        }
      } else em.skip(id, label, 'Could not isolate the bottom position reliably enough to time pauses.');
    }
  }
}

/* ============================= DEADLIFT ============================= */

function deadliftDetectors(ctx: DetectorContext, em: Emitter) {
  const { sig, reps, bar } = ctx;
  const t = sig.t;
  const Q = (i: number, lms: number[]) => windowVis(sig.frames, Math.max(0, i - 2), Math.min(t.length - 1, i + 2), lms);

  /* ---- IPF: downward bar movement during the pull (hitching/dropped bar) ---- */
  {
    const id = 'ipf-downward';
    const label = 'IPF — no downward bar movement during pull';
    em.check(id, label);
    if (bar.trackQuality < 0.3) em.skip(id, label, 'Bar tracking was too unreliable to judge bar-motion continuity.');
    else {
      for (const r of reps) {
        const [a0, a1] = repAscent(r);
        const hit = maxBarDrop(bar, t, a0 + 1, a1);
        if (!hit) continue;
        const THR = 0.012;
        if (hit.drop > THR && hit.i - a0 > 2 && hit.i < a1 - 1) {
          em.push({
            checkId: id,
            category: 'ipf',
            title: 'Bar moved downward during the pull',
            timestamp: hit.t,
            rep: r.index + 1,
            zone: 'bar',
            exceed: (hit.drop - THR) / THR,
            quality: Math.min(0.9, bar.trackQuality + 0.2),
            explanation:
              'After leaving the floor the bar moved measurably downward before lockout. Under IPF rules, any downward movement of the bar before it reaches the final position (including hitching/re-dipping) is cause for failure.',
            cue: 'If the pull stalls, keep hips and chest driving — never re-bend and re-dip the bar on the way up.',
            metric: `Bar re-descended ${pct(hit.drop)} of frame height during the pull`,
          });
        }
      }
    }
  }

  /* ---- IPF: incomplete lockout ---- */
  {
    const id = 'ipf-lockout';
    const label = 'IPF — erect lockout, knees locked';
    const fullReps = reps.filter((r) => r.endIsTop);
    if (!fullReps.length) em.skip(id, label, 'Clip ends before a completed lockout to inspect.');
    else {
      em.check(id, label);
      const tops = fullReps.map((r) => ({ rep: r.index + 1, v: sig.hipAng[r.endIdx], kv: sig.knee[r.endIdx], t0: t[r.endIdx], i: r.endIdx })).filter((x) => isFinite(x.v));
      for (const top of tops) {
        const THR = 152;
        if (top.v < THR) {
          em.push({
            checkId: id,
            category: 'ipf',
            title: 'Incomplete lockout',
            timestamp: top.t0,
            rep: top.rep,
            zone: 'hips',
            exceed: (THR - top.v) / 12,
            quality: Q(top.i, [LM.leftShoulder, LM.leftHip, LM.leftKnee, LM.rightShoulder, LM.rightHip, LM.rightKnee]),
            explanation: `The hip angle at the finish of rep ${top.rep} reached only ${deg(top.v)}. IPF rules require standing erect with shoulders back and knees locked — this finish would likely not pass.`,
            cue: 'Finish every rep tall — hips through, glutes squeezed, shoulders behind the bar.',
            metric: `Lockout hip angle ${deg(top.v)} (target ≥ ~${THR}°)`,
          });
        }
      }
    }
  }

  /* ---- coaching: early hip rise ---- */
  {
    const id = 'early-hip-rise';
    const label = 'Early hip rise';
    em.check(id, label);
    for (const r of reps) {
      const pullEnd = Math.min(r.endIdx, r.bottomIdx + Math.round((r.endIdx - r.bottomIdx) * 0.45) + 2);
      const hipY0 = sig.hipI[r.bottomIdx].y;
      const barY0 = bar.points[r.bottomIdx]?.y ?? sig.wristI[r.bottomIdx].y;
      if (!isFinite(hipY0) || !isFinite(barY0)) continue;
      const metric = sig.t.map((_, i) => {
        if (i < r.bottomIdx || i > pullEnd) return NaN;
        const sc = scaleAt(sig, i);
        const by = bar.points[i]?.y ?? sig.wristI[i].y;
        const hipUp = (hipY0 - sig.hipI[i].y) / sc;
        const barUp = (barY0 - by) / sc;
        if (hipUp < 0.04) return NaN;
        return hipUp - 2.2 * Math.max(0, barUp);
      });
      const ex = sMax(t, metric, r.bottomIdx, pullEnd);
      if (!ex || !isFinite(ex.v) || ex.v <= 0.02) continue;
      const sc = scaleAt(sig, ex.i);
      const hipUp = (hipY0 - sig.hipI[ex.i].y) / sc;
      const barUp = (barY0 - (bar.points[ex.i]?.y ?? sig.wristI[ex.i].y)) / sc;
      em.push({
        checkId: id,
        category: 'coaching',
        title: 'Hips rising before the bar',
        timestamp: ex.t,
        rep: r.index + 1,
        zone: 'hips',
        exceed: ex.v / 0.08,
        quality: Q(ex.i, [LM.leftHip, LM.rightHip, LM.leftWrist, LM.rightWrist]),
        explanation: `In the first phase of rep ${r.index + 1} the hips rose ${pct(hipUp)} of torso length while the bar moved only ${pct(Math.max(0, barUp))} — hips shooting up early turns the pull into a stiff-leg position.`,
        cue: 'Pull the slack out, set the lats, and push the floor away with the legs before the hips climb.',
        metric: `Hips ${pct(hipUp)} up vs bar ${pct(Math.max(0, barUp))} in early pull`,
      });
    }
  }

  /* ---- coaching: bar drifting from the body ---- */
  {
    const id = 'bar-drift';
    const label = 'Bar proximity to the body';
    em.check(id, label);
    const gap = sig.t.map((_, i) => {
      const a = sig.ankleI[i], bx = bar.points[i]?.x ?? sig.wristI[i].x;
      if (!isFinite(a.x) || !isFinite(bx)) return NaN;
      return Math.abs(bx - a.x) / scaleAt(sig, i);
    });
    for (const r of reps) {
      const start = winAvgVal(gap, Math.max(0, r.bottomIdx - 2), r.bottomIdx + 2);
      const ex = sMax(t, gap.map((v, i) => (i >= r.bottomIdx && i <= r.endIdx && isFinite(v) && isFinite(start) ? v - start : NaN)), r.bottomIdx, r.endIdx);
      if (!ex || !isFinite(ex.v)) continue;
      const THR = 0.09;
      if (ex.v > THR) {
        em.push({
          checkId: id,
          category: 'coaching',
          title: 'Bar drifting away from the body',
          timestamp: ex.t,
          rep: r.index + 1,
          zone: 'bar',
          exceed: (ex.v - THR) / THR,
          quality: Q(ex.i, [LM.leftWrist, LM.rightWrist, LM.leftAnkle, LM.rightAnkle]),
          explanation: `The horizontal gap between the bar and your shins grew by ${pct(ex.v)} of torso length during rep ${r.index + 1}. Bar-away-from-body hugely increases the hip moment arm.`,
          cue: 'Drag the bar up your shins and thighs — lats engaged, “wipe your legs” with the bar.',
          metric: `Gap grew +${pct(ex.v)} of torso from pull start`,
        });
      }
    }
  }

  /* ---- coaching: starting-position change ---- */
  {
    const id = 'start-position';
    const label = 'Starting position consistency';
    if (reps.length < 2) em.skip(id, label, 'Needs at least 2 reps to compare setups.');
    else {
      em.check(id, label);
      const setups = reps
        .map((r) => {
          const i = r.bottomIdx;
          const h = sig.hipI[i], a = sig.ankleI[i];
          if (!isFinite(h.y) || !isFinite(a.y) || !isFinite(sig.torso[i])) return null;
          return { rep: r.index + 1, t0: t[i], hipH: (a.y - h.y) / scaleAt(sig, i), torso: sig.torso[i], i };
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      if (setups.length >= 2) {
        const sdH = std(setups.map((v) => v.hipH));
        const sdT = std(setups.map((v) => v.torso));
        if (sdH > 0.06 || sdT > 7) {
          const mH = mean(setups.map((v) => v.hipH));
          const mT = mean(setups.map((v) => v.torso));
          let worst = setups[0];
          for (const v of setups) {
            const d = Math.abs(v.hipH - mH) / Math.max(sdH, 1e-6) + Math.abs(v.torso - mT) / Math.max(sdT, 1e-6);
            const dw = Math.abs(worst.hipH - mH) / Math.max(sdH, 1e-6) + Math.abs(worst.torso - mT) / Math.max(sdT, 1e-6);
            if (d > dw) worst = v;
          }
          em.push({
            checkId: id,
            category: 'coaching',
            title: 'Starting position changed between reps',
            timestamp: worst.t0,
            rep: worst.rep,
            zone: 'hips',
            exceed: Math.max((sdH - 0.06) / 0.06, (sdT - 7) / 7),
            quality: Q(worst.i, [LM.leftHip, LM.rightHip, LM.leftAnkle, LM.rightAnkle]),
            explanation: `Hip height at the start varied by σ ${pct(sdH)} of torso and start torso angle by σ ${deg(sdT)} across ${setups.length} reps. Rep ${worst.rep} set up noticeably different (${deg(worst.torso)} torso vs ${deg(mT)} average).`,
            cue: 'Reset fully between reps — same stance, hip height and brace every pull.',
            metric: `Hip height σ ${pct(sdH)} · torso σ ${deg(sdT)}`,
          });
        }
      } else em.skip(id, label, 'Could not read hip/ankle position at the start of each rep.');
    }
  }

  /* ---- coaching: torso movement during pull ---- */
  {
    const id = 'torso-movement';
    const label = 'Torso movement during pull';
    em.check(id, label);
    for (const r of reps) {
      const a0 = sig.torso[r.bottomIdx];
      if (!isFinite(a0)) continue;
      const ex = sMax(t, sig.torso.map((v, i) => (i >= r.bottomIdx && i <= r.endIdx && isFinite(v) ? v - a0 : NaN)), r.bottomIdx, r.endIdx);
      if (!ex || !isFinite(ex.v)) continue;
      const THR = 10;
      if (ex.v > THR && ex.i > r.bottomIdx + 1) {
        em.push({
          checkId: id,
          category: 'coaching',
          title: 'Excessive torso movement during the pull',
          timestamp: ex.t,
          rep: r.index + 1,
          zone: 'torso',
          exceed: (ex.v - THR) / THR,
          quality: Q(ex.i, [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip]),
          explanation: `Your torso angle increased by ${deg(ex.v)} after the pull started (${deg(a0)} at setup → ${deg(sig.torso[ex.i])}). The back angle should stay fixed until the bar passes the knees.`,
          cue: 'Lock the brace before the bar moves; if the torso tips, the hips shot up first.',
          metric: `Torso ${deg(a0)} → ${deg(sig.torso[ex.i])} (+${deg(ex.v)})`,
        });
      }
    }
  }

  /* ---- coaching: lockout consistency ---- */
  {
    const id = 'lockout-consistency';
    const label = 'Lockout consistency';
    const fullReps = reps.filter((r) => r.endIsTop);
    if (fullReps.length < 2) em.skip(id, label, 'Needs at least 2 reps ending in lockout to compare.');
    else {
      em.check(id, label);
      const tops = fullReps.map((r) => ({ rep: r.index + 1, v: sig.hipAng[r.endIdx], t0: t[r.endIdx], i: r.endIdx })).filter((x) => isFinite(x.v));
      if (tops.length >= 2) {
        const vs = tops.map((x) => x.v);
        const spread = Math.max(...vs) - Math.min(...vs);
        if (spread > 9) {
          let worst = tops[0];
          for (const x of tops) if (x.v < worst.v) worst = x;
          em.push({
            checkId: id,
            category: 'coaching',
            title: 'Lockout inconsistent between reps',
            timestamp: worst.t0,
            rep: worst.rep,
            zone: 'hips',
            exceed: (spread - 9) / 9,
            quality: Q(worst.i, [LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee]),
            explanation: `Hip extension at lockout ranged from ${deg(Math.min(...vs))} to ${deg(Math.max(...vs))} across ${tops.length} reps. Rep ${worst.rep} finished softest at ${deg(worst.v)}.`,
            cue: 'Finish every rep by squeezing the glutes to the same tall stand.',
            metric: `Lockout spread ${deg(spread)}`,
          });
        }
      } else em.skip(id, label, 'Hip angle at lockout was not measurable on enough reps.');
    }
  }

  /* ---- coaching: rep-to-rep bar path changes ---- */
  {
    const id = 'barpath-reps';
    const label = 'Bar path repeatability';
    if (reps.length < 2) em.skip(id, label, 'Needs at least 2 reps to compare bar paths.');
    else {
      em.check(id, label);
      const K = 14;
      const paths: { rep: number; pts: { x: number; y: number }[]; i0: number; i1: number }[] = [];
      for (const r of reps) {
        const pts: { x: number; y: number }[] = [];
        let okPath = true;
        for (let k = 0; k < K; k++) {
          const i = Math.round(r.bottomIdx + ((r.endIdx - r.bottomIdx) * k) / (K - 1));
          const p = bar.points[i];
          if (!p || !isFinite(p.x) || !isFinite(p.y)) {
            okPath = false;
            break;
          }
          pts.push({ x: p.x, y: p.y });
        }
        if (okPath) paths.push({ rep: r.index + 1, pts, i0: r.bottomIdx, i1: r.endIdx });
      }
      if (paths.length >= 2) {
        let globalMean = 0,
          pairs = 0;
        let worstD = 0;
        let worst = paths[0];
        for (const p of paths) {
          let acc = 0;
          for (const q2 of paths) {
            if (q2 === p) continue;
            for (let k = 0; k < K; k++) {
              const d = Math.hypot(p.pts[k].x - q2.pts[k].x, p.pts[k].y - q2.pts[k].y);
              acc += d;
              globalMean += d;
              pairs++;
            }
          }
          const dm = acc / ((paths.length - 1) * K);
          if (dm > worstD) {
            worstD = dm;
            worst = p;
          }
        }
        globalMean = pairs ? globalMean / pairs : 0;
        const THR = 0.028;
        if (globalMean > THR) {
          let maxK = 0,
            maxD = -1;
          for (let k = 0; k < K; k++) {
            let dsum = 0;
            for (const q2 of paths) if (q2 !== worst) dsum += Math.hypot(worst.pts[k].x - q2.pts[k].x, worst.pts[k].y - q2.pts[k].y);
            const dm = dsum / (paths.length - 1);
            if (dm > maxD) {
              maxD = dm;
              maxK = k;
            }
          }
          const ts = t[Math.round(worst.i0 + ((worst.i1 - worst.i0) * maxK) / (K - 1))];
          em.push({
            checkId: id,
            category: 'coaching',
            title: 'Bar path changed between reps',
            timestamp: ts,
            rep: worst.rep,
            zone: 'bar',
            exceed: (globalMean - THR) / THR,
            quality: Math.min(0.9, bar.trackQuality + 0.25),
            explanation: `Average point-to-point bar path difference between reps was ${pct(globalMean)} of frame height — rep ${worst.rep} deviated most here (${pct(maxD)} off the other pulls).`,
            cue: 'Groove one setup and one path: same stance, same grip, same lat engagement each pull.',
            metric: `Mean inter-rep path distance ${pct(globalMean)} of frame height`,
          });
        }
      } else em.skip(id, label, 'Bar path was not tracked continuously enough to compare reps.');
    }
  }
}

/* ============================= registry ============================= */

export function runDetectors(exercise: ExerciseType, ctx: DetectorContext): DetectorResult {
  const em = new Emitter(exercise, ctx.sig);
  if (exercise === 'squat') squatDetectors(ctx, em);
  else if (exercise === 'bench') benchDetectors(ctx, em);
  else deadliftDetectors(ctx, em);

  em.errors.sort((a, b) => a.timestamp - b.timestamp);
  em.errors.forEach((e, i) => (e.id = `err-${i + 1}`));

  return {
    errors: em.errors,
    skipped: em.skipped,
    checkOutcomes: Array.from(em.outcomes.values()),
    checksTotal: em.outcomes.size,
  };
}
