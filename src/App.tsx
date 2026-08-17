import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, ScanSearch, Users } from 'lucide-react';
import Home, { Logo, MediaChoice } from './components/Home';
import Analyzing from './components/Analyzing';
import AnalysisFailed, { FailureInfo } from './components/AnalysisFailed';
import ReviewPage from './components/review/ReviewPage';
import AuthGate from './components/AuthGate';
import TrainingHome from './components/training/TrainingHome';
import AthletePage from './components/training/AthletePage';
import { analyzeLift } from './lib/ai/pipeline';
import { resetPoseRuntime } from './lib/ai/pose';
import { AnalysisProgress, AnalysisResult, ExerciseType } from './lib/ai/types';
import {
  addAnalysis,
  addAthlete,
  addRecommendation,
  addWorkout,
  DB,
  deleteWorkout,
  loadDB,
  removeAthlete,
  Role,
  saveDB,
  setRecStatus,
} from './lib/training/store';
import { makeRecommendation } from './lib/training/recommend';

type Screen =
  | { name: 'home' }
  | { name: 'analyzing'; media: MediaChoice; exercise: ExerciseType }
  | { name: 'review'; media: MediaChoice; result: AnalysisResult }
  | { name: 'failed'; failure: FailureInfo; media: MediaChoice; exercise: ExerciseType }
  | { name: 'training' }
  | { name: 'athlete'; athleteId: string };

const INITIAL_PROGRESS: AnalysisProgress = { stage: 'model', fraction: 0.01, message: 'Preparing…' };

