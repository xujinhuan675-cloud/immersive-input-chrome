export const GUIDE_ENTRY_SOURCES = {
  EXTERNAL_AI: 'external_ai',
  PLUGIN_CHAT: 'plugin_chat',
  DESKTOP_COMPANION: 'desktop_companion',
  MANUAL: 'manual',
} as const;

export type GuideEntrySource = (typeof GUIDE_ENTRY_SOURCES)[keyof typeof GUIDE_ENTRY_SOURCES];

export const GUIDE_TARGETS = {
  BROWSER: 'browser',
  DESKTOP: 'desktop',
  HYBRID: 'hybrid',
} as const;

export type GuideTarget = (typeof GUIDE_TARGETS)[keyof typeof GUIDE_TARGETS];

export const GUIDE_PERMISSION_MODES = {
  READONLY: 'readonly',
  CONFIRM: 'confirm',
  AUTO: 'auto',
} as const;

export type GuidePermissionMode =
  (typeof GUIDE_PERMISSION_MODES)[keyof typeof GUIDE_PERMISSION_MODES];

export const GUIDE_SESSION_STATUSES = {
  DRAFT: 'draft',
  READY: 'ready',
  RUNNING: 'running',
  WAITING_USER: 'waiting_user',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
} as const;

export type GuideSessionStatus =
  (typeof GUIDE_SESSION_STATUSES)[keyof typeof GUIDE_SESSION_STATUSES];

export const GUIDE_STEP_STATUSES = {
  PENDING: 'pending',
  ACTIVE: 'active',
  WAITING_USER: 'waiting_user',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  FAILED: 'failed',
} as const;

export type GuideStepStatus = (typeof GUIDE_STEP_STATUSES)[keyof typeof GUIDE_STEP_STATUSES];

export const GUIDE_STEP_KINDS = {
  HIGHLIGHT: 'highlight',
  WAIT_FOR_USER: 'wait_for_user',
  AUTO_CLICK: 'auto_click',
  AUTO_FILL: 'auto_fill',
  ASSERT: 'assert',
  HANDOFF: 'handoff',
} as const;

export type GuideStepKind = (typeof GUIDE_STEP_KINDS)[keyof typeof GUIDE_STEP_KINDS];

export const GUIDE_SELECTOR_TYPES = {
  CSS: 'css',
  XPATH: 'xpath',
} as const;

export type GuideSelectorType = (typeof GUIDE_SELECTOR_TYPES)[keyof typeof GUIDE_SELECTOR_TYPES];

export interface GuideAnchor {
  markerId?: string;
  selector?: string;
  selectorType?: GuideSelectorType;
  urlPattern?: string;
  description?: string;
}

export interface GuideStep {
  id: string;
  title: string;
  description?: string;
  kind: GuideStepKind;
  target: GuideTarget;
  anchor?: GuideAnchor;
  status: GuideStepStatus;
  instructions?: string[];
  payload?: Record<string, unknown>;
}

export interface GuideIntegrationHints {
  immersiveInputSessionId?: string;
  bridgeKey?: string;
  desktopHandoffEnabled?: boolean;
}

export interface GuideSession {
  id: string;
  taskId?: string;
  title: string;
  summary?: string;
  source: GuideEntrySource;
  target: GuideTarget;
  permissionMode: GuidePermissionMode;
  status: GuideSessionStatus;
  tabId?: number;
  currentStepIndex: number;
  steps: GuideStep[];
  metadata?: Record<string, unknown>;
  integration?: GuideIntegrationHints;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface GuideRuntimeSnapshot {
  sessionId: string;
  status: GuideSessionStatus;
  currentStepIndex: number;
  totalSteps: number;
  activeStep: GuideStep | null;
}

export function getActiveGuideStep(session: GuideSession): GuideStep | null {
  if (session.currentStepIndex < 0 || session.currentStepIndex >= session.steps.length) {
    return null;
  }
  return session.steps[session.currentStepIndex] ?? null;
}

export function createGuideRuntimeSnapshot(session: GuideSession): GuideRuntimeSnapshot {
  return {
    sessionId: session.id,
    status: session.status,
    currentStepIndex: session.currentStepIndex,
    totalSteps: session.steps.length,
    activeStep: getActiveGuideStep(session),
  };
}
