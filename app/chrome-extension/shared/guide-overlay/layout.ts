export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface OverlayViewport {
  width: number;
  height: number;
}

export interface OverlaySize {
  width: number;
  height: number;
}

export interface OverlayPlacement {
  left: number;
  top: number;
  name: string;
}

export interface OverlayPoint {
  left: number;
  top: number;
}

interface CandidatePlacement extends OverlayPlacement {
  overlapArea: number;
  distanceScore: number;
  priority: number;
}

export interface OverlayPositioningOptions {
  margin?: number;
  gap?: number;
}

const DEFAULT_MARGIN = 16;
const DEFAULT_GAP = 16;

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function makeRect(left: number, top: number, width: number, height: number): OverlayRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function getMaxLeft(viewport: OverlayViewport, size: OverlaySize, margin: number): number {
  return Math.max(margin, viewport.width - size.width - margin);
}

function getMaxTop(viewport: OverlayViewport, size: OverlaySize, margin: number): number {
  return Math.max(margin, viewport.height - size.height - margin);
}

function buildRect(
  left: number,
  top: number,
  size: OverlaySize,
  viewport: OverlayViewport,
  margin: number,
): OverlayRect {
  return makeRect(
    clamp(left, margin, getMaxLeft(viewport, size, margin)),
    clamp(top, margin, getMaxTop(viewport, size, margin)),
    size.width,
    size.height,
  );
}

