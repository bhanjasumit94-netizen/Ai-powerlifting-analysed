import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CirclePause,
  Crosshair,
  FileVideo,
  ListChecks,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { ExerciseType, EXERCISE_LABEL } from '../lib/ai/types';

export interface MediaChoice {
  url: string;
  fileName: string;
  isSample: boolean;
}

interface Props {
  onAnalyze: (media: MediaChoice, exercise: ExerciseType) => void;
  /** when the app shell already rendered the nav bar */
  navInjected?: boolean;
}

const EXERCISES: { id: ExerciseType; tag: string; desc: string; checks: string[] }[] = [
  {
    id: 'squat',
    tag: 'SQUAT',
    desc: 'Depth, knees, hips, torso & bar path',
    checks: ['Depth consistency', 'Knee cave', 'Hip shift', 'Forward torso', 'Early hip rise', 'Bar path', 'Rep consistency'],
  },
  {
    id: 'bench',
    tag: 'BENCH PRESS',
    desc: 'Bar path, touch point, elbows & lockout',
    checks: ['Bar path', 'Touch point', 'Elbow flare', 'Uneven lockout', 'Hip movement', 'Pause consistency'],
  },
  {
    id: 'deadlift',
    tag: 'DEADLIFT',
    desc: 'Hip timing, bar drift, setup & lockout',
    checks: ['Early hip rise', 'Bar drift', 'Start position', 'Torso movement', 'Lockout', 'Path repeatability'],
  },
];

const SAMPLES: { id: ExerciseType; src: string; thumb: string; note: string }[] = [
  { id: 'squat', src: '/samples/squat.mp4', thumb: '/img/thumb-squat.jpg', note: 'Barbell squat · rear view' },
  { id: 'bench', src: '/samples/bench.mp4', thumb: '/img/thumb-bench.jpg', note: 'Barbell bench · side view' },
  { id: 'deadlift', src: '/samples/deadlift.mp4', thumb: '/img/thumb-deadlift.jpg', note: 'Barbell deadlift · side view' },
];

const STEPS = [
  { icon: Upload, title: 'Upload the set', text: 'Drop a squat, bench or deadlift clip. The video never leaves your device.' },
  { icon: ScanLine, title: 'AI scans every frame', text: '33-point pose tracking on each frame builds joint-angle & bar-path signals.' },
  { icon: CirclePause, title: 'Auto-pauses at errors', text: 'Playback freezes at the exact timestamp of each fault — area highlighted.' },
  { icon: ListChecks, title: 'Review & fix', text: 'Replay each error in slow-mo, frame-by-frame, then jump to the next one.' },
];

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#c8ff3d" />
        <g stroke="#07080b" strokeWidth="5.5" strokeLinecap="round">
          <line x1="12" y1="32" x2="52" y2="32" />
          <line x1="19" y1="20" x2="19" y2="44" />
          <line x1="45" y1="20" x2="45" y2="44" />
          <line x1="10" y1="26" x2="10" y2="38" />
          <line x1="54" y1="26" x2="54" y2="38" />
        </g>
        <circle cx="32" cy="32" r="4.5" fill="#07080b" />
      </svg>
      <div className="font-display font-bold tracking-tight text-xl leading-none">
        <span className="text-text">LIFT</span>{' '}
        <span className="text-volt">GENIUS</span>
      </div>
    </div>
  );
}

