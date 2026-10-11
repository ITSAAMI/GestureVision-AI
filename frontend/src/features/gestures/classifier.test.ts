import { describe, expect, it } from 'vitest';
import type { Landmark } from '../vision/types';
import { classifyHand, classifyTwoHands, GestureSmoother, handFeatures, WaveDetector } from './classifier';

type FingerState = 'up' | 'curled' | { angle: number };
type ThumbState = 'out' | 'tucked' | 'up' | 'down';

const WRIST = { x: 0.5, y: 0.8 };
const MCP = { index: { x: 0.46, y: 0.62 }, middle: { x: 0.5, y: 0.6 }, ring: { x: 0.54, y: 0.61 }, pinky: { x: 0.58, y: 0.64 } };

const pt = (x: number, y: number, z = 0): Landmark => ({ x, y, z });

function finger(mcp: { x: number; y: number }, state: FingerState): Landmark[] {
  if (state === 'curled') {
    return [pt(mcp.x, mcp.y), pt(mcp.x, mcp.y - 0.06), pt(mcp.x, mcp.y - 0.03), pt(mcp.x, mcp.y + 0.03)];
  }
  const a = ((state === 'up' ? 0 : state.angle) * Math.PI) / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  return [0, 0.08, 0.13, 0.17].map((d) => pt(mcp.x + dx * d, mcp.y + dy * d));
}

function thumb(state: ThumbState): Landmark[] {
  switch (state) {
    case 'out':
      return [pt(0.44, 0.76), pt(0.4, 0.71), pt(0.37, 0.67), pt(0.34, 0.63)];
    case 'tucked':
      return [pt(0.44, 0.76), pt(0.43, 0.71), pt(0.46, 0.68), pt(0.48, 0.66)];
    case 'up':
      return [pt(0.44, 0.76), pt(0.42, 0.7), pt(0.42, 0.6), pt(0.42, 0.5)];
    case 'down':
      return [pt(0.44, 0.78), pt(0.42, 0.82), pt(0.42, 0.9), pt(0.42, 1.0)];
  }
}

function hand(t: ThumbState, index: FingerState, middle: FingerState, ring: FingerState, pinky: FingerState): Landmark[] {
  return [
    pt(WRIST.x, WRIST.y),
    ...thumb(t),
    ...finger(MCP.index, index),
    ...finger(MCP.middle, middle),
    ...finger(MCP.ring, ring),
    ...finger(MCP.pinky, pinky),
  ];
}

const classify = (lm: Landmark[]) => classifyHand(handFeatures(lm)).gesture;

describe('classifyHand', () => {
  it('recognizes an open palm', () => {
    expect(classify(hand('out', { angle: -12 }, 'up', { angle: 8 }, { angle: 16 }))).toBe('open_palm');
  });

  it('recognizes a closed fist', () => {
    expect(classify(hand('tucked', 'curled', 'curled', 'curled', 'curled'))).toBe('closed_fist');
  });

  it('recognizes thumbs up and thumbs down', () => {
    expect(classify(hand('up', 'curled', 'curled', 'curled', 'curled'))).toBe('thumbs_up');
    expect(classify(hand('down', 'curled', 'curled', 'curled', 'curled'))).toBe('thumbs_down');
  });

  it('distinguishes victory (spread) from two fingers (together)', () => {
    expect(classify(hand('tucked', { angle: -22 }, { angle: 18 }, 'curled', 'curled'))).toBe('victory');
    expect(classify(hand('tucked', 'up', 'up', 'curled', 'curled'))).toBe('two_finger');
  });

  it('recognizes pointing with one finger', () => {
    expect(classify(hand('tucked', 'up', 'curled', 'curled', 'curled'))).toBe('one_finger');
  });

  it('recognizes a pinch but not a fist whose thumb rests on the index', () => {
    const lm = hand('tucked', 'up', 'curled', 'curled', 'curled');
    // bend the index toward the thumb and meet it
    lm[6] = pt(0.45, 0.54); lm[7] = pt(0.42, 0.51); lm[8] = pt(0.4, 0.52);
    lm[2] = pt(0.4, 0.71); lm[3] = pt(0.38, 0.62); lm[4] = pt(0.4, 0.535);
    expect(classify(lm)).toBe('pinch');

    const fist = hand('tucked', 'curled', 'curled', 'curled', 'curled');
    fist[4] = pt(0.46, 0.66); // thumb tip right next to the curled index tip
    expect(classify(fist)).toBe('closed_fist');
  });

  it('is invariant to hand scale', () => {
    const lm = hand('tucked', 'up', 'curled', 'curled', 'curled').map((p) => pt(0.5 + (p.x - 0.5) * 0.4, 0.5 + (p.y - 0.5) * 0.4));
    expect(classify(lm)).toBe('one_finger');
  });

  it('returns unknown for ambiguous shapes', () => {
    expect(classify(hand('tucked', 'up', 'up', 'up', 'curled'))).toBe('unknown');
  });
});

