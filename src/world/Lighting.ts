import * as THREE from 'three';

/** 半球光 + 有陰影的平行光 + 霧 */
export function setupLighting(scene: THREE.Scene, opts: { shadowMapSize: number; extent: number }): THREE.DirectionalLight {
  const sky = new THREE.Color('#a9c4dc');
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 35, 120);

  scene.add(new THREE.HemisphereLight('#dbe9ff', '#5b5648', 1.1));

  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.shadowMapSize, opts.shadowMapSize);
  const e = opts.extent;
  const cam = sun.shadow.camera;
  cam.left = -e; cam.right = e; cam.top = e; cam.bottom = -e;
  cam.near = 1; cam.far = 140;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  return sun;
}
