import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  Video,
  X,
} from 'lucide-react';
import { ExerciseType, EXERCISE_LABEL } from '../../lib/ai/types';
import {
  Athlete,
  bestE1RM,
  DB,
  e1rm,
  e1rmSeries,
  Recommendation,
  Role,
  sessionVolume,
  weeklyVolume,
  workoutsFor,
} from '../../lib/training/store';
import { makeRecommendation } from '../../lib/training/recommend';
import { LineChart, VolumeBars } from './Charts';

interface Props {
  db: DB;
  role: Role;
  athlete: Athlete;
  onBack: () => void;
  onAddWorkout: (w: { exercise: ExerciseType; date: string; sets: { reps: number; weightKg: number; rpe: number }[]; notes: string }) => void;
  onDeleteWorkout: (id: string) => void;
  onGenerateRec: (exercise: ExerciseType) => void;
  onSetRecStatus: (id: string, status: Recommendation['status'], note: string, modifiedTop: number | null) => void;
}

const EXS: ExerciseType[] = ['squat', 'bench', 'deadlift'];
const TABS = ['Log', 'History', 'Progress', 'Coach Plan'] as const;

type Tab = (typeof TABS)[number];

export default function AthletePage({ db, role, athlete, onBack, onAddWorkout, onDeleteWorkout, onGenerateRec, onSetRecStatus }: Props) {
  const [tab, setTab] = useState<Tab>('Log');
  const isCoach = role === 'coach';

  /* ---- log form state ---- */
  const [exercise, setExercise] = useState<ExerciseType>('squat');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([{ reps: 5, weightKg: 100, rpe: 8 }]);
  const [notes, setNotes] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const workouts = useMemo(() => workoutsFor(db, athlete.id), [db, athlete.id]);
  const recs = useMemo(() => db.recs.filter((r) => r.athleteId === athlete.id), [db, athlete.id]);
  const analyses = useMemo(() => db.analyses.filter((a) => a.athleteId === athlete.id).slice(-4).reverse(), [db, athlete.id]);
  const volume = useMemo(() => weeklyVolume(db, athlete.id), [db, athlete.id]);
  const e1rmSer = useMemo(() => {
    const all: { label: string; value: number }[] = [];
    const byEx = EXS.map((ex) => ({ ex, pts: e1rmSeries(db, athlete.id, ex) }));
    const best = byEx.sort((a, b) => b.pts.length - a.pts.length)[0];
    if (best && best.pts.length) {
      for (const p of best.pts) all.push({ label: p.date.slice(5), value: Math.round(p.value) });
    }
    return { series: all, exerciseOf: best?.pts.length ? best.ex : null };
  }, [db, athlete.id]);

  const saveWorkout = () => {
    const clean = rows.filter((r) => r.reps > 0 && r.weightKg > 0);
    if (!clean.length) return;
    onAddWorkout({ exercise, date, sets: clean, notes });
    setNotes('');
    setRows(rows.slice(0, 1));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  };

  const totalLoggedVol = workouts.reduce((a, w) => a + sessionVolume(w), 0);

  /* recommendation status editor state */
  const [editingRec, setEditingRec] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editTop, setEditTop] = useState('');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="p-2 rounded-lg border border-line text-muted hover:text-text transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="w-11 h-11 rounded-xl bg-volt/10 border border-volt/30 flex items-center justify-center font-display font-bold text-volt text-lg">
          {athlete.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="font-display font-bold text-xl tracking-tight leading-none">
            {athlete.name}
            {athlete.isSample && <span className="ml-2 text-[10px] font-mono text-amber align-middle">SAMPLE DATA</span>}
          </h1>
          <div className="text-faint text-xs font-mono mt-1">
            {athlete.bodyweightKg}kg BW · {workouts.length} sessions · {Math.round(totalLoggedVol).toLocaleString()}kg total volume
          </div>
        </div>
        {EXS.map((ex) => {
          const b = bestE1RM(db, athlete.id, ex);
          return (
            <div key={ex} className="rounded-xl bg-panel border border-line px-3.5 py-2 text-center">
              <div className="text-[9px] font-mono tracking-widest text-faint">{EXERCISE_LABEL[ex].toUpperCase()}</div>
              <div className="font-display font-bold text-base">{b ? `${Math.round(b)}kg` : '—'}</div>
              <div className="text-[9px] text-faint font-mono">e1RM</div>
            </div>
          );
        })}
      </div>

      {/* tabs */}
      <div className="mt-6 flex gap-1 border-b border-line overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-display font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t ? 'border-volt text-volt' : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {t}
            {t === 'Coach Plan' && recs.some((r) => r.status === 'pending') && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-amber inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* ---------------- LOG ---------------- */}
      {tab === 'Log' && (
        <div className="mt-6 grid md:grid-cols-[1fr_300px] gap-5 items-start">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <div className="text-[11px] font-mono tracking-[0.22em] text-faint mb-4">LOG WORKOUT</div>
            <div className="flex flex-wrap gap-3">
              <label className="flex-1 min-w-36">
                <span className="text-[10px] font-mono tracking-widest text-faint">LIFT</span>
                <div className="relative mt-1">
                  <select
                    value={exercise}
                    onChange={(e) => setExercise(e.target.value as ExerciseType)}
                    className="w-full appearance-none bg-panel2 border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-volt/60"
                  >
                    {EXS.map((e) => (
                      <option key={e} value={e}>
                        {EXERCISE_LABEL[e]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                </div>
              </label>
              <label className="w-36">
                <span className="text-[10px] font-mono tracking-widest text-faint">DATE</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full bg-panel2 border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-volt/60 [color-scheme:dark]"
                />
              </label>
            </div>

            <div className="mt-4 space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 text-[10px] font-mono tracking-widest text-faint px-1">
                <span>WEIGHT KG</span>
                <span>REPS</span>
                <span>RPE</span>
                <span />
              </div>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 items-center">
                  <input
                    type="number"
                    value={r.weightKg}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, weightKg: Number(e.target.value) } : x)))}
                    className="bg-panel2 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-volt/60"
                  />
                  <input
                    type="number"
                    value={r.reps}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, reps: Number(e.target.value) } : x)))}
                    className="bg-panel2 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-volt/60"
                  />
                  <input
                    type="number"
                    step="0.5"
                    min="6"
                    max="10"
                    value={r.rpe}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, rpe: Number(e.target.value) } : x)))}
                    className="bg-panel2 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-volt/60"
                  />
                  <button
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    className="p-1.5 text-faint hover:text-err transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setRows([...rows, { reps: 5, weightKg: rows[rows.length - 1]?.weightKg ?? 60, rpe: 8 }])}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-volt font-mono transition-colors"
              >
                <Plus size={13} /> ADD SET
              </button>
            </div>

            <label className="block mt-4">
              <span className="text-[10px] font-mono tracking-widest text-faint">NOTES</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How did it move? Any pain? Cues used…"
                className="mt-1 w-full bg-panel2 border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-volt/60"
              />
            </label>

            <button
              onClick={saveWorkout}
              className={`mt-5 w-full font-display font-bold py-3 rounded-xl transition-colors ${
                savedFlash ? 'bg-volt/70 text-black' : 'bg-volt text-black hover:bg-volt-dim'
              }`}
            >
              {savedFlash ? '✓ SAVED' : 'SAVE WORKOUT'}
            </button>
          </div>

          <div className="rounded-2xl border border-line bg-panel p-5">
            <div className="text-[11px] font-mono tracking-[0.22em] text-faint mb-3">QUICK STATS</div>
            <div className="space-y-3 text-sm">
              {EXS.map((ex) => {
                const ws = workoutsFor(db, athlete.id, ex);
                const last = ws[ws.length - 1];
                const best = bestE1RM(db, athlete.id, ex);
                return (
                  <div key={ex} className="flex items-center justify-between border-b border-line/60 pb-2.5 last:border-0">
                    <span className="text-muted">{EXERCISE_LABEL[ex]}</span>
                    <span className="font-mono text-xs text-right">
                      <span className="text-text">{best ? `${Math.round(best)}kg e1RM` : 'no data'}</span>
                      {last && <span className="block text-faint">last: {last.date.slice(5)}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-faint mt-4 leading-relaxed">
              RPE feeds the AI recommendation engine: sub-7 auto-progresses load, 9.5+ triggers a pullback. Every proposal waits for coach sign-off.
            </p>
          </div>
        </div>
      )}

      {/* ---------------- HISTORY ---------------- */}
      {tab === 'History' && (
        <div className="mt-6 space-y-2.5">
          {workouts.length === 0 && <div className="rounded-2xl border border-line bg-panel py-12 text-center text-muted text-sm">No workouts logged yet.</div>}
          {[...workouts].reverse().map((w) => (
            <div key={w.id} className="rounded-2xl border border-line bg-panel px-4 py-3.5">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="font-display font-semibold">{EXERCISE_LABEL[w.exercise]}</div>
                <span className="font-mono text-[11px] text-faint">{w.date}</span>
                <span className="font-mono text-[11px] text-muted">{sessionVolume(w).toLocaleString()}kg vol</span>
                <span className="font-mono text-[11px] text-volt">top e1RM {Math.round(Math.max(...w.sets.map((s) => e1rm(s.weightKg, s.reps))))}kg</span>
                <button onClick={() => onDeleteWorkout(w.id)} className="ml-auto p-1.5 text-faint hover:text-err transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {w.sets.map((s, i) => (
                  <span key={i} className="text-[11px] font-mono px-2 py-1 rounded-lg bg-panel2 border border-line text-muted">
                    {s.weightKg}kg × {s.reps} @{s.rpe}
                  </span>
                ))}
              </div>
              {w.flaggedErrors.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {w.flaggedErrors.map((e) => (
                    <span key={e} className="text-[10px] font-mono px-2 py-1 rounded-lg bg-err/10 border border-err/30 text-err">
                      {e}
                    </span>
                  ))}
                </div>
              )}
              {w.notes && <p className="text-xs text-muted mt-2 italic">“{w.notes}”</p>}
            </div>
          ))}
        </div>
      )}

      {/* ---------------- PROGRESS ---------------- */}
      {tab === 'Progress' && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center gap-2 text-[11px] font-mono tracking-[0.22em] text-faint mb-3">
              <TrendingUp size={13} className="text-volt" />
              ESTIMATED 1RM — {e1rmSer.exerciseOf ? EXERCISE_LABEL[e1rmSer.exerciseOf].toUpperCase() : 'NO DATA'}
            </div>
            <LineChart data={e1rmSer.series} unit="kg" />
          </div>
          <div className="rounded-2xl border border-line bg-panel p-5">
            <div className="text-[11px] font-mono tracking-[0.22em] text-faint mb-3">WEEKLY VOLUME (ALL LIFTS)</div>
            <VolumeBars data={volume} />
          </div>
          <div className="rounded-2xl border border-line bg-panel p-5 md:col-span-2">
            <div className="flex items-center gap-2 text-[11px] font-mono tracking-[0.22em] text-faint mb-3">
              <Video size={13} className="text-volt" />
              RECENT AI VIDEO ANALYSES
            </div>
            {analyses.length === 0 ? (
              <p className="text-muted text-sm">No analyses recorded yet for this athlete. Run a video through AI Analysis while this athlete is active and it will appear here.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {analyses.map((a) => (
                  <div key={a.id} className="rounded-xl bg-panel2 border border-line px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-sm">{EXERCISE_LABEL[a.exercise]}</span>
                      <span className="font-mono text-[10px] text-faint">{new Date(a.at).toLocaleDateString()}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted">{a.reps} reps · {Math.round(a.detectionRate * 100)}% tracked</span>
                    </div>
                    <div className="mt-2 flex gap-1.5 flex-wrap">
                      {a.ipfCount > 0 && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-err/15 text-err">{a.ipfCount} IPF risk{a.ipfCount > 1 ? 's' : ''}</span>}
                      {a.coachingCount > 0 && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber/10 text-amber">{a.coachingCount} coaching</span>}
                      {a.ipfCount === 0 && a.coachingCount === 0 && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-volt/10 text-volt">CLEAN</span>}
                    </div>
                    {a.errorTitles.length > 0 && (
                      <div className="mt-2 text-[11px] text-muted leading-snug">{a.errorTitles.slice(0, 3).join(' · ')}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- COACH PLAN ---------------- */}
      {tab === 'Coach Plan' && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-muted flex-1 min-w-52">
              {isCoach
                ? 'Generate a data-driven session proposal from this athlete’s logged history + video analyses. Nothing is prescribed until you approve it.'
                : 'Your coach reviews every AI-generated proposal before it becomes your plan.'}
            </p>
            {isCoach && (
              <div className="flex gap-2 flex-wrap">
                {EXS.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => onGenerateRec(ex)}
                    className="flex items-center gap-1.5 bg-volt text-black font-display font-bold text-xs px-3.5 py-2.5 rounded-xl hover:bg-volt-dim transition-colors"
                  >
                    <Sparkles size={13} strokeWidth={2.5} />
                    PROPOSE {EXERCISE_LABEL[ex].toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          {recs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line bg-panel py-12 text-center text-muted text-sm">
              No proposals yet. {isCoach ? 'Generate one above.' : 'Waiting for your coach.'}
            </div>
          )}

          {recs.map((r) => (
            <div
              key={r.id}
              className={`rounded-2xl border p-5 ${
                r.status === 'pending'
                  ? 'border-amber/40 bg-amber/[0.04]'
                  : r.status === 'approved' || r.status === 'modified'
                    ? 'border-volt/40 bg-volt/[0.04]'
                    : 'border-line bg-panel opacity-70'
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-display font-bold">{EXERCISE_LABEL[r.exercise]} Session Proposal</span>
                <span className="font-mono text-[10px] text-faint">{new Date(r.createdAt).toLocaleString()}</span>
                <span
                  className={`ml-auto text-[10px] font-mono px-2.5 py-1 rounded-full border ${
                    r.status === 'pending'
                      ? 'border-amber/50 text-amber bg-amber/10'
                      : r.status === 'approved'
                        ? 'border-volt/50 text-volt bg-volt/10'
                        : r.status === 'modified'
                          ? 'border-blue-400/50 text-blue-300 bg-blue-400/10'
                          : 'border-line text-faint'
                  }`}
                >
                  {r.status === 'modified' ? 'MODIFIED BY COACH' : r.status.toUpperCase()}
                </span>
              </div>

              <div className="mt-3 grid sm:grid-cols-3 gap-2.5">
                <div className="rounded-xl bg-panel2 border border-line px-4 py-3">
                  <div className="text-[9px] font-mono tracking-widest text-faint">TOP SET</div>
                  <div className="font-display font-bold text-xl mt-0.5">
                    {r.status === 'modified' && r.coachTopSetKg !== null ? `${r.coachTopSetKg}kg × 3` : r.topSetKg > 0 ? `${r.topSetKg}kg × 3` : 'coach sets'}
                  </div>
                  {r.status === 'modified' && r.coachTopSetKg !== null && (
                    <div className="text-[10px] text-faint font-mono line-through">AI said {r.topSetKg}kg</div>
                  )}
                </div>
                <div className="rounded-xl bg-panel2 border border-line px-4 py-3">
                  <div className="text-[9px] font-mono tracking-widest text-faint">BACK-OFFS</div>
                  <div className="font-display font-bold text-xl mt-0.5">{r.backoffs}</div>
                </div>
                <div className="rounded-xl bg-panel2 border border-line px-4 py-3">
                  <div className="text-[9px] font-mono tracking-widest text-faint">VOLUME TARGET</div>
                  <div className="font-display font-bold text-xl mt-0.5">{r.volumeTargetKg > 0 ? `${r.volumeTargetKg.toLocaleString()}kg` : '—'}</div>
                </div>
              </div>

              <ul className="mt-3 space-y-1">
                {r.rationale.map((rl, i) => (
                  <li key={i} className="text-[12.5px] text-muted flex gap-2">
                    <span className="text-volt">▸</span>
                    {rl}
                  </li>
                ))}
              </ul>
              {r.focusCues.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.focusCues.map((c) => (
                    <span key={c} className="text-[10px] font-mono px-2 py-1 rounded-lg bg-amber/10 border border-amber/30 text-amber">
                      FIX: {c}
                    </span>
                  ))}
                </div>
              )}
              {r.coachNote && <p className="mt-3 text-sm text-text border-l-2 border-volt pl-3">Coach: “{r.coachNote}”</p>}

              {/* coach actions */}
              {isCoach && r.status === 'pending' && (
                <div className="mt-4">
                  {editingRec === r.id ? (
                    <div className="flex flex-wrap gap-2 items-center">
                      <input
                        value={editTop}
                        onChange={(e) => setEditTop(e.target.value)}
                        placeholder={`Top set kg (AI: ${r.topSetKg})`}
                        type="number"
                        className="w-40 bg-panel2 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-volt/60"
                      />
                      <input
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Coach note…"
                        className="flex-1 min-w-44 bg-panel2 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-volt/60"
                      />
                      <button
                        onClick={() => {
                          onSetRecStatus(r.id, 'modified', editNote, Number(editTop) || r.topSetKg);
                          setEditingRec(null);
                        }}
                        className="flex items-center gap-1.5 bg-blue-400 text-black font-display font-bold text-xs px-4 py-2.5 rounded-xl"
                      >
                        <BadgeCheck size={13} /> SAVE MODIFIED
                      </button>
                      <button onClick={() => setEditingRec(null)} className="text-faint text-xs font-mono px-2">
                        CANCEL
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => onSetRecStatus(r.id, 'approved', '', null)}
                        className="flex items-center gap-1.5 bg-volt text-black font-display font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-volt-dim"
                      >
                        <Check size={14} strokeWidth={3} /> APPROVE
                      </button>
                      <button
                        onClick={() => {
                          setEditingRec(r.id);
                          setEditTop(String(r.topSetKg));
                          setEditNote('');
                        }}
                        className="flex items-center gap-1.5 border border-blue-400/50 text-blue-300 font-display font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-blue-400/10"
                      >
                        <Pencil size={13} /> MODIFY
                      </button>
                      <button
                        onClick={() => {
                          const note = window.prompt('Reason for rejection (visible to athlete):') ?? '';
                          onSetRecStatus(r.id, 'rejected', note, null);
                        }}
                        className="flex items-center gap-1.5 border border-err/50 text-err font-display font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-err/10"
                      >
                        <Ban size={13} /> REJECT
                      </button>
                    </div>
                  )}
                </div>
              )}
              {!isCoach && r.status === 'pending' && (
                <div className="mt-4 text-[11px] font-mono text-amber flex items-center gap-2">
                  <Sparkles size={12} /> WAITING FOR COACH APPROVAL — not a prescription yet.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
