import {
  GUIDE_BRIDGE_EVENT_TYPES,
  GUIDE_BRIDGE_HANDOFF_STATUSES,
  GUIDE_BRIDGE_SOURCES,
  type GuideBridgeEnvelope,
  type GuideBridgeEvent,
  type GuideBridgeEventRecord,
  type GuideBridgeEventType,
  type GuideBridgeHandoffPayload,
  type GuideBridgeSessionPayload,
  type GuideBridgeSessionState,
  type GuideBridgeSource,
  type GuideBridgeStepPayload,
} from '@/common/guide-bridge-types';
import { STORAGE_KEYS } from '@/common/constants';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import {
  createGuideRuntimeSnapshot,
  getActiveGuideStep,
  type GuideSession,
  type GuideTarget,
} from '@/common/guide-types';

const MAX_BRIDGE_EVENTS_PER_SESSION = 100;

type GuideBridgeEventMap = Record<string, GuideBridgeEventRecord[]>;
type GuideBridgeStateMap = Record<string, GuideBridgeSessionState>;

async function readEventMap(): Promise<GuideBridgeEventMap> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.GUIDE_BRIDGE_EVENTS]);
  return (result[STORAGE_KEYS.GUIDE_BRIDGE_EVENTS] as GuideBridgeEventMap | undefined) ?? {};
}

async function writeEventMap(map: GuideBridgeEventMap): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.GUIDE_BRIDGE_EVENTS]: map });
}

async function readStateMap(): Promise<GuideBridgeStateMap> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.GUIDE_BRIDGE_STATES]);
  return (result[STORAGE_KEYS.GUIDE_BRIDGE_STATES] as GuideBridgeStateMap | undefined) ?? {};
}

async function writeStateMap(map: GuideBridgeStateMap): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.GUIDE_BRIDGE_STATES]: map });
}

function generateBridgeEventId(sessionId: string, sequence: number): string {
  return `bridge_${sessionId}_${sequence}`;
}

function buildBaseState(
  session: GuideSession,
  existing?: GuideBridgeSessionState | null,
): GuideBridgeSessionState {
  return {
    sessionId: session.id,
    bridgeKey: session.integration?.bridgeKey || existing?.bridgeKey,
    immersiveInputSessionId:
      session.integration?.immersiveInputSessionId || existing?.immersiveInputSessionId,
    lastSequence: existing?.lastSequence ?? 0,
    lastEventAt: existing?.lastEventAt,
    lastEventType: existing?.lastEventType,
    pendingHandoff: existing?.pendingHandoff ?? null,
  };
}

function createEnvelope<TType extends GuideBridgeEventType, TPayload>(
  type: TType,
  sessionId: string,
  payload: TPayload,
  source: GuideBridgeSource,
): GuideBridgeEnvelope<TType, TPayload> {
  return {
    type,
    source,
    sessionId,
    timestamp: new Date().toISOString(),
    payload,
  };
}

function applyEventToState(
  current: GuideBridgeSessionState,
  event: GuideBridgeEvent,
): GuideBridgeSessionState {
  const next: GuideBridgeSessionState = {
    ...current,
    lastEventAt: event.timestamp,
    lastEventType: event.type,
  };

  if ('payload' in event && event.payload && typeof event.payload === 'object') {
    const payloadSession =
      'session' in event.payload ? (event.payload.session as GuideSession | undefined) : undefined;
    if (payloadSession?.integration?.bridgeKey) {
      next.bridgeKey = payloadSession.integration.bridgeKey;
    }
    if (payloadSession?.integration?.immersiveInputSessionId) {
      next.immersiveInputSessionId = payloadSession.integration.immersiveInputSessionId;
    }
  }

  switch (event.type) {
    case GUIDE_BRIDGE_EVENT_TYPES.HANDOFF_REQUESTED: {
      const payload = event.payload as GuideBridgeHandoffPayload;
      next.pendingHandoff = {
        sessionId: event.sessionId,
        bridgeKey: next.bridgeKey,
        immersiveInputSessionId: next.immersiveInputSessionId,
        status: GUIDE_BRIDGE_HANDOFF_STATUSES.REQUESTED,
        source: event.source,
        fromTarget: payload.fromTarget,
        toTarget: payload.toTarget,
        reason: payload.reason,
        metadata: payload.metadata,
        requestedAt: event.timestamp,
      };
      break;
    }
    case GUIDE_BRIDGE_EVENT_TYPES.HANDOFF_ACCEPTED: {
      const payload = event.payload as GuideBridgeHandoffPayload;
      next.pendingHandoff = {
        sessionId: event.sessionId,
        bridgeKey: next.bridgeKey,
        immersiveInputSessionId:
          next.immersiveInputSessionId ||
          (typeof payload.metadata?.immersiveInputSessionId === 'string'
            ? payload.metadata.immersiveInputSessionId
            : undefined),
        status: GUIDE_BRIDGE_HANDOFF_STATUSES.ACCEPTED,
        source: event.source,
        fromTarget: payload.fromTarget,
        toTarget: payload.toTarget,
        reason: payload.reason,
        metadata: payload.metadata,
        requestedAt: next.pendingHandoff?.requestedAt,
        acceptedAt: event.timestamp,
      };
      break;
    }
    case GUIDE_BRIDGE_EVENT_TYPES.SESSION_RESUMED: {
      if (next.pendingHandoff) {
        next.pendingHandoff = {
          ...next.pendingHandoff,
          status: GUIDE_BRIDGE_HANDOFF_STATUSES.RESUMED,
          resumedAt: event.timestamp,
        };
      }
      break;
    }
    default:
      break;
  }

  return next;
}

