import {
  GUIDE_ENTRY_SOURCES,
  GUIDE_PERMISSION_MODES,
  GUIDE_STEP_KINDS,
  GUIDE_STEP_STATUSES,
  GUIDE_TARGETS,
  type GuideEntrySource,
  type GuideIntegrationHints,
  type GuidePermissionMode,
  type GuideSession,
  type GuideStep,
} from '@/common/guide-types';
import { buildGuideSessionCreatePayload } from '@/common/guide-task-adapter';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import type { SelectedElementSummary } from '@/common/web-editor-types';

export interface GuideLaunchAnchor {
  selector: string;
  selectorType: 'css';
  title: string;
  description: string;
  instructions?: string[];
  urlPattern?: string;
  markerId?: string;
}

export interface LaunchGuideSessionOptions {
  tabId?: number;
  taskId?: string;
  title: string;
  summary?: string;
  source?: GuideEntrySource;
  permissionMode?: GuidePermissionMode;
  metadata?: Record<string, unknown>;
  integration?: GuideIntegrationHints;
  preferredAnchor?: GuideLaunchAnchor | null;
  start?: boolean;
}

export interface LaunchGuideSessionResult {
  tab: chrome.tabs.Tab;
  session: GuideSession;
  anchors: GuideLaunchAnchor[];
  steps: GuideStep[];
}

type RuntimeResult<T> = { success: true; session: T } | { success: false; error?: string };

function truncateText(value: string, maxLength = 72): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function uniqueAnchors(anchors: Array<GuideLaunchAnchor | null | undefined>): GuideLaunchAnchor[] {
  const seen = new Set<string>();
  const normalized: GuideLaunchAnchor[] = [];
  for (const anchor of anchors) {
    if (!anchor?.selector?.trim()) continue;
    const selector = anchor.selector.trim();
    if (seen.has(selector)) continue;
    seen.add(selector);
    normalized.push({
      ...anchor,
      selector,
      selectorType: 'css',
      title: anchor.title.trim() || 'Current page',
      description: anchor.description.trim() || 'Guide target',
      instructions: anchor.instructions?.filter((item) => item.trim().length > 0),
      urlPattern: anchor.urlPattern?.trim() || undefined,
      markerId: anchor.markerId?.trim() || undefined,
    });
  }
  return normalized;
}

export function buildGuideTitleFromIntent(
  intent: string,
  fallback = 'Immersive browser guide',
): string {
  const trimmed = intent.trim();
  if (!trimmed) return fallback;
  return truncateText(trimmed, 48);
}

export function buildGuideSummaryFromIntent(intent: string): string {
  const trimmed = intent.trim();
  if (!trimmed) {
    return 'Launch a browser guide session from the extension.';
  }
  return `Guide request from plugin chat: ${truncateText(trimmed, 120)}`;
}

export function createGuideAnchorFromSelection(
  selection: SelectedElementSummary,
  pageUrl?: string | null,
): GuideLaunchAnchor | null {
  const selector = selection.locator?.selectors?.find((item) => item.trim().length > 0)?.trim();
  if (!selector) return null;

  const label = selection.label || selection.fullLabel || selection.tagName || 'selected element';
  return {
    selector,
    selectorType: 'css',
    title: `Selected element: ${truncateText(label, 40)}`,
    description: `Guide is anchored to ${label} from the current web editor selection.`,
    instructions: [
      'Follow the highlighted target on the current page.',
      'If the page changes, re-run the guide from chat to refresh the anchor.',
    ],
    urlPattern: pageUrl?.trim() || undefined,
  };
}

async function resolveGuideTab(preferredTabId?: number): Promise<chrome.tabs.Tab> {
  if (typeof preferredTabId === 'number') {
    const tab = await chrome.tabs.get(preferredTabId);
    if (tab?.id) return tab;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id || !activeTab.url) {
    throw new Error('No active tab available for immersive guide launch');
  }
  return activeTab;
}

