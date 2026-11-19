import type { Game } from '../core/Game';
import type { MenuButton } from './PauseMenu';

/** 所有場景共用的暫停選單按鈕：重置存檔（需二次確認） */
export function resetSaveButton(game: Game): MenuButton {
  return {
    label: '重置存檔',
    confirm: '再按一次確認：所有進度將被清除',
    cls: 'warn',
    onClick: () => {
      game.economy.resetProfile();
      game.setScene(game.scenes.hub());
    },
  };
}
