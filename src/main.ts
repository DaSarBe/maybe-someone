import './style.css';
import './ui/panels.css';
import './ui/combat.css';
import './ui/factions.css';
import './ui/layout/layout.css';
import { Game } from './core/Game';
import { GreyboxScene } from './world/GreyboxScene';
import { HubScene } from './world/HubScene';
import { RaidScene } from './world/RaidScene';
import { TEST_MAP_ID, getRaidMapLoader } from './world/maps';
import { DEFAULT_ERA } from './data/eras';

const params = new URLSearchParams(location.search);
const container = document.getElementById('app') as HTMLElement;

const game = new Game(container, {
  debug: params.has('debug'),
  forceTouch: params.get('touch') === '1',
  lazyAudio: params.get('lazyaudio') === '1',
});

if (params.has('debug')) {
  // 測試掛鉤：讓自動化測試可以操作遊戲
  (window as unknown as { __game: Game }).__game = game;
}

// 除錯 HUD 只在 ?debug=1 或 ?hud=1 時顯示（?hud=0 可強制關閉）
const showHud = params.get('hud') === '1' || (params.has('debug') && params.get('hud') !== '0');
let testMapOnce = params.get('scene') === 'raid' && params.get('map') === 'test';
game.scenes = {
  hub: () => new HubScene({ showHud }),
  // 時代 id → 地圖載入器在 world/maps/index.ts；從時光機出發時 startRaid 已先記下時代
  // ?map=test：用小型測試地圖（?scene=raid&map=test）；從時光機出發的一律用該時代的正式地圖
  raid: () => {
    const testMap = testMapOnce;
    testMapOnce = false; // 只有第一次（URL 直接進入）用測試地圖
    return new RaidScene(getRaidMapLoader(game.economy.profile.raid?.era ?? DEFAULT_ERA, testMap ? TEST_MAP_ID : null), { showHud, testMap });
  },
  greybox: () => new GreyboxScene({ showHud, onExit: () => game.setScene(game.scenes.hub()) }),
};

// 預設進入未來基地；?scene=greybox 進入 M1/M2 的灰盒測試場景，?scene=raid 直接開始測試 Raid
const start = params.get('scene');
if (start === 'harbor') {
  // ?scene=harbor：港口地圖預覽（M4 驗收用），動態載入，不增加主程式大小
  void import('./world/maps/HarborPreviewScene').then(({ HarborPreviewScene }) => {
    game.setScene(new HarborPreviewScene({ showHud }));
    game.start();
  });
} else {
  game.setScene(start === 'greybox' ? game.scenes.greybox() : start === 'raid' ? game.scenes.raid() : game.scenes.hub());
  game.start();
}
