import { GUIDE_BRIDGE_SOURCES, type GuideBridgeSource } from '@/common/guide-bridge-types';
import { buildGuideSessionCreatePayload } from '@/common/guide-task-adapter';
import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import {
  GUIDE_ENTRY_SOURCES,
  GUIDE_PERMISSION_MODES,
  GUIDE_SELECTOR_TYPES,
  GUIDE_STEP_KINDS,
  GUIDE_STEP_STATUSES,
  GUIDE_TARGETS,
  createGuideRuntimeSnapshot,
  type GuideAnchor,
  type GuideIntegrationHints,
  type GuidePermissionMode,
  type GuideSession,
  type GuideStep,
  type GuideTarget,
} from '@/common/guide-types';
import { collectGuideAnchors, buildGuideSteps } from '@/common/guide-session-launcher';
import {
  acceptGuideSessionHandoff,
  attachGuideSessionTab,
  advanceGuideSession,
  cancelGuideSession,
  createGuideSession,
  requestGuideSessionHandoff,
  resumeGuideSessionFromBridge,
  startGuideSession,
} from '@/entrypoints/background/guide-runtime';
import {
  getGuideBridgeSessionState,
  listGuideBridgeEvents,
} from '@/entrypoints/background/guide-runtime/bridge-adapter';
import {
  getGuideSession,
  listGuideSessions,
} from '@/entrypoints/background/guide-runtime/session-store';

const IMMERSIVE_GUIDE_TOOL_NAME = 'chrome_immersive_guide' as const;

type GuideToolAction =
  | 'create'
  | 'get'
  | 'list'
  | 'bridge_state'
  | 'bridge_events'
  | 'start'
  | 'next'
  | 'skip'
  | 'cancel'
  | 'attach_tab'
  | 'request_handoff'
  | 'accept_handoff'
  | 'resume';

interface GuideToolStepInput {
  id?: string;
  title: string;
  description?: string;
  kind?: GuideStep['kind'];
  target?: GuideTarget;
  anchor?: GuideAnchor;
  instructions?: string[];
  payload?: Record<string, unknown>;
}

interface GuideToolParams {
  action: GuideToolAction;
  sessionId?: string;
  taskId?: string;
  title?: string;
  summary?: string;
  source?: string;
  bridgeSource?: GuideBridgeSource;
  target?: GuideTarget;
  tabId?: number;
  windowId?: number;
  permissionMode?: GuidePermissionMode;
  steps?: GuideToolStepInput[];
  useAutoAnchors?: boolean;
  start?: boolean;
  metadata?: Record<string, unknown>;
  integration?: GuideIntegrationHints;
}

function normalizeObjectRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function normalizeInstructions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStep(
  step: GuideToolStepInput,
  index: number,
  defaultTarget: GuideTarget,
): GuideStep {
  const anchor = step.anchor
    ? {
        ...step.anchor,
        selector: step.anchor.selector?.trim() || undefined,
        selectorType: step.anchor.selectorType || GUIDE_SELECTOR_TYPES.CSS,
        description: step.anchor.description?.trim() || undefined,
        urlPattern: step.anchor.urlPattern?.trim() || undefined,
        markerId: step.anchor.markerId?.trim() || undefined,
      }
    : undefined;

  return {
    id: step.id?.trim() || `guide_step_${index + 1}`,
    title: step.title.trim(),
    description: step.description?.trim() || undefined,
    kind: step.kind || GUIDE_STEP_KINDS.HIGHLIGHT,
    target: step.target || defaultTarget,
    anchor,
    status: GUIDE_STEP_STATUSES.PENDING,
    instructions: normalizeInstructions(step.instructions),
    payload: normalizeObjectRecord(step.payload),
  };
}

function normalizeSource(value?: string): GuideSession['source'] {
  const normalized = value?.trim();
  switch (normalized) {
    case GUIDE_ENTRY_SOURCES.PLUGIN_CHAT:
    case GUIDE_ENTRY_SOURCES.DESKTOP_COMPANION:
    case GUIDE_ENTRY_SOURCES.MANUAL:
    case GUIDE_ENTRY_SOURCES.EXTERNAL_AI:
      return normalized;
    default:
      return GUIDE_ENTRY_SOURCES.EXTERNAL_AI;
  }
}

