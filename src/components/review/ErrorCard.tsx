import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Gauge, Gavel, MessageSquareText, Play, Repeat2 } from 'lucide-react';
import { DetectedError, EXERCISE_LABEL } from '../../lib/ai/types';
import { fmtTime } from '../../lib/utils';

interface Props {
  error: DetectedError | null;
  errorIndex: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  onReplay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onResume: () => void;
}

const ZONE_LABEL: Record<string, string> = {
  torso: 'TORSO / BAR PATH REGION',
  hips: 'HIP REGION',
  knees: 'KNEE REGION',
  bar: 'BAR REGION',
  elbows: 'ELBOW REGION',
  full: 'FULL BODY',
};

export default function ErrorCard({ error, errorIndex, total, hasNext, hasPrev, onReplay, onNext, onPrev, onResume }: Props) {
  const isIpf = error?.category === 'ipf';
  return (
    <AnimatePresence mode="wait">
      {error && (
        <motion.div
          key={error.id}
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.22 }}
          className={`rounded-2xl border p-5 ${
            isIpf
              ? 'border-err/50 bg-gradient-to-br from-err/[0.08] to-panel shadow-[0_0_60px_-18px_rgba(255,69,69,0.55)]'
              : 'border-amber/45 bg-gradient-to-br from-amber/[0.07] to-panel shadow-[0_0_60px_-18px_rgba(255,176,32,0.4)]'
          }`}
        >
          {/* category banner */}
          <div
            className={`inline-flex items-center gap-1.5 text-[10px] font-mono tracking-[0.2em] px-2.5 py-1 rounded-md border mb-3 ${
              isIpf ? 'border-err/50 bg-err/15 text-err' : 'border-amber/50 bg-amber/10 text-amber'
            }`}
          >
            {isIpf ? <Gavel size={11} /> : <MessageSquareText size={11} />}
            {isIpf ? 'IPF RULE RISK' : 'COACHING OBSERVATION'}
          </div>

          {/* header */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className={`font-mono text-[11px] tracking-[0.22em] font-bold flex items-center gap-2 ${isIpf ? 'text-err' : 'text-amber'}`}>
              <span className={`w-2 h-2 rounded-sm rotate-45 animate-pulse-glow ${isIpf ? 'bg-err' : 'bg-amber'}`} />
              {isIpf ? 'RULE RISK' : 'ERROR'} — {EXERCISE_LABEL[error.exercise].toUpperCase()}
            </div>
            <div className="font-mono text-2xl font-bold text-text tabular-nums">{fmtTime(error.timestamp)}</div>
            <div className="flex items-center gap-2 ml-auto">
              {error.rep !== null && (
                <span className="text-[10px] font-mono px-2 py-1 rounded-md border border-line bg-panel2 text-muted">
                  REP {error.rep}
                </span>
              )}
              <span className="text-[10px] font-mono px-2 py-1 rounded-md border border-err/40 bg-err/10 text-err">
                {ZONE_LABEL[error.zone]}
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-1 rounded-md border ${
                  error.severity === 'high'
                    ? 'border-err/50 bg-err/15 text-err'
                    : error.severity === 'medium'
                      ? 'border-amber/50 bg-amber/10 text-amber'
                      : 'border-line bg-panel2 text-muted'
                }`}
              >
                {error.severity.toUpperCase()}
              </span>
            </div>
          </div>

          <h3 className="font-display font-bold text-lg tracking-tight mt-3">{error.title}</h3>
          <p className="text-sm text-muted leading-relaxed mt-2">{error.explanation}</p>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="font-mono text-[11px] text-faint bg-panel2 border border-line rounded-lg px-3 py-1.5">
              {error.metric}
            </div>
            <div className="flex items-center gap-2">
              <Gauge size={13} className="text-faint" />
              <div className="w-24 h-1.5 rounded-full bg-panel2 border border-line overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber to-err" style={{ width: `${Math.round(error.confidence * 100)}%` }} />
              </div>
              <span className="font-mono text-[11px] text-muted">{Math.round(error.confidence * 100)}% CONF</span>
            </div>
          </div>

          <div className="mt-3 text-sm">
            <span className="text-volt font-medium">Fix it:</span>{' '}
            <span className="text-muted">{error.cue}</span>
          </div>

          {/* actions */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button
              onClick={onReplay}
              className={`flex items-center gap-2 text-white font-display font-bold text-sm px-5 py-2.5 rounded-xl transition-colors ${
                isIpf ? 'bg-err hover:bg-err/85' : 'bg-amber text-black hover:bg-amber/85'
              }`}
            >
              <Repeat2 size={15} strokeWidth={2.5} />
              REPLAY ERROR
            </button>
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className={`flex items-center gap-1.5 font-display font-bold text-sm px-4 py-2.5 rounded-xl transition-colors ${
                hasPrev ? 'border border-line text-text hover:border-line2' : 'bg-panel2 text-faint border border-line cursor-not-allowed'
              }`}
            >
              <ArrowLeft size={15} strokeWidth={2.5} />
              PREV
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className={`flex items-center gap-2 font-display font-bold text-sm px-5 py-2.5 rounded-xl transition-colors ${
                hasNext
                  ? 'bg-volt text-black hover:bg-volt-dim'
                  : 'bg-panel2 text-faint border border-line cursor-not-allowed'
              }`}
            >
              NEXT ERROR
              <ArrowRight size={15} strokeWidth={2.5} />
            </button>
            <button
              onClick={onResume}
              className="flex items-center gap-2 border border-line hover:border-line2 text-muted hover:text-text text-sm px-4 py-2.5 rounded-xl transition-colors"
            >
              <Play size={14} />
              Resume
            </button>
            <span className="ml-auto font-mono text-[11px] text-faint">
              ISSUE {errorIndex + 1} / {total}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
