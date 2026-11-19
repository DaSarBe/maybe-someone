import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { MapBuilder } from '../src/world/MapBuilder';

describe('MapBuilder.addStairs', () => {
  const steps = 10, rise = 0.2, depth = 0.4;
  const build = () => {
    const b = new MapBuilder();
    b.addStairs({ surface: 'metal', color: '#999', x: 0, y: 0, z: 0, steps, rise, depth, width: 3 });
    return b.build();
  };
  const count = (o: THREE.Object3D): number => {
    let n = 0;
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh) n++; });
    return n;
  };

  it('visual steps carry the surface tag and are not in the collision group', () => {
    const { group, meshes, collision } = build();
    expect(meshes).toHaveLength(1);
    expect(meshes[0].userData.surface).toBe('metal');
    expect(group.children).toContain(meshes[0]);
    expect(count(collision)).toBe(1);
    expect(collision.children[0]).not.toBe(meshes[0]);
    expect(collision.children[0].name).toContain('ramp');
    expect(collision.children.every((c) => !group.children.includes(c))).toBe(true);
  });

  it('collision is a smooth ramp: surface height follows the tread centers, no step lips', () => {
    const { collision } = build();
    const octree = new Octree();
    octree.fromGraphNode(collision);
    const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    const heightAt = (x: number): number => {
      ray.origin.set(x, 5, 0);
      const hit = octree.rayIntersect(ray);
      return hit ? 5 - hit.distance : NaN;
    };
    // 每階踏面中心的高度 = (i+1)*rise
    for (let i = 0; i < steps; i++) expect(heightAt((i + 0.5) * depth - 0.001)).toBeCloseTo((i + 1) * rise, 2);
    // 相鄰取樣點高度差平滑（斜率固定 rise/depth）
    for (let x = 0; x < 3.6; x += 0.1) expect(heightAt(x + 0.1) - heightAt(x)).toBeCloseTo((0.1 * rise) / depth, 2);
  });
});
