import { motion } from 'framer-motion';
import { BrainCircuit, Loader2, ScanSearch, Video, XCircle } from 'lucide-react';
import { AnalysisProgress, ExerciseType, EXERCISE_LABEL } from '../lib/ai/types';

interface Props {
  progress: AnalysisProgress;
  exercise: ExerciseType;
  fileName: string;
  onCancel: () => void;
}

export default function Analyzing({ progress, exercise, fileName, onCancel }: Props) {
  const pct = Math.round(progress.fraction * 100);
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-5 relative overflow-hidden">
      {/* backdrop */}
      <div className="absolute inset-0 opacity-[0.05]" style={{
        backgroundImage: 'linear-gradient(#c8ff3d 1px, transparent 1px), linear-gradient(90deg, #c8ff3d 1px, transparent 1px)',
        backgroundSize: '44px 44px',
      }} />
      <div className="absolute left-0 right-0 h-px bg-volt/50 scan-line" style={{ boxShadow: '0 0 24px 2px rgba(200,255,61,0.5)' }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-xl rounded-3xl border border-line bg-panel/90 backdrop-blur p-8 sm:p-10"
      >
        <div className="flex items-center gap-3 text-[11px] font-mono tracking-[0.25em] text-volt">
          <ScanSearch size={15} />
          AI ANALYSIS RUNNING
        </div>

        <h2 className="font-display font-bold text-3xl tracking-tight mt-4">
          Analyzing your {EXERCISE_LABEL[exercise].toLowerCase()}
        </h2>
        <div className="flex items-center gap-2 text-muted text-sm mt-2 font-mono">
          <Video size={14} />
          <span className="truncate">{fileName}</span>
        </div>

        {/* progress */}
        <div className="mt-8">
          <div className="flex items-center justify-between font-mono text-xs text-muted mb-2">
            <span className="uppercase tracking-widest">{progress.stage}</span>
            <span className="text-volt">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-panel2 border border-line overflow-hidden">
            <motion.div
              className="h-full bg-volt rounded-full"
              style={{ boxShadow: '0 0 18px rgba(200,255,61,0.7)' }}
              animate={{ width: `${pct}%` }}
              transition={{ ease: 'easeOut', duration: 0.3 }}
            />
          </div>
          <div className="flex items-center gap-2.5 mt-4 text-sm text-muted min-h-5">
            {progress.stage === 'done' ? (
              <BrainCircuit size={15} className="text-volt" />
            ) : (
              <Loader2 size={15} className="animate-spin text-volt" />
            )}
            <span className="font-mono text-xs sm:text-sm">{progress.message}</span>
          </div>
        </div>

        {/* pipeline explainer */}
        <div className="mt-8 grid grid-cols-3 gap-2 text-[10px] sm:text-[11px] font-mono">
          {[
            ['1 · SAMPLE', 'frame-by-frame decode'],
            ['2 · TRACK', '33 landmarks / frame'],
            ['3 · DETECT', 'rep split + fault rules'],
          ].map(([t, s]) => (
            <div key={t} className="rounded-xl border border-line bg-panel2 px-3 py-2.5">
              <div className="text-volt">{t}</div>
              <div className="text-faint mt-0.5 normal-case tracking-normal">{s}</div>
            </div>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="mt-8 flex items-center gap-2 text-muted hover:text-text text-sm border border-line hover:border-line2 rounded-xl px-4 py-2.5 transition-colors"
        >
          <XCircle size={16} />
          Cancel analysis
        </button>
      </motion.div>
    </div>
  );
}
