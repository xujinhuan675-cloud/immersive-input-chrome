import {
  GUIDE_ENTRY_SOURCES,
  GUIDE_PERMISSION_MODES,
  GUIDE_TARGETS,
  type GuideEntrySource,
  type GuideIntegrationHints,
  type GuidePermissionMode,
  type GuideStep,
  type GuideTarget,
} from '@/common/guide-types';
import type { GuideSessionCreatePayload } from '@/common/message-types';

export interface GuideTaskPayloadInput {
  taskId?: string;
  title: string;
  summary?: string;
  source?: GuideEntrySource;
  target?: GuideTarget;
  tabId?: number;
  permissionMode?: GuidePermissionMode;
  steps: GuideStep[];
  metadata?: Record<string, unknown>;
  integration?: GuideIntegrationHints;
}

function normalizeRecord(value?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeIntegrationHints(
  value?: GuideIntegrationHints,
): GuideIntegrationHints | undefined {
  if (!value) return undefined;

  const normalized: GuideIntegrationHints = {
    immersiveInputSessionId: value.immersiveInputSessionId?.trim() || undefined,
    bridgeKey: value.bridgeKey?.trim() || undefined,
    desktopHandoffEnabled:
      typeof value.desktopHandoffEnabled === 'boolean' ? value.desktopHandoffEnabled : undefined,
  };

  return normalized.immersiveInputSessionId ||
    normalized.bridgeKey ||
    typeof normalized.desktopHandoffEnabled === 'boolean'
    ? normalized
    : undefined;
}

export function buildGuideSessionCreatePayload(
  input: GuideTaskPayloadInput,
): GuideSessionCreatePayload {
  return {
    taskId: input.taskId?.trim() || undefined,
    title: input.title.trim(),
    summary: input.summary?.trim() || undefined,
    source: input.source || GUIDE_ENTRY_SOURCES.PLUGIN_CHAT,
    target: input.target || GUIDE_TARGETS.BROWSER,
    tabId: typeof input.tabId === 'number' ? input.tabId : undefined,
    permissionMode: input.permissionMode || GUIDE_PERMISSION_MODES.CONFIRM,
    steps: input.steps,
    metadata: normalizeRecord(input.metadata),
    integration: normalizeIntegrationHints(input.integration),
  };
}
