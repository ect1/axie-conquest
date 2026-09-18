import {
  Scene,
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  DynamicTexture,
  Mesh,
  LinesMesh,
} from '@babylonjs/core';
import {
  EnemyMarch,
  enemyMarchPosition,
  PortalInstance,
  PortalRuntimeState,
} from './portal';

export type PortalSceneCallbacks = {
  onSelectPortal?: (portalId: string) => void;
  onSelectMarch?: (marchId: string) => void;
};

type PortalVisualNode = {
  portal: PortalInstance;
  root: TransformNode;
  vortexRings: Mesh[];
  floatingShards: Mesh[];
  billboardMesh: Mesh;
  texture: DynamicTexture;
  lastDrawnText: string;
};

type EnemyMarchVisualNode = {
  march: EnemyMarch;
  root: TransformNode;
  ring: Mesh;
  trailLine: LinesMesh;
  unitNodes: TransformNode[];
};

export class PortalSceneManager {
  private readonly root: TransformNode;
  private readonly portalNodes = new Map<string, PortalVisualNode>();
  private readonly marchNodes = new Map<string, EnemyMarchVisualNode>();
  private readonly sharedMaterials: StandardMaterial[] = [];
  private selectedId: string | null = null;
  private animTime = 0;

  constructor(
    private readonly scene: Scene,
    private readonly callbacks: PortalSceneCallbacks = {}
  ) {
    this.root = new TransformNode('portal-system-root', scene);
  }

  public setSelectedId(selectedId: string | null): void {
    this.selectedId = selectedId;
    this.marchNodes.forEach(({ march, ring }) => {
      ring.setEnabled(march.id === selectedId);
    });
  }

  public update(state: PortalRuntimeState, now = Date.now()): void {
    this.animTime += 0.03;

    // 1. Sync Portal structures
    const activePortalIds = new Set(state.portals.map(p => p.id));

    // Remove disposed portals
    this.portalNodes.forEach((node, id) => {
      if (!activePortalIds.has(id)) {
        node.root.dispose();
        node.texture.dispose();
        this.portalNodes.delete(id);
      }
    });

    // Add or update portals
    for (const portal of state.portals) {
      let visual = this.portalNodes.get(portal.id);
      if (!visual) {
        visual = this.createPortalVisual(portal);
        this.portalNodes.set(portal.id, visual);
      } else {
        visual.portal = portal;
        visual.root.position.set(portal.coordinate.x, 0, portal.coordinate.z);
      }

      // Animate swirling vortex
      visual.vortexRings.forEach((ring, idx) => {
        ring.rotation.y += (idx % 2 === 0 ? 1 : -1) * 0.025;
      });

      // Animate floating shards
      visual.floatingShards.forEach((shard, idx) => {
        shard.position.y = 1.2 + Math.sin(this.animTime + idx * 1.5) * 0.35;
        shard.rotation.y += 0.02;
      });

      // Update Billboard Sprite
      this.updatePortalBillboard(visual, now);
    }

    // 2. Sync Enemy Marches
    const activeMarchIds = new Set(state.activeEnemyMarches.map(m => m.id));

    // Remove finished / arrived marches (they disappear)
    this.marchNodes.forEach((node, id) => {
      if (!activeMarchIds.has(id)) {
        node.root.dispose();
        node.trailLine.dispose();
        this.marchNodes.delete(id);
      }
    });

    // Add or update active marches
    for (const march of state.activeEnemyMarches) {
      let visual = this.marchNodes.get(march.id);
      if (!visual) {
        visual = this.createMarchVisual(march);
        this.marchNodes.set(march.id, visual);
      } else {
        visual.march = march;
      }

      const currentPos = enemyMarchPosition(march, now);
      visual.root.position.set(currentPos.x, 0, currentPos.z);
      visual.ring.setEnabled(march.id === this.selectedId);

      // Gentle movement bob
      visual.unitNodes.forEach((unitNode, idx) => {
        unitNode.position.y = Math.abs(Math.sin(now / 150 + idx)) * 0.15;
      });
    }
  }

