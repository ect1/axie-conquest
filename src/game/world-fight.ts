import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode } from '@babylonjs/core';
import type { BattleSession } from './battle-save';

/** Camera-facing aggregate bars and one clash sprite; live combat creates no arena fighters. */
export function createWorldFight(scene: Scene) {
  const root = new TransformNode('world battle indicator', scene);
  const material = (name: string, color: string) => {
    const value = new StandardMaterial(name, scene);
    value.diffuseColor = Color3.FromHexString(color); value.emissiveColor = value.diffuseColor;
    value.specularColor = Color3.Black(); value.disableLighting = true; value.backFaceCulling = false;
    return value;
  };
  const friendly = material('attacker health', '#6be08b');
  const enemy = material('defender health', '#e16d61');
  const empty = material('battle health empty', '#26332f');
  function healthBar(name: string, fillMaterial: StandardMaterial) {
    const back = MeshBuilder.CreatePlane(`${name} background`, { width: 4.4, height: 0.48 }, scene);
    const fill = MeshBuilder.CreatePlane(name, { width: 4, height: 0.24 }, scene);
    back.parent = root; fill.parent = back; back.material = empty; fill.material = fillMaterial;
    back.billboardMode = Mesh.BILLBOARDMODE_ALL; fill.position.z = -0.02;
    back.isPickable = false; fill.isPickable = false;
    return { back, fill };
  }
  const attacker = healthBar('attacker formation health', friendly);
  const defender = healthBar('defender formation health', enemy);

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
  const clash = MeshBuilder.CreatePlane('world fight sprite', { size: 2.7 }, scene);
  clash.parent = root; clash.material = clashMaterial; clash.billboardMode = Mesh.BILLBOARDMODE_ALL;
  clash.isPickable = true; clash.metadata = { action: 'watchBattle' };

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
  const watchBadge = MeshBuilder.CreatePlane('world fight watch badge', { width: 4.4, height: 1.25 }, scene);
  watchBadge.parent = root; watchBadge.material = badgeMaterial; watchBadge.billboardMode = Mesh.BILLBOARDMODE_ALL;
  watchBadge.isPickable = false; watchBadge.metadata = { action: 'watchBattle' };

  const setAllEnabled = (enabled: boolean) => {
    root.setEnabled(enabled);
    clash.setEnabled(enabled);
    clash.isVisible = enabled;
    clash.isPickable = enabled;
    watchBadge.setEnabled(enabled);
    watchBadge.isVisible = enabled;
    watchBadge.isPickable = enabled;
    attacker.back.setEnabled(enabled);
    attacker.back.isVisible = enabled;
    attacker.fill.setEnabled(enabled);
    attacker.fill.isVisible = enabled;
    defender.back.setEnabled(enabled);
    defender.back.isVisible = enabled;
    defender.fill.setEnabled(enabled);
    defender.fill.isVisible = enabled;
  };

  setAllEnabled(false);
  let lastSession = '', lastTick = -3;
  return {
    update(session: BattleSession | null, visible: boolean) {
      const active = !!session && visible;
      setAllEnabled(active);
      if (!active || !session) return;
      const pulse = 1 + Math.sin(performance.now() / 170) * 0.08;
      clash.scaling.setAll(pulse); clash.rotation.z = Math.sin(performance.now() / 360) * 0.08;
      const badgePulse = 1 + Math.sin(performance.now() / 250) * 0.04;
      watchBadge.scaling.setAll(badgePulse);
      const key = `${session.army.id}:${session.startedAt}`;
      if (key === lastSession && session.battle.tick - lastTick < 3 && !session.battle.result) return;
      lastSession = key; lastTick = session.battle.tick;
      const players = session.battle.fighters.filter(fighter => fighter.side === 'player');
      const enemies = session.battle.fighters.filter(fighter => fighter.side === 'enemy');
      const ratio = (fighters: typeof players) => {
        const maximum = fighters.reduce((sum, fighter) => sum + fighter.maxHp, 0);
        return maximum ? fighters.reduce((sum, fighter) => sum + fighter.hp, 0) / maximum : 0;
      };
      root.position.set(session.target.x, 0, session.target.z); clash.position.set(0, 2, 0);
      attacker.back.position.set(0, 4, 0); defender.back.position.set(0, 3.4, 0);
      watchBadge.position.set(0, 4.85, 0);
      for (const [bar, value] of [[attacker, ratio(players)], [defender, ratio(enemies)]] as const) {
        bar.fill.scaling.x = Math.max(0.001, value);
        bar.fill.position.x = -2 * (1 - value);
      }
    },
    dispose() {
      root.dispose(); friendly.dispose(); enemy.dispose(); empty.dispose();
      clashMaterial.dispose(); clashTexture.dispose();
      badgeMaterial.dispose(); badgeTexture.dispose();
    },
  };
}
