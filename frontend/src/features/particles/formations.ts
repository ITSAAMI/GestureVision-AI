/** Procedural particle formations. All are centred on the origin within a ~5 unit radius. */

export const FORMATIONS = ['sphere', 'torus', 'galaxy', 'helix', 'wave', 'cube', 'human', 'cloud'] as const;
export type Formation = (typeof FORMATIONS)[number];

export const FORMATION_LABELS: Record<Formation, string> = {
  sphere: 'Sphere',
  torus: 'Torus',
  galaxy: 'Galaxy',
  helix: 'DNA Helix',
  wave: 'Wave',
  cube: 'Cube',
  human: 'Human',
  cloud: 'Nebula',
};

/** Deterministic PRNG so formations are stable between renders. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
type Vec = [number, number, number];

function gaussian(rand: Rand): number {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function capsulePoint(rand: Rand, a: Vec, b: Vec, r: number): Vec {
  const d: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d) || 1;
  const n: Vec = [d[0] / len, d[1] / len, d[2] / len];
  // Any vector not parallel to n gives a perpendicular basis.
  const ref: Vec = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u: Vec = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
  const ul = Math.hypot(...u) || 1;
  u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const v: Vec = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const t = rand();
  const theta = rand() * Math.PI * 2;
  const rr = r * (0.82 + 0.18 * rand());
  const c = Math.cos(theta) * rr;
  const s = Math.sin(theta) * rr;
  return [a[0] + d[0] * t + u[0] * c + v[0] * s, a[1] + d[1] * t + u[1] * c + v[1] * s, a[2] + d[2] * t + u[2] * c + v[2] * s];
}

type BodyPart = { kind: 'sphere'; c: Vec; r: number } | { kind: 'capsule'; a: Vec; b: Vec; r: number };

const BODY: BodyPart[] = [
  { kind: 'sphere', c: [0, 3.35, 0], r: 0.62 }, // head
  { kind: 'capsule', a: [0, 2.55, 0], b: [0, 2.85, 0], r: 0.22 }, // neck
  { kind: 'capsule', a: [0, 0.45, 0], b: [0, 2.3, 0], r: 0.78 }, // torso
  { kind: 'capsule', a: [-0.95, 2.25, 0], b: [-1.6, 0.95, 0.1], r: 0.24 }, // upper arms
  { kind: 'capsule', a: [0.95, 2.25, 0], b: [1.6, 0.95, 0.1], r: 0.24 },
  { kind: 'capsule', a: [-1.6, 0.95, 0.1], b: [-1.85, -0.35, 0.25], r: 0.2 }, // forearms
  { kind: 'capsule', a: [1.6, 0.95, 0.1], b: [1.85, -0.35, 0.25], r: 0.2 },
  { kind: 'capsule', a: [-0.42, 0.35, 0], b: [-0.52, -1.75, 0], r: 0.3 }, // thighs
  { kind: 'capsule', a: [0.42, 0.35, 0], b: [0.52, -1.75, 0], r: 0.3 },
  { kind: 'capsule', a: [-0.52, -1.75, 0], b: [-0.58, -3.6, 0.1], r: 0.24 }, // shins
  { kind: 'capsule', a: [0.52, -1.75, 0], b: [0.58, -3.6, 0.1], r: 0.24 },
];

const BODY_WEIGHTS = (() => {
  const w = BODY.map((p) => (p.kind === 'sphere' ? 4 * p.r * p.r : Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) * p.r * 2.4 + p.r * p.r));
  const total = w.reduce((s, x) => s + x, 0);
  let acc = 0;
  return w.map((x) => (acc += x / total));
})();

export function generateFormation(name: Formation, count: number, seed = 7): Float32Array {
  const out = new Float32Array(count * 3);
  const rand = mulberry32(seed + FORMATIONS.indexOf(name) * 1013);
  const set = (i: number, x: number, y: number, z: number) => {
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  };

  switch (name) {
    case 'sphere': {
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / Math.max(1, count - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const t = golden * i;
        const R = 4.1 + gaussian(rand) * 0.06;
        set(i, Math.cos(t) * r * R, y * R, Math.sin(t) * r * R);
      }
      break;
    }
    case 'torus': {
      for (let i = 0; i < count; i++) {
        const u = rand() * Math.PI * 2;
        const v = rand() * Math.PI * 2;
        const R = 3.4, r = 1.2 + gaussian(rand) * 0.05;
        set(i, (R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u));
      }
      break;
    }
    case 'galaxy': {
      const arms = 3;
      for (let i = 0; i < count; i++) {
        if (rand() < 0.14) {
          set(i, gaussian(rand) * 0.55, gaussian(rand) * 0.35, gaussian(rand) * 0.55);
          continue;
        }
        const t = Math.pow(rand(), 0.75);
        const r = 0.4 + t * 5.4;
        const angle = r * 0.95 + (i % arms) * ((Math.PI * 2) / arms);
        const spread = 0.18 + t * 0.45;
        set(i, Math.cos(angle) * r + gaussian(rand) * spread, gaussian(rand) * 0.22 * (1.2 - t), Math.sin(angle) * r + gaussian(rand) * spread);
      }
      break;
    }
    case 'helix': {
      const turns = 3.2, R = 1.7, height = 9.5, rungs = 30;
      for (let i = 0; i < count; i++) {
        if (rand() < 0.22) {
          const k = Math.floor(rand() * rungs);
          const t = (k + 0.5) / rungs;
          const a = t * turns * Math.PI * 2;
          const s = rand() * 2 - 1;
          set(i, Math.cos(a) * R * s, (t - 0.5) * height + gaussian(rand) * 0.03, Math.sin(a) * R * s);
        } else {
          const t = rand();
          const a = t * turns * Math.PI * 2 + (i % 2) * Math.PI;
          set(i, Math.cos(a) * R + gaussian(rand) * 0.09, (t - 0.5) * height, Math.sin(a) * R + gaussian(rand) * 0.09);
        }
      }
      break;
    }
    case 'wave': {
      const side = Math.ceil(Math.sqrt(count));
      for (let i = 0; i < count; i++) {
        const x = ((i % side) / side - 0.5) * 11;
        const z = (Math.floor(i / side) / side - 0.5) * 11;
        set(i, x, waveHeight(x, z, 0), z);
      }
      break;
    }
    case 'cube': {
      const h = 3;
      for (let i = 0; i < count; i++) {
        const p: Vec = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
        if (rand() < 0.25) {
          // Edges: two coordinates pinned to ±1.
          const free = Math.floor(rand() * 3);
          for (let k = 0; k < 3; k++) if (k !== free) p[k] = rand() < 0.5 ? -1 : 1;
        } else {
          const axis = Math.floor(rand() * 3);
          p[axis] = rand() < 0.5 ? -1 : 1;
        }
        set(i, p[0] * h, p[1] * h, p[2] * h);
      }
      break;
    }
    case 'human': {
      for (let i = 0; i < count; i++) {
        const pick = rand();
        const part = BODY[BODY_WEIGHTS.findIndex((w) => pick <= w)] ?? BODY[2];
        let p: Vec;
        if (part.kind === 'sphere') {
          const u = rand() * 2 - 1;
          const th = rand() * Math.PI * 2;
          const rr = part.r * (0.85 + 0.15 * rand());
          const s = Math.sqrt(1 - u * u);
          p = [part.c[0] + Math.cos(th) * s * rr, part.c[1] + u * rr, part.c[2] + Math.sin(th) * s * rr];
        } else {
          p = capsulePoint(rand, part.a, part.b, part.r);
        }
        set(i, p[0] * 1.05, p[1] * 1.05 + 0.1, p[2] * 0.6);
      }
      break;
    }
    case 'cloud':
    default: {
      const clusters = Array.from({ length: 6 }, () => ({
        c: [gaussian(rand) * 2.4, gaussian(rand) * 1.4, gaussian(rand) * 2.4] as Vec,
        s: 0.6 + rand() * 0.9,
      }));
      for (let i = 0; i < count; i++) {
        if (rand() < 0.2) {
          set(i, (rand() - 0.5) * 12, (rand() - 0.5) * 7, (rand() - 0.5) * 12);
        } else {
          const cl = clusters[Math.floor(rand() * clusters.length)];
          set(i, cl.c[0] + gaussian(rand) * cl.s, cl.c[1] + gaussian(rand) * cl.s * 0.7, cl.c[2] + gaussian(rand) * cl.s);
        }
      }
    }
  }
  return out;
}

export function waveHeight(x: number, z: number, t: number): number {
  return Math.sin(x * 0.7 + t * 1.6) * 0.7 + Math.cos(z * 0.6 + t * 1.2) * 0.6;
}

// ---- colour ----------------------------------------------------------------------

export const PALETTES = {
  aurora: ['#8b7bff', '#38bdf8', '#34d399'],
  nebula: ['#f472b6', '#a78bfa', '#38bdf8'],
  ember: ['#f43f5e', '#fb923c', '#fde047'],
  ocean: ['#1d4ed8', '#22d3ee', '#cffafe'],
  matrix: ['#052e16', '#22c55e', '#bbf7d0'],
  mono: ['#6366f1', '#c7d2fe', '#ffffff'],
} as const;

export type PaletteName = keyof typeof PALETTES;

function hexToRgb(hex: string): Vec {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Per-particle colours: a gradient by distance from the centre, with slight per-particle variation. */
export function generateColors(positions: Float32Array, palette: PaletteName, seed = 3): Float32Array {
  const stops = PALETTES[palette].map(hexToRgb);
  const n = positions.length / 3;
  const out = new Float32Array(positions.length);
  const rand = mulberry32(seed);
  let maxR = 1e-6;
  for (let i = 0; i < n; i++) maxR = Math.max(maxR, Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]));
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]) / maxR;
    const t = Math.min(1, Math.max(0, r * 0.85 + (rand() - 0.5) * 0.3));
    const seg = t < 0.5 ? 0 : 1;
    const local = seg === 0 ? t / 0.5 : (t - 0.5) / 0.5;
    const a = stops[seg], b = stops[seg + 1];
    const bright = 0.8 + rand() * 0.4;
    out[i * 3] = (a[0] + (b[0] - a[0]) * local) * bright;
    out[i * 3 + 1] = (a[1] + (b[1] - a[1]) * local) * bright;
    out[i * 3 + 2] = (a[2] + (b[2] - a[2]) * local) * bright;
  }
  return out;
}
