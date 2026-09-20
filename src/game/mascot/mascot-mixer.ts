import '@babylonjs/loaders/glTF';
import {
  AbstractMesh,
  AnimationGroup,
  AssetContainer,
  SceneLoader,
  TransformNode,
  type Scene,
} from '@babylonjs/core';

export type MascotId = 'tripp' | 'xia' | 'bing' | 'kotaro' | 'kibo' | 'paladill' | 'pomodoro';
export type MascotTroopKind = 'soldier' | 'infantry' | 'archer' | 'kotaro' | 'paladill' | 'kibo' | 'pomodoro';

export type BabylonMascotInstance = {
  readonly root: TransformNode;
  readonly mascotId: MascotId;
  readonly kind: string;
  update(state: string, seconds: number): void;
  dispose(): void;
};

export type MascotConfig = {
  readonly id: MascotId;
  readonly name: string;
  readonly url: string;
  readonly equipmentUrl?: string;
  readonly equipmentBone?: string;
  readonly scale: number;
  readonly yOffset: number;
  readonly rotationY: number;
  readonly clips: {
    readonly idle: readonly string[];
    readonly run: readonly string[];
    readonly attack: readonly string[];
    readonly dead?: readonly string[];
  };
};

export const MASCOT_CONFIGS: Record<string, MascotConfig> = {
  soldier: {
    id: 'tripp',
    name: 'Tripp',
    url: '/assets/mascot/mascots/tripp.glb',
    scale: 0.65,
    yOffset: 0,
    rotationY: 0,
    clips: {
      idle: ['Idle'],
      run: ['Run', 'Walk'],
      attack: ['Axe.Attack', 'Axe.Skill', 'Attack'],
    },
  },
  infantry: {
    id: 'xia',
    name: 'Xia',
    url: '/assets/mascot/mascots/xia.glb',
    scale: 0.55,
    yOffset: 0,
    rotationY: 0,
    clips: {
      idle: ['Idle', 'Axe.Idle'],
      run: ['Run', 'Axe.Run', 'Walk'],
      attack: ['Axe.Attack', 'Axe.Skill', 'Attack'],
      dead: ['Dead'],
    },
  },
  archer: {
    id: 'bing',
    name: 'Bing',
    url: '/assets/mascot/mascots/bing.glb',
    scale: 0.65,
    yOffset: 0,
    rotationY: 0,
    clips: {
      idle: ['Cannon.Idle', 'Idle'],
      run: ['Cannon.Run', 'Run', 'Cannon.Walk', 'Walk'],
      attack: ['Cannon.Attack', 'Cannon.Skill', 'Attack'],
      dead: ['Dead'],
    },
  },
  kotaro: {
    id: 'kotaro',
    name: 'Kotaro',
    url: '/assets/mascot/mascots/kotaro.glb',
    equipmentUrl: '/assets/mascot/equipment/kotaro-sword.glb',
    equipmentBone: 'Weapon_R_JNT',
    scale: 0.65,
    yOffset: 0,
    rotationY: 0,
    clips: {
      idle: ['Sword.Idle', 'Idle'],
      run: ['Sword.Run', 'Run', 'Sword.Walk', 'Walk'],
      attack: ['Sword.Attack', 'Sword.Skill', 'Attack'],
      dead: ['Dead'],
    },
  },
  paladill: {
    id: 'paladill',
    name: 'Paladill',
    url: '/assets/mascot/mascots/paladill.glb',
    equipmentUrl: '/assets/mascot/equipment/paladill-axe.glb',
    equipmentBone: 'Weapon_R_JNT',
    scale: 0.7,
    yOffset: 0,
    rotationY: 0,
    clips: {
      idle: ['Idle'],
      run: ['Run', 'Walk'],
      attack: ['Axe.Attack', 'Axe.Skill', 'Attack'],
      dead: ['Dead'],
    },
  },
  kibo: {
    id: 'kibo',
    name: 'Kibo',
    url: '/assets/mascot/mascots/kibo.glb',
    equipmentUrl: '/assets/mascot/equipment/kibo-hammer.glb',
    equipmentBone: 'Weapon_R_JNT',
    scale: 0.65,
    yOffset: 0,
    rotationY: 0,
    clips: {
      idle: ['Hammer.Idle', 'Idle'],
      run: ['Hammer.Run', 'Run', 'Walk'],
      attack: ['Hammer.Attack', 'Hammer.Skill', 'Attack'],
      dead: ['Dead'],
    },
  },
  pomodoro: {
    id: 'pomodoro',
    name: 'Pomodoro',
    url: '/assets/mascot/mascots/pomodoro.glb',
    equipmentUrl: '/assets/mascot/equipment/pomodoro-staff.glb',
    equipmentBone: 'Weapon_R_JNT',
    scale: 0.65,
    yOffset: 0,
    rotationY: 0,
    clips: {
      idle: ['Staff.Idle', 'Idle'],
      run: ['Staff.Run', 'Run', 'Walk'],
      attack: ['Staff.Attack', 'Staff.Skill', 'Attack'],
      dead: ['Dead'],
    },
  },
};

