import { useMemo, useState } from 'react';
import { CalendarDays, Dumbbell, Plus, Sparkles, Trash2, User, Users } from 'lucide-react';
import { ExerciseType, EXERCISE_LABEL } from '../../lib/ai/types';
import { Athlete, bestE1RM, DB, Role } from '../../lib/training/store';

interface Props {
  db: DB;
  role: Role;
  currentAthleteId: string | null;
  onOpenAthlete: (id: string) => void;
  onAddAthlete: (name: string, bw: number) => void;
  onRemoveAthlete: (id: string) => void;
}

const EX: ExerciseType[] = ['squat', 'bench', 'deadlift'];

export default function TrainingHome({ db, role, currentAthleteId, onOpenAthlete, onAddAthlete, onRemoveAthlete }: Props) {
  const [name, setName] = useState('');
  const [bw, setBw] = useState('80');
  const [adding, setAdding] = useState(false);

  const visibleAthletes = useMemo(() => {
    if (role === 'coach') return db.athletes;
    return db.athletes.filter((a) => a.id === currentAthleteId);
  }, [db.athletes, role, currentAthleteId]);

  const stats = (a: Athlete) => {
    const ws = db.workouts.filter((w) => w.athleteId === a.id);
    const vol = ws.reduce((acc, w) => acc + w.sets.reduce((s, x) => s + x.reps * x.weightKg, 0), 0);
    const pending = db.recs.filter((r) => r.athleteId === a.id && r.status === 'pending').length;
    return { sessions: ws.length, vol, pending };
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl tracking-tight flex items-center gap-2.5">
            <Users size={22} className="text-volt" />
            {role === 'coach' ? 'Athletes' : 'My Training'}
          </h1>
          <p className="text-muted text-sm mt-1">
            {role === 'coach'
              ? 'Your roster. Every AI recommendation requires your approval before it reaches the athlete.'
              : 'Your private training log. Video analyses and workouts here are only visible to you and your coach.'}
          </p>
        </div>
        {role === 'coach' && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-2 bg-volt text-black font-display font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-volt-dim transition-colors"
          >
            <Plus size={16} strokeWidth={2.5} />
            ADD ATHLETE
          </button>
        )}
      </div>

      {adding && role === 'coach' && (
        <div className="mt-4 rounded-2xl border border-line bg-panel p-4 flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-40">
            <span className="text-[10px] font-mono tracking-widest text-faint">NAME</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Athlete name"
              className="mt-1 w-full bg-panel2 border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-volt/60"
            />
          </label>
          <label className="w-32">
            <span className="text-[10px] font-mono tracking-widest text-faint">BODYWEIGHT KG</span>
            <input
              value={bw}
              onChange={(e) => setBw(e.target.value)}
              type="number"
              className="mt-1 w-full bg-panel2 border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-volt/60"
            />
          </label>
          <button
            onClick={() => {
              if (!name.trim()) return;
              onAddAthlete(name, Number(bw) || 80);
              setName('');
              setAdding(false);
            }}
            className="bg-volt text-black font-display font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-volt-dim"
          >
            CREATE
          </button>
        </div>
      )}

      {visibleAthletes.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line bg-panel px-6 py-14 text-center">
          <User size={28} className="text-faint mx-auto" />
          <div className="font-display font-semibold mt-3">No athletes yet</div>
          <p className="text-muted text-sm mt-1">{role === 'coach' ? 'Add your first athlete to start logging.' : 'Ask your coach to create your profile.'}</p>
        </div>
      ) : (
        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          {visibleAthletes.map((a) => {
            const s = stats(a);
            return (
              <button
                key={a.id}
                onClick={() => onOpenAthlete(a.id)}
                className="text-left rounded-2xl border border-line bg-panel hover:border-volt/40 transition-all p-5 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-volt/10 border border-volt/30 flex items-center justify-center font-display font-bold text-volt text-lg">
                      {a.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-display font-semibold text-lg leading-tight">{a.name}</div>
                      <div className="text-faint text-xs font-mono mt-0.5">
                        {a.bodyweightKg}kg BW {a.isSample && <span className="ml-1 text-amber">· SAMPLE DATA</span>}
                      </div>
                    </div>
                  </div>
                  {role === 'coach' && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveAthlete(a.id);
                      }}
                      className="p-2 rounded-lg text-faint hover:text-err hover:bg-err/10 transition-colors"
                      title="Remove athlete"
                    >
                      <Trash2 size={15} />
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {EX.map((ex) => {
                    const b = bestE1RM(db, a.id, ex);
                    return (
                      <div key={ex} className="rounded-xl bg-panel2 border border-line px-3 py-2.5">
                        <div className="text-[9px] font-mono tracking-widest text-faint">{EXERCISE_LABEL[ex].toUpperCase().slice(0, 5)}</div>
                        <div className="font-display font-bold text-base mt-0.5">{b ? `${Math.round(b)}kg` : '—'}</div>
                        <div className="text-[9px] text-faint font-mono">e1RM</div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-4 text-[11px] font-mono text-faint">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={11} /> {s.sessions} sessions
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Dumbbell size={11} /> {Math.round(s.vol).toLocaleString()}kg lifted
                  </span>
                  {s.pending > 0 && (
                    <span className="flex items-center gap-1.5 text-amber">
                      <Sparkles size={11} /> {s.pending} plan{s.pending > 1 ? 's' : ''} awaiting review
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
