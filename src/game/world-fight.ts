import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode } from '@babylonjs/core';
import type { Fighter } from './battle';
import type { BattleSession } from './battle-save';

type IndicatorInstance = {
  root: TransformNode;
  clash: Mesh;
  watchBadge: Mesh;
  attacker: { back: Mesh; fill: Mesh };
  defender: { back: Mesh; fill: Mesh };
  lastSession: string;
  lastTick: number;
};

/** Camera-facing aggregate bars and clash sprites for all active world battles. */
export function createWorldFight(scene: Scene) {
  const material = (name: string, color: string) => {
    const value = new StandardMaterial(name, scene);
    value.diffuseColor = Color3.FromHexString(color); value.emissiveColor = value.diffuseColor;
    value.specularColor = Color3.Black(); value.disableLighting = true; value.backFaceCulling = false;
    return value;
  };
  const friendly = material('attacker health', '#6be08b');
  const enemy = material('defender health', '#e16d61');
  const empty = material('battle health empty', '#26332f');

  const clashTexture = new DynamicTexture('world fight sprite texture', { width: 128, height: 128 }, scene, false);
  clashTexture.hasAlpha = true;
  const context = clashTexture.getContext();
  context.clearRect(0, 0, 128, 128);
  context.fillStyle = '#fff4c7'; context.beginPath(); context.arc(64, 64, 47, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#7a4b35'; context.lineWidth = 11;
  context.beginPath(); context.moveTo(37, 35); context.lineTo(91, 91); context.moveTo(91, 35); context.lineTo(37, 91); context.stroke();
  context.strokeStyle = '#f0be55'; context.lineWidth = 5;
  context.beginPath(); context.moveTo(39, 33); context.lineTo(93, 89); context.moveTo(89, 33); context.lineTo(35, 87); context.stroke();
  clashTexture.update();
  const clashMaterial = new StandardMaterial('world fight sprite material', scene);
  clashMaterial.diffuseTexture = clashTexture; clashMaterial.opacityTexture = clashTexture;
  clashMaterial.emissiveColor = Color3.White(); clashMaterial.disableLighting = true; clashMaterial.backFaceCulling = false;

  const badgeTexture = new DynamicTexture('world fight watch badge texture', { width: 256, height: 72 }, scene, false);
  badgeTexture.hasAlpha = true;
  const badgeCtx = badgeTexture.getContext() as unknown as CanvasRenderingContext2D;
  badgeCtx.clearRect(0, 0, 256, 72);
  badgeCtx.beginPath();
  if (typeof badgeCtx.roundRect === 'function') badgeCtx.roundRect(4, 4, 248, 64, 32);
  else badgeCtx.rect(4, 4, 248, 64);
  badgeCtx.fillStyle = 'rgba(18, 26, 24, 0.94)'; badgeCtx.fill();
  badgeCtx.lineWidth = 4; badgeCtx.strokeStyle = '#ffd166'; badgeCtx.stroke();
  badgeCtx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  badgeCtx.fillStyle = '#ffffff'; badgeCtx.textAlign = 'center'; badgeCtx.textBaseline = 'middle';
  badgeCtx.fillText('⚔ Watch Battle', 128, 36);
  badgeTexture.update();

  const badgeMaterial = new StandardMaterial('world fight watch badge mat', scene);
  badgeMaterial.diffuseTexture = badgeTexture; badgeMaterial.opacityTexture = badgeTexture;
  badgeMaterial.emissiveColor = Color3.White(); badgeMaterial.disableLighting = true; badgeMaterial.backFaceCulling = false;

  function healthBar(parent: TransformNode, name: string, fillMaterial: StandardMaterial) {
    const back = MeshBuilder.CreatePlane(`${name} background`, { width: 4.4, height: 0.48 }, scene);
    const fill = MeshBuilder.CreatePlane(name, { width: 4, height: 0.24 }, scene);
    back.parent = parent; fill.parent = back; back.material = empty; fill.material = fillMaterial;
    back.billboardMode = Mesh.BILLBOARDMODE_ALL; fill.position.z = -0.02;
    back.isPickable = false; fill.isPickable = false;
    return { back, fill };
  }

  const indicators = new Map<string, IndicatorInstance>();

  function createIndicator(id: string): IndicatorInstance {
    const root = new TransformNode(`world battle indicator ${id}`, scene);
    const attacker = healthBar(root, `attacker health ${id}`, friendly);
    const defender = healthBar(root, `defender health ${id}`, enemy);

    const clash = MeshBuilder.CreatePlane(`world fight sprite ${id}`, { size: 2.7 }, scene);
    clash.parent = root; clash.material = clashMaterial; clash.billboardMode = Mesh.BILLBOARDMODE_ALL;
    clash.isPickable = true; clash.metadata = { action: 'watchBattle', sessionId: id };

    const watchBadge = MeshBuilder.CreatePlane(`world fight watch badge ${id}`, { width: 4.4, height: 1.25 }, scene);
    watchBadge.parent = root; watchBadge.material = badgeMaterial; watchBadge.billboardMode = Mesh.BILLBOARDMODE_ALL;
    watchBadge.isPickable = true; watchBadge.metadata = { action: 'watchBattle', sessionId: id };

    clash.position.set(0, 1.75, 0);
    attacker.back.position.set(0, 4, 0);
    defender.back.position.set(0, 3.4, 0);
    watchBadge.position.set(0, 5.7, 0);

    return { root, clash, watchBadge, attacker, defender, lastSession: '', lastTick: -3 };
  }

  function setIndicatorEnabled(ind: IndicatorInstance, enabled: boolean) {
    ind.root.setEnabled(enabled);
    ind.clash.setEnabled(enabled); ind.clash.isVisible = enabled; ind.clash.isPickable = enabled;
    ind.watchBadge.setEnabled(enabled); ind.watchBadge.isVisible = enabled; ind.watchBadge.isPickable = enabled;
    ind.attacker.back.setEnabled(enabled); ind.attacker.back.isVisible = enabled;
    ind.attacker.fill.setEnabled(enabled); ind.attacker.fill.isVisible = enabled;
    ind.defender.back.setEnabled(enabled); ind.defender.back.isVisible = enabled;
    ind.defender.fill.setEnabled(enabled); ind.defender.fill.isVisible = enabled;
  }

  return {
    update(sessionsInput: readonly BattleSession[] | BattleSession | null, visible: boolean) {
      const list = Array.isArray(sessionsInput) ? sessionsInput : sessionsInput ? [sessionsInput] : [];
      const activeKeys = new Set<string>();

      for (const session of list) {
        if (!session) continue;
        const key = session.id || `${session.army.id}:${session.startedAt ?? 0}`;
        activeKeys.add(key);

        let ind = indicators.get(key);
        if (!ind) {
          ind = createIndicator(key);
          indicators.set(key, ind);
        }

        setIndicatorEnabled(ind, visible);
        if (!visible) continue;

        const pulse = 1 + Math.sin(performance.now() / 170) * 0.08;
        ind.clash.scaling.setAll(pulse); ind.clash.rotation.z = Math.sin(performance.now() / 360) * 0.08;
        const badgePulse = 1 + Math.sin(performance.now() / 250) * 0.04;
        ind.watchBadge.scaling.setAll(badgePulse);

        ind.root.position.set(session.target.x, 0, session.target.z);
        ind.clash.metadata = { action: 'watchBattle', sessionId: key };
        ind.watchBadge.metadata = { action: 'watchBattle', sessionId: key };

        if (key === ind.lastSession && session.battle.tick - ind.lastTick < 3 && !session.battle.result) continue;
        ind.lastSession = key; ind.lastTick = session.battle.tick;

        const players = session.battle.fighters.filter((fighter: Fighter) => fighter.side === 'player');
        const enemies = session.battle.fighters.filter((fighter: Fighter) => fighter.side === 'enemy');
        const ratio = (fighters: Fighter[]) => {
          const maximum = fighters.reduce((sum: number, fighter: Fighter) => sum + fighter.maxHp, 0);
          return maximum ? fighters.reduce((sum: number, fighter: Fighter) => sum + fighter.hp, 0) / maximum : 0;
        };

        for (const [bar, value] of [[ind.attacker, ratio(players)], [ind.defender, ratio(enemies)]] as const) {
          bar.fill.scaling.x = Math.max(0.001, value);
          bar.fill.position.x = -2 * (1 - value);
        }
      }

      indicators.forEach((ind, k) => {
        if (!activeKeys.has(k)) {
          ind.root.dispose();
          indicators.delete(k);
        }
      });
    },
    dispose() {
      indicators.forEach(ind => ind.root.dispose());
      indicators.clear();
      friendly.dispose(); enemy.dispose(); empty.dispose();
      clashMaterial.dispose(); clashTexture.dispose();
      badgeMaterial.dispose(); badgeTexture.dispose();
    },
  };
}
