import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { buildHarborCore } from '../src/world/maps/harbor1990/core';
import { NAV_DENSE, NAV_FORCED } from '../src/world/maps/harbor1990/navForced';
import { generateNav } from '../src/world/maps/harbor1990/navTools';

/**
 * 導航圖產生器（離線）。地圖幾何改了之後重新產生：
 *   GEN_HARBOR_NAV=1 npx vitest run tests/harbor-nav-gen.test.ts
 * 平常（沒有設環境變數）這個測試是跳過的。
 */

describe.skipIf(!process.env.GEN_HARBOR_NAV)('harbor nav generator', () => {
  it('generates navData.ts', () => {
    const core = buildHarborCore();
    const oct = new Octree();
    oct.fromGraphNode(core.collision);
    const forced = NAV_FORCED;
    const t0 = Date.now();
    const nav = generateNav(oct, { x0: -91, z0: -63, x1: 91, z1: 91 }, forced, { dense: NAV_DENSE });
    const r = (n: number): number => Math.round(n * 100) / 100;
    const nodes = nav.nodes.flatMap((p) => [r(p.x), r(p.y), r(p.z)]);
    const edges = nav.edges.flat();
    writeFileSync(
      'src/world/maps/harbor1990/navData.ts',
      `/** 由 tests/harbor-nav-gen.test.ts 產生（GEN_HARBOR_NAV=1 npx vitest run tests/harbor-nav-gen.test.ts）。不要手改。 */\n` +
        `export const NAV_NODES: number[] = ${JSON.stringify(nodes)};\nexport const NAV_EDGES: number[] = ${JSON.stringify(edges)};\n`,
    );
    console.log(`nav: ${nav.nodes.length} nodes, ${nav.edges.length} edges, ${Date.now() - t0} ms`);
  }, 600_000);
});
