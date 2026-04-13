import { BACKGROUND_MESSAGE_TYPES, TOOL_MESSAGE_TYPES } from '@/common/message-types';
import {
  createGuideOverlayController,
  type GuideOverlayController,
  type GuideOverlayRenderPayload,
} from '@/shared/guide-overlay';

interface GuideOverlayMessage {
  action: string;
  payload?: Record<string, unknown>;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    if (window.top !== window) return;

    let controller: GuideOverlayController | null = null;

    function ensureController(): GuideOverlayController {
      if (!controller) {
        controller = createGuideOverlayController({
          onAdvance: async (sessionId, action) => {
            try {
              await chrome.runtime.sendMessage({
                type: BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_ADVANCE,
                sessionId,
                action,
              });
            } catch (error) {
              console.warn('[GuideOverlay] Failed to advance session:', error);
            }
          },
          onCancel: async (sessionId) => {
            try {
              await chrome.runtime.sendMessage({
                type: BACKGROUND_MESSAGE_TYPES.GUIDE_SESSION_CANCEL,
                sessionId,
              });
            } catch (error) {
              console.warn('[GuideOverlay] Failed to cancel session:', error);
            }
          },
        });
      }
      return controller;
    }

    function handleMessage(
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ): boolean | void {
      const msg = message as GuideOverlayMessage | undefined;
      if (!msg?.action) return false;

      if (msg.action === TOOL_MESSAGE_TYPES.GUIDE_OVERLAY_PING) {
        sendResponse({ success: true, mounted: controller?.isVisible() ?? false });
        return true;
      }

      if (
        msg.action === TOOL_MESSAGE_TYPES.GUIDE_OVERLAY_SHOW ||
        msg.action === TOOL_MESSAGE_TYPES.GUIDE_OVERLAY_UPDATE
      ) {
        const payload = msg.payload as GuideOverlayRenderPayload | undefined;
        if (!payload?.session || !payload.snapshot) {
          sendResponse({ success: false, error: 'Invalid guide overlay payload' });
          return true;
        }
        const overlay = ensureController();
        if (msg.action === TOOL_MESSAGE_TYPES.GUIDE_OVERLAY_SHOW) {
          overlay.show(payload);
        } else {
          overlay.update(payload);
        }
        sendResponse({ success: true });
        return true;
      }

      if (msg.action === TOOL_MESSAGE_TYPES.GUIDE_OVERLAY_HIDE) {
        controller?.hide();
        sendResponse({ success: true });
        return true;
      }

      return false;
    }

    chrome.runtime.onMessage.addListener(handleMessage);

    window.addEventListener('unload', () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      controller?.dispose();
      controller = null;
    });
  },
});