function getRectCenter(rect: OverlayRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function getDistanceScore(a: OverlayRect, b: OverlayRect): number {
  const centerA = getRectCenter(a);
  const centerB = getRectCenter(b);
  const dx = centerA.x - centerB.x;
  const dy = centerA.y - centerB.y;
  return dx * dx + dy * dy;
}

function getOverlapArea(a: OverlayRect, b: OverlayRect): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

export function toOverlayRect(rect: RectLike): OverlayRect {
  return makeRect(rect.left, rect.top, rect.width, rect.height);
}

export function inflateRect(rect: OverlayRect, padding: number): OverlayRect {
  return makeRect(
    rect.left - padding,
    rect.top - padding,
    rect.width + padding * 2,
    rect.height + padding * 2,
  );
}

export function choosePanelPlacement(
  viewport: OverlayViewport,
  size: OverlaySize,
  targetRect: OverlayRect | null,
  options: OverlayPositioningOptions = {},
): OverlayPlacement {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const gap = options.gap ?? DEFAULT_GAP;

  if (!targetRect) {
    return {
      left: getMaxLeft(viewport, size, margin),
      top: margin,
      name: 'top-right',
    };
  }

  const target = inflateRect(targetRect, gap);
  const candidates: CandidatePlacement[] = [
    {
      ...buildRect(getMaxLeft(viewport, size, margin), margin, size, viewport, margin),
      name: 'top-right',
      overlapArea: 0,
      distanceScore: 0,
      priority: 0,
    },
    {
      ...buildRect(margin, margin, size, viewport, margin),
      name: 'top-left',
      overlapArea: 0,
      distanceScore: 0,
      priority: 1,
    },
    {
      ...buildRect(
        getMaxLeft(viewport, size, margin),
        getMaxTop(viewport, size, margin),
        size,
        viewport,
        margin,
      ),
      name: 'bottom-right',
      overlapArea: 0,
      distanceScore: 0,
      priority: 2,
    },
    {
      ...buildRect(margin, getMaxTop(viewport, size, margin), size, viewport, margin),
      name: 'bottom-left',
      overlapArea: 0,
      distanceScore: 0,
      priority: 3,
    },
    {
      ...buildRect(
        targetRect.right + gap,
        targetRect.top + targetRect.height / 2 - size.height / 2,
        size,
        viewport,
        margin,
      ),
      name: 'right-center',
      overlapArea: 0,
      distanceScore: 0,
      priority: 4,
    },
    {
      ...buildRect(
        targetRect.left - size.width - gap,
        targetRect.top + targetRect.height / 2 - size.height / 2,
        size,
        viewport,
        margin,
      ),
      name: 'left-center',
      overlapArea: 0,
      distanceScore: 0,
      priority: 5,
    },
    {
      ...buildRect(
        targetRect.left + targetRect.width / 2 - size.width / 2,
        getMaxTop(viewport, size, margin),
        size,
        viewport,
        margin,
      ),
      name: 'bottom-center',
      overlapArea: 0,
      distanceScore: 0,
      priority: 6,
    },
    {
      ...buildRect(
        targetRect.left + targetRect.width / 2 - size.width / 2,
        margin,
        size,
        viewport,
        margin,
      ),
      name: 'top-center',
      overlapArea: 0,
      distanceScore: 0,
      priority: 7,
    },
  ].map((candidate) => ({
    ...candidate,
    overlapArea: getOverlapArea(candidate, target),
    distanceScore: getDistanceScore(candidate, targetRect),
  }));

  candidates.sort((a, b) => {
    if (a.overlapArea !== b.overlapArea) return a.overlapArea - b.overlapArea;
    if (a.distanceScore !== b.distanceScore) return b.distanceScore - a.distanceScore;
    return a.priority - b.priority;
  });

  const best = candidates[0];
  return {
    left: best.left,
    top: best.top,
    name: best.name,
  };
}

export function clampFloatingPlacement(
  viewport: OverlayViewport,
  size: OverlaySize,
  point: OverlayPoint,
  options: OverlayPositioningOptions = {},
): OverlayPlacement {
  const margin = options.margin ?? DEFAULT_MARGIN;

  return {
    left: clamp(point.left, margin, getMaxLeft(viewport, size, margin)),
    top: clamp(point.top, margin, getMaxTop(viewport, size, margin)),
    name: 'manual',
  };
}

export function chooseHintPlacement(
  viewport: OverlayViewport,
  size: OverlaySize,
  targetRect: OverlayRect,
  options: OverlayPositioningOptions = {},
): OverlayPlacement {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const gap = options.gap ?? DEFAULT_GAP;
  const target = inflateRect(targetRect, gap / 2);

  const candidates: CandidatePlacement[] = [
    {
      ...buildRect(targetRect.left, targetRect.bottom + gap, size, viewport, margin),
      name: 'bottom-start',
      overlapArea: 0,
      distanceScore: 0,
      priority: 0,
    },
    {
      ...buildRect(
        targetRect.left + targetRect.width / 2 - size.width / 2,
        targetRect.bottom + gap,
        size,
        viewport,
        margin,
      ),
      name: 'bottom-center',
      overlapArea: 0,
      distanceScore: 0,
      priority: 1,
    },
    {
      ...buildRect(targetRect.left, targetRect.top - size.height - gap, size, viewport, margin),
      name: 'top-start',
      overlapArea: 0,
      distanceScore: 0,
      priority: 2,
    },
    {
      ...buildRect(
        targetRect.left + targetRect.width / 2 - size.width / 2,
        targetRect.top - size.height - gap,
        size,
        viewport,
        margin,
      ),
      name: 'top-center',
      overlapArea: 0,
      distanceScore: 0,
      priority: 3,
    },
    {
      ...buildRect(
        targetRect.right + gap,
        targetRect.top + targetRect.height / 2 - size.height / 2,
        size,
        viewport,
        margin,
      ),
      name: 'right-center',
      overlapArea: 0,
      distanceScore: 0,
      priority: 4,
    },
    {
      ...buildRect(
        targetRect.left - size.width - gap,
        targetRect.top + targetRect.height / 2 - size.height / 2,
        size,
        viewport,
        margin,
      ),
      name: 'left-center',
      overlapArea: 0,
      distanceScore: 0,
      priority: 5,
    },
  ].map((candidate) => ({
    ...candidate,
    overlapArea: getOverlapArea(candidate, target),
    distanceScore: getDistanceScore(candidate, targetRect),
  }));

  candidates.sort((a, b) => {
    if (a.overlapArea !== b.overlapArea) return a.overlapArea - b.overlapArea;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.distanceScore - b.distanceScore;
  });

  const best = candidates[0];
  return {
    left: best.left,
    top: best.top,
    name: best.name,
  };
}
