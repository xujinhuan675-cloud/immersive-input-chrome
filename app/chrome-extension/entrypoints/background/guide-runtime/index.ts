import { GUIDE_BRIDGE_SOURCES, type GuideBridgeSource } from '@/common/guide-bridge-types';
import {
  GUIDE_ENTRY_SOURCES,
  GUIDE_PERMISSION_MODES,
  GUIDE_SESSION_STATUSES,
  GUIDE_STEP_KINDS,
  GUIDE_STEP_STATUSES,
  GUIDE_TARGETS,
  createGuideRuntimeSnapshot,
  getActiveGuideStep,
  type GuideSession,
  type GuideStep,
} from '@/common/guide-types';
import {
  BACKGROUND_MESSAGE_TYPES,
  TOOL_MESSAGE_TYPES,
  type GuideSessionCreatePayload,
} from '@/common/message-types';
import {
  acceptGuideBridgeHandoff,
  getGuideBridgeSessionState,
  listGuideBridgeEvents,
  recordGuideBridgeSessionCreated,
  recordGuideBridgeSessionResumed,
  recordGuideBridgeSessionUpdated,
  recordGuideBridgeStepChanged,
  requestGuideBridgeHandoff,
} from './bridge-adapter';
import { getGuideSession, listGuideSessions, saveGuideSession } from './session-store';

