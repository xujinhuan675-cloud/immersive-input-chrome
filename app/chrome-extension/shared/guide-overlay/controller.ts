import type { GuideSession, GuideStep } from '@/common/guide-types';

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
  panel.style.top = '16px';
  panel.style.right = '16px';
  panel.style.width = '320px';
  panel.style.maxWidth = 'calc(100vw - 32px)';
  panel.style.borderRadius = '16px';
  panel.style.background = 'rgba(15, 23, 42, 0.94)';
  panel.style.color = '#fff';
  panel.style.padding = '16px';
  panel.style.boxShadow = '0 18px 48px rgba(15,23,42,0.35)';
  panel.style.backdropFilter = 'blur(10px)';
  panel.style.fontFamily = '"Segoe UI", "PingFang SC", sans-serif';
  panel.style.lineHeight = '1.5';
  panel.style.pointerEvents = 'auto';
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
    <div style="font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#93c5fd; margin-bottom:8px;">
      Immersive Guide
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

function positionHighlight(highlight: HTMLDivElement, target: HTMLElement | null): void {
  if (!target) {
    highlight.style.display = 'none';
    return;
  }

  const rect = target.getBoundingClientRect();
  const padding = 8;
  highlight.style.display = 'block';
  highlight.style.left = `${Math.max(rect.left - padding, 0)}px`;
  highlight.style.top = `${Math.max(rect.top - padding, 0)}px`;
  highlight.style.width = `${Math.max(rect.width + padding * 2, 32)}px`;
  highlight.style.height = `${Math.max(rect.height + padding * 2, 32)}px`;
}

export function createGuideOverlayController(
  options: GuideOverlayControllerOptions = {},
): GuideOverlayController {
  const host = createHost();
  const panel = createPanel();
  const highlight = createHighlight();
  host.appendChild(highlight);
  host.appendChild(panel);

  let visible = false;
  let currentPayload: GuideOverlayRenderPayload | null = null;

  function ensureMounted(): void {
    if (host.isConnected) return;
    document.documentElement.appendChild(host);
  }

  function syncPosition(): void {
    if (!visible || !currentPayload) return;
    const target = resolveElement(currentPayload.activeStep);
    positionHighlight(highlight, target);
  }

  function render(payload: GuideOverlayRenderPayload): void {
    ensureMounted();
    currentPayload = payload;
    const target = resolveElement(payload.activeStep);
    renderPanel(panel, payload, target, options);
    positionHighlight(highlight, target);
    if (target) {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
    visible = true;
  }

  window.addEventListener('scroll', syncPosition, true);
  window.addEventListener('resize', syncPosition);

  return {
    show(payload) {
      render(payload);
    },
    update(payload) {
      render(payload);
    },
    hide() {
      if (host.isConnected) {
        host.remove();
      }
      visible = false;
      currentPayload = null;
    },
    isVisible() {
      return visible;
    },
    dispose() {
      window.removeEventListener('scroll', syncPosition, true);
      window.removeEventListener('resize', syncPosition);
      if (host.isConnected) {
        host.remove();
      }
      visible = false;
      currentPayload = null;
    },
  };
}