export default function Home({ onAnalyze, navInjected }: Props) {
  const [exercise, setExercise] = useState<ExerciseType>('squat');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v|mkv)$/i.test(f.name)) return;
    setFile(f);
  }, []);

  const start = () => {
    if (!file) return;
    onAnalyze({ url: URL.createObjectURL(file), fileName: file.name, isSample: false }, exercise);
  };

  return (
    <div className="min-h-screen bg-bg text-text overflow-x-hidden">
      {/* top nav (skipped when the app shell renders its own) */}
      {!navInjected && (
        <header className="max-w-6xl mx-auto px-5 pt-6 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted border border-line rounded-full px-3 py-1.5">
            <ShieldCheck size={13} className="text-volt" />
            100% ON-DEVICE · NO UPLOAD TO SERVERS
          </div>
        </header>
      )}

      <main className="max-w-6xl mx-auto px-5 pb-24">
        {/* hero */}
        <section className="relative mt-10 rounded-3xl overflow-hidden border border-line">
          <img src="/img/hero.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/75 to-bg" />
          <div className="relative px-6 sm:px-12 py-16 sm:py-24">
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
              <div className="inline-flex items-center gap-2 text-[11px] font-mono tracking-[0.2em] text-volt border border-volt/30 bg-volt/5 rounded-full px-3 py-1.5 mb-6">
                <Sparkles size={13} />
                AI FORM CHECK · SQUAT / BENCH / DEADLIFT
              </div>
              <h1 className="font-display font-bold text-4xl sm:text-6xl leading-[1.02] tracking-tight max-w-3xl">
                The AI watches your lift.
                <br />
                <span className="text-volt">Finds the error.</span>
                <br />
                <span className="text-muted">Pauses exactly there.</span>
              </h1>
              <p className="mt-6 max-w-xl text-muted text-base sm:text-lg leading-relaxed">
                Upload your set and Lift Genius tracks 33 body landmarks frame-by-frame, detects technical errors,
                freezes the video at each fault, highlights the faulty area and explains what went wrong —
                then jumps you to the next one.
              </p>
            </motion.div>
          </div>
        </section>

        {/* exercise select */}
        <section className="mt-12">
          <div className="text-[11px] font-mono tracking-[0.25em] text-faint mb-4">01 — CHOOSE THE LIFT</div>
          <div className="grid sm:grid-cols-3 gap-3">
            {EXERCISES.map((e) => {
              const active = exercise === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => setExercise(e.id)}
                  className={`text-left rounded-2xl border p-5 transition-all no-tap-highlight ${
                    active
                      ? 'border-volt bg-volt/[0.07] shadow-[0_0_40px_-12px_rgba(200,255,61,0.35)]'
                      : 'border-line bg-panel hover:border-line2 hover:bg-panel2'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`font-display font-bold text-lg tracking-tight ${active ? 'text-volt' : 'text-text'}`}>
                      {e.tag}
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        active ? 'border-volt' : 'border-faint'
                      }`}
                    >
                      {active && <div className="w-2 h-2 rounded-full bg-volt" />}
                    </div>
                  </div>
                  <div className="text-muted text-sm mt-1.5">{e.desc}</div>
                  <div className={`mt-3 flex flex-wrap gap-1.5 transition-opacity ${active ? 'opacity-100' : 'opacity-45'}`}>
                    {e.checks.map((c) => (
                      <span key={c} className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-line text-muted">
                        {c}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* upload */}
        <section className="mt-12">
          <div className="text-[11px] font-mono tracking-[0.25em] text-faint mb-4">02 — DROP THE FOOTAGE</div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              acceptFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={`relative rounded-2xl border-2 border-dashed transition-all ${
              dragging ? 'border-volt bg-volt/5' : file ? 'border-volt/60 bg-panel' : 'border-line bg-panel hover:border-line2'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/*,.mp4,.webm,.mov,.m4v,.mkv"
              className="hidden"
              onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
            />
            {!file ? (
              <button onClick={() => inputRef.current?.click()} className="w-full px-6 py-14 flex flex-col items-center gap-4 group">
                <div className="w-16 h-16 rounded-2xl bg-panel2 border border-line flex items-center justify-center group-hover:border-volt/50 group-hover:shadow-[0_0_30px_-8px_rgba(200,255,61,0.4)] transition-all">
                  <FileVideo size={26} className="text-volt" />
                </div>
                <div>
                  <div className="font-display font-semibold text-lg">
                    Drop your {EXERCISE_LABEL[exercise].toLowerCase()} video here
                  </div>
                  <div className="text-muted text-sm mt-1">
                    or <span className="text-volt underline underline-offset-4">browse files</span> · MP4 / WebM / MOV · best from the side, full body in frame
                  </div>
                </div>
              </button>
            ) : (
              <div className="px-6 py-8 flex flex-col sm:flex-row items-center gap-5">
                <div className="w-14 h-14 rounded-xl bg-volt/10 border border-volt/40 flex items-center justify-center shrink-0">
                  <Video size={24} className="text-volt" />
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="font-medium truncate">{file.name}</div>
                  <div className="text-muted text-sm font-mono mt-0.5">{(file.size / 1e6).toFixed(1)} MB · ready to analyze as {EXERCISE_LABEL[exercise]}</div>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="p-2 rounded-lg border border-line text-muted hover:text-text hover:border-line2 transition-colors"
                  title="Remove file"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={start}
                  className="flex items-center gap-2 bg-volt text-black font-display font-bold px-7 py-3.5 rounded-xl hover:bg-volt-dim transition-colors shadow-[0_0_40px_-10px_rgba(200,255,61,0.6)]"
                >
                  ANALYZE {EXERCISES.find((x) => x.id === exercise)?.tag}
                  <ArrowRight size={18} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* samples */}
        <section className="mt-12">
          <div className="text-[11px] font-mono tracking-[0.25em] text-faint mb-4">
            NO VIDEO HANDY? — RUN A REAL SAMPLE THROUGH THE PIPELINE
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onClick={() => onAnalyze({ url: s.src, fileName: s.src.split('/').pop() ?? 'sample.mp4', isSample: true }, s.id)}
                className="group relative rounded-2xl overflow-hidden border border-line hover:border-volt/50 transition-all text-left"
              >
                <img src={s.thumb} alt={EXERCISE_LABEL[s.id]} className="w-full aspect-[16/9] object-cover opacity-80 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display font-bold tracking-tight">{EXERCISE_LABEL[s.id].toUpperCase()}</div>
                      <div className="text-[11px] font-mono text-muted mt-0.5">{s.note}</div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-volt text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Crosshair size={16} strokeWidth={2.5} />
                    </div>
                  </div>
                </div>
                <div className="absolute top-3 left-3 text-[10px] font-mono px-2 py-1 rounded bg-black/60 border border-white/10 tracking-widest">
                  SAMPLE
                </div>
              </button>
            ))}
          </div>
          <p className="text-faint text-xs mt-3 font-mono">
            Samples are analyzed live by the same pipeline — errors you see are measured from those frames, never scripted.
          </p>
        </section>

        {/* how it works */}
        <section className="mt-16">
          <div className="text-[11px] font-mono tracking-[0.25em] text-faint mb-4">HOW THE REVIEW WORKS</div>
          <div className="grid sm:grid-cols-4 gap-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-line bg-panel p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-volt/10 border border-volt/30 flex items-center justify-center">
                    <s.icon size={17} className="text-volt" />
                  </div>
                  <div className="font-mono text-faint text-xs">0{i + 1}</div>
                </div>
                <div className="font-display font-semibold mt-3.5">{s.title}</div>
                <div className="text-muted text-sm mt-1.5 leading-relaxed">{s.text}</div>
              </div>
            ))}
          </div>
        </section>

        {/* honesty / privacy strip */}
        <section className="mt-12 rounded-2xl border border-line bg-panel px-6 py-5 flex flex-col sm:flex-row gap-4 sm:items-center">
          <ShieldCheck size={26} className="text-volt shrink-0" />
          <p className="text-sm text-muted leading-relaxed">
            <span className="text-text font-medium">Real analysis, or an honest answer.</span> Every timestamp, rep count and
            confidence score is computed from your footage by an on-device vision model — nothing is generated or faked.
            If the model can't see you clearly, Lift Genius tells you exactly that and what to fix about the filming,
            instead of inventing results.
          </p>
        </section>
      </main>
    </div>
  );
}
