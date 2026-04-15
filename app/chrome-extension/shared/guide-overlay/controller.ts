import type { GuideSession, GuideStep } from '@/common/guide-types';

import {
  clampFloatingPlacement,
  chooseHintPlacement,
  choosePanelPlacement,
  toOverlayRect,
  type OverlayRect,
  type OverlaySize,
  type OverlayViewport,
} from './layout';

export interface GuideOverlayRenderPayload {
  session: GuideSession;
  activeStep: GuideStep | null;
  snapshot: {
    currentStepIndex: number;
    totalSteps: number;
    status: string;
  };
}

export interface GuideOverlayControllerOptions {
  onAdvance?: (sessionId: string, action: 'next' | 'skip') => void | Promise<void>;
  onCancel?: (sessionId: string) => void | Promise<void>;
}

export interface GuideOverlayController {
  show(payload: GuideOverlayRenderPayload): void;
  update(payload: GuideOverlayRenderPayload): void;
  hide(): void;
  isVisible(): boolean;
  dispose(): void;
}

const HOST_ID = 'immersive-guide-overlay-host';
const PANEL_ID = 'immersive-guide-overlay-panel';
const HIGHLIGHT_ID = 'immersive-guide-overlay-highlight';
const HINT_ID = 'immersive-guide-overlay-hint';
const HIGHLIGHT_PADDING = 8;
const LAYOUT_MARGIN = 16;
const LAYOUT_GAP = 16;
const PANEL_TRANSITION = 'top 160ms ease, left 160ms ease, box-shadow 160ms ease';

function resolveElement(step: GuideStep | null): HTMLElement | null {
  if (!step?.anchor?.selector) return null;
  try {
    if (step.anchor.selectorType === 'xpath') {
      const result = document.evaluate(
        step.anchor.selector,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      return result.singleNodeValue instanceof HTMLElement ? result.singleNodeValue : null;
    }
    return document.querySelector(step.anchor.selector) as HTMLElement | null;
  } catch (error) {
    console.warn('[GuideOverlay] Failed to resolve selector:', error);
    return null;
  }
}

function createHost(): HTMLDivElement {
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483647';
  return host;
}

function createPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.position = 'fixed';
  panel.style.top = `${LAYOUT_MARGIN}px`;
  panel.style.left = `${LAYOUT_MARGIN}px`;
  panel.style.width = '320px';
  panel.style.maxWidth = 'calc(100vw - 32px)';
  panel.style.maxHeight = 'calc(100vh - 32px)';
  panel.style.overflowY = 'auto';
  panel.style.borderRadius = '16px';
  panel.style.background = 'rgba(15, 23, 42, 0.94)';
  panel.style.color = '#fff';
  panel.style.padding = '16px';
  panel.style.boxShadow = '0 18px 48px rgba(15,23,42,0.35)';
  panel.style.backdropFilter = 'blur(10px)';
  panel.style.outline = '1px solid rgba(148, 163, 184, 0.18)';
  panel.style.fontFamily = '"Segoe UI", "PingFang SC", sans-serif';
  panel.style.lineHeight = '1.5';
  panel.style.pointerEvents = 'auto';
  panel.style.transition = PANEL_TRANSITION;
  return panel;
}

function createHighlight(): HTMLDivElement {
  const highlight = document.createElement('div');
  highlight.id = HIGHLIGHT_ID;
  highlight.style.position = 'fixed';
  highlight.style.border = '2px solid #38bdf8';
  highlight.style.borderRadius = '12px';
  highlight.style.boxShadow = '0 0 0 9999px rgba(15,23,42,0.45)';
  highlight.style.pointerEvents = 'none';
  highlight.style.transition = 'all 160ms ease';
  return highlight;
}

