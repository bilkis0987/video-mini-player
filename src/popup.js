// Mini Play Web - Popup Script
const api = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const modeButtons = document.querySelectorAll('.mode-btn');
  const activateBtn = document.getElementById('activateBtn');
  const deactivateBtn = document.getElementById('deactivateBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const settingsLink = document.getElementById('settingsLink');

  let currentMode = 'pip';

  async function getActiveTab() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function sendToTab(message) {
    const tab = await getActiveTab();
    if (!tab) return null;
    try {
      return await api.tabs.sendMessage(tab.id, message);
    } catch (e) {
      console.log('sendToTab error:', e.message);
      return null;
    }
  }

  async function loadSettings() {
    try {
      const response = await api.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response?.settings) {
        currentMode = response.settings.mode || 'pip';
        updateModeUI(currentMode);
      }
    } catch (e) {
      console.log('loadSettings error:', e);
    }
  }

  function updateModeUI(mode) {
    modeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      currentMode = mode;
      updateModeUI(mode);
      await api.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { mode } });
    });
  });

  activateBtn.addEventListener('click', async () => {
    await sendToTab({ type: 'SHOW_MINI_PLAYER', settings: { mode: currentMode } });
  });

  deactivateBtn.addEventListener('click', async () => {
    await sendToTab({ type: 'HIDE_MINI_PLAYER' });
  });

  prevBtn.addEventListener('click', async () => {
    await sendToTab({ type: 'SCROLL_PREV' });
  });

  nextBtn.addEventListener('click', async () => {
    await sendToTab({ type: 'SCROLL_NEXT' });
  });

  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    api.runtime.openOptionsPage();
  });

  await loadSettings();
});
