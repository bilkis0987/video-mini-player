(function() {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;
  const LOG = '[MiniPlay]';

  function log(...args) { console.log(LOG, ...args); }

  let currentVideo = null;

  function findVideo() {
    try {
      const videos = Array.from(document.querySelectorAll('video'));
      const playing = videos.find(v => !v.paused && !v.ended);
      if (playing) return playing;
      return videos.reduce((best, v) => {
        if (!best) return v;
        return (v.clientWidth * v.clientHeight) > (best.clientWidth * best.clientHeight) ? v : best;
      }, null);
    } catch { return null; }
  }

  async function togglePiP() {
    const video = findVideo();
    if (!video) return { ok: false, reason: 'no video' };

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return { ok: true, action: 'exited' };
      }
      await video.requestPictureInPicture();
      return { ok: true, action: 'entered' };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  // Listen for auto-activate from background (on tab switch)
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message.type === 'SHOW_MINI_PLAYER') {
        togglePiP().then(result => sendResponse(result));
        return true;
      }
      if (message.type === 'HIDE_MINI_PLAYER') {
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => {});
        }
        sendResponse({ ok: true });
      }
    } catch {}
    return true;
  });

  // Track video for auto-activate
  const observer = new MutationObserver(() => {
    const video = findVideo();
    if (video && video !== currentVideo) {
      currentVideo = video;
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  log('loaded on', location.href.substring(0, 60));
})();