function createHint(): HTMLDivElement {
  const hint = document.createElement('div');
  hint.id = HINT_ID;
  hint.style.position = 'fixed';
  hint.style.left = `${LAYOUT_MARGIN}px`;
  hint.style.top = `${LAYOUT_MARGIN}px`;
  hint.style.width = '240px';
  hint.style.maxWidth = 'calc(100vw - 32px)';
  hint.style.padding = '10px 12px';
  hint.style.borderRadius = '12px';
  hint.style.background = 'rgba(15, 23, 42, 0.92)';
  hint.style.border = '1px solid rgba(56, 189, 248, 0.28)';
  hint.style.boxShadow = '0 12px 28px rgba(15,23,42,0.24)';
  hint.style.backdropFilter = 'blur(8px)';
  hint.style.color = '#e2e8f0';
  hint.style.fontFamily = '"Segoe UI", "PingFang SC", sans-serif';
  hint.style.pointerEvents = 'none';
  hint.style.transition = 'top 160ms ease, left 160ms ease, opacity 160ms ease';
  return hint;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function getViewport(): OverlayViewport {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function getMeasuredSize(element: HTMLElement): OverlaySize {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(Math.ceil(rect.width), element.offsetWidth, 1),
    height: Math.max(Math.ceil(rect.height), element.offsetHeight, 1),
  };
}

function getTargetRect(target: HTMLElement | null): OverlayRect | null {
  return target ? toOverlayRect(target.getBoundingClientRect()) : null;
}

function getShortHint(step: GuideStep | null): { title: string; body: string } | null {
  if (!step) return null;

  const bodySource =
    step.instructions?.find((instruction) => instruction.trim().length > 0) ||
    step.anchor?.description ||
    step.description ||
    'Follow the highlighted target to continue.';

  return {
    title: truncateText(step.title || 'Highlighted target', 48),
    body: truncateText(bodySource, 96),
  };
}

function renderPanel(
  panel: HTMLDivElement,
  payload: GuideOverlayRenderPayload,
  target: HTMLElement | null,
  options: GuideOverlayControllerOptions,
): void {
  const stepNumber = Math.min(payload.snapshot.currentStepIndex + 1, payload.snapshot.totalSteps);
  const statusLabel = payload.snapshot.status.replaceAll('_', ' ');
  const stepTitle = escapeHtml(payload.activeStep?.title || 'No active step');
  const stepDescription = escapeHtml(
    payload.activeStep?.description || 'This session does not have a step description yet.',
  );
  const selectorText = escapeHtml(payload.activeStep?.anchor?.selector || 'No selector bound');
  const foundText = target ? 'Target located' : 'Target not found';
  const instructions =
    payload.activeStep?.instructions
      ?.filter(Boolean)
      .map((instruction) => `<li style="margin-bottom:4px;">${escapeHtml(instruction)}</li>`)
      .join('') || '';

  panel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
      <div style="font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#93c5fd;">
        Immersive Guide
      </div>
      <div
        data-guide-drag-handle="panel"
        title="Drag panel"
        style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; background:rgba(148,163,184,0.16); color:#cbd5e1; font-size:11px; cursor:grab; user-select:none;"
      >
        <span style="font-size:12px; letter-spacing:.08em;">⋮⋮</span>
        Drag
      </div>
    </div>
    <div style="font-size:18px; font-weight:700; margin-bottom:6px;">${escapeHtml(payload.session.title)}</div>
    <div style="font-size:13px; color:rgba(255,255,255,0.72); margin-bottom:12px;">
      ${escapeHtml(payload.session.summary || 'Immersive browser guide is running.')}
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
      <span style="padding:4px 8px; border-radius:999px; background:rgba(56,189,248,0.16); color:#bae6fd; font-size:12px;">Step ${stepNumber}/${payload.snapshot.totalSteps}</span>
      <span style="padding:4px 8px; border-radius:999px; background:rgba(148,163,184,0.18); color:#e2e8f0; font-size:12px;">${escapeHtml(statusLabel)}</span>
      <span style="padding:4px 8px; border-radius:999px; background:${target ? 'rgba(16,185,129,0.18)' : 'rgba(248,113,113,0.18)'}; color:${target ? '#a7f3d0' : '#fecaca'}; font-size:12px;">${foundText}</span>
    </div>
    <div style="font-size:16px; font-weight:600; margin-bottom:6px;">${stepTitle}</div>
    <div style="font-size:13px; color:rgba(255,255,255,0.84); margin-bottom:12px;">${stepDescription}</div>
    ${
      instructions
        ? `<ul style="margin:0 0 12px 18px; padding:0; font-size:12px; color:rgba(255,255,255,0.72);">${instructions}</ul>`
        : ''
    }
    <div style="font-size:12px; color:rgba(255,255,255,0.64); word-break:break-all;">
      Anchor: ${selectorText}
    </div>
    <div style="display:flex; gap:8px; margin-top:14px;">
      <button data-guide-action="next" style="flex:1; border:none; border-radius:10px; background:#38bdf8; color:#082f49; font-weight:700; padding:10px 12px; cursor:pointer;">Next</button>
      <button data-guide-action="skip" style="flex:1; border:none; border-radius:10px; background:rgba(148,163,184,0.2); color:#e2e8f0; font-weight:600; padding:10px 12px; cursor:pointer;">Skip</button>
      <button data-guide-action="cancel" style="border:none; border-radius:10px; background:rgba(248,113,113,0.2); color:#fecaca; font-weight:600; padding:10px 12px; cursor:pointer;">End</button>
    </div>
  `;

  const nextButton = panel.querySelector<HTMLButtonElement>('[data-guide-action="next"]');
  const skipButton = panel.querySelector<HTMLButtonElement>('[data-guide-action="skip"]');
  const cancelButton = panel.querySelector<HTMLButtonElement>('[data-guide-action="cancel"]');

  nextButton?.addEventListener('click', () => {
    void options.onAdvance?.(payload.session.id, 'next');
  });
  skipButton?.addEventListener('click', () => {
    void options.onAdvance?.(payload.session.id, 'skip');
  });
  cancelButton?.addEventListener('click', () => {
    void options.onCancel?.(payload.session.id);
  });
}

function renderHint(hint: HTMLDivElement, step: GuideStep | null): void {
  const hintCopy = getShortHint(step);
  if (!hintCopy) {
    hint.style.display = 'none';
    hint.innerHTML = '';
    return;
  }

  hint.innerHTML = `
    <div style="font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#7dd3fc; margin-bottom:4px;">
      Guide target
    </div>
    <div style="font-size:13px; font-weight:700; color:#f8fafc; margin-bottom:4px;">
      ${escapeHtml(hintCopy.title)}
    </div>
    <div style="font-size:12px; color:rgba(226,232,240,0.86);">
      ${escapeHtml(hintCopy.body)}
    </div>
  `;
  hint.style.display = 'block';
}

function positionHighlight(highlight: HTMLDivElement, targetRect: OverlayRect | null): void {
  if (!targetRect) {
    highlight.style.display = 'none';
    return;
  }

  highlight.style.display = 'block';
  highlight.style.left = `${Math.max(targetRect.left - HIGHLIGHT_PADDING, 0)}px`;
  highlight.style.top = `${Math.max(targetRect.top - HIGHLIGHT_PADDING, 0)}px`;
  highlight.style.width = `${Math.max(targetRect.width + HIGHLIGHT_PADDING * 2, 32)}px`;
  highlight.style.height = `${Math.max(targetRect.height + HIGHLIGHT_PADDING * 2, 32)}px`;
}

function positionPanel(panel: HTMLDivElement, targetRect: OverlayRect | null): void {
  const placement = choosePanelPlacement(getViewport(), getMeasuredSize(panel), targetRect, {
    margin: LAYOUT_MARGIN,
    gap: LAYOUT_GAP,
  });

  panel.style.left = `${placement.left}px`;
  panel.style.top = `${placement.top}px`;
  panel.dataset.guidePlacement = placement.name;
}

function positionHint(hint: HTMLDivElement, targetRect: OverlayRect | null): void {
  if (!targetRect || hint.innerHTML.trim().length === 0) {
    hint.style.display = 'none';
    return;
  }

  hint.style.display = 'block';
  const placement = chooseHintPlacement(getViewport(), getMeasuredSize(hint), targetRect, {
    margin: LAYOUT_MARGIN,
    gap: 12,
  });

  hint.style.left = `${placement.left}px`;
  hint.style.top = `${placement.top}px`;
  hint.dataset.guidePlacement = placement.name;
}

export function createGuideOverlayController(
  options: GuideOverlayControllerOptions = {},
): GuideOverlayController {
  const host = createHost();
  const panel = createPanel();
  const highlight = createHighlight();
  const hint = createHint();
  host.appendChild(highlight);
  host.appendChild(hint);
  host.appendChild(panel);

  let visible = false;
  let currentPayload: GuideOverlayRenderPayload | null = null;
  let currentSessionId: string | null = null;
  let lastTargetLocated: boolean | null = null;
  let rafHandle: number | null = null;
  let manualPanelPosition: { left: number; top: number } | null = null;
  let dragState: { pointerId: number; offsetX: number; offsetY: number } | null = null;
  const handleScroll = () => requestSync();
  const handleResize = () => requestSync();
  const handlePointerMove = (event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const placement = clampFloatingPlacement(
      getViewport(),
      getMeasuredSize(panel),
      {
        left: event.clientX - dragState.offsetX,
        top: event.clientY - dragState.offsetY,
      },
      { margin: LAYOUT_MARGIN },
    );

    manualPanelPosition = {
      left: placement.left,
      top: placement.top,
    };
    panel.style.left = `${placement.left}px`;
    panel.style.top = `${placement.top}px`;
    panel.dataset.guidePlacement = placement.name;
    event.preventDefault();
  };
  const finishDrag = (pointerId?: number) => {
    if (!dragState) return;
    if (typeof pointerId === 'number' && dragState.pointerId !== pointerId) return;
    dragState = null;
    panel.style.transition = PANEL_TRANSITION;
    panel.style.cursor = '';
    document.body.style.userSelect = '';
  };
  const handlePointerUp = (event: PointerEvent) => {
    finishDrag(event.pointerId);
  };
  const handlePointerCancel = (event: PointerEvent) => {
    finishDrag(event.pointerId);
  };

  function ensureMounted(): void {
    if (host.isConnected) return;
    document.documentElement.appendChild(host);
  }

  function syncLayout(forceRerender = false): void {
    if (!visible || !currentPayload) return;

    const target = resolveElement(currentPayload.activeStep);
    const targetLocated = Boolean(target);

    if (forceRerender || targetLocated !== lastTargetLocated) {
      renderPanel(panel, currentPayload, target, options);
      renderHint(hint, currentPayload.activeStep);
      bindPanelDragHandle();
      lastTargetLocated = targetLocated;
    }

    const targetRect = getTargetRect(target);
    positionHighlight(highlight, targetRect);
    positionHint(hint, targetRect);
    if (manualPanelPosition) {
      const placement = clampFloatingPlacement(
        getViewport(),
        getMeasuredSize(panel),
        manualPanelPosition,
        { margin: LAYOUT_MARGIN },
      );
      manualPanelPosition = { left: placement.left, top: placement.top };
      panel.style.left = `${placement.left}px`;
      panel.style.top = `${placement.top}px`;
      panel.dataset.guidePlacement = placement.name;
    } else {
      positionPanel(panel, targetRect);
    }
  }

  function bindPanelDragHandle(): void {
    const handle = panel.querySelector<HTMLElement>('[data-guide-drag-handle="panel"]');
    if (!handle) return;

    handle.onpointerdown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      manualPanelPosition = {
        left: rect.left,
        top: rect.top,
      };
      panel.style.transition = 'none';
      panel.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    };
  }

  function requestSync(forceRerender = false): void {
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
    }

    rafHandle = window.requestAnimationFrame(() => {
      rafHandle = null;
      syncLayout(forceRerender);
    });
  }

  function render(payload: GuideOverlayRenderPayload): void {
    ensureMounted();

    if (currentSessionId !== payload.session.id) {
      currentSessionId = payload.session.id;
      manualPanelPosition = null;
    }

    currentPayload = payload;
    visible = true;
    lastTargetLocated = null;

    const target = resolveElement(payload.activeStep);
    if (target) {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }

    requestSync(true);
  }

  window.addEventListener('scroll', handleScroll, true);
  window.addEventListener('resize', handleResize);
  window.addEventListener('pointermove', handlePointerMove, true);
  window.addEventListener('pointerup', handlePointerUp, true);
  window.addEventListener('pointercancel', handlePointerCancel, true);

  return {
    show(payload) {
      render(payload);
    },
    update(payload) {
      render(payload);
    },
    hide() {
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      finishDrag();
      if (host.isConnected) {
        host.remove();
      }
      visible = false;
      currentPayload = null;
      currentSessionId = null;
      lastTargetLocated = null;
      manualPanelPosition = null;
    },
    isVisible() {
      return visible;
    },
    dispose() {
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      finishDrag();
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
      if (host.isConnected) {
        host.remove();
      }
      visible = false;
      currentPayload = null;
      currentSessionId = null;
      lastTargetLocated = null;
      manualPanelPosition = null;
    },
  };
}
