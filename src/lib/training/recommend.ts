import { ExerciseType, EXERCISE_LABEL } from '../ai/types';
import { DB, e1rm, Recommendation, workoutsFor } from './store';
import { mean } from '../utils';

const round25 = (v: number) => Math.round(v / 2.5) * 2.5;

/**
 * Deterministic "AI coach" proposal: computed purely from the athlete's real
 * logged history (weights, reps, RPE) and their real video-analysis findings.
 * Always pending until a coach approves / modifies / rejects.
 */
export function makeRecommendation(db: DB, athleteId: string, exercise: ExerciseType): Omit<Recommendation, 'id'> {
  const ws = workoutsFor(db, athleteId, exercise);
  const analyses = db.analyses.filter((a) => a.athleteId === athleteId && a.exercise === exercise);
  const rationale: string[] = [];
  const focusCues: string[] = [];

  let topSet = 0;
  let backoffs = '3 × 5 @ RPE 7';

  if (ws.length === 0) {
    rationale.push(`No ${EXERCISE_LABEL[exercise]} sessions logged yet — proposing a conservative technique-block entry point.`);
    topSet = 0; // coach must fill in
    backoffs = '4 × 5 @ light, crisp reps';
  } else {
    const last = ws[ws.length - 1];
    const bestSet = [...last.sets].sort((a, b) => b.weightKg - a.weightKg)[0];
    const lastE1 = e1rm(bestSet.weightKg, bestSet.reps);
    const avgRpe = mean(last.sets.map((s) => s.rpe).filter((v) => isFinite(v)));

    // RPE-guided load regulation
    let factor = 1.0;
    if (avgRpe < 7) factor = 1.05;
    else if (avgRpe < 8.5) factor = 1.025;
    else if (avgRpe <= 9.5) factor = 1.0;
    else factor = 0.94;
    topSet = round25(bestSet.weightKg * factor);

    rationale.push(
      `Last session: top set ${bestSet.weightKg}kg × ${bestSet.reps} (e1RM ≈ ${Math.round(lastE1)}kg), avg RPE ${avgRpe.toFixed(1)}.`,
    );
    if (factor > 1) rationale.push(`RPE below target → progress load by ${((factor - 1) * 100).toFixed(1)}%.`);
    if (factor < 1) rationale.push('RPE above 9.5 (grinding) → pull back ~6% to restore bar speed and technique.');
    if (factor === 1) rationale.push('RPE on target → hold load, consolidate quality reps.');

    backoffs =
      exercise === 'deadlift'
        ? `${factor > 1 ? '2' : '3'} × 3 @ ${round25(topSet * 0.9)}kg`
        : `${factor >= 1 ? '3' : '4'} × 5 @ ${round25(topSet * 0.87)}kg`;
  }

  // training-block focus from the most recent REAL video analysis findings
  if (analyses.length) {
    const latest = analyses[analyses.length - 1];
    if (latest.errorTitles.length) {
      focusCues.push(...latest.errorTitles.slice(0, 2));
      rationale.push(
        `Last video analysis (${EXERCISE_LABEL[exercise]}, ${latest.reps} reps tracked) flagged: ${latest.errorTitles.slice(0, 2).join(' · ')} — technique priority before load.`,
      );
    } else {
      rationale.push(`Last video analysis of this lift came back clean (${latest.reps} reps tracked).`);
    }
    if (latest.ipfCount > 0) rationale.push(`${latest.ipfCount} IPF rule risk(s) present — competition-standard execution is the priority.`);
  }

  const weekly = ws.reduce((acc, w) => acc + w.sets.reduce((s, x) => s + x.reps * x.weightKg, 0), 0);
  const volumeTarget = Math.round((ws.length ? weekly / Math.min(ws.length, 4) : 0) * 1.03);
  if (volumeTarget > 0) rationale.push(`Volume target ≈ ${volumeTarget}kg for the session (+3% over recent average).`);

  return {
    athleteId,
    exercise,
    createdAt: Date.now(),
    topSetKg: topSet,
    backoffs,
    volumeTargetKg: volumeTarget,
    rationale,
    focusCues,
    status: 'pending',
    coachNote: '',
    coachTopSetKg: null,
  };
}
