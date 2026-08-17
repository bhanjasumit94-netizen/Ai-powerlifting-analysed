import { useEffect, useRef } from 'react';
import { BarKinematics, DetectedError, ExerciseType, FramePose, Lm, LM } from '../../lib/ai/types';

const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [28, 30], [30, 32],
];

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  frames: FramePose[];
  /** currently displayed time — read from a ref for zero-rerender drawing */
  timeRef: React.RefObject<number>;
  /** active (paused-on) error */
  activeError: DetectedError | null;
  exercise: ExerciseType;
  showSkeleton: boolean;
  showBarPath: boolean;
  bar: BarKinematics;
}

/** binary search: neighbors around time t among tracked frames */
function neighbors(frames: FramePose[], t: number): [FramePose | null, FramePose | null, number] {
  let lo = 0, hi = frames.length - 1, idx = 0;
  while (lo <= hi) {
    const midI = (lo + hi) >> 1;
    if (frames[midI].t < t) {
      idx = midI;
      lo = midI + 1;
    } else hi = midI - 1;
  }
  // find nearest ok frames before/after idx
  let a: FramePose | null = null;
  let b: FramePose | null = null;
  for (let i = idx; i >= 0; i--) {
    if (frames[i].ok && frames[i].img) {
      a = frames[i];
      break;
    }
  }
  for (let i = idx + 1; i < frames.length; i++) {
    if (frames[i].ok && frames[i].img) {
      b = frames[i];
      break;
    }
  }
  if (!a && !b) return [null, null, 0];
  if (!a) return [b, b, 0];
  if (!b) return [a, a, 0];
  if (a === b) return [a, b, 0];
  const span = b.t - a.t;
  if (span > 0.3) return [Math.abs(t - a.t) <= Math.abs(t - b.t) ? a : b, null, 0];
  const alpha = span > 1e-6 ? (t - a.t) / span : 0;
  return [a, b, Math.max(0, Math.min(1, alpha))];
}

function lerpLm(a: Lm[], b: Lm[] | null, al: number): Lm[] {
  if (!b) return a;
  return a.map((p, i) => ({
    x: p.x + (b[i].x - p.x) * al,
    y: p.y + (b[i].y - p.y) * al,
    z: p.z + (b[i].z - p.z) * al,
    visibility: Math.min(p.visibility, b[i].visibility),
  }));
}