function findClip(groups: readonly AnimationGroup[], candidates: readonly string[]): AnimationGroup | undefined {
  for (const candidate of candidates) {
    const match = groups.find(g =>
      g.name === candidate ||
      g.name.startsWith(`${candidate}_`) ||
      g.name.endsWith(`_${candidate}`) ||
      g.name.toLowerCase().includes(candidate.toLowerCase())
    );
    if (match) return match;
  }
  return undefined;
}

/**
 * Caches mascot GLB asset containers and creates independent animated instances
 * for Tripp (Soldiers), Xia (Infantry), and Boss heroes (Kotaro, Paladill).
 */
export class BabylonMascotMixer {
  private readonly containers = new Map<string, Promise<AssetContainer>>();
  private nextInstanceId = 0;
  private disposed = false;

  constructor(private readonly scene: Scene) {}

  async create(kind: MascotTroopKind | string): Promise<BabylonMascotInstance> {
    const config = MASCOT_CONFIGS[kind];
    if (!config) throw new Error(`Unknown mascot: ${kind}`);

    const container = await this.source(config.url);
    if (this.disposed) throw new Error('Scene disposed.');

    const instanceId = ++this.nextInstanceId;
    const root = new TransformNode(`Mascot:${config.id}:${instanceId}`, this.scene);
    root.scaling.setAll(config.scale);
    root.position.y = config.yOffset;
    if (config.rotationY !== 0) {
      root.rotation.y = config.rotationY;
    }

    const entries = container.instantiateModelsToScene(
      (name) => `${name}_${instanceId}`,
      false,
      { doNotInstantiate: true }
    );

    // Parent top-level instantiated nodes to our root wrapper
    entries.rootNodes.forEach(node => {
      node.parent = root;
    });

    // Make meshes unpickable so they don't block hex selection
    root.getChildMeshes().forEach(mesh => {
      mesh.isPickable = false;
      mesh.receiveShadows = true;
    });

    // Attach weapon / equipment if configured
    if (config.equipmentUrl) {
      try {
        const equipmentContainer = await this.source(config.equipmentUrl);
        if (!this.disposed) {
          const equipmentEntries = equipmentContainer.instantiateModelsToScene(
            (name) => `${name}_eq_${instanceId}`,
            false,
            { doNotInstantiate: true }
          );
          const skeleton = entries.skeletons[0];
          const boneName = config.equipmentBone ?? 'Weapon_R_JNT';
          const bone = skeleton?.bones.find(b => b.name === boneName || b.name === 'Weapon_R_JNT' || b.name === 'Hand_R_JNT');
          const charMesh = entries.rootNodes[0]?.getChildMeshes()[0];
          const weaponRoot = equipmentEntries.rootNodes[0];
          if (bone && charMesh && weaponRoot instanceof TransformNode) {
            weaponRoot.attachToBone(bone, charMesh);
          } else if (weaponRoot instanceof TransformNode) {
            weaponRoot.parent = root;
          }
          equipmentEntries.rootNodes.forEach(node => {
            node.getChildMeshes().forEach(mesh => {
              mesh.isPickable = false;
              mesh.receiveShadows = true;
            });
          });
          entries.rootNodes.push(...equipmentEntries.rootNodes);
        }
      } catch (err) {
        console.warn(`[mascot-mixer] Failed to load equipment for ${config.id}:`, err);
      }
    }

    const idleClip = findClip(entries.animationGroups, config.clips.idle);
    const runClip = findClip(entries.animationGroups, config.clips.run);
    const attackClip = findClip(entries.animationGroups, config.clips.attack);
    const deadClip = config.clips.dead ? findClip(entries.animationGroups, config.clips.dead) : undefined;

    let activeClip: AnimationGroup | undefined = idleClip;
    let currentState = 'holding';

    if (idleClip) {
      idleClip.start(true);
    }

    const resolveClip = (state: string): AnimationGroup | undefined => {
      if (state === 'attacking') return attackClip ?? idleClip;
      if (['approaching', 'charging', 'retreating', 'marching'].includes(state)) return runClip ?? idleClip;
      if (state === 'defeated') return deadClip;
      return idleClip;
    };

    const update = (state: string, _seconds: number) => {
      const targetClip = resolveClip(state);
      if (state !== currentState || targetClip !== activeClip) {
        currentState = state;
        if (activeClip && activeClip !== targetClip) {
          activeClip.stop();
        }
        if (targetClip) {
          activeClip = targetClip;
          if (!targetClip.isPlaying) {
            const loop = state !== 'defeated';
            targetClip.start(loop);
          }
        } else if (state === 'defeated') {
          // If no dead clip (e.g. Tripp), stop all animations on defeat
          activeClip?.stop();
          activeClip = undefined;
        }
      }
    };

    const dispose = () => {
      entries.animationGroups.forEach(g => {
        g.stop();
        g.dispose();
      });
      entries.rootNodes.forEach(node => node.dispose());
      root.dispose();
    };

    return {
      root,
      mascotId: config.id,
      kind,
      update,
      dispose,
    };
  }

  dispose() {
    this.disposed = true;
    this.containers.forEach(entry => {
      void entry.then(container => container.dispose(), () => {});
    });
    this.containers.clear();
  }

  private source(url: string): Promise<AssetContainer> {
    let entry = this.containers.get(url);
    if (!entry) {
      entry = SceneLoader.LoadAssetContainerAsync('', url, this.scene);
      this.containers.set(url, entry);
    }
    return entry;
  }
}