function normalizeBridgeSource(value?: GuideBridgeSource): GuideBridgeSource {
  switch (value) {
    case GUIDE_BRIDGE_SOURCES.EXTERNAL_AI:
    case GUIDE_BRIDGE_SOURCES.IMMERSIVE_INPUT:
    case GUIDE_BRIDGE_SOURCES.BROWSER_EXTENSION:
      return value;
    default:
      return GUIDE_BRIDGE_SOURCES.EXTERNAL_AI;
  }
}

function normalizeTarget(value?: GuideTarget): GuideTarget {
  if (value === GUIDE_TARGETS.DESKTOP || value === GUIDE_TARGETS.HYBRID) {
    return value;
  }
  return GUIDE_TARGETS.BROWSER;
}

function normalizePermissionMode(value?: GuidePermissionMode): GuidePermissionMode {
  switch (value) {
    case GUIDE_PERMISSION_MODES.READONLY:
    case GUIDE_PERMISSION_MODES.AUTO:
    case GUIDE_PERMISSION_MODES.CONFIRM:
      return value;
    default:
      return GUIDE_PERMISSION_MODES.CONFIRM;
  }
}

class ImmersiveGuideTool extends BaseBrowserToolExecutor {
  name = IMMERSIVE_GUIDE_TOOL_NAME;

  private async resolveTargetTabId(tabId?: number, windowId?: number): Promise<number> {
    const explicit = await this.tryGetTab(tabId);
    if (explicit?.id) return explicit.id;

    const active = await this.getActiveTabOrThrowInWindow(windowId);
    if (!active.id) throw new Error('Active tab not found');
    return active.id;
  }