export default function App() {
  const [db, setDb] = useState<DB>(loadDB);
  const [role, setRole] = useState<Role | null>(null);
  const [currentAthleteId, setCurrentAthleteId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [progress, setProgress] = useState<AnalysisProgress>(INITIAL_PROGRESS);
  const abortRef = useRef({ aborted: false });
  const runIdRef = useRef(0);

  const updateDb = useCallback((next: DB) => {
    setDb(next);
    saveDB(next);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen.name]);

  const startAnalysis = useCallback(
    async (media: MediaChoice, exercise: ExerciseType) => {
      const runId = ++runIdRef.current;
      abortRef.current.aborted = false;
      setProgress({ ...INITIAL_PROGRESS });
      setScreen({ name: 'analyzing', media, exercise });

      const outcome = await analyzeLift({
        videoUrl: media.url,
        exercise,
        abort: abortRef.current,
        onProgress: (p) => {
          if (runIdRef.current === runId) setProgress(p);
        },
      });

      if (runIdRef.current !== runId) return;

      if (outcome.kind === 'ok') {
        // attach the REAL analysis result to the active athlete's record\n
        if (currentAthleteId) {
          const r = outcome.result;
          updateDb(
            addAnalysis(loadDB(), {
              athleteId: currentAthleteId,
              exercise,
              at: Date.now(),
              fileName: media.fileName,
              reps: r.reps.length,
              ipfCount: r.errors.filter((e) => e.category === 'ipf').length,
              coachingCount: r.errors.filter((e) => e.category === 'coaching').length,
              errorTitles: r.errors.map((e) => e.title),
              detectionRate: r.meta.detectionRate,
            }),
          );
        }
        setScreen({ name: 'review', media, result: outcome.result });
      } else if (outcome.kind === 'aborted') {
        setScreen({ name: 'home' });
      } else if (outcome.kind === 'unavailable') {
        setScreen({ name: 'failed', failure: { kind: 'unavailable', reason: outcome.reason, detail: outcome.detail }, media, exercise });
      } else if (outcome.kind === 'insufficient') {
        setScreen({ name: 'failed', failure: { kind: 'insufficient', detectionRate: outcome.detectionRate }, media, exercise });
      } else {
        setScreen({ name: 'failed', failure: { kind: 'no-reps', detectionRate: outcome.detectionRate }, media, exercise });
      }
    },
    [currentAthleteId, updateDb],
  );

  const goHome = useCallback(() => {
    runIdRef.current++;
    abortRef.current.aborted = true;
    setScreen((s) => {
      if ('media' in s && !s.media.isSample) URL.revokeObjectURL(s.media.url);
      return { name: 'home' };
    });
  }, []);

  /* ---------- auth gate ---------- */
  if (!role) {
    return (
      <AuthGate
        db={db}
        onEnter={(r, athleteId) => {
          setRole(r);
          setCurrentAthleteId(athleteId ?? (r === 'athlete' ? db.athletes[0]?.id ?? null : null));
          setScreen({ name: 'home' });
        }}
      />
    );
  }

  const athleteForHeader = db.athletes.find((a) => a.id === currentAthleteId);

  const navBar =
    screen.name === 'home' || screen.name === 'training' || screen.name === 'athlete' ? (
      <nav className="max-w-6xl mx-auto px-5 pt-5 flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl border border-line overflow-hidden">
          <button
            onClick={() => setScreen({ name: 'home' })}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono tracking-widest transition-colors ${
              screen.name === 'home' ? 'bg-volt text-black font-bold' : 'text-muted hover:text-text'
            }`}
          >
            <ScanSearch size={13} />
            AI ANALYSIS
          </button>
          <button
            onClick={() => setScreen(role === 'athlete' && currentAthleteId ? { name: 'athlete', athleteId: currentAthleteId } : { name: 'training' })}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono tracking-widest transition-colors ${
              screen.name !== 'home' ? 'bg-volt text-black font-bold' : 'text-muted hover:text-text'
            }`}
          >
            <Users size={13} />
            TRAINING
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {athleteForHeader && (
            <span className="text-[10px] font-mono text-muted border border-line rounded-full px-3 py-1.5">
              {role === 'coach' ? 'COACH' : 'ATHLETE'}
              {role === 'athlete' ? ` · ${athleteForHeader.name}` : athleteForHeader && role === 'coach' ? ` · viewing: ${athleteForHeader.name}` : ''}
            </span>
          )}
          {role === 'coach' && (
            <select
              value={currentAthleteId ?? ''}
              onChange={(e) => setCurrentAthleteId(e.target.value || null)}
              className="bg-panel border border-line rounded-full px-3 py-1.5 text-[10px] font-mono text-muted outline-none max-w-36"
              title="Athlete context for analyses"
            >
              <option value="">no athlete context</option>
              {db.athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              setRole(null);
              setScreen({ name: 'home' });
            }}
            className="p-2 rounded-lg border border-line text-muted hover:text-text transition-colors"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </nav>
    ) : null;

  /* ---------- screens ---------- */
  if (screen.name === 'home') {
    return (
      <div className="min-h-screen bg-bg">
        {navBar}
        <Home onAnalyze={startAnalysis} navInjected />
      </div>
    );
  }

  if (screen.name === 'analyzing') {
    return <Analyzing progress={progress} exercise={screen.exercise} fileName={screen.media.fileName} onCancel={goHome} />;
  }

  if (screen.name === 'review') {
    return (
      <ReviewPage
        videoUrl={screen.media.url}
        fileName={screen.media.fileName}
        result={screen.result}
        onBack={goHome}
        onReanalyze={() => startAnalysis(screen.media, screen.result.meta.exercise)}
      />
    );
  }

  if (screen.name === 'training') {
    return (
      <div className="min-h-screen bg-bg">
        {navBar}
        <TrainingHome
          db={db}
          role={role}
          currentAthleteId={currentAthleteId}
          onOpenAthlete={(id) => setScreen({ name: 'athlete', athleteId: id })}
          onAddAthlete={(name, bw) => updateDb(addAthlete(db, name, bw))}
          onRemoveAthlete={(id) => {
            updateDb(removeAthlete(db, id));
            if (currentAthleteId === id) setCurrentAthleteId(null);
          }}
        />
      </div>
    );
  }

  if (screen.name === 'athlete') {
    const athlete = db.athletes.find((a) => a.id === screen.athleteId);
    if (!athlete) {
      setScreen({ name: 'training' });
      return null;
    }
    return (
      <div className="min-h-screen bg-bg">
        {navBar}
        <AthletePage
          db={db}
          role={role}
          athlete={athlete}
          onBack={() => setScreen(role === 'coach' ? { name: 'training' } : { name: 'home' })}
          onAddWorkout={(w) => updateDb(addWorkout(db, { ...w, athleteId: athlete.id, flaggedErrors: [] }))}
          onDeleteWorkout={(id) => updateDb(deleteWorkout(db, id))}
          onGenerateRec={(ex) => updateDb(addRecommendation(db, makeRecommendation(db, athlete.id, ex)))}
          onSetRecStatus={(id, status, note, modifiedTop) => updateDb(setRecStatus(db, id, status, note, modifiedTop))}
        />
      </div>
    );
  }

  return (
    <AnalysisFailed
      failure={screen.failure}
      onBack={goHome}
      onRetry={() => {
        resetPoseRuntime();
        startAnalysis(screen.media, screen.exercise);
      }}
    />
  );
}

export { Logo };
