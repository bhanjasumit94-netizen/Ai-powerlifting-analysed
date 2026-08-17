import { useState } from 'react';
import { ChevronDown, Dumbbell, Lock, ShieldCheck } from 'lucide-react';
import { Role } from '../lib/training/store';
import { DB } from '../lib/training/store';
import { Logo } from './Home';

interface Props {
  db: DB;
  onEnter: (role: Role, athleteId: string | null) => void;
}

/**
 * Demo authentication gate. Roles and data live in this browser only —
 * in production this is where SSO/federated sign-in would plug in.
 */
export default function AuthGate({ db, onEnter }: Props) {
  const [athleteId, setAthleteId] = useState<string>('sample-athlete');

  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-5 relative overflow-hidden">
      <img src="/img/hero.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-15" />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/60 via-bg/85 to-bg" />
      <div className="relative w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo size={40} />
        </div>
        <div className="rounded-3xl border border-line bg-panel/95 backdrop-blur p-7 sm:p-9">
          <div className="text-[11px] font-mono tracking-[0.25em] text-volt flex items-center gap-2">
            <Lock size={12} />
            SECURE SIGN IN
          </div>
          <h1 className="font-display font-bold text-2xl tracking-tight mt-3">Choose your role</h1>
          <p className="text-muted text-sm mt-1.5">
            Athlete data and videos are private to the athlete and their coach.
          </p>

          <button
            onClick={() => onEnter('coach', null)}
            className="mt-6 w-full rounded-2xl border border-volt/40 bg-volt/[0.07] hover:bg-volt/[0.12] transition-colors p-4 text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-volt/15 border border-volt/40 flex items-center justify-center">
                <ShieldCheck size={18} className="text-volt" />
              </div>
              <div className="flex-1">
                <div className="font-display font-bold">Coach / Admin</div>
                <div className="text-muted text-xs mt-0.5">Full roster access · approves every AI recommendation</div>
              </div>
            </div>
          </button>

          <div className="mt-3 rounded-2xl border border-line bg-panel2 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-panel border border-line flex items-center justify-center">
                <Dumbbell size={18} className="text-muted" />
              </div>
              <div className="flex-1">
                <div className="font-display font-bold">Athlete</div>
                <div className="text-muted text-xs mt-0.5">Private log, own analyses, coach-approved plans</div>
              </div>
            </div>
            <div className="relative mt-3">
              <select
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
                className="w-full appearance-none bg-panel border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-volt/60"
              >
                {db.athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                {db.athletes.length === 0 && <option value="">No athletes — coach must create one first</option>}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            </div>
            <button
              disabled={!athleteId}
              onClick={() => onEnter('athlete', athleteId)}
              className="mt-3 w-full bg-text text-bg font-display font-bold text-sm py-2.5 rounded-xl hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ENTER AS ATHLETE
            </button>
          </div>
        </div>
        <p className="text-center text-[11px] font-mono text-faint mt-5">
          DEMO SECURITY — roles & data persist in this browser only. Real deployments would wire SSO + encrypted storage here.
        </p>
      </div>
    </div>
  );
}
