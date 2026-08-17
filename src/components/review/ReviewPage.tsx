import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Camera,
  Cpu,
  Film,
  ListChecks,
  RefreshCw,
  SkipForward,
} from 'lucide-react';
import { AnalysisResult, DetectedError, EXERCISE_LABEL } from '../../lib/ai/types';
import { fmtTime } from '../../lib/utils';
import VideoPlayer, { PlayerHandle } from './VideoPlayer';
import ErrorCard from './ErrorCard';
import ErrorList from './ErrorList';
import { Logo } from '../Home';

interface Props {
  videoUrl: string;
  fileName: string;
  result: AnalysisResult;
  onBack: () => void;
  onReanalyze: () => void;
}

export default function ReviewPage({ videoUrl, fileName, result, onBack, onReanalyze }: Props) {
  const [activeError, setActiveError] = useState<DetectedError | null>(null);
  const [, setDur] = useState(0);
  const handleRef = useRef<PlayerHandle | null>(null);

  const sorted = useMemo(() => [...result.errors].sort((a, b) => a.timestamp - b.timestamp), [result.errors]);
  const activeIdx = activeError ? sorted.findIndex((e) => e.id === activeError.id) : -1;
  const skippedIds = useMemo(() => new Set(result.skipped.map((s) => s.checkId)), [result.skipped]);

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* header */}
      <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur border-b border-line">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg border border-line text-muted hover:text-text hover:border-line2 transition-colors" title="New analysis">
            <ArrowLeft size={16} />
          </button>
          <Logo size={26} />
          <div className="h-5 w-px bg-line hidden sm:block" />
          <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-muted min-w-0">
            <Film size={13} className="shrink-0" />
            <span className="truncate max-w-[220px]">{fileName}</span>
          </div>
          <div className="flex-1" />
          <div className="font-mono text-[10px] px-2.5 py-1.5 rounded-lg border border-volt/40 bg-volt/10 text-volt tracking-widest">
            {EXERCISE_LABEL[result.meta.exercise].toUpperCase()}
          </div>
          <button
            onClick={onReanalyze}
            className="flex items-center gap-1.5 text-[11px] font-mono px-3 py-2 rounded-lg border border-line text-muted hover:text-text hover:border-line2 transition-colors"
          >
            <RefreshCw size={12} />
            <span className="hidden sm:inline">RE-ANALYZE</span>
          </button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        {/* ------- left: player + error card ------- */}
        <section className="min-w-0">
          <VideoPlayer
            src={videoUrl}
            frames={result.frames}
            reps={result.reps}
            errors={result.errors}
            exercise={result.meta.exercise}
            bar={result.bar}
            activeError={activeError}
            onActiveError={setActiveError}
            onDuration={setDur}
            handleRef={handleRef}
          />

          <div className="mt-4">
            <ErrorCard
              error={activeError}
              errorIndex={activeIdx}
              total={sorted.length}
              hasNext={activeIdx >= 0 && activeIdx < sorted.length - 1}
              hasPrev={activeIdx > 0}
              onReplay={() => activeError && handleRef.current?.replayError(activeError)}
              onNext={() => handleRef.current?.nextError()}
              onPrev={() => handleRef.current?.prevError()}
              onResume={() => {
                setActiveError(null);
                handleRef.current?.resume();
              }}
            />
          </div>

          {/* flow hint when nothing selected */}
          {!activeError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl border border-line bg-panel px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex items-center gap-2.5 text-sm text-muted flex-1">
                <Activity size={16} className="text-volt shrink-0" />
                {sorted.length > 0 ? (
                  <span>
                    Press <span className="text-volt font-mono font-bold">PLAY</span> — the AI auto-pauses{' '}
                    <span className="text-text">{sorted.length} detected issue{sorted.length !== 1 ? 's' : ''}</span> one by
                    one, or jump straight to one:
                  </span>
                ) : (
                  <span>No errors were detected in this set — scrub the timeline to review the tracked skeleton.</span>
                )}
              </div>
              {sorted.length > 0 && (
                <button
                  onClick={() => handleRef.current?.jumpToError(sorted[0])}
                  className="flex items-center gap-2 bg-err text-white font-display font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-err/85 transition-colors shrink-0"
                >
                  <SkipForward size={15} strokeWidth={2.5} />
                  FIRST ERROR · {fmtTime(sorted[0].timestamp)}
                </button>
              )}
            </motion.div>
          )}

          {result.meta.truncated && (
            <div className="mt-4 rounded-xl border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber flex gap-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              Long clip — only the first {fmtTime(result.meta.analyzedDuration)} were analyzed frame-by-frame.
            </div>
          )}

          <div className="mt-4 text-[11px] font-mono text-faint flex flex-wrap gap-x-4 gap-y-1">
            <span>[SPACE] play/pause</span>
            <span>[←/→] frame step</span>
            <span>[N] next error</span>
            <span>[P] previous error</span>
            <span>[A] toggle AI review</span>
          </div>
        </section>

        {/* ------- right: sidebar ------- */}
        <aside className="space-y-4 lg:sticky lg:top-[72px]">
          <ErrorList errors={sorted} activeId={activeError?.id ?? null} onSelect={(e) => handleRef.current?.jumpToError(e)} />

          {/* session stats — proves the analysis is real & measured */}
          <div className="rounded-2xl border border-line bg-panel overflow-hidden">
            <div className="px-4 py-3 border-b border-line text-[11px] font-mono tracking-[0.22em] text-faint flex items-center gap-2">
              <Cpu size={13} />
              ANALYSIS SESSION
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-line/60">
              {[
                ['FRAMES SCANNED', String(result.meta.framesAnalyzed)],
                ['POSE DETECTION', `${Math.round(result.meta.detectionRate * 100)}%`],
                ['REPS SEGMENTED', String(result.reps.length)],
                ['BAR TRACKING', `${Math.round(result.bar.trackQuality * 100)}%`],
                ['CAMERA VIEW', result.meta.view.toUpperCase()],
                ['CLIP LENGTH', fmtTime(result.meta.duration)],
              ].map(([k, v]) => (
                <div key={k} className="px-4 py-3">
                  <div className="text-[9px] font-mono tracking-[0.18em] text-faint">{k}</div>
                  <div className="font-display font-bold text-lg mt-0.5 tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-line text-[10px] font-mono text-faint flex items-center gap-2">
              <Camera size={11} />
              MODEL · {result.meta.model.toUpperCase()}
            </div>
          </div>

          {/* checks audit */}
          <div className="rounded-2xl border border-line bg-panel overflow-hidden">
            <div className="px-4 py-3 border-b border-line text-[11px] font-mono tracking-[0.22em] text-faint flex items-center gap-2">
              <ListChecks size={13} />
              CHECKS AUDIT
            </div>
            <div className="divide-y divide-line/60">
              {result.checkOutcomes.map((c) => {
                const skipped = skippedIds.has(c.checkId);
                const reason = result.skipped.find((s) => s.checkId === c.checkId)?.reason;
                return (
                  <div key={c.checkId} className="px-4 py-2.5 flex items-center gap-2.5">
                    {skipped ? (
                      <AlertTriangle size={14} className="text-amber shrink-0" />
                    ) : c.found > 0 ? (
                      <span className="w-3.5 h-3.5 rounded-full bg-err text-[9px] font-mono text-white flex items-center justify-center shrink-0">
                        {c.found}
                      </span>
                    ) : (
                      <CheckCircle2 size={14} className="text-volt shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className={`text-[13px] leading-tight ${skipped ? 'text-faint' : 'text-muted'}`}>{c.label}</div>
                      {skipped && reason && <div className="text-[10px] text-faint leading-tight mt-0.5">{reason}</div>}
                    </div>
                    {skipped && <span className="ml-auto text-[9px] font-mono text-amber shrink-0">SKIPPED</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-err/25 bg-err/5 px-4 py-3 text-[11px] leading-relaxed text-muted">
            <span className="text-err font-medium">Assistant, not a referee.</span> IPF rule checks cover only what is
            measurable from video (depth, bar motion continuity, pause immobility, lockout, bench contact). Referee
            commands, foot movement on the platform and equipment rules cannot be judged from footage. Data here never
            replaces certified officials.
          </div>
          <p className="text-[11px] text-faint leading-relaxed px-1">
            Every timestamp, rep number and confidence score above is computed from pose + bar tracking of{' '}
            <span className="text-muted">your footage</span> — Lift Genius never generates placeholder results. Checks that
            can't run on this camera angle are reported as skipped.
          </p>
        </aside>
      </main>
    </div>
  );
}
