import { ExerciseType } from '../ai/types';

export type Role = 'coach' | 'athlete';

export interface Athlete {
  id: string;
  name: string;
  bodyweightKg: number;
  createdAt: number;
  isSample?: boolean;
}

export interface SetLog {
  reps: number;
  weightKg: number;
  rpe: number; // 6-10
}

export interface WorkoutLog {
  id: string;
  athleteId: string;
  exercise: ExerciseType;
  date: string; // ISO date
  sets: SetLog[];
  notes: string;
  /** error titles surfaced by the AI video analysis attached to this session */
  flaggedErrors: string[];
}

export interface AnalysisRecord {
  id: string;
  athleteId: string;
  exercise: ExerciseType;
  at: number;
  fileName: string;
  reps: number;
  ipfCount: number;
  coachingCount: number;
  errorTitles: string[];
  detectionRate: number;
}

export type RecStatus = 'pending' | 'approved' | 'modified' | 'rejected';

export interface Recommendation {
  id: string;
  athleteId: string;
  exercise: ExerciseType;
  createdAt: number;
  /** AI-proposed session, computed from real history + RPE + analysis findings */
  topSetKg: number;
  backoffs: string;
  volumeTargetKg: number;
  rationale: string[];
  focusCues: string[];
  status: RecStatus;
  coachNote: string;
  /** coach-modified value when status === 'modified' */
  coachTopSetKg: number | null;
}

export interface DB {
  athletes: Athlete[];
  workouts: WorkoutLog[];
  analyses: AnalysisRecord[];
  recs: Recommendation[];
}

const KEY = 'liftgenius.v1';

function empty(): DB {
  return { athletes: [], workouts: [], analyses: [], recs: [] };
}

export function loadDB(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const db = JSON.parse(raw) as DB;
    return { ...empty(), ...db };
  } catch {
    return empty();
  }
}

