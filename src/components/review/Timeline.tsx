import { useCallback, useRef } from 'react';
import { DetectedError, RepSeg } from '../../lib/ai/types';
import { fmtTime } from '../../lib/utils';

interface Props {
  duration: number;
  now: number;
  reps: RepSeg[];
  errors: DetectedError[];
  activeId: string | null;
  onSeek: (t: number) => void;
  onSelectError: (e: DetectedError) => void;
}

export default function Timeline({ duration, now, reps, errors, activeId, onSeek, onSelectError }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el || duration <= 0) return;
      const r = el.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      onSeek(f * duration);
    },
    [duration, onSeek],
  );

  const playhead = duration > 0 ? (now / duration) * 100 : 0;

  return (
    <div className="select-none">
      {/* ruler */}
      <div
        ref={ref}
        className="relative h-14 rounded-xl border border-line bg-panel2 cursor-pointer overflow-hidden no-tap-highlight"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          seekFromEvent(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFromEvent(e.clientX);
        }}
      >
        {/* rep bands */}
        {reps.map((r, i) => {
          const l = (r.start / duration) * 100;
          const w = ((r.end - r.start) / duration) * 100;
          return (
            <div
              key={r.index}
              className={`absolute top-0 bottom-0 border-l border-line ${i % 2 === 0 ? 'bg-white/[0.025]' : ''}`}
              style={{ left: `${l}%`, width: `${w}%` }}
            >
              <span className="absolute top-1 left-1.5 text-[9px] font-mono text-faint">R{i + 1}</span>
            </div>
          );
        })}

        {/* error markers */}
        {errors.map((e) => {
          const x = (e.timestamp / duration) * 100;
          const active = e.id === activeId;
          return (
            <button
              key={e.id}
              title={`${fmtTime(e.timestamp)} — ${e.title}`}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                onSelectError(e);
              }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group z-10 p-1.5"
              style={{ left: `${x}%` }}
            >
              <div
                className={`w-3 h-3 rotate-45 border-2 transition-all ${
                  active
                    ? 'bg-err border-white scale-125 shadow-[0_0_16px_rgba(255,69,69,0.9)]'
                    : e.severity === 'high'
                      ? 'bg-err border-err group-hover:scale-125'
                      : e.severity === 'medium'
                        ? 'bg-amber border-amber group-hover:scale-125'
                        : 'bg-amber/60 border-amber/60 group-hover:scale-125'
                }`}
              />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap text-[9px] font-mono bg-black/90 border border-line rounded px-1.5 py-0.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {fmtTime(e.timestamp)} · R{e.rep ?? '–'}
              </div>
            </button>
          );
        })}

        {/* playhead */}
        <div className="absolute top-0 bottom-0 w-px bg-volt pointer-events-none z-20" style={{ left: `${playhead}%`, boxShadow: '0 0 10px rgba(200,255,61,0.8)' }}>
          <div className="absolute -top-0 -translate-x-1/2 w-2.5 h-2.5 bg-volt rounded-sm" />
        </div>
      </div>

      {/* ticks */}
      <div className="relative h-4 mt-1">
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} className="absolute -translate-x-1/2 text-[9px] font-mono text-faint" style={{ left: `${i * 10}%` }}>
            {fmtTime((duration * i) / 10)}
          </span>
        ))}
      </div>
    </div>
  );
}
