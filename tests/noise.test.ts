import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { describe, expect, it } from 'vitest';
import { assessHearing, relativeBearing } from '../src/audio/Hearing';
import { EventBus, type GameEvents } from '../src/core/EventBus';
import {
  DEFAULT_SHOT_RANGE, LAND_RANGE, NOISE_RANGE, OCCLUDED_GAIN, OCCLUDED_LOWPASS, REF_DISTANCE, SHOT_RANGE, SURFACE_LOUDNESS,
  VERTICAL_DIST, distanceGain, isFootLevel, landRange, noiseRange, stepKind, type NoiseEvent,
} from '../src/data/noise';
import { PlayerController } from '../src/player/PlayerController';
import { SURFACES } from '../src/world/Surface';

const P = (x: number, y: number, z: number) => ({ x, y, z });

describe('noise distance table', () => {
  it('matches the confirmed design table', () => {
    expect(NOISE_RANGE.footstep_sprint).toBe(30);
    expect(NOISE_RANGE.footstep_walk).toBe(18);
    expect(NOISE_RANGE.footstep_crouch).toBe(0);
    expect(NOISE_RANGE.footstep_crouch_run).toBe(8);
    expect(NOISE_RANGE.reload).toBe(10);
    expect(NOISE_RANGE.weapon_swap).toBe(8);
    expect(NOISE_RANGE.dry_fire).toBe(6);
    expect(NOISE_RANGE.heal).toBe(8);
    expect(NOISE_RANGE.search).toBe(12);
    expect(NOISE_RANGE.item_pickup).toBe(6);
    expect(NOISE_RANGE.item_drop).toBe(6);
    expect(NOISE_RANGE.armor_equip).toBe(6);
    expect(NOISE_RANGE.trade).toBe(8);
    expect(NOISE_RANGE.evac).toBe(40);
    expect(NOISE_RANGE.hurt).toBe(20);
    expect(NOISE_RANGE.death).toBe(20);
  });

  it('gunshots are 80-120m depending on the weapon; landing is 15-25m by fall speed', () => {
    for (const r of [...Object.values(SHOT_RANGE), DEFAULT_SHOT_RANGE]) { expect(r).toBeGreaterThanOrEqual(80); expect(r).toBeLessThanOrEqual(120); }
    expect(noiseRange({ kind: 'shot', weaponId: 'rifle' })).toBeGreaterThan(noiseRange({ kind: 'shot', weaponId: 'pistol' }));
    expect(landRange(2)).toBe(LAND_RANGE[0]);
    expect(landRange(11)).toBe(LAND_RANGE[1]);
    expect(landRange(6)).toBeGreaterThan(LAND_RANGE[0]);
    expect(landRange(6)).toBeLessThan(LAND_RANGE[1]);
    expect(noiseRange({ kind: 'land', fallSpeed: 9 })).toBeGreaterThan(noiseRange({ kind: 'land', fallSpeed: 3 }));
  });

  it('footsteps are scaled by the ground surface; other sounds are not', () => {
    expect(noiseRange({ kind: 'footstep_walk', surface: 'concrete' })).toBe(18);
    expect(noiseRange({ kind: 'footstep_walk', surface: 'metal' })).toBeGreaterThan(18);
    expect(noiseRange({ kind: 'footstep_walk', surface: 'grass' })).toBeLessThan(18);
    expect(noiseRange({ kind: 'footstep_sprint', surface: 'metal_hollow' })).toBeCloseTo(30 * SURFACE_LOUDNESS.metal_hollow, 6);
    expect(noiseRange({ kind: 'footstep_crouch_run', surface: 'carpet' })).toBeCloseTo(8 * SURFACE_LOUDNESS.carpet, 6);
    expect(noiseRange({ kind: 'reload', surface: 'metal' })).toBe(10);
    // 全部材質的順序一致：金屬類 > 水泥 > 草 / 沙 / 地毯
    expect(SURFACE_LOUDNESS.metal_hollow).toBeGreaterThan(SURFACE_LOUDNESS.metal);
    expect(SURFACE_LOUDNESS.metal).toBeGreaterThan(SURFACE_LOUDNESS.concrete);
    expect(SURFACE_LOUDNESS.concrete).toBeGreaterThan(SURFACE_LOUDNESS.grass);
    for (const s of SURFACES) expect(SURFACE_LOUDNESS[s]).toBeGreaterThan(0);
  });

  it('crouch-walking is completely silent', () => {
    expect(noiseRange({ kind: 'footstep_crouch', surface: 'metal_hollow' })).toBe(0);
    const h = assessHearing(P(0, 1.6, 0), { kind: 'footstep_crouch', position: P(0.3, 0, 0), surface: 'metal' }, null);
    expect(h.audible).toBe(false);
    expect(h.gain).toBe(0);
  });
});