export function saveDB(db: DB): void {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ---------- athletes ---------- */
export function addAthlete(db: DB, name: string, bodyweightKg: number): DB {
  const a: Athlete = { id: uid(), name: name.trim() || 'Athlete', bodyweightKg, createdAt: Date.now() };
  return { ...db, athletes: [...db.athletes, a] };
}

export function updateAthlete(db: DB, id: string, patch: Partial<Athlete>): DB {
  return { ...db, athletes: db.athletes.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
}

export function removeAthlete(db: DB, id: string): DB {
  return {
    athletes: db.athletes.filter((a) => a.id !== id),
    workouts: db.workouts.filter((w) => w.athleteId !== id),
    analyses: db.analyses.filter((a) => a.athleteId !== id),
    recs: db.recs.filter((r) => r.athleteId !== id),
  };
}

/* ---------- workouts ---------- */
export function addWorkout(db: DB, w: Omit<WorkoutLog, 'id'>): DB {
  return { ...db, workouts: [...db.workouts, { ...w, id: uid() }] };
}

export function deleteWorkout(db: DB, id: string): DB {
  return { ...db, workouts: db.workouts.filter((w) => w.id !== id) };
}

/* ---------- analysis records ---------- */
export function addAnalysis(db: DB, a: Omit<AnalysisRecord, 'id'>): DB {
  return { ...db, analyses: [...db.analyses, { ...a, id: uid() }] };
}

/* ---------- recommendations ---------- */
export function addRecommendation(db: DB, r: Omit<Recommendation, 'id'>): DB {
  return { ...db, recs: [ { ...r, id: uid() }, ...db.recs ] };
}

export function setRecStatus(db: DB, id: string, status: RecStatus, coachNote: string, coachTopSetKg: number | null): DB {
  return {
    ...db,
    recs: db.recs.map((r) => (r.id === id ? { ...r, status, coachNote, coachTopSetKg } : r)),
  };
}

/* ---------- metrics ---------- */

/** Epley estimated 1RM */
export function e1rm(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function workoutsFor(db: DB, athleteId: string, exercise?: ExerciseType): WorkoutLog[] {
  return db.workouts
    .filter((w) => w.athleteId === athleteId && (!exercise || w.exercise === exercise))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function bestE1RM(db: DB, athleteId: string, exercise: ExerciseType): number | null {
  const ws = workoutsFor(db, athleteId, exercise);
  let best = 0;
  for (const w of ws) for (const s of w.sets) best = Math.max(best, e1rm(s.weightKg, s.reps));
  return best > 0 ? Math.round(best * 10) / 10 : null;
}

export function sessionVolume(w: WorkoutLog): number {
  return w.sets.reduce((acc, s) => acc + s.reps * s.weightKg, 0);
}

export interface WeekPoint {
  week: string;
  volume: number;
}

function weekKey(iso: string): string {
  const d = new Date(iso);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function weeklyVolume(db: DB, athleteId: string): WeekPoint[] {
  const map = new Map<string, number>();
  for (const w of workoutsFor(db, athleteId)) {
    const k = weekKey(w.date);
    map.set(k, (map.get(k) ?? 0) + sessionVolume(w));
  }
  return Array.from(map.entries()).map(([week, volume]) => ({ week, volume })).sort((a, b) => a.week.localeCompare(b.week));
}

export function e1rmSeries(db: DB, athleteId: string, exercise: ExerciseType): { date: string; value: number }[] {
  return workoutsFor(db, athleteId, exercise)
    .map((w) => ({ date: w.date, value: Math.max(...w.sets.map((s) => e1rm(s.weightKg, s.reps)), 0) }))
    .filter((p) => p.value > 0);
}

/* ---------- sample seed (clearly labeled) ---------- */

function seed(): DB {
  const a: Athlete = { id: 'sample-athlete', name: 'Alex Demo (sample)', bodyweightKg: 82, createdAt: Date.now(), isSample: true };
  const day = 86400000;
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const workouts: WorkoutLog[] = [
    { id: uid(), athleteId: a.id, exercise: 'squat', date: iso(now - 21 * day), sets: [{ reps: 5, weightKg: 120, rpe: 7 }, { reps: 5, weightKg: 120, rpe: 7.5 }, { reps: 5, weightKg: 120, rpe: 8 }], notes: '', flaggedErrors: [] },
    { id: uid(), athleteId: a.id, exercise: 'bench', date: iso(now - 20 * day), sets: [{ reps: 5, weightKg: 80, rpe: 7 }, { reps: 5, weightKg: 80, rpe: 8 }], notes: '', flaggedErrors: [] },
    { id: uid(), athleteId: a.id, exercise: 'deadlift', date: iso(now - 19 * day), sets: [{ reps: 3, weightKg: 170, rpe: 8 }], notes: '', flaggedErrors: [] },
    { id: uid(), athleteId: a.id, exercise: 'squat', date: iso(now - 14 * day), sets: [{ reps: 5, weightKg: 122.5, rpe: 7.5 }, { reps: 5, weightKg: 122.5, rpe: 8 }, { reps: 5, weightKg: 122.5, rpe: 8.5 }], notes: '', flaggedErrors: [] },
    { id: uid(), athleteId: a.id, exercise: 'bench', date: iso(now - 13 * day), sets: [{ reps: 5, weightKg: 82.5, rpe: 8 }, { reps: 4, weightKg: 82.5, rpe: 8.5 }], notes: 'pause felt long', flaggedErrors: ['Inconsistent pause length'] },
    { id: uid(), athleteId: a.id, exercise: 'deadlift', date: iso(now - 12 * day), sets: [{ reps: 3, weightKg: 175, rpe: 8.5 }, { reps: 3, weightKg: 170, rpe: 8 }], notes: '', flaggedErrors: [] },
    { id: uid(), athleteId: a.id, exercise: 'squat', date: iso(now - 7 * day), sets: [{ reps: 5, weightKg: 125, rpe: 8 }, { reps: 5, weightKg: 125, rpe: 8.5 }, { reps: 4, weightKg: 125, rpe: 9 }], notes: 'hips shot up on last set', flaggedErrors: ['Hips rising faster than shoulders'] },
    { id: uid(), athleteId: a.id, exercise: 'bench', date: iso(now - 6 * day), sets: [{ reps: 5, weightKg: 82.5, rpe: 8 }, { reps: 5, weightKg: 82.5, rpe: 8.5 }], notes: '', flaggedErrors: [] },
    { id: uid(), athleteId: a.id, exercise: 'deadlift', date: iso(now - 5 * day), sets: [{ reps: 2, weightKg: 180, rpe: 9 }], notes: 'grindy single-ish double', flaggedErrors: [] },
    { id: uid(), athleteId: a.id, exercise: 'squat', date: iso(now - 2 * day), sets: [{ reps: 5, weightKg: 127.5, rpe: 8.5 }, { reps: 5, weightKg: 127.5, rpe: 9 }, { reps: 3, weightKg: 127.5, rpe: 9 }], notes: '', flaggedErrors: [] },
  ];
  return { athletes: [a], workouts, analyses: [], recs: [] };
}
