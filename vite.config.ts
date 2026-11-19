import { defineConfig } from 'vite';

// GitHub Pages 部署在子路徑 /maybe-someone/；本機開發與一般建置維持根路徑。
// 所有素材路徑一律以 import.meta.env.BASE_URL 開頭。
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/maybe-someone/' : '/',
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 900 },
});