export default function OverlayCanvas({ videoRef, frames, timeRef, activeError, exercise, showSkeleton, showBarPath, bar }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(activeError);
  const framesRef = useRef(frames);
  const skelRef = useRef(showSkeleton);
  const barPathRef = useRef(showBarPath);
  const barRef = useRef(bar);
  const exRef = useRef(exercise);
  activeRef.current = activeError;
  framesRef.current = frames;
  skelRef.current = showSkeleton;
  barPathRef.current = showBarPath;
  barRef.current = bar;
  exRef.current = exercise;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let cw = 0, ch = 0, dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      cw = r.width;
      ch = r.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(cw * dpr));
      canvas.height = Math.max(1, Math.round(ch * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const video = videoRef.current;
      if (!video) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      const scale = Math.min(cw / vw, ch / vh);
      const ox = (cw - vw * scale) / 2;
      const oy = (ch - vh * scale) / 2;
      const P = (lm: Lm) => ({ x: ox + lm.x * vw * scale, y: oy + lm.y * vh * scale });

      const t = timeRef.current ?? video.currentTime;
      const [a, b, al] = neighbors(framesRef.current, t);
      const lms = a?.img ? lerpLm(a.img, b?.img ?? null, al) : null;
      const active = activeRef.current;
      const now = performance.now();
      const pulse = 0.62 + 0.38 * Math.sin(now / 170);

      /* ---- bar path trail + live bar marker ---- */
      const bk = barRef.current;
      if (bk && bk.points.length && (barPathRef.current || true)) {
        const pts = bk.points;
        // find playhead index
        let pi = 0;
        while (pi < pts.length - 1 && pts[pi].t < t) pi++;
        if (barPathRef.current) {
          // trail: past 2.5s of tracked bar path
          ctx.save();
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          const tFrom = t - 2.5;
          let started = false;
          ctx.beginPath();
          for (let i = 0; i <= pi; i++) {
            const p = pts[i];
            if (p.t < tFrom || !isFinite(p.x)) continue;
            const X = ox + p.x * vw * scale;
            const Y = oy + p.y * vh * scale;
            if (!started) {
              ctx.moveTo(X, Y);
              started = true;
            } else ctx.lineTo(X, Y);
          }
          ctx.strokeStyle = 'rgba(96,165,250,0.85)';
          ctx.shadowColor = 'rgba(96,165,250,0.8)';
          ctx.shadowBlur = 6;
          ctx.stroke();
          ctx.restore();
        }
        // current bar crosshair
        const p = pts[Math.min(pi, pts.length - 1)];
        if (p && isFinite(p.x) && Math.abs(p.t - t) < 0.35) {
          const X = ox + p.x * vw * scale;
          const Y = oy + p.y * vh * scale;
          ctx.save();
          ctx.strokeStyle = 'rgba(96,165,250,0.95)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(X, Y, 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(X - 16, Y);
          ctx.lineTo(X - 4, Y);
          ctx.moveTo(X + 4, Y);
          ctx.lineTo(X + 16, Y);
          ctx.moveTo(X, Y - 16);
          ctx.lineTo(X, Y - 4);
          ctx.moveTo(X, Y + 4);
          ctx.lineTo(X, Y + 16);
          ctx.stroke();
          // velocity arrow (scaled)
          const vi = Math.min(pi, bk.vx.length - 1);
          const vx = bk.vx[vi], vy = bk.vy[vi];
          if (isFinite(vx) && isFinite(vy) && Math.hypot(vx, vy) > 0.03) {
            ctx.strokeStyle = 'rgba(147,197,253,0.9)';
            ctx.beginPath();
            ctx.moveTo(X, Y);
            ctx.lineTo(X + vx * 60 * vw * scale * 0.5, Y + vy * 60 * vh * scale * 0.5);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      /* ---- skeleton ---- */
      if (lms && skelRef.current) {
        ctx.lineCap = 'round';
        for (const [i, j] of BONES) {
          const p = lms[i], q = lms[j];
          if (p.visibility < 0.3 || q.visibility < 0.3) continue;
          const A = P(p), B = P(q);
          ctx.strokeStyle = 'rgba(200,255,61,0.55)';
          ctx.lineWidth = 2.25;
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(B.x, B.y);
          ctx.stroke();
        }
        for (const j of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
          const p = lms[j];
          if (p.visibility < 0.3) continue;
          const A = P(p);
          ctx.fillStyle = 'rgba(200,255,61,0.9)';
          ctx.beginPath();
          ctx.arc(A.x, A.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* ---- error highlight ---- */
      if (lms && active) {
        const near = Math.abs(t - active.timestamp) < 0.9;
        const paused = video.paused;
        if (paused || near) {
          const red = `rgba(255,69,69,`;
          const zone = active.zone;
          const em = (i: number) => lms[i];
          const midPt = (i: number, j: number) => {
            const A = P(em(i)), B = P(em(j));
            return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
          };
          const glowLine = (A: { x: number; y: number }, B: { x: number; y: number }, w = 7) => {
            ctx.save();
            ctx.strokeStyle = red + `${0.85 * pulse})`;
            ctx.lineWidth = w;
            ctx.shadowColor = red + '0.9)';
            ctx.shadowBlur = 18;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
            ctx.stroke();
            ctx.restore();
          };
          const glowCircle = (C: { x: number; y: number }, r: number, fill = true) => {
            ctx.save();
            ctx.strokeStyle = red + `${0.95 * pulse})`;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = red + '0.9)';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(C.x, C.y, r, 0, Math.PI * 2);
            if (fill) {
              ctx.fillStyle = red + `${0.13 * pulse})`;
              ctx.fill();
            }
            ctx.stroke();
            ctx.restore();
          };
          const R = Math.min(cw, ch) * 0.085;

          if (zone === 'torso') {
            // translucent torso quad + glowing spine line
            const pts = [11, 12, 24, 23].filter((i) => em(i).visibility > 0.25).map((i) => P(em(i)));
            if (pts.length === 4) {
              ctx.save();
              ctx.fillStyle = red + `${0.16 * pulse})`;
              ctx.strokeStyle = red + `${0.8 * pulse})`;
              ctx.lineWidth = 2;
              ctx.shadowColor = red + '0.9)';
              ctx.shadowBlur = 16;
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
              ctx.restore();
              glowLine(midPt(11, 12), midPt(23, 24), 6);
            }
          } else if (zone === 'hips') {
            if (em(23).visibility > 0.25 && em(24).visibility > 0.25) glowLine(P(em(23)), P(em(24)), 6);
            glowCircle(midPt(23, 24), R);
          } else if (zone === 'knees') {
            [25, 26].forEach((i) => {
              if (em(i).visibility > 0.25) glowCircle(P(em(i)), R * 0.8);
            });
            if (em(25).visibility > 0.25 && em(26).visibility > 0.25) glowLine(P(em(25)), P(em(26)), 4);
          } else if (zone === 'elbows') {
            [13, 14].forEach((i) => {
              if (em(i).visibility > 0.25) glowCircle(P(em(i)), R * 0.7);
            });
            [[11, 13], [13, 15], [12, 14], [14, 16]].forEach(([i, j]) => {
              if (em(i).visibility > 0.25 && em(j).visibility > 0.25) glowLine(P(em(i)), P(em(j)), 3.5);
            });
          } else if (zone === 'bar') {
            // squat → bar on shoulders; bench/deadlift → bar in hands
            const [i, j] = exRef.current === 'squat' ? [11, 12] : [15, 16];
            if (em(i).visibility > 0.2 && em(j).visibility > 0.2) {
              glowLine(P(em(i)), P(em(j)), 8);
              glowCircle(midPt(i, j), R * 0.9, false);
            } else if (em(i).visibility > 0.2) {
              glowCircle(P(em(i)), R * 0.9);
            }
          } else {
            // full body bounding box
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            lms.forEach((p) => {
              if (p.visibility < 0.3) return;
              const A = P(p);
              minX = Math.min(minX, A.x);
              minY = Math.min(minY, A.y);
              maxX = Math.max(maxX, A.x);
              maxY = Math.max(maxY, A.y);
            });
            if (isFinite(minX)) {
              ctx.save();
              ctx.setLineDash([7, 6]);
              ctx.strokeStyle = red + `${0.85 * pulse})`;
              ctx.lineWidth = 2;
              ctx.shadowColor = red + '0.9)';
              ctx.shadowBlur = 14;
              const pad = 10;
              ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
              ctx.restore();
            }
          }
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [videoRef, timeRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
