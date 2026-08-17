import { motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, CameraOff, CircleSlash, RefreshCw, ScanLine } from 'lucide-react';

export type FailureInfo =
  | { kind: 'unavailable'; reason: string; detail: string }
  | { kind: 'insufficient'; detectionRate: number }
  | { kind: 'no-reps'; detectionRate: number };

interface Props {
  failure: FailureInfo;
  onBack: () => void;
  onRetry: () => void;
}

const TIPS = [
  'Film from the side (squat/deadlift) or front (symmetry checks) with the full body in frame — feet and bar visible.',
  'Keep the camera stationary at hip height, 2–4 meters away.',
  'Good lighting, no strong backlight, minimal occlusion by racks or spotters.',
  'Use MP4 (H.264) or WebM, at least ~2 seconds long with one full rep.',
];

export default function AnalysisFailed({ failure, onBack, onRetry }: Props) {
  const isUnavailable = failure.kind === 'unavailable';
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl rounded-3xl border border-line bg-panel p-8 sm:p-10"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
              isUnavailable ? 'bg-err/10 border-err/40 text-err' : 'bg-amber/10 border-amber/40 text-amber'
            }`}
          >
            {isUnavailable ? <CameraOff size={22} /> : failure.kind === 'no-reps' ? <CircleSlash size={22} /> : <AlertTriangle size={22} />}
          </div>
          <div>
            <div className="text-[11px] font-mono tracking-[0.25em] text-faint">
              {isUnavailable ? 'ANALYSIS UNAVAILABLE' : 'ANALYSIS STOPPED — NO FABRICATED RESULTS'}
            </div>
            <h2 className="font-display font-bold text-2xl tracking-tight mt-1">
              {isUnavailable
                ? 'The AI analysis service is unavailable'
                : failure.kind === 'no-reps'
                  ? 'No complete repetition detected'
                  : 'The lifter could not be tracked reliably'}
            </h2>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-panel2 px-5 py-4">
          {failure.kind === 'unavailable' && (
            <>
              <p className="text-sm text-text leading-relaxed">{failure.reason}</p>
              <p className="text-sm text-muted leading-relaxed mt-2">{failure.detail}</p>
            </>
          )}
          {failure.kind === 'insufficient' && (
            <p className="text-sm text-muted leading-relaxed">
              The pose model could only track the lifter in{' '}
              <span className="text-text font-mono">{Math.round(failure.detectionRate * 100)}%</span> of sampled frames —
              below the 35% minimum we require before drawing any conclusion. Rather than guessing, Lift Genius declines
              to produce findings from this footage.
            </p>
          )}
          {failure.kind === 'no-reps' && (
            <p className="text-sm text-muted leading-relaxed">
              The lifter was tracked (detection rate{' '}
              <span className="text-text font-mono">{Math.round(failure.detectionRate * 100)}%</span>) but no full
              repetition cycle (extended → deep → extended) could be segmented from the joint-angle signal. The clip may
              start or end mid-rep, or the selected lift type may not match the footage.
            </p>
          )}
        </div>

        <div className="mt-6">
          <div className="text-[11px] font-mono tracking-[0.25em] text-faint mb-3 flex items-center gap-2">
            <ScanLine size={13} />
            HOW TO GET AN ANALYZABLE CLIP
          </div>
          <ul className="space-y-2">
            {TIPS.map((tip) => (
              <li key={tip} className="flex gap-2.5 text-sm text-muted">
                <span className="text-volt mt-0.5 shrink-0">▸</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={onRetry}
            className="flex items-center gap-2 bg-volt text-black font-display font-bold px-6 py-3 rounded-xl hover:bg-volt-dim transition-colors"
          >
            <RefreshCw size={16} strokeWidth={2.5} />
            RETRY ANALYSIS
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-2 border border-line hover:border-line2 text-muted hover:text-text px-6 py-3 rounded-xl transition-colors"
          >
            <ArrowLeft size={16} />
            Choose different footage
          </button>
        </div>
      </motion.div>
    </div>
  );
}