async function persistEvent(
  session: GuideSession,
  event: GuideBridgeEvent,
): Promise<{ record: GuideBridgeEventRecord; state: GuideBridgeSessionState }> {
  const [eventMap, stateMap] = await Promise.all([readEventMap(), readStateMap()]);
  const baseState = buildBaseState(session, stateMap[session.id]);
  const sequence = baseState.lastSequence + 1;
  const record: GuideBridgeEventRecord = {
    id: generateBridgeEventId(session.id, sequence),
    sequence,
    sessionId: session.id,
    event,
  };

  const existingEvents = eventMap[session.id] ?? [];
  eventMap[session.id] = [...existingEvents, record].slice(-MAX_BRIDGE_EVENTS_PER_SESSION);

  const nextState = applyEventToState(
    {
      ...baseState,
      lastSequence: sequence,
    },
    event,
  );
  stateMap[session.id] = nextState;

  await Promise.all([writeEventMap(eventMap), writeStateMap(stateMap)]);

  void chrome.runtime
    .sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GUIDE_BRIDGE_EVENT_RECORDED,
      record,
      state: nextState,
    })
    .catch(() => {});

  return { record, state: nextState };
}

export async function listGuideBridgeEvents(sessionId?: string): Promise<GuideBridgeEventRecord[]> {
  const eventMap = await readEventMap();
  if (sessionId?.trim()) {
    return [...(eventMap[sessionId.trim()] ?? [])].sort((a, b) => b.sequence - a.sequence);
  }

  return Object.values(eventMap)
    .flat()
    .sort((a, b) => b.event.timestamp.localeCompare(a.event.timestamp));
}

export async function getGuideBridgeSessionState(
  sessionId: string,
): Promise<GuideBridgeSessionState | null> {
  const stateMap = await readStateMap();
  return stateMap[sessionId] ?? null;
}

export async function recordGuideBridgeSessionCreated(
  session: GuideSession,
  source: GuideBridgeSource = GUIDE_BRIDGE_SOURCES.BROWSER_EXTENSION,
): Promise<{ record: GuideBridgeEventRecord; state: GuideBridgeSessionState }> {
  const payload: GuideBridgeSessionPayload = {
    session,
    snapshot: createGuideRuntimeSnapshot(session),
  };
  return persistEvent(
    session,
    createEnvelope(GUIDE_BRIDGE_EVENT_TYPES.SESSION_CREATED, session.id, payload, source),
  );
}

export async function recordGuideBridgeSessionUpdated(
  session: GuideSession,
  source: GuideBridgeSource = GUIDE_BRIDGE_SOURCES.BROWSER_EXTENSION,
): Promise<{ record: GuideBridgeEventRecord; state: GuideBridgeSessionState }> {
  const payload: GuideBridgeSessionPayload = {
    session,
    snapshot: createGuideRuntimeSnapshot(session),
  };
  return persistEvent(
    session,
    createEnvelope(GUIDE_BRIDGE_EVENT_TYPES.SESSION_UPDATED, session.id, payload, source),
  );
}

export async function recordGuideBridgeStepChanged(
  session: GuideSession,
  source: GuideBridgeSource = GUIDE_BRIDGE_SOURCES.BROWSER_EXTENSION,
): Promise<{ record: GuideBridgeEventRecord; state: GuideBridgeSessionState }> {
  const activeStep = getActiveGuideStep(session);
  const payload: GuideBridgeStepPayload = {
    session,
    snapshot: createGuideRuntimeSnapshot(session),
    stepId: activeStep?.id,
    stepIndex: session.currentStepIndex,
  };
  return persistEvent(
    session,
    createEnvelope(GUIDE_BRIDGE_EVENT_TYPES.STEP_CHANGED, session.id, payload, source),
  );
}

export async function requestGuideBridgeHandoff(
  session: GuideSession,
  toTarget: GuideTarget,
  reason?: string,
  metadata?: Record<string, unknown>,
  source: GuideBridgeSource = GUIDE_BRIDGE_SOURCES.BROWSER_EXTENSION,
): Promise<{ record: GuideBridgeEventRecord; state: GuideBridgeSessionState }> {
  const payload: GuideBridgeHandoffPayload = {
    session,
    fromTarget: session.target,
    toTarget,
    reason,
    metadata,
  };
  return persistEvent(
    session,
    createEnvelope(GUIDE_BRIDGE_EVENT_TYPES.HANDOFF_REQUESTED, session.id, payload, source),
  );
}

export async function acceptGuideBridgeHandoff(
  session: GuideSession,
  fromTarget: GuideTarget,
  toTarget: GuideTarget,
  metadata?: Record<string, unknown>,
  source: GuideBridgeSource = GUIDE_BRIDGE_SOURCES.IMMERSIVE_INPUT,
): Promise<{ record: GuideBridgeEventRecord; state: GuideBridgeSessionState }> {
  const payload: GuideBridgeHandoffPayload = {
    session,
    fromTarget,
    toTarget,
    metadata,
  };
  return persistEvent(
    session,
    createEnvelope(GUIDE_BRIDGE_EVENT_TYPES.HANDOFF_ACCEPTED, session.id, payload, source),
  );
}

export async function recordGuideBridgeSessionResumed(
  session: GuideSession,
  source: GuideBridgeSource = GUIDE_BRIDGE_SOURCES.IMMERSIVE_INPUT,
): Promise<{ record: GuideBridgeEventRecord; state: GuideBridgeSessionState }> {
  const payload: GuideBridgeSessionPayload = {
    session,
    snapshot: createGuideRuntimeSnapshot(session),
  };
  return persistEvent(
    session,
    createEnvelope(GUIDE_BRIDGE_EVENT_TYPES.SESSION_RESUMED, session.id, payload, source),
  );
}
