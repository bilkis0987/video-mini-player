// Mini Play Web - Settings Script
// Configuration page for extension
// Save/load settings from storage

const api = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const modeSelect = document.getElementById('mode');
  const overlaySizeSelect = document.getElementById('overlaySize');
  const overlayPositionSelect = document.getElementById('overlayPosition');
  const autoActivateToggle = document.getElementById('autoActivate');
  const showNavigationToggle = document.getElementById('showNavigation');
  const showOnHoverToggle = document.getElementById('showOnHover');
  const saveBtn = document.getElementById('saveBtn');
  const saveStatus = document.getElementById('saveStatus');
  const overlaySettings = document.getElementById('overlaySettings');

  const defaultSettings = {
    mode: 'pip',
    overlaySize: 'medium',
    overlayPosition: 'bottom-right',
    autoActivate: true,
    showNavigation: true,
    showOnHover: true
  };

  let currentSettings = { ...defaultSettings };

  async function loadSettings() {
    try {
      const response = await api.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response?.settings) {
        currentSettings = { ...defaultSettings, ...response.settings };
      }
    } catch (e) {
      console.log('Failed to load settings:', e);
    }
    applySettingsToUI();
  }

  function applySettingsToUI() {
    modeSelect.value = currentSettings.mode;
    overlaySizeSelect.value = currentSettings.overlaySize;
    overlayPositionSelect.value = currentSettings.overlayPosition;
    autoActivateToggle.checked = currentSettings.autoActivate;
    showNavigationToggle.checked = currentSettings.showNavigation;
    showOnHoverToggle.checked = currentSettings.showOnHover;
    toggleOverlaySettings();
  }

  function toggleOverlaySettings() {
    const showOverlay = currentSettings.mode === 'overlay';
    overlaySettings.style.display = showOverlay ? 'block' : 'none';
  }

  function collectSettings() {
    return {
      mode: modeSelect.value,
      overlaySize: overlaySizeSelect.value,
      overlayPosition: overlayPositionSelect.value,
      autoActivate: autoActivateToggle.checked,
      showNavigation: showNavigationToggle.checked,
      showOnHover: showOnHoverToggle.checked
    };
  }

  async function saveSettings() {
    const settings = collectSettings();
    try {
      await api.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings
      });
      currentSettings = settings;
      showSaveStatus('Settings saved!');
    } catch (e) {
      console.log('Failed to save settings:', e);
      showSaveStatus('Failed to save', true);
    }
  }

  function showSaveStatus(message, isError = false) {
    saveStatus.textContent = message;
    saveStatus.style.color = isError ? '#FF5050' : '#22C55E';
    saveStatus.classList.add('show');
    setTimeout(() => {
      saveStatus.classList.remove('show');
    }, 2000);
  }

  modeSelect.addEventListener('change', () => {
    currentSettings.mode = modeSelect.value;
    toggleOverlaySettings();
  });

  saveBtn.addEventListener('click', saveSettings);

  [overlaySizeSelect, overlayPositionSelect, autoActivateToggle, showNavigationToggle, showOnHoverToggle].forEach((el) => {
    el.addEventListener('change', () => saveSettings());
  });

  await loadSettings();
});
