const POPUP_VIEWPORT_PADDING = 12;
const POPUP_MAX_WIDTH = 560;
const POPUP_MAX_HEIGHT = 680;

export interface Position {
  top: number;
  left: number;
  placement: "right" | "left" | "below" | "above";
}

export interface PopupSize {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
  offsetLeft?: number;
  offsetTop?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function constrainPopupSize(popup: PopupSize, viewport: Viewport): PopupSize {
  return {
    width: Math.min(Math.max(popup.width, 1), POPUP_MAX_WIDTH, Math.max(1, viewport.width - POPUP_VIEWPORT_PADDING * 2)),
    height: Math.min(Math.max(popup.height, 1), POPUP_MAX_HEIGHT, Math.max(1, viewport.height - POPUP_VIEWPORT_PADDING * 2)),
  };
}

export function getPopupViewport(): Viewport {
  const visualViewport = window.visualViewport;
  const rawWidth = visualViewport?.width ?? window.innerWidth;
  const rawHeight = visualViewport?.height ?? window.innerHeight;
  const scale = visualViewport?.scale ?? 1;
  const usesLayoutViewportCoordinates = scale > 1.01 && rawWidth >= window.innerWidth - 1 && rawHeight >= window.innerHeight - 1;
  const viewportScale = usesLayoutViewportCoordinates ? scale : 1;
  return {
    width: rawWidth / viewportScale,
    height: rawHeight / viewportScale,
    offsetLeft: (visualViewport?.offsetLeft ?? 0) / viewportScale,
    offsetTop: (visualViewport?.offsetTop ?? 0) / viewportScale,
  };
}

export function computePopupPosition(rect: DOMRect, popup: PopupSize, viewport: Viewport = getPopupViewport()): Position {
  const vw = viewport.width;
  const vh = viewport.height;
  const offsetLeft = viewport.offsetLeft ?? 0;
  const offsetTop = viewport.offsetTop ?? 0;
  const pad = POPUP_VIEWPORT_PADDING;
  const gap = 12;
  const minLeft = offsetLeft + pad;
  const maxRight = offsetLeft + vw - pad;
  const minTop = offsetTop + pad;
  const maxBottom = offsetTop + vh - pad;
  const width = Math.min(Math.max(popup.width, 1), Math.max(1, vw - pad * 2));
  const height = Math.min(Math.max(popup.height, 1), Math.max(1, vh - pad * 2));
  const fitsVertically = height <= maxBottom - minTop;
  const rightLeft = rect.right + gap;
  const leftLeft = rect.left - width - gap;

  if (rightLeft + width <= maxRight && fitsVertically) {
    return {
      left: rightLeft,
      top: clamp(rect.top, minTop, maxBottom - height),
      placement: "right",
    };
  }
  if (leftLeft >= minLeft && fitsVertically) {
    return {
      left: leftLeft,
      top: clamp(rect.top, minTop, maxBottom - height),
      placement: "left",
    };
  }

  const belowTop = rect.bottom + gap;
  const aboveTop = rect.top - height - gap;
  const spaceBelow = maxBottom - rect.bottom;
  const spaceAbove = rect.top - minTop;
  if (spaceBelow >= spaceAbove) {
    return {
      left: clamp(rect.left, minLeft, maxRight - width),
      top: clamp(belowTop, minTop, maxBottom - height),
      placement: "below",
    };
  }
  return {
    left: clamp(rect.left, minLeft, maxRight - width),
    top: clamp(aboveTop, minTop, maxBottom - height),
    placement: "above",
  };
}

export function computeSelectionTriggerPosition(
  rect: DOMRect,
  trigger: PopupSize = { width: 36, height: 36 },
  viewport: Viewport = getPopupViewport(),
): Position {
  const pad = 8;
  const gap = 8;
  const offsetLeft = viewport.offsetLeft ?? 0;
  const offsetTop = viewport.offsetTop ?? 0;
  const minLeft = offsetLeft + pad;
  const maxRight = offsetLeft + viewport.width - pad;
  const minTop = offsetTop + pad;
  const maxBottom = offsetTop + viewport.height - pad;
  const width = Math.min(Math.max(trigger.width, 1), Math.max(1, viewport.width - pad * 2));
  const height = Math.min(Math.max(trigger.height, 1), Math.max(1, viewport.height - pad * 2));
  const clampLeft = (left: number) => clamp(left, minLeft, maxRight - width);
  const clampTop = (top: number) => clamp(top, minTop, maxBottom - height);
  const verticallyCentered = clampTop(rect.top + (rect.height - height) / 2);
  const horizontallyCentered = clampLeft(rect.left + (rect.width - width) / 2);

  if (rect.right + gap + width <= maxRight) {
    return { left: rect.right + gap, top: verticallyCentered, placement: "right" };
  }
  if (rect.left - gap - width >= minLeft) {
    return { left: rect.left - gap - width, top: verticallyCentered, placement: "left" };
  }
  if (rect.bottom + gap + height <= maxBottom) {
    return { left: horizontallyCentered, top: rect.bottom + gap, placement: "below" };
  }
  return { left: horizontallyCentered, top: clampTop(rect.top - gap - height), placement: "above" };
}
