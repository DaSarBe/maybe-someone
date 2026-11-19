import './style.css';
import { Game } from './core/Game';
import { GreyboxScene } from './world/GreyboxScene';

const params = new URLSearchParams(location.search);
const container = document.getElementById('app') as HTMLElement;

const game = new Game(container, {
  debug: params.has('debug'),
  forceTouch: params.get('touch') === '1',
});

if (params.has('debug')) {
  // 測試掛鉤：讓自動化測試可以操作遊戲
  (window as unknown as { __game: Game }).__game = game;
}

game.setScene(new GreyboxScene({ showHud: params.get('hud') !== '0' }));
game.start();
