import { Battle } from './battle';
import { BattleOverlays } from './battle-debug';
import { activeBattleSettings } from './battle-settings';
import { createBattleBoardScene } from './battle-board-scene';

/** Shared, fixed-isometric TFT-style tactical hex board scene for live battles and Mail replays. */
export function createBattleScene(
  canvas: HTMLCanvasElement,
  read: () => { battle: Battle; selected: string | null; overlays: BattleOverlays; all: boolean },
  select: (id: string) => void,
  onReady: () => void = () => {},
  passive = false,
  onModelError: (message: string) => void = () => {}
) {
  const layout = {
    hexGap: activeBattleSettings.boardHexGap ?? 0.35,
    teamGap: activeBattleSettings.boardTeamGap ?? 1,
    columns: activeBattleSettings.boardColumns ?? 5,
    rowsPerTeam: activeBattleSettings.boardRows ?? 3,
  };

  const handleReady = () => {
    canvas.dataset.battleReady = 'true';
    onReady();
  };

  const board = createBattleBoardScene(canvas, layout, handleReady, select, passive, onModelError);
  board.bindBattleReader(read);

  return {
    zoom: board.zoom,
    rotate: board.rotate,
    home: board.home,
    dispose: board.dispose,
  };
}
