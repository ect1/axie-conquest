import '@babylonjs/loaders/glTF';
import { AssetContainer, Color3, PBRMaterial, SceneLoader, TransformNode, type Node, type Scene } from '@babylonjs/core';

export type AxiePartRigPlan = { readonly type: string; readonly attachNode: string; readonly lod: { readonly url: string; readonly sceneNode: string } };
export type BabylonAxiePlan = {
  readonly genes: string;
  readonly palette?: { readonly primary?: string; readonly secondary?: string } | null;
  readonly body: { readonly id: string; readonly assetAvailable: boolean; readonly lod: { readonly url: string; readonly sceneNode: string } | null };
  readonly parts: readonly { readonly assetId: string; readonly rigs: readonly AxiePartRigPlan[] }[];
};
export type BabylonAxieInstance = { readonly root: TransformNode; readonly genes: string; readonly bodyId: string; readonly attachedPartCount: number; dispose(): void };

function descendants(root: Node): Node[] { return [root, ...root.getDescendants(false)]; }
function findInRoots(roots: readonly Node[], name: string) { return roots.flatMap(descendants).find((node) => node.name === name); }
function paletteColor(value: string | undefined, fallback: string) {
  return Color3.FromHexString(`#${(value ?? fallback).replace(/^#/, '')}`);
}

/** Caches source GLBs and creates a separate body-plus-socketed-parts instance for each Axie. */
export class BabylonAxieMixer {
  private readonly containers = new Map<string, Promise<AssetContainer>>();
  private nextInstanceId = 0;

  constructor(private readonly scene: Scene) {}

  async create(plan: BabylonAxiePlan): Promise<BabylonAxieInstance> {
    if (!plan.body.assetAvailable || !plan.body.lod) throw new Error(`Body ${plan.body.id} is unavailable in the Axie manifest.`);
    const instanceId = ++this.nextInstanceId;
    const root = new TransformNode(`Axie:${plan.body.id}:${instanceId}`, this.scene);
    const body = await this.instantiate(plan.body.lod.url);
    body.rootNodes.forEach((node) => node.parent = root);
    const bodyRoots = body.rootNodes;
    let attachedPartCount = 0;

    try {
      for (const part of plan.parts) for (const rig of part.rigs) {
        const socket = findInRoots(bodyRoots, rig.attachNode);
        if (!socket) throw new Error(`Body ${plan.body.id} has no instantiated socket ${rig.attachNode} for ${part.assetId}.`);
        const partInstance = await this.instantiate(rig.lod.url);
        const partRoots = partInstance.rootNodes;
        const partNode = findInRoots(partRoots, rig.lod.sceneNode);
        if (!partNode) {
          partInstance.rootNodes.forEach((node) => node.dispose());
          throw new Error(`Part ${part.assetId} does not contain node ${rig.lod.sceneNode}.`);
        }
        // Socket-local GLBs retain the Unity socket transform in the exported geometry.
        // Moving their selected node below the body bone makes them follow that bone.
        partNode.parent = socket;
        attachedPartCount += 1;
      }
      const material = this.createFallbackMaterial(plan, instanceId);
      root.getChildMeshes(false).forEach((mesh) => {
        mesh.material = material;
        mesh.receiveShadows = true;
      });
      root.metadata = { axieGenes: plan.genes, axieBody: plan.body.id, axieMaterial: 'pbr-fallback' };
      return {
        root,
        genes: plan.genes,
        bodyId: plan.body.id,
        attachedPartCount,
        dispose: () => { root.dispose(false, true); material.dispose(); },
      };
    } catch (error) {
      root.dispose(false, true);
      throw error;
    }
  }

  dispose() {
    this.containers.forEach((entry) => { void entry.then((container) => container.dispose()); });
    this.containers.clear();
  }

  private source(url: string) {
    let entry = this.containers.get(url);
    if (!entry) {
      entry = SceneLoader.LoadAssetContainerAsync('', url, this.scene);
      this.containers.set(url, entry);
    }
    return entry;
  }

  private async instantiate(url: string) {
    const source = await this.source(url);
    // Names are retained so manifest socket and scene-node keys remain exact.
    // Each assembled Axie is isolated below its own wrapper root.
    return source.instantiateModelsToScene((name) => name, false);
  }

  private createFallbackMaterial(plan: BabylonAxiePlan, instanceId: number) {
    const material = new PBRMaterial(`AxiePbrFallback:${instanceId}`, this.scene);
    material.albedoColor = paletteColor(plan.palette?.primary, 'ffffff');
    material.emissiveColor = paletteColor(plan.palette?.secondary, '000000').scale(0.06);
    material.metallic = 0;
    material.roughness = 0.72;
    return material;
  }
}
