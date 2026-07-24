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
  const tabId = sender.tab?.id;
  log('msg:', message.type, 'tab:', tabId);

  switch (message.type) {
    case 'GET_SETTINGS':
      sendResponse({ settings: state.settings });
      break;

    case 'UPDATE_SETTINGS':
      state.settings = { ...state.settings, ...message.settings };
      api.storage.local.set({ settings: state.settings });
      // Broadcast to all tabs
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
      // Popup sends this directly, forward to tab
      if (tabId) {
        api.tabs.sendMessage(tabId, {
          type: 'SHOW_MINI_PLAYER',
          settings: state.settings
        }).catch(e => logErr('SHOW_MINI_PLAYER:', e));
      }
      sendResponse({ success: true });
      break;

    case 'HIDE_MINI_PLAYER':
      if (tabId) {
        api.tabs.sendMessage(tabId, { type: 'HIDE_MINI_PLAYER' })
          .catch(e => logErr('HIDE_MINI_PLAYER:', e));
      }
      sendResponse({ success: true });
      break;

    case 'NAVIGATE_NEXT':
    case 'NAVIGATE_PREV':
      if (tabId) {
        api.tabs.sendMessage(tabId, { type: message.type })
          .catch(e => logErr(message.type + ':', e));
      }
      sendResponse({ success: true });
      break;
  }
  return true;
});

// Tab activated - key logic for auto-activate
api.tabs.onActivated.addListener(async (activeInfo) => {
  log('tab activated:', activeInfo.tabId, 'prev:', state.lastActiveTabId);

  await loadSettings();

  const prevTabId = state.lastActiveTabId;
  state.lastActiveTabId = activeInfo.tabId;

  // Auto-activate: send SHOW_MINI_PLAYER to the tab that LOST focus
  if (state.settings.autoActivate && state.settings.mode !== 'off' && prevTabId && prevTabId !== activeInfo.tabId) {
    log('sending SHOW_MINI_PLAYER to previous tab', prevTabId);
    api.tabs.sendMessage(prevTabId, {
      type: 'SHOW_MINI_PLAYER',
      settings: state.settings
    }).catch(e => logErr('auto-activate failed:', e.message));
  }
});

// Track tab updates
api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    if (state.lastActiveTabId === tabId) {
      state.lastActiveTabId = null;
    }
  }
});

api.tabs.onRemoved.addListener((tabId) => {
  if (state.lastActiveTabId === tabId) {
    state.lastActiveTabId = null;
  }
});

// Initialize
loadSettings();
log('Background script loaded');
