export type PopupAnchor = { left: number; right: number; top: number; bottom: number };

/** Large dialogs remain centered; small dialogs prefer the trigger's right side. */
export function popupPosition(anchor: PopupAnchor | null, width: number, height: number, viewportWidth: number, viewportHeight: number, offsetX = 0) {
  if (!anchor || width >= viewportWidth * 0.75 || height >= viewportHeight * 0.75) return null;
  const gap = 12;
  const margin = 16;
  const preferredLeft = anchor.right + gap + width <= viewportWidth - margin
    ? anchor.right + gap
    : anchor.left - gap - width >= margin ? anchor.left - gap - width : anchor.left;
  return {
    left: Math.max(margin, Math.min(preferredLeft + offsetX, viewportWidth - width - margin)),
    top: Math.max(margin, Math.min(anchor.bottom, viewportHeight - height - margin)),
  };
}
