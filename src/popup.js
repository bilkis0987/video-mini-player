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
  let isActive = false;

  async function loadSettings() {
    try {
      const response = await api.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response?.settings) {
        currentMode = response.settings.mode || 'pip';
        updateModeUI(currentMode);
      }
    } catch (e) {
      console.log('Failed to load settings:', e);
    }
  }

  function updateModeUI(mode) {
    modeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  function updateStatus(active) {
    isActive = active;
    statusIndicator.className = 'status-indicator ' + (active ? 'active' : 'inactive');
    statusText.textContent = active ? 'Mini Player Active' : 'Ready';
    activateBtn.style.display = active ? 'none' : 'flex';
    deactivateBtn.style.display = active ? 'flex' : 'none';
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      currentMode = mode;
      updateModeUI(mode);
      await api.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: { mode }
      });
    });
  });

  activateBtn.addEventListener('click', async () => {
    try {
      await api.runtime.sendMessage({ type: 'ACTIVATE_MINI_PLAYER' });
      updateStatus(true);
    } catch (e) {
      console.log('Failed to activate:', e);
    }
  });

  deactivateBtn.addEventListener('click', async () => {
    try {
      await api.runtime.sendMessage({ type: 'DEACTIVATE_MINI_PLAYER' });
      updateStatus(false);
    } catch (e) {
      console.log('Failed to deactivate:', e);
    }
  });

  prevBtn.addEventListener('click', async () => {
    await api.runtime.sendMessage({ type: 'NAVIGATE_PREV' });
  });

  nextBtn.addEventListener('click', async () => {
    await api.runtime.sendMessage({ type: 'NAVIGATE_NEXT' });
  });

  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    api.runtime.openOptionsPage();
  });

  await loadSettings();
  updateStatus(false);
});
