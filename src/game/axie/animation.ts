import { Animation, AnimationGroup, Quaternion, Vector3, type TransformNode } from '@babylonjs/core';

type Slice = { offset: number; length: number };
type Clip = { duration: number; sampleCount: number; sampleTimes: Slice; floatByteOffset: number; tracks: { path: string; position: Slice; quaternion: Slice; scale: Slice }[] };

/** AXANIM1 payloads contain target-GLB-local transforms, followed by little-endian floats. */
export function createAxieAnimation(buffer: ArrayBuffer, root: TransformNode, name: string) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (new TextDecoder().decode(bytes.subarray(0, 7)) !== 'AXANIM1') throw new Error('Invalid Axie animation.');
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + view.getUint32(8, true)))) as Clip;
  const value = (offset: number) => view.getFloat32(header.floatByteOffset + offset * 4, true);
  const nodes = root.getDescendants(false);
  const group = new AnimationGroup(name, root.getScene());
  for (const track of header.tracks) {
    const node = nodes.find(node => node.name === track.path.split('/').pop());
    if (!node) { group.dispose(); throw new Error(`Missing animation bone ${track.path}.`); }
    for (const [property, slice, quaternion] of [['position', track.position, false], ['rotationQuaternion', track.quaternion, true], ['scaling', track.scale, false]] as const) {
      const animation = new Animation(`${name}:${node.name}:${property}`, property, 30, quaternion ? Animation.ANIMATIONTYPE_QUATERNION : Animation.ANIMATIONTYPE_VECTOR3);
      animation.setKeys(Array.from({ length: header.sampleCount }, (_, index) => {
        const offset = slice.offset + index * (quaternion ? 4 : 3);
        return { frame: value(header.sampleTimes.offset + index) * 30, value: quaternion ? new Quaternion(value(offset), value(offset + 1), value(offset + 2), value(offset + 3)) : new Vector3(value(offset), value(offset + 1), value(offset + 2)) };
      }));
      group.addTargetedAnimation(animation, node);
    }
  }
  return { group, duration: header.duration };
}