describe('distance falloff curve', () => {
  it('is full inside the reference distance and exactly zero at / beyond the range', () => {
    expect(distanceGain(0, 18)).toBe(1);
    expect(distanceGain(REF_DISTANCE, 18)).toBe(1);
    expect(distanceGain(18, 18)).toBe(0);
    expect(distanceGain(18.01, 18)).toBe(0);
    expect(distanceGain(500, 18)).toBe(0);
    expect(distanceGain(5, 0)).toBe(0);
  });
  it('decreases monotonically with distance', () => {
    let prev = 1.0001;
    for (let d = 0; d <= 18; d += 0.5) { const g = distanceGain(d, 18); expect(g).toBeLessThanOrEqual(prev); prev = g; }
    expect(distanceGain(10, 18)).toBeGreaterThan(distanceGain(14, 18));
    expect(distanceGain(10, 18)).toBeGreaterThan(0.1);
  });
});

describe('occlusion and vertical separation', () => {
  const ear = P(0, 1.6, 0);
  const ev = { kind: 'footstep_walk' as const, position: P(-10, 0, 0), surface: 'concrete' as const };
  it('no obstacle: plain distance gain, no low-pass', () => {
    const h = assessHearing(ear, ev, () => true);
    expect(h.occluded).toBe(false);
    expect(h.lowpass).toBeNull();
    expect(h.gain).toBeCloseTo(h.distGain, 8);
  });
  it('a wall in between lowers the volume (about -8dB) and low-passes around 1kHz', () => {
    const open = assessHearing(ear, ev, () => true);
    const walled = assessHearing(ear, ev, () => false);
    expect(walled.occluded).toBe(true);
    expect(walled.lowpass).toBe(OCCLUDED_LOWPASS);
    expect(OCCLUDED_LOWPASS).toBeGreaterThanOrEqual(800);
    expect(OCCLUDED_LOWPASS).toBeLessThanOrEqual(1200);
    expect(walled.gain).toBeCloseTo(open.gain * OCCLUDED_GAIN, 8);
    const db = 20 * Math.log10(OCCLUDED_GAIN);
    expect(db).toBeLessThanOrEqual(-6);
    expect(db).toBeGreaterThanOrEqual(-10);
  });
  it('the occluder receives the lifted source (feet-level sounds are raised) and the ear', () => {
    let seen: { a: { y: number }; b: { y: number } } | null = null;
    assessHearing(ear, ev, (a, b) => { seen = { a, b }; return true; });
    expect(isFootLevel(ev.kind)).toBe(true);
    expect(seen!.a.y).toBeGreaterThan(0.5);
    expect(seen!.b.y).toBe(1.6);
  });
  it('beyond the range nothing is audible and the occluder is not even asked', () => {
    let asked = false;
    const h = assessHearing(ear, { ...ev, position: P(-25, 0, 0) }, () => { asked = true; return true; });
    expect(h.audible).toBe(false);
    expect(asked).toBe(false);
  });
  it('other floors (more than 2.5m up or down) get muffled with extra reverb', () => {
    const same = assessHearing(ear, { kind: 'reload', position: P(-4, 1.6, 0) }, null);
    const above = assessHearing(ear, { kind: 'reload', position: P(-4, 1.6 + VERTICAL_DIST + 0.5, 0) }, null);
    expect(same.vertical).toBe(false);
    expect(above.vertical).toBe(true);
    expect(above.lowpass).not.toBeNull();
    expect(above.wetBoost).toBeGreaterThan(0);
    expect(above.extraGain).toBeLessThan(1);
  });
  it('works against a real Octree wall', () => {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 40), new THREE.MeshBasicMaterial());
    floor.position.y = -0.5;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 10), new THREE.MeshBasicMaterial());
    wall.position.set(-5, 2, 0);
    g.add(floor, wall);
    g.updateMatrixWorld(true);
    const octree = new Octree();
    octree.fromGraphNode(g);
    const ray = new THREE.Ray();
    const los = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
      const d = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
      const len = d.length();
      ray.origin.set(a.x, a.y, a.z);
      ray.direction.copy(d).divideScalar(len);
      const hit = octree.rayIntersect(ray);
      return !hit || hit.distance >= len - 0.15;
    };
    const behind = assessHearing(P(0, 1.6, 0), { kind: 'footstep_walk', position: P(-10, 0, 0), surface: 'concrete' }, los);
    const beside = assessHearing(P(0, 1.6, 0), { kind: 'footstep_walk', position: P(-10, 0, 14), surface: 'concrete' }, los);
    expect(behind.occluded).toBe(true);
    expect(beside.occluded).toBe(false);
  });
});

