import { CircleAlert, CircleCheck, Gavel, MessageSquareText } from 'lucide-react';
import { DetectedError } from '../../lib/ai/types';
import { fmtTime } from '../../lib/utils';

interface Props {
  errors: DetectedError[];
  activeId: string | null;
  onSelect: (e: DetectedError) => void;
}

function Row({ e, i, active, onSelect }: { e: DetectedError; i: number; active: boolean; onSelect: (e: DetectedError) => void }) {
  const isIpf = e.category === 'ipf';
  return (
    <button
      onClick={() => onSelect(e)}
      className={`w-full text-left px-4 py-3 transition-colors flex gap-3 items-start ${
        active ? (isIpf ? 'bg-err/10 border-l-2 border-err' : 'bg-amber/10 border-l-2 border-amber') : 'hover:bg-panel2 border-l-2 border-transparent'
      }`}
    >
      <CircleAlert size={15} className={`mt-0.5 shrink-0 ${isIpf ? 'text-err' : active ? 'text-amber' : 'text-amber/80'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-mono text-[10px] text-faint">
          <span className={active ? (isIpf ? 'text-err' : 'text-amber') : ''}>#{i + 1}</span>
          <span className="tabular-nums">{fmtTime(e.timestamp)}</span>
          {e.rep !== null && <span>REP {e.rep}</span>}
          <span className="ml-auto">{Math.round(e.confidence * 100)}%</span>
        </div>
        <div className={`text-sm mt-0.5 leading-snug ${active ? 'text-text font-medium' : 'text-muted'}`}>{e.title}</div>
      </div>
    </button>
  );
}

export default function ErrorList({ errors, activeId, onSelect }: Props) {
  const ipf = errors.filter((e) => e.category === 'ipf');
  const coaching = errors.filter((e) => e.category === 'coaching');

  return (
    <div className="rounded-2xl border border-line bg-panel overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <span className="text-[11px] font-mono tracking-[0.22em] text-faint">DETECTED ISSUES</span>
        <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${errors.length ? 'bg-err/15 text-err' : 'bg-volt/10 text-volt'}`}>
          {errors.length}
        </span>
      </div>

      {errors.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <CircleCheck size={26} className="text-volt mx-auto" />
          <div className="font-display font-semibold mt-3">No rule risks or technique errors detected</div>
          <p className="text-muted text-sm mt-1.5 leading-relaxed">
            Every check that could run on this footage came back clean. Nice lifting.
          </p>
        </div>
      ) : (
        <div className="max-h-[46vh] lg:max-h-[380px] overflow-y-auto">
          <div className="sticky top-0 z-10 px-4 py-2 bg-[#160c0e] border-b border-err/25 flex items-center gap-2">
            <Gavel size={12} className="text-err" />
            <span className="text-[10px] font-mono tracking-[0.18em] text-err">IPF RULE RISKS</span>
            <span className="ml-auto text-[10px] font-mono text-err/80">{ipf.length}</span>
          </div>
          <div className="divide-y divide-line/60">
            {ipf.length === 0 && <div className="px-4 py-3 text-[12px] text-faint">No competition-rule risks detected in this footage.</div>}
            {ipf.map((e) => (
              <Row key={e.id} e={e} i={errors.indexOf(e)} active={e.id === activeId} onSelect={onSelect} />
            ))}
          </div>
          <div className="sticky z-10 px-4 py-2 bg-[#171307] border-y border-amber/25 flex items-center gap-2" style={{ top: 0 }}>
            <MessageSquareText size={12} className="text-amber" />
            <span className="text-[10px] font-mono tracking-[0.18em] text-amber">COACHING OBSERVATIONS</span>
            <span className="ml-auto text-[10px] font-mono text-amber/80">{coaching.length}</span>
          </div>
          <div className="divide-y divide-line/60">
            {coaching.length === 0 && <div className="px-4 py-3 text-[12px] text-faint">No coaching observations for this set.</div>}
            {coaching.map((e) => (
              <Row key={e.id} e={e} i={errors.indexOf(e)} active={e.id === activeId} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