  private createPortalVisual(portal: PortalInstance): PortalVisualNode {
    const root = new TransformNode(`portal-root-${portal.id}`, this.scene);
    root.parent = this.root;
    root.position.set(portal.coordinate.x, 0, portal.coordinate.z);

    // Stone runic altar base
    const altarMat = new StandardMaterial(`portal-altar-mat-${portal.id}`, this.scene);
    altarMat.diffuseColor = Color3.FromHexString('#241d31');
    altarMat.specularColor = Color3.FromHexString('#581c87');
    this.sharedMaterials.push(altarMat);

    const altar = MeshBuilder.CreateCylinder(`portal-altar-${portal.id}`, { diameter: 6.2, height: 0.45, tessellation: 16 }, this.scene);
    altar.parent = root;
    altar.position.y = 0.22;
    altar.material = altarMat;

    // Glowing purple runic outer ring
    const ringMat = new StandardMaterial(`portal-ring-mat-${portal.id}`, this.scene);
    ringMat.diffuseColor = Color3.FromHexString('#7c3aed');
    ringMat.emissiveColor = Color3.FromHexString('#9333ea');
    ringMat.specularColor = Color3.Black();
    this.sharedMaterials.push(ringMat);

    const runeRing = MeshBuilder.CreateTorus(`portal-rune-ring-${portal.id}`, { diameter: 5.2, thickness: 0.22, tessellation: 32 }, this.scene);
    runeRing.parent = root;
    runeRing.position.y = 0.35;
    runeRing.material = ringMat;

    // Swirling vortex inner rings
    const vortexMat = new StandardMaterial(`portal-vortex-mat-${portal.id}`, this.scene);
    vortexMat.diffuseColor = Color3.FromHexString('#c084fc');
    vortexMat.emissiveColor = Color3.FromHexString('#a855f7');
    vortexMat.alpha = 0.85;
    this.sharedMaterials.push(vortexMat);

    const innerRing1 = MeshBuilder.CreateTorus(`portal-vortex-1-${portal.id}`, { diameter: 3.6, thickness: 0.28, tessellation: 24 }, this.scene);
    innerRing1.parent = root;
    innerRing1.position.y = 0.4;
    innerRing1.material = vortexMat;

    const innerRing2 = MeshBuilder.CreateTorus(`portal-vortex-2-${portal.id}`, { diameter: 2.2, thickness: 0.24, tessellation: 20 }, this.scene);
    innerRing2.parent = root;
    innerRing2.position.y = 0.45;
    innerRing2.material = vortexMat;

    // Center void core
    const coreMat = new StandardMaterial(`portal-core-mat-${portal.id}`, this.scene);
    coreMat.diffuseColor = Color3.Black();
    coreMat.emissiveColor = Color3.FromHexString('#3b0764');
    this.sharedMaterials.push(coreMat);

    const core = MeshBuilder.CreateSphere(`portal-core-${portal.id}`, { diameter: 1.8, segments: 8 }, this.scene);
    core.parent = root;
    core.position.y = 0.6;
    core.material = coreMat;

    // Orbiting void monolith shards
    const shardMat = new StandardMaterial(`portal-shard-mat-${portal.id}`, this.scene);
    shardMat.diffuseColor = Color3.FromHexString('#4c1d95');
    shardMat.emissiveColor = Color3.FromHexString('#6b21a8');
    this.sharedMaterials.push(shardMat);

    const floatingShards: Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const shard = MeshBuilder.CreateCylinder(`portal-shard-${portal.id}-${i}`, { diameterTop: 0, diameterBottom: 0.6, height: 1.6, tessellation: 4 }, this.scene);
      shard.parent = root;
      shard.position.set(Math.cos(angle) * 2.8, 1.2, Math.sin(angle) * 2.8);
      shard.rotation.x = 0.2;
      shard.material = shardMat;
      shard.isPickable = false;
      floatingShards.push(shard);
    }

    // Touch hit cylinder
    const hitArea = MeshBuilder.CreateCylinder(`portal-hit-${portal.id}`, { diameter: 7.2, height: 4, tessellation: 16 }, this.scene);
    hitArea.parent = root;
    hitArea.position.y = 2;
    hitArea.visibility = 0;
    hitArea.isPickable = true;
    hitArea.metadata = {
      portalId: portal.id,
      mapObject: `${portal.name} (Level ${portal.level})`,
    };

    // 3D Billboard Sprite with DynamicTexture
    const texture = new DynamicTexture(`portal-tex-${portal.id}`, { width: 512, height: 220 }, this.scene, true);
    texture.hasAlpha = true;

    const billboardMat = new StandardMaterial(`portal-bb-mat-${portal.id}`, this.scene);
    billboardMat.diffuseTexture = texture;
    billboardMat.emissiveColor = Color3.White();
    billboardMat.specularColor = Color3.Black();
    billboardMat.useAlphaFromDiffuseTexture = true;
    this.sharedMaterials.push(billboardMat);

    const billboardMesh = MeshBuilder.CreatePlane(`portal-billboard-${portal.id}`, { width: 5.6, height: 2.4 }, this.scene);
    billboardMesh.parent = root;
    billboardMesh.position.y = 4.2;
    billboardMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    billboardMesh.material = billboardMat;
    billboardMesh.isPickable = true;
    billboardMesh.metadata = {
      portalId: portal.id,
      mapObject: `${portal.name} (Level ${portal.level})`,
    };

