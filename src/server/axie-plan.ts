import { readFile } from 'node:fs/promises';
import path from 'node:path';

const GENE_BITS = 512;
const GENE_HEX_DIGITS = GENE_BITS / 4;
const PART_ORDER = ['eye', 'mouth', 'ear', 'horn', 'back', 'tail'] as const;
const PART_NAMES = { eye: 'Eye', mouth: 'Mouth', ear: 'Ear', horn: 'Horn', back: 'Back', tail: 'Tail' } as const;
const CLASS_BY_CODE: Record<number, string> = { 0: 'Beast', 1: 'Bug', 2: 'Bird', 3: 'Plant', 4: 'Aquatic', 5: 'Reptile', 16: 'Mech', 17: 'Dawn', 18: 'Dusk' };
const BODY_BY_DETAIL: Record<number, string> = { 1: 'spiky', 2: 'fuzzy', 3: 'curly', 256: 'sumo', 257: 'wetdog', 384: 'bigyak' };
const COLOR_VARIANTS: Record<string, number> = {
  'Beast:0': 0, 'Beast:1': 1, 'Beast:2': 2, 'Beast:3': 3, 'Beast:4': 4, 'Beast:6': 5,
  'Plant:0': 6, 'Plant:1': 7, 'Plant:2': 8, 'Plant:3': 9, 'Plant:4': 10,
  'Aquatic:0': 11, 'Aquatic:1': 12, 'Aquatic:2': 13, 'Aquatic:3': 14, 'Aquatic:4': 15, 'Aquatic:6': 16,
  'Bug:0': 17, 'Bug:1': 18, 'Bug:2': 19, 'Bug:3': 20, 'Bug:4': 21,
  'Bird:0': 22, 'Bird:1': 23, 'Bird:2': 24, 'Bird:3': 25, 'Bird:4': 26,
  'Reptile:0': 27, 'Reptile:1': 28, 'Reptile:2': 29, 'Reptile:3': 30, 'Reptile:4': 31, 'Reptile:6': 32,
  'Dawn:0': 33, 'Dawn:1': 34, 'Dawn:2': 35, 'Dawn:3': 36, 'Dawn:4': 37,
  'Dusk:0': 38, 'Dusk:1': 39, 'Dusk:2': 40, 'Dusk:3': 41, 'Dusk:4': 42,
  'Mech:0': 43, 'Mech:1': 44, 'Mech:2': 45, 'Mech:3': 46, 'Mech:4': 47,
};

type PartType = typeof PART_ORDER[number];
type DecodedPart = { type: PartType; skin: number; class: string; variant: number; level: number; assetId: string };
type LodAsset = { url?: string; sceneNode?: string };
type PartRig = { type?: string; attachNode?: string; lods?: LodAsset[] };
type BodyAsset = { id?: string; lods?: LodAsset[]; animations?: { lite?: { url?: string } }; attachNodes?: Record<string, string> };
type PartAsset = { descriptor?: Omit<DecodedPart, 'assetId'>; rigs?: PartRig[] };
type AssetManifest = { assets?: { bodies?: Record<string, BodyAsset>; parts?: Record<string, PartAsset> }; creator?: { colorVariants?: Array<{ index?: number; primary1?: string; primary2?: string }> } };

class BitReader {
  private offset = 0;
  constructor(private readonly hex: string) {}
  read(count: number) {
    if (this.offset + count > GENE_BITS) throw new Error(`Gene read exceeds 512 bits at offset ${this.offset}.`);
    let result = 0;
    for (let index = 0; index < count; index += 1) {
      const bitOffset = this.offset + index;
      const nibble = Number.parseInt(this.hex[Math.floor(bitOffset / 4)], 16);
      result = (result * 2) + ((nibble >> (3 - (bitOffset % 4))) & 1);
    }
    this.offset += count;
    return result;
  }
  skip(count: number) { this.read(count); }
}

function normalizeGenes(genes: string) {
  const trimmed = genes.trim();
  const hex = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length === 0 || hex.length > GENE_HEX_DIGITS) {
    throw new Error('Genes must be a hexadecimal value with at most 128 digits.');
  }
  return `0x${hex.toLowerCase().padStart(GENE_HEX_DIGITS, '0')}`;
}

function partAssetId(part: Omit<DecodedPart, 'assetId'>) {
  return `S${part.skin.toString().padStart(2, '0')}_${part.class}${part.variant.toString().padStart(2, '0')}_L${part.level}_${PART_NAMES[part.type]}`;
}

