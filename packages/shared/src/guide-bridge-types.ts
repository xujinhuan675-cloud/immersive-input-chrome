import type { GuideRuntimeSnapshot, GuideSession, GuideTarget } from './guide-types';

export const GUIDE_BRIDGE_SOURCES = {
  BROWSER_EXTENSION: 'browser_extension',
  IMMERSIVE_INPUT: 'immersive_input',
  EXTERNAL_AI: 'external_ai',
} as const;

export type GuideBridgeSource = (typeof GUIDE_BRIDGE_SOURCES)[keyof typeof GUIDE_BRIDGE_SOURCES];

export const GUIDE_BRIDGE_EVENT_TYPES = {
  SESSION_CREATED: 'guide.session_created',
  SESSION_UPDATED: 'guide.session_updated',
  STEP_CHANGED: 'guide.step_changed',
  HANDOFF_REQUESTED: 'guide.handoff_requested',
  HANDOFF_ACCEPTED: 'guide.handoff_accepted',
  SESSION_RESUMED: 'guide.session_resumed',
} as const;

export type GuideBridgeEventType =
  (typeof GUIDE_BRIDGE_EVENT_TYPES)[keyof typeof GUIDE_BRIDGE_EVENT_TYPES];

export const GUIDE_BRIDGE_HANDOFF_STATUSES = {
  IDLE: 'idle',
  REQUESTED: 'requested',
  ACCEPTED: 'accepted',
  RESUMED: 'resumed',
} as const;

export type GuideBridgeHandoffStatus =
  (typeof GUIDE_BRIDGE_HANDOFF_STATUSES)[keyof typeof GUIDE_BRIDGE_HANDOFF_STATUSES];

export interface GuideBridgeEnvelope<TType extends GuideBridgeEventType, TPayload> {
  type: TType;
  source: GuideBridgeSource;
  sessionId: string;
  timestamp: string;
  payload: TPayload;
}

export interface GuideBridgeSessionPayload {
  session: GuideSession;
  snapshot: GuideRuntimeSnapshot;
}

export interface GuideBridgeStepPayload {
  session: GuideSession;
  snapshot: GuideRuntimeSnapshot;
  stepId?: string;
  stepIndex: number;
}

export interface GuideBridgeHandoffPayload {
  session: GuideSession;
  fromTarget: GuideTarget;
  toTarget: GuideTarget;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface GuideBridgeEventRecord {
  id: string;
  sequence: number;
  sessionId: string;
  event: GuideBridgeEvent;
}

export interface GuideBridgeHandoffState {
  sessionId: string;
  bridgeKey?: string;
  immersiveInputSessionId?: string;
  status: GuideBridgeHandoffStatus;
  source: GuideBridgeSource;
  fromTarget: GuideTarget;
  toTarget: GuideTarget;
  reason?: string;
  metadata?: Record<string, unknown>;
  requestedAt?: string;
  acceptedAt?: string;
  resumedAt?: string;
}

export interface GuideBridgeSessionState {
  sessionId: string;
  bridgeKey?: string;
  immersiveInputSessionId?: string;
  lastSequence: number;
  lastEventType?: GuideBridgeEventType;
  lastEventAt?: string;
  pendingHandoff?: GuideBridgeHandoffState | null;
}

export type GuideBridgeSessionCreatedEvent = GuideBridgeEnvelope<
  typeof GUIDE_BRIDGE_EVENT_TYPES.SESSION_CREATED,
  GuideBridgeSessionPayload
>;

export type GuideBridgeSessionUpdatedEvent = GuideBridgeEnvelope<
  typeof GUIDE_BRIDGE_EVENT_TYPES.SESSION_UPDATED,
  GuideBridgeSessionPayload
>;

export type GuideBridgeStepChangedEvent = GuideBridgeEnvelope<
  typeof GUIDE_BRIDGE_EVENT_TYPES.STEP_CHANGED,
  GuideBridgeStepPayload
>;

export type GuideBridgeHandoffRequestedEvent = GuideBridgeEnvelope<
  typeof GUIDE_BRIDGE_EVENT_TYPES.HANDOFF_REQUESTED,
  GuideBridgeHandoffPayload
>;

export type GuideBridgeHandoffAcceptedEvent = GuideBridgeEnvelope<
  typeof GUIDE_BRIDGE_EVENT_TYPES.HANDOFF_ACCEPTED,
  GuideBridgeHandoffPayload
>;

export type GuideBridgeSessionResumedEvent = GuideBridgeEnvelope<
  typeof GUIDE_BRIDGE_EVENT_TYPES.SESSION_RESUMED,
  GuideBridgeSessionPayload
>;

export type GuideBridgeEvent =
  | GuideBridgeSessionCreatedEvent
  | GuideBridgeSessionUpdatedEvent
  | GuideBridgeStepChangedEvent
  | GuideBridgeHandoffRequestedEvent
  | GuideBridgeHandoffAcceptedEvent
  | GuideBridgeSessionResumedEvent;