  private createResponse(session: GuideSession, extra: Record<string, unknown> = {}): ToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            session,
            snapshot: createGuideRuntimeSnapshot(session),
            ...extra,
          }),
        },
      ],
      isError: false,
    };
  }

  private async handleCreate(args: GuideToolParams): Promise<ToolResult> {
    if (!args.title?.trim()) {
      return createErrorResponse('Param [title] is required for action=create');
    }

    const target = normalizeTarget(args.target);
    const tabId = await this.resolveTargetTabId(args.tabId, args.windowId);
    const tab = await chrome.tabs.get(tabId);

    const normalizedSteps =
      args.steps
        ?.filter((step) => step && typeof step.title === 'string' && step.title.trim().length > 0)
        .map((step, index) => normalizeStep(step, index, target)) ?? [];

    const shouldUseAutoAnchors = args.useAutoAnchors !== false || normalizedSteps.length === 0;
    const autoSteps =
      shouldUseAutoAnchors && target === GUIDE_TARGETS.BROWSER
        ? buildGuideSteps(await collectGuideAnchors(tabId))
        : [];

    const steps = normalizedSteps.length > 0 ? normalizedSteps : autoSteps;
    if (steps.length === 0) {
      return createErrorResponse(
        'No guide steps available. Provide [steps] or allow [useAutoAnchors] on a browser tab.',
      );
    }

    const created = await createGuideSession(
      buildGuideSessionCreatePayload({
        taskId: args.taskId?.trim() || `external_guide_${Date.now()}`,
        title: args.title.trim(),
        summary: args.summary?.trim() || undefined,
        source: normalizeSource(args.source),
        target,
        tabId,
        permissionMode: normalizePermissionMode(args.permissionMode),
        steps,
        metadata: {
          ...(normalizeObjectRecord(args.metadata) || {}),
          pageUrl: tab.url,
          entry: 'mcp',
        },
        integration: normalizeObjectRecord(args.integration) as GuideIntegrationHints | undefined,
      }),
    );

    if (args.start === false) {
      return this.createResponse(created, {
        created: true,
        started: false,
        stepCount: created.steps.length,
        autoAnchorsUsed: normalizedSteps.length === 0 && autoSteps.length > 0,
      });
    }

    const started = await startGuideSession(created.id);
    return this.createResponse(started, {
      created: true,
      started: true,
      stepCount: started.steps.length,
      autoAnchorsUsed: normalizedSteps.length === 0 && autoSteps.length > 0,
    });
  }

  async execute(args: GuideToolParams): Promise<ToolResult> {
    try {
      switch (args?.action) {
        case 'create':
          return await this.handleCreate(args);
        case 'get': {
          if (!args.sessionId?.trim()) {
            return createErrorResponse('Param [sessionId] is required for action=get');
          }
          const session = await getGuideSession(args.sessionId.trim());
          if (!session) {
            return createErrorResponse(`Guide session not found: ${args.sessionId}`);
          }
          return this.createResponse(session, { found: true });
        }
        case 'list': {
          const sessions = await listGuideSessions();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: true,
                  count: sessions.length,
                  sessions: sessions.map((session) => ({
                    id: session.id,
                    title: session.title,
                    status: session.status,
                    source: session.source,
                    target: session.target,
                    currentStepIndex: session.currentStepIndex,
                    totalSteps: session.steps.length,
                    updatedAt: session.updatedAt,
                  })),
                }),
              },
            ],
            isError: false,
          };
        }
        case 'bridge_state': {
          if (!args.sessionId?.trim()) {
            return createErrorResponse('Param [sessionId] is required for action=bridge_state');
          }
          const state = await getGuideBridgeSessionState(args.sessionId.trim());
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, state }) }],
            isError: false,
          };
        }
        case 'bridge_events': {
          const events = await listGuideBridgeEvents(args.sessionId?.trim() || undefined);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: true,
                  count: events.length,
                  events,
                }),
              },
            ],
            isError: false,
          };
        }
        case 'start': {
          if (!args.sessionId?.trim()) {
            return createErrorResponse('Param [sessionId] is required for action=start');
          }
          const session = await startGuideSession(args.sessionId.trim());
          return this.createResponse(session, { started: true });
        }
        case 'next':
        case 'skip': {
          if (!args.sessionId?.trim()) {
            return createErrorResponse(`Param [sessionId] is required for action=${args.action}`);
          }
          const session = await advanceGuideSession(args.sessionId.trim(), args.action);
          return this.createResponse(session, { advanced: args.action });
        }
        case 'cancel': {
          if (!args.sessionId?.trim()) {
            return createErrorResponse('Param [sessionId] is required for action=cancel');
          }
          const session = await cancelGuideSession(args.sessionId.trim());
          return this.createResponse(session, { cancelled: true });
        }
        case 'attach_tab': {
          if (!args.sessionId?.trim()) {
            return createErrorResponse('Param [sessionId] is required for action=attach_tab');
          }
          const tabId = await this.resolveTargetTabId(args.tabId, args.windowId);
          const session = await attachGuideSessionTab(args.sessionId.trim(), tabId);
          return this.createResponse(session, { attachedTabId: tabId });
        }
        case 'request_handoff': {
          if (!args.sessionId?.trim()) {
            return createErrorResponse('Param [sessionId] is required for action=request_handoff');
          }
          const target = normalizeTarget(args.target);
          const { session, state } = await requestGuideSessionHandoff(
            args.sessionId.trim(),
            target,
            args.summary?.trim() || undefined,
            normalizeObjectRecord(args.metadata),
            normalizeBridgeSource(args.bridgeSource),
          );
          return this.createResponse(session, { handoffRequested: true, bridgeState: state });
        }
        case 'accept_handoff': {
          if (!args.sessionId?.trim()) {
            return createErrorResponse('Param [sessionId] is required for action=accept_handoff');
          }
          const { session, state } = await acceptGuideSessionHandoff(
            args.sessionId.trim(),
            args.target ? normalizeTarget(args.target) : undefined,
            normalizeObjectRecord(args.metadata),
            normalizeBridgeSource(args.bridgeSource),
          );
          return this.createResponse(session, { handoffAccepted: true, bridgeState: state });
        }
        case 'resume': {
          if (!args.sessionId?.trim()) {
            return createErrorResponse('Param [sessionId] is required for action=resume');
          }
          const resolvedTabId =
            typeof args.tabId === 'number' || typeof args.windowId === 'number'
              ? await this.resolveTargetTabId(args.tabId, args.windowId)
              : undefined;
          const { session, state } = await resumeGuideSessionFromBridge(args.sessionId.trim(), {
            target: args.target ? normalizeTarget(args.target) : undefined,
            tabId: resolvedTabId,
            metadata: normalizeObjectRecord(args.metadata),
            bridgeSource: normalizeBridgeSource(args.bridgeSource),
          });
          return this.createResponse(session, { resumed: true, bridgeState: state });
        }
        default:
          return createErrorResponse(
            'Param [action] is required and must be one of: create, get, list, bridge_state, bridge_events, start, next, skip, cancel, attach_tab, request_handoff, accept_handoff, resume',
          );
      }
    } catch (error) {
      console.error('[ImmersiveGuideTool] execute failed:', error);
      return createErrorResponse(
        error instanceof Error ? error.message : 'Unknown immersive guide tool error',
      );
    }
  }
}

export const immersiveGuideTool = new ImmersiveGuideTool();
