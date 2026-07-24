// Background script - Tab detection and mini player activation
// Manifest V3 service worker

const api = typeof browser !== 'undefined' ? browser : chrome;
const LOG = '[MiniPlay-bg]';

function log(...args) { console.log(LOG, ...args); }
function logErr(...args) { console.error(LOG, ...args); }

const state = {
  lastActiveTabId: null,
  settings: {
    mode: 'pip',
    overlaySize: 'medium',
    overlayPosition: 'bottom-right',
    showNavigation: true,
    autoActivate: true,
    showOnHover: true
  }
};

async function loadSettings() {
  try {
    const result = await api.storage.local.get('settings');
    if (result.settings) {
      state.settings = { ...state.settings, ...result.settings };
    }
  } catch (e) {
    logErr('loadSettings:', e);
  }
}

// Handle messages
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    const tabId = sender.tab?.id;
    log('msg:', message.type, 'tab:', tabId);

    switch (message.type) {
      case 'GET_SETTINGS':
        sendResponse({ settings: state.settings });
        break;

      case 'UPDATE_SETTINGS':
        state.settings = { ...state.settings, ...message.settings };
        api.storage.local.set({ settings: state.settings });
        api.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              api.tabs.sendMessage(tab.id, {
                type: 'SETTINGS_UPDATED',
                settings: state.settings
              }).catch(() => {});
            }
          }
        });
        sendResponse({ success: true });
        break;

      case 'SHOW_MINI_PLAYER':
        if (tabId) {
          api.tabs.sendMessage(tabId, {
            type: 'SHOW_MINI_PLAYER',
            settings: state.settings
          }).catch(() => {});
        }
        sendResponse({ success: true });
        break;

      case 'HIDE_MINI_PLAYER':
        if (tabId) {
          api.tabs.sendMessage(tabId, { type: 'HIDE_MINI_PLAYER' })
            .catch(() => {});
        }
        sendResponse({ success: true });
        break;

      case 'NAVIGATE_NEXT':
      case 'NAVIGATE_PREV':
        if (tabId) {
          api.tabs.sendMessage(tabId, { type: message.type })
            .catch(() => {});
        }
        sendResponse({ success: true });
        break;

      case 'VIDEO_STATE_CHANGED':
        sendResponse({ success: true });
        break;

      case 'DEACTIVATE_MINI_PLAYER':
        sendResponse({ success: true });
        break;
    }
  } catch (e) {
    console.error('[MiniPlay-bg] msg error:', e);
  }
  return true;
});

// Tab activated - key logic for auto-activate
api.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    log('tab activated:', activeInfo.tabId, 'prev:', state.lastActiveTabId);

    await loadSettings();

    const prevTabId = state.lastActiveTabId;
    state.lastActiveTabId = activeInfo.tabId;

    if (state.settings.autoActivate && state.settings.mode !== 'off' && prevTabId && prevTabId !== activeInfo.tabId) {
      log('sending SHOW_MINI_PLAYER to previous tab', prevTabId);
      api.tabs.sendMessage(prevTabId, {
        type: 'SHOW_MINI_PLAYER',
        settings: state.settings
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[MiniPlay-bg] onActivated error:', e);
  }
});

// Track tab updates
api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  try {
    if (changeInfo.status === 'loading') {
      if (state.lastActiveTabId === tabId) {
        state.lastActiveTabId = null;
      }
    }
  } catch {}
});

api.tabs.onRemoved.addListener((tabId) => {
  try {
    if (state.lastActiveTabId === tabId) {
      state.lastActiveTabId = null;
    }
  } catch {}
});

// Initialize
try {
  loadSettings();
  log('Background script loaded');
} catch (e) {
  console.error('[MiniPlay-bg] init failed:', e);
}