describe('bearing (direction of a sound relative to the view)', () => {
  const o = P(0, 0, 0);
  const deg = (a: number) => (a * 180) / Math.PI;
  it('front / right / left / behind for yaw = 0 (forward is -z)', () => {
    expect(deg(relativeBearing(o, 0, P(0, 0, -10)))).toBeCloseTo(0, 6);
    expect(deg(relativeBearing(o, 0, P(10, 0, 0)))).toBeCloseTo(90, 6);
    expect(deg(relativeBearing(o, 0, P(-10, 0, 0)))).toBeCloseTo(-90, 6);
    expect(Math.abs(deg(relativeBearing(o, 0, P(0, 0, 10))))).toBeCloseTo(180, 6);
  });
  it('follows the view rotation', () => {
    // 往左轉 90 度（yaw +π/2）：原本在左邊的聲音變成正前方
    expect(deg(relativeBearing(o, Math.PI / 2, P(-10, 0, 0)))).toBeCloseTo(0, 6);
    expect(deg(relativeBearing(o, Math.PI, P(0, 0, -10)))).toBeCloseTo(180, 4);
  });
});

describe('player footstep noise (PlayerController)', () => {
  function rig() {
    const floorGroup = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 200), new THREE.MeshBasicMaterial());
    floor.position.y = -0.5;
    floor.userData.surface = 'concrete';
    floorGroup.add(floor);
    floorGroup.updateMatrixWorld(true);
    const octree = new Octree();
    octree.fromGraphNode(floorGroup);
    const down = new Set<string>();
    const input = {
      isDown: (a: string) => down.has(a),
      getMove: (v: THREE.Vector2) => v.set(0, 1),
      consumePress: () => false,
      consumeLook: (v: THREE.Vector2) => v.set(0, 0),
    };
    const bus = new EventBus<GameEvents>();
    const events: NoiseEvent[] = [];
    bus.on('noise', (e) => events.push(e));
    const pc = new PlayerController(input as never, bus, new THREE.PerspectiveCamera());
    pc.setWorld(octree, [floor]);
    pc.teleport(new THREE.Vector3(0, 0.05, 0), 0);
    const run = (sec: number) => { for (let t = 0; t < sec; t += 1 / 120) pc.update(1 / 120); };
    run(0.5); // 落地、站穩
    events.length = 0;
    return { pc, down, events, run };
  }

  it('crouch-walk emits no noise at all', () => {
    const { pc, down, events, run } = rig();
    down.add('crouch');
    run(0.3);
    events.length = 0;
    run(6);
    expect(pc.state.crouching).toBe(true);
    expect(pc.state.moving).toBe(true);
    expect(pc.state.crouchRunning).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('crouch-run (crouch + sprint) is faster than crouch-walk, slower than walking, and emits crouch_run footsteps', () => {
    const speeds: Record<string, number> = {};
    const kinds: Record<string, Set<string>> = {};
    for (const mode of ['crouch', 'crouch_run', 'walk', 'sprint']) {
      const { pc, down, events, run } = rig();
      if (mode !== 'walk' && mode !== 'sprint') down.add('crouch');
      if (mode === 'crouch_run' || mode === 'sprint') down.add('sprint');
      run(0.6);
      events.length = 0;
      run(4);
      speeds[mode] = pc.state.speed;
      kinds[mode] = new Set(events.map((e) => e.kind));
      for (const e of events) expect(e.source).toBe('player');
    }
    expect(speeds.crouch_run).toBeGreaterThan(speeds.crouch + 0.5);
    expect(speeds.crouch_run).toBeLessThan(speeds.walk - 0.5);
    expect(speeds.crouch_run).toBeCloseTo(2.8, 0);
    expect([...kinds.crouch]).toEqual([]);
    expect([...kinds.crouch_run]).toEqual([stepKind('crouch_run')]);
    expect([...kinds.walk]).toEqual([stepKind('walk')]);
    expect([...kinds.sprint]).toEqual([stepKind('sprint')]);
  });
});