    // Make all visual meshes propagate portalId metadata
    [altar, runeRing, innerRing1, innerRing2, core].forEach(mesh => {
      mesh.isPickable = true;
      mesh.metadata = {
        portalId: portal.id,
        mapObject: `${portal.name} (Level ${portal.level})`,
      };
    });

    return {
      portal,
      root,
      vortexRings: [innerRing1, innerRing2],
      floatingShards,
      billboardMesh,
      texture,
      lastDrawnText: '',
    };
  }

  private updatePortalBillboard(node: PortalVisualNode, now: number): void {
    const portal = node.portal;
    const remainingSec = Math.max(0, Math.ceil((portal.nextAttackTime - now) / 1000));

    let statusLine = '';
    let statusColor = '#ffffff';

    if (portal.cycleState === 'disabled') {
      statusLine = '⏸️ SUMMONING PAUSED';
      statusColor = '#94a3b8';
    } else if (portal.cycleState === 'exhausted') {
      statusLine = `⏳ EXHAUSTED: ${remainingSec}s`;
      statusColor = '#fbbf24';
    } else {
      statusLine = `⚔️ ATTACK IN ${remainingSec}s`;
      statusColor = '#f87171';
    }

    const stateKey = `${portal.name}-${portal.level}-${statusLine}`;
    if (node.lastDrawnText === stateKey) return;
    node.lastDrawnText = stateKey;

    const ctx = node.texture.getContext() as unknown as CanvasRenderingContext2D;
    const w = 512;
    const h = 220;

    ctx.clearRect(0, 0, w, h);

    // Dark rounded badge background
    ctx.fillStyle = 'rgba(20, 14, 32, 0.9)';
    this.roundRect(ctx, 12, 12, w - 24, h - 24, 22);
    ctx.fill();

    // Purple neon border
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Header: Portal Name & Level
    ctx.font = 'bold 30px Arial, Helvetica, sans-serif';
    ctx.fillStyle = '#f3e8ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🌀 ${portal.name.toUpperCase()} · LV. ${portal.level}`, w / 2, 54);

    // Status: Countdown / State
    ctx.font = 'bold 34px Arial, Helvetica, sans-serif';
    ctx.fillStyle = statusColor;
    ctx.fillText(statusLine, w / 2, 108);

    // Subtitle: Next wave composition breakdown
    const form = portal.upcomingFormation;
    ctx.font = 'bold 22px Arial, Helvetica, sans-serif';
    ctx.fillStyle = '#d8b4fe';
    ctx.fillText(`👑 ${form.totalMascot} Mascots  ·  ⚔️ ${form.totalSoldier} Soldiers  ·  🏹 ${form.totalArcher} Archers`, w / 2, 164);

    node.texture.update();
  }

  private createMarchVisual(march: EnemyMarch): EnemyMarchVisualNode {
    const root = new TransformNode(`enemy-march-${march.id}`, this.scene);
    root.parent = this.root;
    root.position.set(march.origin.x, 0, march.origin.z);

    // Rotate towards city destination
    root.rotation.y = Math.atan2(march.destination.x - march.origin.x, march.destination.z - march.origin.z);

    // Selection ring (crimson glow)
    const ringMat = new StandardMaterial(`march-ring-mat-${march.id}`, this.scene);
    ringMat.diffuseColor = Color3.FromHexString('#ef4444');
    ringMat.emissiveColor = Color3.FromHexString('#dc2626');
    this.sharedMaterials.push(ringMat);

    const ring = MeshBuilder.CreateTorus(`enemy-selection-${march.id}`, { diameter: 7.5, thickness: 0.16, tessellation: 36 }, this.scene);
    ring.parent = root;
    ring.position.y = 0.12;
    ring.material = ringMat;
    ring.isPickable = false;
    ring.setEnabled(march.id === this.selectedId);

    // Hostile red trail line from origin (portal) to destination (city)
    const trailLine = MeshBuilder.CreateLines(
      `enemy-trail-${march.id}`,
      { points: [new Vector3(march.origin.x, 0.22, march.origin.z), new Vector3(march.destination.x, 0.22, march.destination.z)] },
      this.scene
    );
    trailLine.parent = this.root;
    trailLine.color = Color3.FromHexString('#ef4444');
    trailLine.alpha = 0.75;
    trailLine.isPickable = false;

    // Units in formation
    const unitNodes: TransformNode[] = [];

    // Materials for mob kinds
    const mascotMat = new StandardMaterial(`mascot-mat-${march.id}`, this.scene);
    mascotMat.diffuseColor = Color3.FromHexString('#ec4899'); // Crimson-pink Axie mascot
    mascotMat.emissiveColor = Color3.FromHexString('#831843');
    this.sharedMaterials.push(mascotMat);

    const soldierMat = new StandardMaterial(`soldier-mat-${march.id}`, this.scene);
    soldierMat.diffuseColor = Color3.FromHexString('#475569'); // Dark steel armor
    soldierMat.emissiveColor = Color3.FromHexString('#b91c1c'); // Crimson trim
    this.sharedMaterials.push(soldierMat);

    const archerMat = new StandardMaterial(`archer-mat-${march.id}`, this.scene);
    archerMat.diffuseColor = Color3.FromHexString('#15803d'); // Woodland / sniper green
    archerMat.emissiveColor = Color3.FromHexString('#052e16');
    this.sharedMaterials.push(archerMat);

    march.formation.slots.forEach(slot => {
      const squadNode = new TransformNode(`squad-${slot.id}`, this.scene);
      squadNode.parent = root;
      squadNode.position.set(slot.offset.x, 0, slot.offset.z);
      unitNodes.push(squadNode);

      if (slot.kind === 'mascot') {
        // Mascot hero
        const body = MeshBuilder.CreateSphere(`mascot-body-${slot.id}`, { diameter: 1.1, segments: 8 }, this.scene);
        body.parent = squadNode;
        body.position.y = 0.75;
        body.material = mascotMat;
        body.isPickable = true;
        body.metadata = { unitId: march.id, isEnemy: true };

        // Horns / Ears
        for (const side of [-1, 1]) {
          const ear = MeshBuilder.CreateCylinder(`mascot-ear-${slot.id}`, { height: 0.5, diameterBottom: 0.28, diameterTop: 0, tessellation: 6 }, this.scene);
          ear.parent = squadNode;
          ear.position.set(side * 0.35, 1.35, 0);
          ear.material = mascotMat;
          ear.isPickable = true;
          ear.metadata = { unitId: march.id, isEnemy: true };
        }
      } else if (slot.kind === 'soldier') {
        // Vanguard soldier
        const body = MeshBuilder.CreateBox(`soldier-body-${slot.id}`, { width: 0.75, height: 0.9, depth: 0.75 }, this.scene);
        body.parent = squadNode;
        body.position.y = 0.65;
        body.material = soldierMat;
        body.isPickable = true;
        body.metadata = { unitId: march.id, isEnemy: true };

        // Shield
        const shield = MeshBuilder.CreateBox(`soldier-shield-${slot.id}`, { width: 0.5, height: 0.7, depth: 0.1 }, this.scene);
        shield.parent = squadNode;
        shield.position.set(0.42, 0.65, 0.25);
        shield.material = mascotMat;
        shield.isPickable = true;
        shield.metadata = { unitId: march.id, isEnemy: true };
      } else {
        // Archer
        const body = MeshBuilder.CreateCylinder(`archer-body-${slot.id}`, { diameterBottom: 0.65, diameterTop: 0.35, height: 0.95, tessellation: 8 }, this.scene);
        body.parent = squadNode;
        body.position.y = 0.65;
        body.material = archerMat;
        body.isPickable = true;
        body.metadata = { unitId: march.id, isEnemy: true };

        // Bow / Hat
        const hat = MeshBuilder.CreateCylinder(`archer-hat-${slot.id}`, { diameterBottom: 0.75, diameterTop: 0.1, height: 0.4, tessellation: 6 }, this.scene);
        hat.parent = squadNode;
        hat.position.y = 1.2;
        hat.material = archerMat;
        hat.isPickable = true;
        hat.metadata = { unitId: march.id, isEnemy: true };
      }
    });

    // Touch hit area cylinder across entire march
    const touchTarget = MeshBuilder.CreateCylinder(`enemy-hit-${march.id}`, { diameter: 7.5, height: 2.2, tessellation: 16 }, this.scene);
    touchTarget.parent = root;
    touchTarget.position.y = 1;
    touchTarget.visibility = 0;
    touchTarget.isPickable = true;
    touchTarget.metadata = { unitId: march.id, isEnemy: true };

    return {
      march,
      root,
      ring,
      trailLine,
      unitNodes,
    };
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  public dispose(): void {
    this.portalNodes.forEach(node => {
      node.root.dispose();
      node.texture.dispose();
    });
    this.portalNodes.clear();

    this.marchNodes.forEach(node => {
      node.root.dispose();
      node.trailLine.dispose();
    });
    this.marchNodes.clear();

    this.sharedMaterials.forEach(m => m.dispose());
    this.sharedMaterials.length = 0;

    this.root.dispose();
  }
}
