import { describe, expect, it } from 'vitest';
import { classifyPose } from '../pose/classifier';
import type { Landmark } from '../vision/types';
import { FORMATIONS, generateColors, generateFormation, PALETTES, type PaletteName } from './formations';

describe('generateFormation', () => {
  it.each(FORMATIONS)('%s produces finite, bounded positions', (name) => {
    const n = 3000;
    const pos = generateFormation(name, n);
    expect(pos.length).toBe(n * 3);
    let maxR = 0;
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      expect(Number.isFinite(r)).toBe(true);
      maxR = Math.max(maxR, r);
    }
    expect(maxR).toBeGreaterThan(1);
    expect(maxR).toBeLessThan(10);
  });

  it('is deterministic', () => {
    expect(generateFormation('galaxy', 500)).toEqual(generateFormation('galaxy', 500));
  });

  it('generates colours for every palette', () => {
    const pos = generateFormation('sphere', 200);
    for (const p of Object.keys(PALETTES) as PaletteName[]) {
      const c = generateColors(pos, p);
      expect(c.length).toBe(pos.length);
      expect(Array.from(c).every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
    }
  });
});

describe('classifyPose', () => {
  const body = (overrides: Record<number, Partial<Landmark>>): Landmark[] =>
    Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, z: 0, visibility: 1, ...overrides[i] }));
  const base = {
    11: { x: 0.6, y: 0.4 }, 12: { x: 0.4, y: 0.4 },
    13: { x: 0.65, y: 0.55 }, 14: { x: 0.35, y: 0.55 },
    15: { x: 0.65, y: 0.68 }, 16: { x: 0.35, y: 0.68 },
    23: { x: 0.57, y: 0.7 }, 24: { x: 0.43, y: 0.7 },
    25: { x: 0.57, y: 0.85 }, 26: { x: 0.43, y: 0.85 },
  };

  it('detects standing, arms raised and T-pose', () => {
    expect(classifyPose(body(base)).activity).toBe('standing');
    expect(classifyPose(body({ ...base, 15: { x: 0.62, y: 0.2 }, 16: { x: 0.38, y: 0.2 } })).activity).toBe('arms_raised');
    expect(classifyPose(body({ ...base, 13: { x: 0.75, y: 0.41 }, 14: { x: 0.25, y: 0.41 }, 15: { x: 0.9, y: 0.41 }, 16: { x: 0.1, y: 0.41 } })).activity).toBe('t_pose');
  });

  it('reports unknown when shoulders are not visible', () => {
    expect(classifyPose(body({ 11: { visibility: 0.1 } })).activity).toBe('unknown');
  });
});
