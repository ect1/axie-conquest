/** Shared styling for unit selection and name sprites across battle and world views. */
export const UNIT_LABEL_STYLE = {
  font: 'bold 30px Arial, Helvetica, sans-serif',
  textColor: '#ffffff',
  // Match the portal badge opacity while keeping the requested neutral grey.
  backgroundColor: 'rgba(10, 11, 12, 0.5)',
  markerColor: '#ffe36c',
} as const;

// Portal headers use 30px Arial on a 512px-wide dynamic texture. Keeping the
// same width here preserves that apparent font size instead of shrinking it.
export const UNIT_LABEL_TEXTURE_SIZE = { width: 512, height: 96 } as const;

/** Draws the compact, portal-style nameplate shared by world entities. */
export function drawUnitNameLabel(context: CanvasRenderingContext2D, label: string): number {
  const { width, height } = UNIT_LABEL_TEXTURE_SIZE;
  context.clearRect(0, 0, width, height);
  context.fillStyle = UNIT_LABEL_STYLE.backgroundColor;
  context.beginPath();
  context.roundRect(4, 4, width - 8, height - 8, 14);
  context.fill();
  context.font = UNIT_LABEL_STYLE.font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const textWidth = Math.min(470, Math.max(150, context.measureText(label).width + 44));
  context.shadowColor = 'rgba(0, 0, 0, 0.8)';
  context.shadowBlur = 6;
  context.fillStyle = UNIT_LABEL_STYLE.textColor;
  context.fillText(label, width / 2, height / 2, textWidth - 24);
  context.shadowBlur = 0;
  return textWidth;
}