export async function collectGuideAnchors(tabId: number): Promise<GuideLaunchAnchor[]> {
  const executionResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      function cssEscapeInline(value: string): string {
        return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
      }

      function attributeSelector(tagName: string, attr: string, value: string): string {
        return `${tagName}[${attr}="${value.replace(/"/g, '\\"')}"]`;
      }

      function buildSelector(element: Element): string {
        const htmlElement = element as HTMLElement;
        if (htmlElement.id) {
          return `${element.tagName.toLowerCase()}#${cssEscapeInline(htmlElement.id)}`;
        }

        const priorityAttributes = ['data-testid', 'data-test', 'data-qa', 'name', 'aria-label'];
        for (const attr of priorityAttributes) {
          const attributeValue = element.getAttribute(attr);
          if (attributeValue) {
            return attributeSelector(element.tagName.toLowerCase(), attr, attributeValue);
          }
        }

        const className = htmlElement.className;
        if (typeof className === 'string' && className.trim()) {
          const classTokens = className
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((token) => `.${cssEscapeInline(token)}`);
          if (classTokens.length > 0) {
            return `${element.tagName.toLowerCase()}${classTokens.join('')}`;
          }
        }

        const parent = element.parentElement;
        if (!parent) {
          return element.tagName.toLowerCase();
        }

        const siblingIndex =
          Array.from(parent.children).findIndex((child) => child === element) + 1;
        return `${parent.tagName.toLowerCase()} > ${element.tagName.toLowerCase()}:nth-child(${siblingIndex})`;
      }

      function isVisible(element: Element): boolean {
        const htmlElement = element as HTMLElement;
        const rect = htmlElement.getBoundingClientRect();
        if (rect.width < 12 || rect.height < 12) return false;
        const style = window.getComputedStyle(htmlElement);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number.parseFloat(style.opacity || '1') < 0.05
        ) {
          return false;
        }
        return rect.bottom >= 0 && rect.right >= 0;
      }

      const specs = [
        {
          selector:
            'button:not([disabled]), [role="button"]:not([aria-disabled="true"]), input[type="submit"], input[type="button"]',
          title: 'Primary action',
          description: 'Start from the visible primary action on this page.',
          instructions: ['Click or review the main call-to-action highlighted on the page.'],
        },
        {
          selector:
            'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
          title: 'Form input',
          description: 'Use the first visible form field as the guide anchor.',
          instructions: ['Enter the required information in the highlighted field.'],
        },
        {
          selector: 'a[href], nav a[href], [role="link"]',
          title: 'Navigation entry',
          description: 'Guide starts from the first visible navigation entry.',
          instructions: ['Open the highlighted entry to continue the task flow.'],
        },
      ];

      const anchors: Array<{
        selector: string;
        selectorType: 'css';
        title: string;
        description: string;
        instructions?: string[];
      }> = [];
      const seen = new Set<string>();

      for (const spec of specs) {
        const candidates = Array.from(document.querySelectorAll(spec.selector));
        const match = candidates.find((candidate) => isVisible(candidate));
        if (!match) continue;
        const selector = buildSelector(match);
        if (!selector || seen.has(selector)) continue;
        seen.add(selector);
        anchors.push({
          selector,
          selectorType: 'css',
          title: spec.title,
          description: spec.description,
          instructions: spec.instructions,
        });
      }

      if (!anchors.length) {
        anchors.push({
          selector: 'body',
          selectorType: 'css',
          title: 'Current page',
          description:
            'The guide is attached to the current page because no visible interactive element was detected.',
          instructions: ['Use this fallback preview to validate the runtime and overlay flow.'],
        });
      }

      return anchors;
    },
  });

  return Array.isArray(executionResults[0]?.result) ? executionResults[0].result : [];
}

export function buildGuideSteps(anchors: GuideLaunchAnchor[]): GuideStep[] {
  return anchors.map((anchor, index) => ({
    id: `guide_step_${index + 1}`,
    title: anchor.title,
    description: anchor.description,
    kind:
      index === anchors.length - 1 && anchors.length > 1
        ? GUIDE_STEP_KINDS.WAIT_FOR_USER
        : GUIDE_STEP_KINDS.HIGHLIGHT,
    target: GUIDE_TARGETS.BROWSER,
    status: GUIDE_STEP_STATUSES.PENDING,
    anchor: {
      selector: anchor.selector,
      selectorType: anchor.selectorType,
      description: anchor.description,
      urlPattern: anchor.urlPattern,
      markerId: anchor.markerId,
    },
    instructions: anchor.instructions,
    payload: {
      preview: true,
      source: 'browser_extension',
    },
  }));
}

export async function launchGuideSession(
  options: LaunchGuideSessionOptions,
): Promise<LaunchGuideSessionResult> {
  const tab = await resolveGuideTab(options.tabId);
  if (!tab.id || !tab.url) {
    throw new Error('Active tab is missing required metadata');
  }

  const autoAnchors = await collectGuideAnchors(tab.id);
  const anchors = uniqueAnchors([options.preferredAnchor, ...autoAnchors]);
  const steps = buildGuideSteps(anchors);
  const taskId = options.taskId || `browser_guide_${Date.now()}`;

  const created = (await chrome.runtime.sendMessage({
    type: BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_CREATE,
    payload: buildGuideSessionCreatePayload({
      taskId,
      title: options.title.trim() || buildGuideTitleFromIntent(''),
      summary: options.summary?.trim() || undefined,
      source: options.source || GUIDE_ENTRY_SOURCES.PLUGIN_CHAT,
      target: GUIDE_TARGETS.BROWSER,
      tabId: tab.id,
      permissionMode: options.permissionMode || GUIDE_PERMISSION_MODES.CONFIRM,
      steps,
      metadata: {
        pageUrl: tab.url,
        ...options.metadata,
      },
      integration: options.integration,
    }),
  })) as RuntimeResult<GuideSession>;

  if (!created?.success || !created.session) {
    const errorMessage = created && 'error' in created ? created.error : undefined;
    throw new Error(errorMessage || 'Failed to create guide session');
  }

  const shouldStart = options.start !== false;
  if (!shouldStart) {
    return { tab, session: created.session, anchors, steps };
  }

  const started = (await chrome.runtime.sendMessage({
    type: BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_START,
    sessionId: created.session.id,
  })) as RuntimeResult<GuideSession>;

  if (!started?.success || !started.session) {
    const errorMessage = started && 'error' in started ? started.error : undefined;
    throw new Error(errorMessage || 'Failed to start guide session');
  }

  return {
    tab,
    session: started.session,
    anchors,
    steps,
  };
}
