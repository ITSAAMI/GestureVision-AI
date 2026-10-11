import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { visionEngine } from '../vision/engine';
import { generateColors, generateFormation, mulberry32, waveHeight, type Formation, type PaletteName } from './formations';
import type { ParticleControl } from './particleStore';

const vertexShader = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTime;
  attribute vec3 aColor;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vTwinkle = 0.7 + 0.3 * sin(uTime * 2.2 + aSeed * 6.2831);
    gl_PointSize = uSize * uPixelRatio * (0.6 + aSeed * 0.8) * (14.0 / -mv.z);
    vColor = aColor;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float alpha = pow(core, 1.8) * vTwinkle;
    gl_FragColor = vec4(vColor * (0.6 + core * 0.9), alpha);
  }
`;

interface FieldProps {
  count: number;
  formation: Formation;
  palette: PaletteName;
  speed: number;
  size: number;
  autoRotate: boolean;
  control: RefObject<ParticleControl>;
  onFps?: (fps: number) => void;
}

interface SimState {
  target: Float32Array;
  pos: Float32Array;
  vel: Float32Array;
  colors: Float32Array;
  targetColors: Float32Array;
  seeds: Float32Array;
}

function Particles({ count, formation, palette, speed, size, autoRotate, control, onFps }: FieldProps) {
  const group = useRef<THREE.Group>(null);
  const points = useRef<THREE.Points>(null);

  const state = useMemo<SimState>(() => {
    // Particles start scattered in a dim nebula and fly into the selected formation
    // (the retarget effect below sets the real target and colours).
    const rand = mulberry32(count);
    const target = generateFormation('cloud', count);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = (rand() - 0.5) * 18;
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = rand();
    const colors = new Float32Array(count * 3).fill(0.15);
    return { target, pos, vel: new Float32Array(count * 3), colors, targetColors: colors.slice(), seeds };
  }, [count]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(state.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(state.colors, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(state.seeds, 1));
    return g;
  }, [state]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uSize: { value: 1 }, uPixelRatio: { value: Math.min(2, window.devicePixelRatio) }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  // Retarget on formation/palette change; particles glide to the new shape.
  useEffect(() => {
    state.target = generateFormation(formation, count);
    state.targetColors = generateColors(state.target, palette);
  }, [formation, palette, count, state]);

  const fps = useRef({ frames: 0, t: 0 });

  useFrame((three, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const t = three.clock.elapsedTime;
    const now = performance.now() / 1000; // same clock the gesture controller uses
    const c = control.current;
    if (!c || !group.current) return;

    material.uniforms.uTime.value = t;
    material.uniforms.uSize.value = size;

    // Spin
    const boost = now < c.spinBoostUntil ? 4 : 1;
    if (autoRotate) group.current.rotation.y += dt * 0.12 * speed * c.spinDir * boost;

    // Cursor in the group's local space
    const rot = -group.current.rotation.y;
    const cx = c.cursor.x * Math.cos(rot) - c.cursor.z * Math.sin(rot);
    const cz = c.cursor.x * Math.sin(rot) + c.cursor.z * Math.cos(rot);
    const cy = c.cursor.y;

    c.scale += (c.baseScale - c.scale) * Math.min(1, dt * 3);
    const scale = c.scale;
    const { pos, vel, target, colors, targetColors } = state;
    const n = count;
    const stiffness = 2.2 * speed;
    const damping = Math.pow(0.86, dt * 60);
    const waveAge = now - c.waveAt;
    const waveOn = c.waveAt >= 0 && waveAge < 3;
    const burst = c.burstAt >= 0; // one-shot impulse
    if (burst) c.burstAt = -1;
    const isWave = formation === 'wave';

    for (let i = 0; i < n; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2;
      let tx = target[ix] * scale;
      let ty = target[iy] * scale;
      let tz = target[iz] * scale;
      if (isWave) ty = waveHeight(target[ix], target[iz], t * speed) * scale;
      if (waveOn) {
        const r = Math.hypot(tx, tz);
        ty += Math.sin(r * 1.6 - waveAge * 7) * Math.exp(-waveAge * 1.2) * 1.1;
      }

      let ax = (tx - pos[ix]) * stiffness;
      let ay = (ty - pos[iy]) * stiffness;
      let az = (tz - pos[iz]) * stiffness;

      if (c.mode === 'spread') {
        const len = Math.hypot(pos[ix], pos[iy], pos[iz]) || 1;
        ax += (pos[ix] / len) * 9;
        ay += (pos[iy] / len) * 9;
        az += (pos[iz] / len) * 9;
      } else if (c.cursorActive && (c.mode === 'attract' || c.mode === 'repel')) {
        const dx = pos[ix] - cx, dy = pos[iy] - cy, dz = pos[iz] - cz;
        const d = Math.hypot(dx, dy, dz) || 1;
        if (c.mode === 'attract') {
          const f = 7 / (1 + d * 0.15);
          ax -= (dx / d) * f * Math.min(d, 3);
          ay -= (dy / d) * f * Math.min(d, 3);
          az -= (dz / d) * f * Math.min(d, 3);
        } else if (d < 2.6) {
          const f = (2.6 - d) * 22;
          ax += (dx / d) * f;
          ay += (dy / d) * f;
          az += (dz / d) * f;
        }
      }

      if (burst) {
        const len = Math.hypot(pos[ix], pos[iy], pos[iz]) || 1;
        const k = 8 + state.seeds[i] * 10;
        vel[ix] += (pos[ix] / len) * k;
        vel[iy] += (pos[iy] / len) * k;
        vel[iz] += (pos[iz] / len) * k;
      }

      vel[ix] = (vel[ix] + ax * dt) * damping;
      vel[iy] = (vel[iy] + ay * dt) * damping;
      vel[iz] = (vel[iz] + az * dt) * damping;
      pos[ix] += vel[ix] * dt;
      pos[iy] += vel[iy] * dt;
      pos[iz] += vel[iz] * dt;
    }

    const blend = Math.min(1, dt * 2.5);
    for (let i = 0; i < colors.length; i++) colors[i] += (targetColors[i] - colors[i]) * blend;

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;

    if (onFps) {
      fps.current.frames++;
      if (t - fps.current.t >= 1) {
        onFps(Math.round(fps.current.frames / (t - fps.current.t)));
        fps.current = { frames: 0, t };
      }
    }
  });

  return (
    <group ref={group}>
      <points ref={points} geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}

/** Invisible plane that turns mouse movement into a 3D cursor when no hand is tracked. */
function PointerPlane({ control }: { control: RefObject<ParticleControl> }) {
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const c = control.current;
    if (!c || visionEngine.hands.length) return;
    c.cursor = { x: e.point.x, y: e.point.y, z: 0 };
    c.cursorActive = true;
    c.mode = e.buttons & 1 ? 'attract' : 'repel';
  };
  const onLeave = () => {
    const c = control.current;
    if (c && !visionEngine.hands.length) {
      c.cursorActive = false;
      c.mode = 'idle';
    }
  };
  return (
    <mesh onPointerMove={onMove} onPointerOut={onLeave} visible={false}>
      <planeGeometry args={[60, 40]} />
      <meshBasicMaterial />
    </mesh>
  );
}

export function ParticleCanvas(props: FieldProps) {
  return (
    <Canvas
      camera={{ position: [0, 1.6, 12], fov: 55 }}
      dpr={[1, 1.75]}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
      onCreated={({ gl }) => gl.setClearColor('#05060a')}
    >
      <fog attach="fog" args={['#05060a', 14, 34]} />
      <Stars radius={60} depth={30} count={1800} factor={3} saturation={0} fade speed={0.6} />
      <Particles {...props} />
      <PointerPlane control={props.control} />
      <OrbitControls enablePan={false} minDistance={5} maxDistance={26} enableDamping dampingFactor={0.08} rotateSpeed={0.6} mouseButtons={{ LEFT: undefined, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }} />
    </Canvas>
  );
}
