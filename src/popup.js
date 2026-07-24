const api = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('togglePiP');
  const autoActivate = document.getElementById('autoActivate');
  const status = document.getElementById('status');

  // Load auto-activate setting
  try {
    const result = await api.storage.local.get('autoActivate');
    autoActivate.checked = result.autoActivate !== false;
  } catch {}

  // Toggle PiP
  toggleBtn.addEventListener('click', async () => {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
      const [result] = await api.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const video = document.querySelector('video');
          if (!video) return { ok: false, reason: 'No video found' };
          if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
            return { ok: true, action: 'exited' };
          }
          return video.requestPictureInPicture()
            .then(() => ({ ok: true, action: 'entered' }))
            .catch(e => ({ ok: false, reason: e.message }));
        }
      });

      const res = result?.result;
      if (res?.ok) {
        status.textContent = res.action === 'entered' ? 'PiP Active' : 'PiP Off';
        status.className = 'status' + (res.action === 'entered' ? ' active' : '');
      } else {
        status.textContent = res?.reason || 'No video';
        status.className = 'status';
      }
    } catch (e) {
      status.textContent = 'Error: ' + e.message;
      status.className = 'status';
    }
  });

  // Auto-activate toggle
  autoActivate.addEventListener('change', async () => {
    try {
      await api.storage.local.set({ autoActivate: autoActivate.checked });
      // Notify background
      api.runtime.sendMessage({
        type: 'UPDATE_AUTO_ACTIVATE',
        autoActivate: autoActivate.checked
      }).catch(() => {});
    } catch {}
  });
});
