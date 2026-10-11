import type { OverlayLayers } from '../../store/settingsStore';
import { gestureEmoji, gestureLabel } from '../gestures/catalog';
import { HAND_CONNECTIONS, POSE_CONNECTIONS } from './mediapipe';
import type { FrameAnalysis, HandObservation, PoseObservation } from './types';

export const TRACK_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#fbbf24', '#60a5fa', '#fb923c', '#2dd4bf'];
export const trackColor = (id: number) => TRACK_COLORS[id % TRACK_COLORS.length];

const FACE_COLOR = '#fbbf24';
const HAND_COLOR = '#f472b6';
const POSE_COLOR = '#34d399';

export interface OverlayInput {
  width: number;
  height: number;
  mirror: boolean;
  layers: OverlayLayers;
  hands: HandObservation[];
  pose: PoseObservation | null;
  analysis: FrameAnalysis | null;
  /** Milliseconds since the analysis arrived; old results fade out. */
  analysisAge: number;
}

export function drawOverlay(ctx: CanvasRenderingContext2D, input: OverlayInput) {
  const { width: w, height: h, mirror, layers } = input;
  ctx.clearRect(0, 0, w, h);
  const X = (x: number) => (mirror ? 1 - x : x) * w;
  const Y = (y: number) => y * h;
  const scale = Math.max(0.75, Math.min(w, h) / 540);

  const a = input.analysis;
  const fade = a ? Math.max(0, 1 - Math.max(0, input.analysisAge - 600) / 900) : 0;

  if (a && fade > 0) {
    ctx.globalAlpha = fade;
    if (layers.trails) {
      for (const p of a.persons) {
        if (p.trail.length < 2) continue;
        const color = trackColor(p.track_id);
        for (let i = 1; i < p.trail.length; i++) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = fade * (i / p.trail.length) * 0.8;
          ctx.lineWidth = 2.5 * scale * (i / p.trail.length);
          ctx.beginPath();
          ctx.moveTo(X(p.trail[i - 1][0]), Y(p.trail[i - 1][1]));
          ctx.lineTo(X(p.trail[i][0]), Y(p.trail[i][1]));
          ctx.stroke();
        }
      }
      ctx.globalAlpha = fade;
    }

    if (layers.persons) {
      for (const p of a.persons) {
        const [bx, by, bw, bh] = p.bbox;
        const left = X(mirror ? bx + bw : bx);
        const top = Y(by);
        const pw = bw * w;
        const ph = bh * h;
        const color = trackColor(p.track_id);
        drawBracketBox(ctx, left, top, pw, ph, color, scale);
        if (layers.labels) {
          const name = p.name ? ` ${p.name}` : '';
          drawLabel(ctx, `#${p.track_id}${name}  ${Math.round(p.confidence * 100)}%`, left, top, color, scale);
        }
      }
    }

    if (layers.faces) {
      for (const f of a.faces) {
        const [fx, fy, fw, fh] = f.bbox;
        const left = X(mirror ? fx + fw : fx);
        ctx.strokeStyle = FACE_COLOR;
        ctx.lineWidth = 1.5 * scale;
        ctx.setLineDash([4 * scale, 3 * scale]);
        roundRect(ctx, left, Y(fy), fw * w, fh * h, 6 * scale);
        ctx.stroke();
        ctx.setLineDash([]);
        if (f.landmarks) {
          ctx.fillStyle = FACE_COLOR;
          for (const [lx, ly] of f.landmarks) {
            ctx.beginPath();
            ctx.arc(X(lx), Y(ly), 2 * scale, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (layers.labels) {
          if (f.name) {
            const sim = f.similarity != null ? ` ${Math.round(f.similarity * 100)}%` : '';
            drawLabel(ctx, `${f.name}${sim}`, left, Y(fy + fh) + 20 * scale, FACE_COLOR, scale, true);
          } else {
            drawLabel(ctx, 'Unknown', left, Y(fy + fh) + 18 * scale, FACE_COLOR, scale * 0.85, true, true);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  if (layers.pose && input.pose) {
    const lm = input.pose.landmarks;
    ctx.strokeStyle = POSE_COLOR;
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85;
    for (const [s, e] of POSE_CONNECTIONS) {
      if (s < 11 || e < 11) continue; // skip the face mesh points; faces have their own layer
      const p1 = lm[s], p2 = lm[e];
      if ((p1.visibility ?? 1) < 0.5 || (p2.visibility ?? 1) < 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(X(p1.x), Y(p1.y));
      ctx.lineTo(X(p2.x), Y(p2.y));
      ctx.stroke();
    }
    ctx.fillStyle = '#ecfdf5';
    for (let i = 11; i < lm.length; i++) {
      if ((lm[i].visibility ?? 1) < 0.5) continue;
      ctx.beginPath();
      ctx.arc(X(lm[i].x), Y(lm[i].y), 3 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (layers.hands) {
    for (const hand of input.hands) {
      const lm = hand.landmarks;
      ctx.save();
      ctx.shadowColor = HAND_COLOR;
      ctx.shadowBlur = 12 * scale;
      ctx.strokeStyle = HAND_COLOR;
      ctx.lineWidth = 2.5 * scale;
      ctx.lineCap = 'round';
      for (const [s, e] of HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(X(lm[s].x), Y(lm[s].y));
        ctx.lineTo(X(lm[e].x), Y(lm[e].y));
        ctx.stroke();
      }
      ctx.restore();
      for (let i = 0; i < lm.length; i++) {
        ctx.fillStyle = i % 4 === 0 ? HAND_COLOR : '#fff';
        ctx.beginPath();
        ctx.arc(X(lm[i].x), Y(lm[i].y), (i % 4 === 0 ? 4 : 2.5) * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      if (layers.labels && hand.stableGesture !== 'unknown') {
        const minY = Math.min(...lm.map((p) => p.y));
        const cx = lm.reduce((s, p) => s + p.x, 0) / lm.length;
        const text = `${gestureEmoji(hand.stableGesture)} ${gestureLabel(hand.stableGesture)}`;
        drawCenteredTag(ctx, text, X(cx), Y(minY) - 14 * scale, scale);
      }
    }
  }
}

function drawBracketBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, s: number) {
  ctx.strokeStyle = color;
  ctx.globalAlpha *= 0.35;
  ctx.lineWidth = 1 * s;
  roundRect(ctx, x, y, w, h, 4 * s);
  ctx.stroke();
  ctx.globalAlpha /= 0.35;

  const c = Math.min(22 * s, w / 3, h / 3);
  ctx.lineWidth = 3 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
  ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
  ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h);
  ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c);
  ctx.stroke();
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, s: number, below = false, subtle = false) {
  ctx.font = `600 ${12 * s}px "Inter Variable", system-ui, sans-serif`;
  const padX = 7 * s;
  const hgt = 20 * s;
  const tw = ctx.measureText(text).width;
  const top = below ? y - hgt : Math.max(0, y - hgt - 4 * s);
  ctx.fillStyle = subtle ? 'rgba(11, 13, 18, 0.7)' : color;
  roundRect(ctx, x, top, tw + padX * 2, hgt, 5 * s);
  ctx.fill();
  ctx.fillStyle = subtle ? color : '#0b0d12';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, top + hgt / 2 + 0.5);
}

function drawCenteredTag(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, s: number) {
  ctx.font = `600 ${13 * s}px "Inter Variable", system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  const w = tw + 18 * s;
  const h = 24 * s;
  ctx.fillStyle = 'rgba(11, 13, 18, 0.82)';
  roundRect(ctx, cx - w / 2, y - h, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = HAND_COLOR;
  ctx.lineWidth = 1 * s;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx - tw / 2, y - h / 2 + 0.5);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}