describe('classifyTwoHands', () => {
  it('detects both hands raised and hands together', () => {
    const raised = classifyTwoHands(
      { gesture: 'open_palm', palm: { x: 0.3, y: 0.3 }, palmSize: 0.15 },
      { gesture: 'open_palm', palm: { x: 0.7, y: 0.3 }, palmSize: 0.15 },
    );
    expect(raised?.gesture).toBe('both_hands_raised');

    const together = classifyTwoHands(
      { gesture: 'open_palm', palm: { x: 0.48, y: 0.6 }, palmSize: 0.15 },
      { gesture: 'open_palm', palm: { x: 0.55, y: 0.6 }, palmSize: 0.15 },
    );
    expect(together?.gesture).toBe('hands_together');

    expect(
      classifyTwoHands(
        { gesture: 'closed_fist', palm: { x: 0.2, y: 0.6 }, palmSize: 0.15 },
        { gesture: 'one_finger', palm: { x: 0.8, y: 0.6 }, palmSize: 0.15 },
      ),
    ).toBeNull();
  });
});

describe('GestureSmoother', () => {
  it('requires a stable majority and fires once on change', () => {
    const s = new GestureSmoother(6, 800);
    const fired: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = s.push('victory', i * 33);
      if (r.fired) fired.push(r.fired);
    }
    expect(s.current).toBe('unknown'); // not yet stable
    for (let i = 3; i < 10; i++) {
      const r = s.push(i === 6 ? 'unknown' : 'victory', i * 33); // one flickering frame
      if (r.fired) fired.push(r.fired);
    }
    expect(s.current).toBe('victory');
    expect(fired).toEqual(['victory']);
  });

  it('enforces the cooldown for repeated gestures', () => {
    const s = new GestureSmoother(3, 1000);
    const run = (g: 'victory' | 'closed_fist', start: number) => {
      const out: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = s.push(g, start + i * 30);
        if (r.fired) out.push(r.fired);
      }
      return out;
    };
    expect(run('victory', 0)).toEqual(['victory']);
    expect(run('closed_fist', 100)).toEqual(['closed_fist']);
    expect(run('victory', 300)).toEqual([]); // within cooldown
    run('closed_fist', 500);
    expect(run('victory', 1500)).toEqual(['victory']);
  });
});

describe('WaveDetector', () => {
  it('detects side-to-side waving of an open hand', () => {
    const w = new WaveDetector();
    let waved = false;
    for (let i = 0; i < 40 && !waved; i++) {
      const x = 0.5 + 0.06 * Math.sin(i * 0.9);
      waved = w.push(x, true, i * 40);
    }
    expect(waved).toBe(true);
  });

  it('ignores still hands and closed hands', () => {
    const w = new WaveDetector();
    for (let i = 0; i < 40; i++) expect(w.push(0.5 + (i % 2) * 0.005, true, i * 40)).toBe(false);
    for (let i = 0; i < 40; i++) expect(w.push(0.5 + 0.06 * Math.sin(i * 0.9), false, i * 40)).toBe(false);
  });
});
