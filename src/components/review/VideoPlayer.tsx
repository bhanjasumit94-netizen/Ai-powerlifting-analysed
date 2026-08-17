import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronFirst,
  ChevronLast,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
  Pause,
  Play,
  Radar,
  Route,
} from 'lucide-react';
import { BarKinematics, DetectedError, ExerciseType, FramePose, RepSeg } from '../../lib/ai/types';
import { fmtTime } from '../../lib/utils';
import OverlayCanvas from './OverlayCanvas';
import Timeline from './Timeline';

const FRAME = 1 / 30;

export interface PlayerHandle {
  jumpToError: (e: DetectedError) => void;
  replayError: (e: DetectedError) => void;
  nextError: () => void;
  prevError: () => void;
  resume: () => void;
}

interface Props {
  src: string;
  frames: FramePose[];
  reps: RepSeg[];
  errors: DetectedError[];
  exercise: ExerciseType;
  bar: BarKinematics;
  activeError: DetectedError | null;
  onActiveError: (e: DetectedError | null) => void;
  onDuration: (d: number) => void;
  handleRef: React.MutableRefObject<PlayerHandle | null>;
}

export default function VideoPlayer({
  src,
  frames,
  reps,
  errors,
  exercise,
  bar,
  activeError,
  onActiveError,
  onDuration,
  handleRef,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(0);
  const prevTimeRef = useRef(0);
  const [now, setNow] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [reviewMode, setReviewMode] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showBarPath, setShowBarPath] = useState(true);
  const consumedRef = useRef<Set<string>>(new Set());
  const replayUntilRef = useRef<number | null>(null);
  const reviewRef = useRef(reviewMode);
  const errorsRef = useRef(errors);
  reviewRef.current = reviewMode;
  errorsRef.current = errors;

  const sorted = [...errors].sort((a, b) => a.timestamp - b.timestamp);

  /* ---------- core error watcher: pause exactly at the error timestamp ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stop = false;
    let handle: number | undefined;

    const tick = () => {
      if (stop) return;
      const t = video.currentTime;
      timeRef.current = t;
      setNow(t);

      if (!video.paused && reviewRef.current && replayUntilRef.current === null) {
        const prev = prevTimeRef.current;
        if (t >= prev - 0.25 && t - prev < 0.6) {
          const hit = errorsRef.current.find(
            (e) => !consumedRef.current.has(e.id) && e.timestamp > prev + 0.0005 && e.timestamp <= t,
          );
          if (hit) {
            video.pause();
            video.currentTime = hit.timestamp; // freeze on the EXACT timestamp
            timeRef.current = hit.timestamp;
            setNow(hit.timestamp);
            consumedRef.current.add(hit.id);
            onActiveError(hit);
          }
        }
      }

      // replay window end → pause right after the error moment
      if (replayUntilRef.current !== null && t >= replayUntilRef.current) {
        video.pause();
        replayUntilRef.current = null;
        video.playbackRate = 1;
        setRate(1);
      }

      prevTimeRef.current = timeRef.current;
      if (!stop && 'requestVideoFrameCallback' in video) {
        (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(tick);
      }
    };

    const fallback = window.setInterval(() => {
      if (!('requestVideoFrameCallback' in video)) tick();
    }, 40);

    if ('requestVideoFrameCallback' in video) {
      (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(tick);
    } else {
      // interval drives it
    }
    return () => {
      stop = true;
      window.clearInterval(fallback);
      if (handle !== undefined) cancelAnimationFrame(handle);
    };
  }, [onActiveError]);

  /* ---------- transport ---------- */
  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    void v.play();
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const nt = Math.min(Math.max(0, t), (v.duration || t) - 0.01);
    consumedRef.current.clear();
    replayUntilRef.current = null;
    v.currentTime = nt;
    timeRef.current = nt;
    prevTimeRef.current = nt;
    setNow(nt);
  }, []);

  const chooseRate = (r: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = r;
    setRate(r);
  };

  const jumpToError = useCallback(
    (e: DetectedError) => {
      const v = videoRef.current;
      if (!v) return;
      v.pause();
      v.playbackRate = 1;
      setRate(1);
      replayUntilRef.current = null;
      consumedRef.current.clear();
      consumedRef.current.add(e.id);
      v.currentTime = e.timestamp;
      timeRef.current = e.timestamp;
      prevTimeRef.current = e.timestamp;
      setNow(e.timestamp);
      onActiveError(e);
    },
    [onActiveError],
  );

  const replayError = useCallback(
    (e: DetectedError) => {
      const v = videoRef.current;
      if (!v) return;
      const from = Math.max(0, e.timestamp - 1.0);
      replayUntilRef.current = Math.min(v.duration || e.timestamp + 0.75, e.timestamp + 0.75);
      consumedRef.current.clear();
      v.playbackRate = 0.5;
      setRate(0.5);
      v.currentTime = from;
      timeRef.current = from;
      prevTimeRef.current = from;
      setNow(from);
      onActiveError(e);
      void v.play();
    },
    [onActiveError],
  );

  const nextError = useCallback(() => {
    const list = [...errorsRef.current].sort((a, b) => a.timestamp - b.timestamp);
    const cur = timeRef.current;
    const nxt = list.find((e) => e.timestamp > cur + 0.05);
    if (nxt) jumpToError(nxt);
  }, [jumpToError]);

  const prevError = useCallback(() => {
    const list = [...errorsRef.current].sort((a, b) => a.timestamp - b.timestamp);
    const cur = timeRef.current;
    const prv = [...list].reverse().find((e) => e.timestamp < cur - 0.25);
    if (prv) jumpToError(prv);
  }, [jumpToError]);

  const stepFrame = useCallback(
    (dir: 1 | -1) => {
      const v = videoRef.current;
      if (!v) return;
      v.pause();
      seek(v.currentTime + dir * FRAME);
      onActiveError(null);
    },
    [seek, onActiveError],
  );

  // expose imperative handle for the error card / sidebar
  useEffect(() => {
    handleRef.current = {
      jumpToError,
      replayError,
      nextError,
      prevError,
      resume: play,
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, jumpToError, replayError, nextError, prevError, play]);

  /* ---------- keyboard shortcuts ---------- */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        toggle();
      } else if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        stepFrame(1);
      } else if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        stepFrame(-1);
      } else if (ev.key === 'n' || ev.key === 'N') nextError();
      else if (ev.key === 'p' || ev.key === 'P') prevError();
      else if (ev.key === 'a' || ev.key === 'A') setReviewMode((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, stepFrame, nextError, prevError]);

  /* ---------- derived ---------- */
  const currentRep = reps.findIndex((r) => now >= r.start - 0.15 && now <= r.end + 0.15);
  const hasActive = !!activeError;

  return (
    <div className="rounded-2xl border border-line bg-black overflow-hidden">
      {/* video stage */}
      <div ref={wrapRef} className="relative w-full aspect-video video-frame">
        <video
          ref={videoRef}
          src={src}
          className="absolute inset-0 w-full h-full object-contain"
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (isFinite(d)) {
              setDuration(d);
              onDuration(d);
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onClick={toggle}
        />
        <OverlayCanvas
          videoRef={videoRef}
          frames={frames}
          timeRef={timeRef}
          activeError={activeError}
          exercise={exercise}
          showSkeleton={showSkeleton}
          showBarPath={showBarPath}
          bar={bar}
        />

        {/* rep badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
          <span className="font-mono text-[11px] px-2.5 py-1.5 rounded-lg bg-black/70 border border-volt/40 text-volt backdrop-blur-sm">
            {currentRep >= 0 ? `REP ${currentRep + 1} / ${reps.length}` : `REPS ${reps.length}`}
          </span>
        </div>

        <div className="absolute top-3 right-3 flex items-center gap-2">
          <button
            onClick={() => setShowBarPath((v) => !v)}
            title="Toggle tracked bar path"
            className={`font-mono text-[10px] px-2.5 py-1.5 rounded-lg backdrop-blur-sm border transition-colors flex items-center gap-1.5 ${
              showBarPath ? 'bg-black/70 border-blue-400/50 text-blue-300' : 'bg-black/70 border-line text-muted'
            }`}
          >
            <Route size={12} />
            BAR PATH
          </button>
          <button
            onClick={() => setShowSkeleton((v) => !v)}
            title="Toggle AI pose overlay"
            className={`font-mono text-[10px] px-2.5 py-1.5 rounded-lg backdrop-blur-sm border transition-colors flex items-center gap-1.5 ${
              showSkeleton ? 'bg-black/70 border-volt/40 text-volt' : 'bg-black/70 border-line text-muted'
            }`}
          >
            {showSkeleton ? <Eye size={12} /> : <EyeOff size={12} />}
            AI OVERLAY
          </button>
          <span className={`font-mono text-[10px] px-2.5 py-1.5 rounded-lg backdrop-blur-sm border ${reviewMode ? 'bg-black/70 border-volt/40 text-volt' : 'bg-black/70 border-line text-muted'}`}>
            {reviewMode ? 'AI REVIEW ON' : 'FREE SCRUB'}
          </span>
        </div>

        {/* paused-on-error ribbon */}
        {hasActive && !playing && (
          <div className="absolute bottom-3 left-3 pointer-events-none">
            <div className="font-mono text-[10px] tracking-[0.2em] px-2.5 py-1.5 rounded-lg bg-err/90 text-white backdrop-blur-sm flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse-glow" />
              PAUSED AT ERROR · {fmtTime(activeError.timestamp)}
            </div>
          </div>
        )}
      </div>

      {/* transport */}
      <div className="border-t border-line bg-panel px-3 sm:px-4 py-2.5 flex items-center gap-1 sm:gap-1.5 flex-wrap">
        <button onClick={prevError} title="Previous error (P)" className="ctl-btn">
          <ChevronFirst size={17} />
        </button>
        <button onClick={() => stepFrame(-1)} title="Frame back (←) — 1/30s" className="ctl-btn">
          <ChevronsLeft size={17} />
        </button>
        <button
          onClick={toggle}
          title="Play / Pause (Space)"
          className="w-10 h-10 rounded-xl bg-volt text-black flex items-center justify-center hover:bg-volt-dim transition-colors mx-0.5"
        >
          {playing ? <Pause size={18} strokeWidth={2.5} /> : <Play size={18} strokeWidth={2.5} className="ml-0.5" />}
        </button>
        <button onClick={() => stepFrame(1)} title="Frame forward (→) — 1/30s" className="ctl-btn">
          <ChevronsRight size={17} />
        </button>
        <button onClick={nextError} title="Next error (N)" className="ctl-btn">
          <ChevronLast size={17} />
        </button>

        <div className="h-6 w-px bg-line mx-1.5 hidden sm:block" />

        {/* slow motion */}
        <div className="flex items-center rounded-lg border border-line overflow-hidden">
          {[1, 0.5, 0.25].map((r) => (
            <button
              key={r}
              onClick={() => chooseRate(r)}
              className={`px-2.5 sm:px-3 py-1.5 font-mono text-[11px] transition-colors ${
                rate === r ? 'bg-volt text-black font-bold' : 'text-muted hover:text-text'
              }`}
            >
              {r}×
            </button>
          ))}
        </div>

        <div className="font-mono text-[12px] text-muted tabular-nums ml-2">
          <span className="text-text">{fmtTime(now)}</span>
          <span className="text-faint"> / {fmtTime(duration)}</span>
        </div>

        <div className="flex-1" />

        {/* AI review toggle */}
        <button
          onClick={() => setReviewMode((v) => !v)}
          title="Auto-pause at detected errors (A)"
          className={`flex items-center gap-1.5 font-mono text-[10px] px-3 py-2 rounded-lg border transition-colors ${
            reviewMode ? 'border-volt/50 bg-volt/10 text-volt' : 'border-line text-muted hover:text-text'
          }`}
        >
          <Radar size={13} className={reviewMode ? 'animate-pulse' : ''} />
          AI REVIEW
        </button>
      </div>

      {/* timeline */}
      <div className="px-3 sm:px-4 pb-3 bg-panel">
        <Timeline
          duration={duration}
          now={now}
          reps={reps}
          errors={errors}
          activeId={activeError?.id ?? null}
          onSeek={(t) => {
            seek(t);
            onActiveError(null);
          }}
          onSelectError={jumpToError}
        />
      </div>

      <style>{`
        .ctl-btn {
          width: 2.25rem; height: 2.25rem; border-radius: 0.65rem;
          border: 1px solid var(--color-line); color: var(--color-muted);
          display: flex; align-items: center; justify-content: center;
          transition: all .15s ease;
        }
        .ctl-btn:hover { color: var(--color-text); border-color: var(--color-line); background: var(--color-panel2); }
      `}</style>
    </div>
  );
}
