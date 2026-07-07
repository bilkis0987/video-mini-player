// Background script - Tab detection and mini player activation
// Works as service worker (Manifest V3) or background script (Manifest V2)
// Updated: Added tab state tracking
// State management for video tabs

const api = typeof browser !== 'undefined' ? browser : chrome;

// State management
const state = {
  videoTabs: {}, // { tabId: { hasVideo, isPlaying, videoSrc } }
  settings: {
    mode: 'pip', // 'pip', 'overlay', 'manual', 'off'
    overlaySize: 'medium',
    overlayPosition: 'bottom-right',
    showNavigation: true,
    autoActivate: true,
    showOnHover: true
  }
};

// Load settings from storage
async function loadSettings() {
  try {
    const result = await api.storage.local.get('settings');
    if (result.settings) {
      state.settings = { ...state.settings, ...result.settings };
    }
  } catch (e) {
    console.log('Mini Play Web: Using default settings');
  }
}

// Save settings to storage
async function saveSettings(settings) {
  state.settings = { ...state.settings, ...settings };
  await api.storage.local.set({ settings: state.settings });
}

// Handle messages from content scripts
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case 'VIDEO_STATE_CHANGED':
      if (tabId) {
        state.videoTabs[tabId] = {
          hasVideo: message.hasVideo,
          isPlaying: message.isPlaying,
          videoSrc: message.videoSrc
        };
      }
      sendResponse({ success: true });
      break;

    case 'GET_SETTINGS':
      sendResponse({ settings: state.settings });
      break;

    case 'UPDATE_SETTINGS':
      saveSettings(message.settings).then(() => {
        api.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              api.tabs.sendMessage(tab.id, {
                type: 'SETTINGS_UPDATED',
                settings: state.settings
              }).catch(() => {});
            }
          });
        });
      });
      sendResponse({ success: true });
      break;

    case 'ACTIVATE_MINI_PLAYER':
      if (tabId) {
        api.tabs.sendMessage(tabId, {
          type: 'SHOW_MINI_PLAYER',
          settings: state.settings
        }).catch(() => {});
      }
      sendResponse({ success: true });
      break;

    case 'DEACTIVATE_MINI_PLAYER':
      if (tabId) {
        api.tabs.sendMessage(tabId, {
          type: 'HIDE_MINI_PLAYER'
        }).catch(() => {});
      }
      sendResponse({ success: true });
      break;

    case 'NAVIGATE_NEXT':
      if (tabId) {
        api.tabs.sendMessage(tabId, {
          type: 'SCROLL_NEXT'
        }).catch(() => {});
      }
      sendResponse({ success: true });
      break;

    case 'NAVIGATE_PREV':
      if (tabId) {
        api.tabs.sendMessage(tabId, {
          type: 'SCROLL_PREV'
        }).catch(() => {});
      }
      sendResponse({ success: true });
      break;
  }

  return true;
});

// Tab activated - user switched tabs
api.tabs.onActivated.addListener(async (activeInfo) => {
  await loadSettings();

  if (!state.settings.autoActivate || state.settings.mode === 'off') {
    return;
  }

  const previousTabId = Object.keys(state.videoTabs).find(
    (id) => parseInt(id) !== activeInfo.tabId && state.videoTabs[id]?.isPlaying
  );

  if (previousTabId) {
    api.tabs.sendMessage(parseInt(previousTabId), {
      type: 'SHOW_MINI_PLAYER',
      settings: state.settings
    }).catch(() => {});
  }

  api.tabs.sendMessage(activeInfo.tabId, {
    type: 'TAB_ACTIVATED',
    settings: state.settings
  }).catch(() => {});
});

// Tab updated - URL changed
api.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    delete state.videoTabs[tabId];
  }
});

// Tab removed - clean up
api.tabs.onRemoved.addListener((tabId) => {
  delete state.videoTabs[tabId];
});

// Initialize
loadSettings();
console.log('Mini Play Web: Background script loaded');
