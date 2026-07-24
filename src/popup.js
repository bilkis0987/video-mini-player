// Mini Play Web - Popup Script (PiP-only)
const api = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const activateBtn = document.getElementById('activateBtn');

  activateBtn.addEventListener('click', async () => {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
      const [result] = await api.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const video = document.querySelector('video');
          if (!video) return { ok: false, reason: 'no video' };
          if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
            return { ok: true, action: 'exited' };
          }
          return video.requestPictureInPicture()
            .then(() => ({ ok: true, action: 'entered' }))
            .catch(e => ({ ok: false, reason: e.message }));
        }
      });

      if (result?.result?.ok) {
        statusText.textContent = result.result.action === 'entered' ? 'PiP Active' : 'PiP Off';
        statusIndicator.classList.add('active');
      } else {
        statusText.textContent = result?.result?.reason || 'No video found';
        statusIndicator.classList.remove('active');
      }
    } catch (e) {
      statusText.textContent = 'Error: ' + e.message;
      statusIndicator.classList.remove('active');
    }
  });
});
