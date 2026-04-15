import { describe, expect, it } from 'vitest';

import {
  clampFloatingPlacement,
  chooseHintPlacement,
  choosePanelPlacement,
  toOverlayRect,
  type OverlaySize,
  type OverlayViewport,
} from '@/shared/guide-overlay/layout';

const viewport: OverlayViewport = { width: 1440, height: 900 };
const panelSize: OverlaySize = { width: 320, height: 280 };
const hintSize: OverlaySize = { width: 240, height: 88 };

describe('guide overlay layout', () => {
  it('keeps the panel away from a top-right target', () => {
    const target = toOverlayRect({
      left: 1180,
      top: 24,
      width: 140,
      height: 48,
    });

    const placement = choosePanelPlacement(viewport, panelSize, target);

    expect(placement.name).not.toBe('top-right');
    expect(placement.left + panelSize.width <= target.left || placement.top >= target.bottom).toBe(
      true,
    );
  });

  it('defaults the panel to top-right when there is no target', () => {
    const placement = choosePanelPlacement(viewport, panelSize, null);

    expect(placement.name).toBe('top-right');
    expect(placement.top).toBe(16);
    expect(placement.left).toBe(viewport.width - panelSize.width - 16);
  });

  it('prefers a hint below the target when there is enough space', () => {
    const target = toOverlayRect({
      left: 160,
      top: 180,
      width: 120,
      height: 40,
    });

    const placement = chooseHintPlacement(viewport, hintSize, target);

    expect(placement.name).toBe('bottom-start');
    expect(placement.top).toBeGreaterThan(target.bottom);
  });

  it('moves the hint above the target when the target is close to the viewport bottom', () => {
    const target = toOverlayRect({
      left: 420,
      top: 820,
      width: 140,
      height: 44,
    });

    const placement = chooseHintPlacement(viewport, hintSize, target);

    expect(placement.name.startsWith('top')).toBe(true);
    expect(placement.top + hintSize.height).toBeLessThanOrEqual(target.top);
  });

  it('clamps a manually dragged panel position to the viewport bounds', () => {
    const placement = clampFloatingPlacement(
      viewport,
      panelSize,
      {
        left: 4000,
        top: -80,
      },
      { margin: 16 },
    );

    expect(placement.name).toBe('manual');
    expect(placement.left).toBe(viewport.width - panelSize.width - 16);
    expect(placement.top).toBe(16);
  });
});