function decodeGenes(genes: string) {
  const normalizedGenes = normalizeGenes(genes);
  const reader = new BitReader(normalizedGenes.slice(2));
  const mainClass = CLASS_BY_CODE[reader.read(5)];
  if (!mainClass) throw new Error('Genes have an unsupported main class.');
  reader.skip(45); reader.skip(5); reader.skip(1);
  const bodySkin = reader.read(9);
  const bodyDetail = reader.read(9);
  reader.skip(18);
  const primaryColor = reader.read(6);
  reader.skip(30);
  const body = bodySkin === 1 ? 'frosty' : BODY_BY_DETAIL[bodyDetail] ?? 'normal';
  const parts: DecodedPart[] = PART_ORDER.map((type) => {
    const stage = reader.read(2);
    reader.skip(13); reader.skip(1);
    const skin = reader.read(9);
    const partClass = CLASS_BY_CODE[reader.read(5)];
    if (!partClass) throw new Error(`Genes have an unsupported ${type} part class.`);
    const variant = reader.read(8);
    reader.skip(26);
    const part = { type, skin, class: partClass, variant, level: stage + 1 };
    return { ...part, assetId: partAssetId(part) };
  });
  return { genes: normalizedGenes, body, colorVariant: bodySkin === 1 ? 48 : COLOR_VARIANTS[`${mainClass}:${primaryColor}`] ?? 0, parts };
}

let manifestPromise: Promise<AssetManifest> | undefined;

function loadManifest() {
  manifestPromise ??= readFile(path.join(process.cwd(), 'public', 'assets', 'axie', 'manifest.json'), 'utf8')
    .then((source) => JSON.parse(source) as AssetManifest);
  return manifestPromise;
}

export async function buildAxiePlan(genes: string) {
  const decoded = decodeGenes(genes);
  return assemblePlan(decoded);
}

async function assemblePlan(decoded: ReturnType<typeof decodeGenes>) {
  const manifest = await loadManifest();
  const bodies = manifest.assets?.bodies ?? {};
  const parts = manifest.assets?.parts ?? {};
  const bodyAsset = bodies[decoded.body];
  const palette = manifest.creator?.colorVariants?.find((entry) => entry.index === decoded.colorVariant);
  return {
    ...decoded,
    palette: palette ? { primary: palette.primary1, secondary: palette.primary2 } : null,
    body: {
      id: decoded.body,
      animationUrl: bodyAsset?.animations?.lite?.url,
      assetAvailable: !!bodyAsset,
      lod: bodyAsset?.lods?.[0]?.url && bodyAsset.lods[0].sceneNode
        ? { url: bodyAsset.lods[0].url, sceneNode: bodyAsset.lods[0].sceneNode }
        : null,
    },
    parts: decoded.parts.map((part) => {
      const asset = parts[part.assetId];
      return {
        ...part,
        assetAvailable: !!asset,
        rigs: (asset?.rigs ?? []).flatMap((rig) => {
          const attachNode = bodyAsset?.attachNodes?.[rig.type ?? ''] ?? rig.attachNode;
          const lod = rig.lods?.[0];
          return attachNode && lod?.url && lod.sceneNode
            ? [{ type: rig.type, attachNode, lod: { url: lod.url, sceneNode: lod.sceneNode } }]
            : [];
        }),
      };
    }),
  };
}

/** Deterministic preview for fictional starter heroes; never substitutes a roster identity. */
export async function buildStarterAxiePlan(className: string) {
  const classes = Object.values(CLASS_BY_CODE);
  const canonical = className.toLowerCase() === 'aqua' ? 'Aquatic' : classes.find(c => c.toLowerCase() === className.toLowerCase());
  if (!canonical) throw new Error('Unknown starter class.');
  const manifest = await loadManifest();
  const parts = PART_ORDER.map(type => {
    const entries = Object.entries(manifest.assets?.parts ?? {}).filter(([, asset]) => asset.descriptor?.type === type && asset.descriptor.skin === 0 && asset.descriptor.level === 1);
    const entry = entries.find(([, asset]) => asset.descriptor?.class === canonical) ?? entries[0];
    if (!entry?.[1].descriptor) throw new Error(`No starter ${type} asset.`);
    return { ...entry[1].descriptor, assetId: entry[0] };
  });
  return assemblePlan({ genes: '', body: 'normal', colorVariant: COLOR_VARIANTS[`${canonical}:0`], parts });
}