function generateGuideSessionId(): string {
  return `guide_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateGuideBridgeKey(sessionId: string): string {
  return `bridge_${sessionId}`;
}

function ensureGuideSteps(steps: GuideStep[]): GuideStep[] {
  return steps.map((step, index) => ({
    ...step,
    id: step.id || `step_${index + 1}`,
    status: step.status || GUIDE_STEP_STATUSES.PENDING,
  }));
}

function buildGuideIntegration(
  payload: GuideSessionCreatePayload,
  sessionId: string,
): GuideSession['integration'] {
  const existing = payload.integration;
  const bridgeKey = existing?.bridgeKey?.trim() || generateGuideBridgeKey(sessionId);
  return {
    bridgeKey,
    immersiveInputSessionId: existing?.immersiveInputSessionId?.trim() || undefined,
    desktopHandoffEnabled:
      existing?.desktopHandoffEnabled ?? payload.target === GUIDE_TARGETS.DESKTOP,
  };
}

function cloneSession(session: GuideSession): GuideSession {
  return {
    ...session,
    steps: session.steps.map((step) => ({ ...step })),
  };
}

async function resolveTabId(preferred?: number): Promise<number | undefined> {
  if (typeof preferred === 'number') return preferred;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

function buildSession(payload: GuideSessionCreatePayload, tabId?: number): GuideSession {
  const now = new Date().toISOString();
  const sessionId = generateGuideSessionId();
  return {
    id: sessionId,
    taskId: payload.taskId,
    title: payload.title.trim(),
    summary: payload.summary?.trim(),
    source: (payload.source as GuideSession['source']) || GUIDE_ENTRY_SOURCES.PLUGIN_CHAT,
    target: payload.target || GUIDE_TARGETS.BROWSER,
    permissionMode: payload.permissionMode || GUIDE_PERMISSION_MODES.CONFIRM,
    status: GUIDE_SESSION_STATUSES.READY,
    tabId,
    currentStepIndex: 0,
    steps: ensureGuideSteps(payload.steps),
    metadata: payload.metadata,
    integration: buildGuideIntegration(payload, sessionId),
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

function emitSessionChanged(session: GuideSession): void {
  const snapshot = createGuideRuntimeSnapshot(session);
  void chrome.runtime
    .sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_CHANGED,
      session,
      snapshot,
    })
    .catch(() => {});
}

async function sendOverlayMessage(
  tabId: number | undefined,
  action: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  if (typeof tabId !== 'number') return;
  try {
    await chrome.tabs.sendMessage(tabId, { action, payload });
  } catch (error) {
    console.warn('[GuideRuntime] Failed to send overlay message:', action, error);
  }
}

async function syncOverlay(session: GuideSession): Promise<void> {
  const snapshot = createGuideRuntimeSnapshot(session);
  const payload = {
    session,
    snapshot,
    activeStep: getActiveGuideStep(session),
  };

  if (
    session.status === GUIDE_SESSION_STATUSES.PAUSED ||
    session.status === GUIDE_SESSION_STATUSES.CANCELLED ||
    session.status === GUIDE_SESSION_STATUSES.COMPLETED ||
    session.status === GUIDE_SESSION_STATUSES.FAILED ||
    session.target === GUIDE_TARGETS.DESKTOP
  ) {
    await sendOverlayMessage(session.tabId, TOOL_MESSAGE_TYPES.GUIDE_OVERLAY_HIDE, {
      sessionId: session.id,
      status: session.status,
    });
    return;
  }

  const action =
    session.status === GUIDE_SESSION_STATUSES.READY
      ? TOOL_MESSAGE_TYPES.GUIDE_OVERLAY_SHOW
      : TOOL_MESSAGE_TYPES.GUIDE_OVERLAY_UPDATE;
  await sendOverlayMessage(session.tabId, action, payload);
}

function markActiveStep(session: GuideSession): GuideSession {
  const next = cloneSession(session);
  next.steps = next.steps.map((step, index) => {
    if (index < next.currentStepIndex && step.status === GUIDE_STEP_STATUSES.PENDING) {
      return { ...step, status: GUIDE_STEP_STATUSES.COMPLETED };
    }
    if (index === next.currentStepIndex) {
      const waiting =
        step.kind === GUIDE_STEP_KINDS.WAIT_FOR_USER || step.kind === GUIDE_STEP_KINDS.HIGHLIGHT
          ? GUIDE_STEP_STATUSES.WAITING_USER
          : GUIDE_STEP_STATUSES.ACTIVE;
      return { ...step, status: waiting };
    }
    if (index > next.currentStepIndex && step.status !== GUIDE_STEP_STATUSES.SKIPPED) {
      return { ...step, status: GUIDE_STEP_STATUSES.PENDING };
    }
    return step;
  });
  return next;
}

function shouldEmitStepChanged(previous: GuideSession | null, next: GuideSession): boolean {
  if (!previous) return true;
  const previousActive = getActiveGuideStep(previous);
  const nextActive = getActiveGuideStep(next);
  return (
    previous.currentStepIndex !== next.currentStepIndex ||
    previous.status !== next.status ||
    previousActive?.id !== nextActive?.id
  );
}

async function recordGuideSessionMutation(
  previous: GuideSession | null,
  next: GuideSession,
): Promise<void> {
  await recordGuideBridgeSessionUpdated(next);
  if (shouldEmitStepChanged(previous, next)) {
    await recordGuideBridgeStepChanged(next);
  }
}

export async function createGuideSession(
  payload: GuideSessionCreatePayload,
): Promise<GuideSession> {
  const tabId = await resolveTabId(payload.tabId);
  const session = buildSession(payload, tabId);
  await saveGuideSession(session);
  await recordGuideBridgeSessionCreated(session);
  emitSessionChanged(session);
  await syncOverlay(session);
  return session;
}

export async function startGuideSession(sessionId: string): Promise<GuideSession> {
  const current = await getGuideSession(sessionId);
  if (!current) throw new Error('Guide session not found');

  const next = markActiveStep({
    ...cloneSession(current),
    status: GUIDE_SESSION_STATUSES.RUNNING,
    updatedAt: new Date().toISOString(),
    version: current.version + 1,
  });

  await saveGuideSession(next);
  await recordGuideSessionMutation(current, next);
  emitSessionChanged(next);
  await syncOverlay(next);
  return next;
}

export async function advanceGuideSession(
  sessionId: string,
  action: 'next' | 'skip' = 'next',
): Promise<GuideSession> {
  const current = await getGuideSession(sessionId);
  if (!current) throw new Error('Guide session not found');

  const next = cloneSession(current);
  const currentStep = next.steps[next.currentStepIndex];
  if (currentStep) {
    currentStep.status =
      action === 'skip' ? GUIDE_STEP_STATUSES.SKIPPED : GUIDE_STEP_STATUSES.COMPLETED;
  }

  const nextIndex = next.currentStepIndex + 1;
  if (nextIndex >= next.steps.length) {
    next.currentStepIndex = next.steps.length;
    next.status = GUIDE_SESSION_STATUSES.COMPLETED;
  } else {
    next.currentStepIndex = nextIndex;
    next.status = GUIDE_SESSION_STATUSES.RUNNING;
    const active = next.steps[next.currentStepIndex];
    if (active) {
      active.status =
        active.kind === GUIDE_STEP_KINDS.WAIT_FOR_USER || active.kind === GUIDE_STEP_KINDS.HIGHLIGHT
          ? GUIDE_STEP_STATUSES.WAITING_USER
          : GUIDE_STEP_STATUSES.ACTIVE;
    }
  }

  next.updatedAt = new Date().toISOString();
  next.version += 1;

  await saveGuideSession(next);
  await recordGuideSessionMutation(current, next);
  emitSessionChanged(next);
  await syncOverlay(next);
  return next;
}

export async function cancelGuideSession(sessionId: string): Promise<GuideSession> {
  const current = await getGuideSession(sessionId);
  if (!current) throw new Error('Guide session not found');

  const next: GuideSession = {
    ...cloneSession(current),
    status: GUIDE_SESSION_STATUSES.CANCELLED,
    updatedAt: new Date().toISOString(),
    version: current.version + 1,
  };

  await saveGuideSession(next);
  await recordGuideSessionMutation(current, next);
  emitSessionChanged(next);
  await syncOverlay(next);
  return next;
}

export async function attachGuideSessionTab(
  sessionId: string,
  tabId: number,
): Promise<GuideSession> {
  const current = await getGuideSession(sessionId);
  if (!current) throw new Error('Guide session not found');

  const next: GuideSession = {
    ...cloneSession(current),
    tabId,
    updatedAt: new Date().toISOString(),
    version: current.version + 1,
  };
  await saveGuideSession(next);
  await recordGuideSessionMutation(current, next);
  emitSessionChanged(next);
  await syncOverlay(next);
  return next;
}

export async function requestGuideSessionHandoff(
  sessionId: string,
  toTarget: GuideSession['target'],
  reason?: string,
  metadata?: Record<string, unknown>,
  bridgeSource: GuideBridgeSource = GUIDE_BRIDGE_SOURCES.BROWSER_EXTENSION,
): Promise<{
  session: GuideSession;
  state: Awaited<ReturnType<typeof getGuideBridgeSessionState>>;
}> {
  const current = await getGuideSession(sessionId);
  if (!current) throw new Error('Guide session not found');

  const next: GuideSession = {
    ...cloneSession(current),
    status: GUIDE_SESSION_STATUSES.PAUSED,
    updatedAt: new Date().toISOString(),
    version: current.version + 1,
    integration: {
      ...current.integration,
      bridgeKey: current.integration?.bridgeKey || generateGuideBridgeKey(current.id),
      desktopHandoffEnabled: true,
      immersiveInputSessionId:
        typeof metadata?.immersiveInputSessionId === 'string'
          ? metadata.immersiveInputSessionId
          : current.integration?.immersiveInputSessionId,
    },
  };

  await saveGuideSession(next);
  await recordGuideSessionMutation(current, next);
  await requestGuideBridgeHandoff(next, toTarget, reason, metadata, bridgeSource);
  emitSessionChanged(next);
  await syncOverlay(next);
  const state = await getGuideBridgeSessionState(next.id);
  return { session: next, state };
}

export async function acceptGuideSessionHandoff(
  sessionId: string,
  target?: GuideSession['target'],
  metadata?: Record<string, unknown>,
  bridgeSource: GuideBridgeSource = GUIDE_BRIDGE_SOURCES.IMMERSIVE_INPUT,
): Promise<{
  session: GuideSession;
  state: Awaited<ReturnType<typeof getGuideBridgeSessionState>>;
}> {
  const current = await getGuideSession(sessionId);
  if (!current) throw new Error('Guide session not found');

  const bridgeState = await getGuideBridgeSessionState(sessionId);
  const resolvedTarget = target || bridgeState?.pendingHandoff?.toTarget || current.target;
  const fromTarget = bridgeState?.pendingHandoff?.fromTarget || current.target;

  const next: GuideSession = {
    ...cloneSession(current),
    target: resolvedTarget,
    status: GUIDE_SESSION_STATUSES.PAUSED,
    updatedAt: new Date().toISOString(),
    version: current.version + 1,
    integration: {
      ...current.integration,
      bridgeKey: current.integration?.bridgeKey || generateGuideBridgeKey(current.id),
      desktopHandoffEnabled: true,
      immersiveInputSessionId:
        typeof metadata?.immersiveInputSessionId === 'string'
          ? metadata.immersiveInputSessionId
          : current.integration?.immersiveInputSessionId,
    },
  };

  await saveGuideSession(next);
  await recordGuideSessionMutation(current, next);
  await acceptGuideBridgeHandoff(next, fromTarget, resolvedTarget, metadata, bridgeSource);
  emitSessionChanged(next);
  await syncOverlay(next);
  const state = await getGuideBridgeSessionState(next.id);
  return { session: next, state };
}

export async function resumeGuideSessionFromBridge(
  sessionId: string,
  options: {
    target?: GuideSession['target'];
    tabId?: number;
    metadata?: Record<string, unknown>;
    bridgeSource?: GuideBridgeSource;
  } = {},
): Promise<{
  session: GuideSession;
  state: Awaited<ReturnType<typeof getGuideBridgeSessionState>>;
}> {
  const current = await getGuideSession(sessionId);
  if (!current) throw new Error('Guide session not found');

  const next = markActiveStep({
    ...cloneSession(current),
    target: options.target || current.target,
    tabId: typeof options.tabId === 'number' ? options.tabId : current.tabId,
    status: GUIDE_SESSION_STATUSES.RUNNING,
    updatedAt: new Date().toISOString(),
    version: current.version + 1,
    integration: {
      ...current.integration,
      bridgeKey: current.integration?.bridgeKey || generateGuideBridgeKey(current.id),
      immersiveInputSessionId:
        typeof options.metadata?.immersiveInputSessionId === 'string'
          ? options.metadata.immersiveInputSessionId
          : current.integration?.immersiveInputSessionId,
    },
  });

  await saveGuideSession(next);
  await recordGuideSessionMutation(current, next);
  await recordGuideBridgeSessionResumed(
    next,
    options.bridgeSource || GUIDE_BRIDGE_SOURCES.IMMERSIVE_INPUT,
  );
  emitSessionChanged(next);
  await syncOverlay(next);
  const state = await getGuideBridgeSessionState(next.id);
  return { session: next, state };
}

export function initGuideRuntimeListeners(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      switch (message?.type) {
        case BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_CREATE: {
          createGuideSession(message.payload)
            .then((session) => sendResponse({ success: true, session }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_GET: {
          getGuideSession(String(message.sessionId || ''))
            .then((session) => sendResponse({ success: true, session }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_LIST: {
          listGuideSessions()
            .then((sessions) => sendResponse({ success: true, sessions }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_START: {
          startGuideSession(String(message.sessionId || ''))
            .then((session) => sendResponse({ success: true, session }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_ADVANCE: {
          advanceGuideSession(
            String(message.sessionId || ''),
            message.action === 'skip' ? 'skip' : 'next',
          )
            .then((session) => sendResponse({ success: true, session }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_CANCEL: {
          cancelGuideSession(String(message.sessionId || ''))
            .then((session) => sendResponse({ success: true, session }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_ATTACH_TAB: {
          attachGuideSessionTab(String(message.sessionId || ''), Number(message.tabId))
            .then((session) => sendResponse({ success: true, session }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.GUIDE_BRIDGE_LIST_EVENTS: {
          listGuideBridgeEvents(
            typeof message.sessionId === 'string' ? message.sessionId : undefined,
          )
            .then((events) => sendResponse({ success: true, events }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.GUIDE_BRIDGE_GET_STATE: {
          getGuideBridgeSessionState(String(message.sessionId || ''))
            .then((state) => sendResponse({ success: true, state }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.GUIDE_BRIDGE_REQUEST_HANDOFF: {
          requestGuideSessionHandoff(
            String(message.sessionId || ''),
            message.target || GUIDE_TARGETS.DESKTOP,
            typeof message.reason === 'string' ? message.reason : undefined,
            typeof message.metadata === 'object' && message.metadata ? message.metadata : undefined,
            message.bridgeSource || GUIDE_BRIDGE_SOURCES.BROWSER_EXTENSION,
          )
            .then(({ session, state }) => sendResponse({ success: true, session, state }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.GUIDE_BRIDGE_ACCEPT_HANDOFF: {
          acceptGuideSessionHandoff(
            String(message.sessionId || ''),
            message.target,
            typeof message.metadata === 'object' && message.metadata ? message.metadata : undefined,
            message.bridgeSource || GUIDE_BRIDGE_SOURCES.IMMERSIVE_INPUT,
          )
            .then(({ session, state }) => sendResponse({ success: true, session, state }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.GUIDE_BRIDGE_RESUME: {
          resumeGuideSessionFromBridge(String(message.sessionId || ''), {
            target: message.target,
            tabId: typeof message.tabId === 'number' ? message.tabId : undefined,
            metadata:
              typeof message.metadata === 'object' && message.metadata
                ? message.metadata
                : undefined,
            bridgeSource: message.bridgeSource || GUIDE_BRIDGE_SOURCES.IMMERSIVE_INPUT,
          })
            .then(({ session, state }) => sendResponse({ success: true, session, state }))
            .catch((error) =>
              sendResponse({ success: false, error: String(error?.message || error) }),
            );
          return true;
        }
      }
    } catch (error) {
      sendResponse({ success: false, error: String(error) });
      return true;
    }
    return false;
  });
}
