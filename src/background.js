const api = typeof browser !== 'undefined' ? browser : chrome;
const LOG = '[MiniPlay-bg]';
function log(...args) { console.log(LOG, ...args); }

let autoActivate = true;
let lastActiveTabId = null;

async function loadSettings() {
  try {
    const result = await api.storage.local.get('autoActivate');
    if (result.autoActivate !== undefined) autoActivate = result.autoActivate;
  } catch {}
}

// Handle messages
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === 'UPDATE_AUTO_ACTIVATE') {
      autoActivate = message.autoActivate;
      sendResponse({ success: true });
    }
    if (message.type === 'VIDEO_STATE_CHANGED') {
      sendResponse({ success: true });
    }
  } catch {}
  return true;
});

// Tab activated - auto-activate PiP on previous tab
api.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    await loadSettings();
    const prevTabId = lastActiveTabId;
    lastActiveTabId = activeInfo.tabId;

    if (autoActivate && prevTabId && prevTabId !== activeInfo.tabId) {
      log('auto-activate: scripting on tab', prevTabId);
      api.scripting.executeScript({
        target: { tabId: prevTabId },
        func: () => {
          const video = document.querySelector('video');
          if (!video) return;
          if (document.pictureInPictureElement) return;
          video.requestPictureInPicture().catch(() => {});
        }
      }).catch(() => {});
    }
  } catch {}
});

// Clear tab tracking on navigation
api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && lastActiveTabId === tabId) {
    lastActiveTabId = null;
  }
});

api.tabs.onRemoved.addListener((tabId) => {
  if (lastActiveTabId === tabId) lastActiveTabId = null;
});

loadSettings();
log('Background loaded');
