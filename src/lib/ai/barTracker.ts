/**
 * Real barbell tracker: template matching (normalized cross-correlation) on the
 * analysis canvas, seeded from pose-estimated bar points (wrists for
 * bench/deadlift, shoulders for squat) and fused back to those when the visual
 * match degrades (occlusion, rack pass-through). All coordinates are normalized
 * image space [0..1] so they map 1:1 onto the displayed video.
 */

export interface BarSample {
  t: number;
  x: number; // NaN when not tracked
  y: number;
  confident: boolean;
}

const TW = 15; // template half-size (px at surface scale)
const SEARCH = 46; // search window half-size
const MIN_CORR = 0.42;

export class BarTracker {
  private w = 0;
  private h = 0;
  private tmpl: Float32Array | null = null;
  private tmplMean = 0;
  private tmplSd = 1;
  private gray: Float32Array | null = null;
  private px: Uint8ClampedArray | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private lastNX = NaN;
  private lastNY = NaN;
  private seeded = false;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.w = canvas.width;
    this.h = canvas.height;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.gray = new Float32Array(this.w * this.h);
    this.tmpl = null;
    this.seeded = false;
    this.lastNX = NaN;
    this.lastNY = NaN;
  }

  release(): void {
    this.canvas = null;
    this.ctx = null;
    this.gray = null;
    this.px = null;
    this.tmpl = null;
  }

  private readGray(): void {
    if (!this.ctx || !this.canvas || !this.gray) return;
    const data = this.ctx.getImageData(0, 0, this.w, this.h).data;
    this.px = data;
    const g = this.gray;
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      g[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
  }

  /** capture template patch around image-normalized position */
  private seedAt(nx: number, ny: number): void {
    if (!this.gray) return;
    const cx = Math.round(nx * this.w);
    const cy = Math.round(ny * this.h);
    if (cx - TW < 0 || cy - TW < 0 || cx + TW >= this.w || cy + TW >= this.h) return;
    const t = new Float32Array((2 * TW + 1) * (2 * TW + 1));
    let k = 0;
    let s = 0;
    let s2 = 0;
    for (let y = cy - TW; y <= cy + TW; y++) {
      for (let x = cx - TW; x <= cx + TW; x++) {
        const v = this.gray[y * this.w + x];
        t[k++] = v;
        s += v;
        s2 += v * v;
      }
    }
    const n = t.length;
    this.tmplMean = s / n;
    this.tmplSd = Math.sqrt(Math.max(1e-6, s2 / n - this.tmplMean * this.tmplMean));
    if (this.tmplSd < 6) return; // flat patch carries no texture — useless template
    this.tmpl = t;
    this.seeded = true;
  }

  /** NCC best match within search window; returns normalized coords + corr */
  private match(hx: number, hy: number): { nx: number; ny: number; corr: number } | null {
    if (!this.gray || !this.tmpl) return null;
    const t = this.tmpl;
    const n = t.length;
    const cx = Math.round(hx * this.w);
    const cy = Math.round(hy * this.h);
    let bestCorr = -1;
    let bx = cx;
    let by = cy;
    const x0 = Math.max(cx - SEARCH, TW);
    const x1 = Math.min(cx + SEARCH, this.w - TW - 1);
    const y0 = Math.max(cy - SEARCH, TW);
    const y1 = Math.min(cy + SEARCH, this.h - TW - 1);
    if (x1 <= x0 || y1 <= y0) return null;
    for (let oy = y0; oy <= y1; oy += 2) {
      for (let ox = x0; ox <= x1; ox += 2) {
        let k = 0;
        let s = 0;
        let s2 = 0;
        let dot = 0;
        for (let dy = -TW; dy <= TW; dy++) {
          const row = (oy + dy) * this.w + ox;
          let idx = row - TW;
          for (let dx = -TW; dx <= TW; dx++, idx++) {
            const v = this.gray[idx];
            s += v;
            s2 += v * v;
            dot += v * t[k++];
          }
        }
        const m = s / n;
        const varr = s2 / n - m * m;
        if (varr < 1e-6) continue;
        const corr = (dot / n - m * this.tmplMean) / (Math.sqrt(varr) * this.tmplSd);
        if (corr > bestCorr) {
          bestCorr = corr;
          bx = ox;
          by = oy;
        }
      }
    }
    return { nx: bx / this.w, ny: by / this.h, corr: bestCorr };
  }

  /**
   * Track the bar at time t given a pose-derived hint (normalized coords, may
   * be NaN). Returns the fused position estimate.
   */
  track(t: number, hintX: number, hintY: number): BarSample {
    this.readGray();
    const hasHint = isFinite(hintX) && isFinite(hintY);

    if (!this.seeded) {
      if (hasHint) {
        this.seedAt(hintX, hintY);
        if (this.seeded) {
          this.lastNX = hintX;
          this.lastNY = hintY;
        }
      }
      return { t, x: NaN, y: NaN, confident: false };
    }

    const hx = hasHint ? hintX : this.lastNX;
    const hy = hasHint ? hintY : this.lastNY;
    if (!isFinite(hx) || !isFinite(hy)) return { t, x: NaN, y: NaN, confident: false };

    const m = this.match(hx, hy);
    if (m && m.corr >= MIN_CORR) {
      // reject physically impossible teleports vs hint
      if (hasHint && Math.hypot(m.nx - hintX, m.ny - hintY) > 0.12) {
        this.lastNX = hintX;
        this.lastNY = hintY;
        return { t, x: hintX, y: hintY, confident: false };
      }
      // adaptive template refresh keeps tracker locked across lighting shifts
      if (m.corr > 0.6 && Math.random() < 1) this.seedAt(m.nx, m.ny);
      this.lastNX = m.nx;
      this.lastNY = m.ny;
      return { t, x: m.nx, y: m.ny, confident: m.corr >= 0.5 };
    }
    if (hasHint) {
      this.lastNX = hintX;
      this.lastNY = hintY;
      return { t, x: hintX, y: hintY, confident: false };
    }
    return { t, x: this.lastNX, y: this.lastNY, confident: false };
  }
}

/** velocity series (normalized units per second) from a sampled bar track */
export function barKinematics(samples: BarSample[]): { vx: number[]; vy: number[]; speed: number[] } {
  const n = samples.length;
  const vx = new Array<number>(n).fill(NaN);
  const vy = new Array<number>(n).fill(NaN);
  const speed = new Array<number>(n).fill(NaN);
  for (let i = 1; i < n - 1; i++) {
    const a = samples[i - 1];
    const b = samples[i + 1];
    if (!isFinite(a.x) || !isFinite(b.x)) continue;
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    vx[i] = (b.x - a.x) / dt;
    vy[i] = (b.y - a.y) / dt;
    speed[i] = Math.hypot(vx[i], vy[i]);
  }
  // fill ends
  if (n > 1 && isFinite(vx[1])) {
    vx[0] = vx[1];
    vy[0] = vy[1];
    speed[0] = speed[1];
  }
  if (n > 1 && isFinite(vx[n - 2])) {
    vx[n - 1] = vx[n - 2];
    vy[n - 1] = vy[n - 2];
    speed[n - 1] = speed[n - 2];
  }
  return { vx, vy, speed };
}
