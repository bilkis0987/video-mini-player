// Content script - Video detection, PiP mode, and Overlay mode
// Universal video detection for all websites
// MutationObserver for dynamic content
// PiP event handlers
// Fallback to overlay when PiP not supported
// Overlay Mode implementation
// Draggable header
// Resizable handle
// Navigation controls (Next/Prev)
// Scroll navigation implementation
// Message handling
// Initialize
(function() {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;
  const LOG_PREFIX = '[MiniPlay]';

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function logWarn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  function logError(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  let settings = {
    mode: 'pip',
    overlaySize: 'medium',
    overlayPosition: 'bottom-right',
    showNavigation: true,
    autoActivate: true,
    showOnHover: true
  };

  let miniPlayerActive = false;
  let currentVideo = null;
  let overlayElement = null;
  let isPiPActive = false;
  let syncRafId = null;
  let visibilityHandler = null;

  // Find all video elements on page
  function findVideos() {
    try {
      const videos = Array.from(document.querySelectorAll('video'));
      const filtered = videos.filter(v => {
        try {
          return (v.src || v.querySelector('source')) && v.readyState >= 0;
        } catch { return false; }
      });
      log('findVideos:', videos.length, 'total,', filtered.length, 'with src');
      return filtered;
    } catch (e) {
      logError('findVideos error:', e);
      return [];
    }
  }

  // Get the main/playing video
  function getMainVideo() {
    try {
      const videos = findVideos();
      if (videos.length === 0) {
        log('getMainVideo: no videos found');
        return null;
      }

      const playing = videos.find(v => !v.paused && !v.ended);
      if (playing) {
        log('getMainVideo: found playing video', playing.src?.substring(0, 80));
        return playing;
      }

      const largest = videos.reduce((largest, v) => {
        if (!largest) return v;
        const area = v.clientWidth * v.clientHeight;
        const largestArea = largest.clientWidth * largest.clientHeight;
        return area > largestArea ? v : largest;
      }, null);
      log('getMainVideo: no playing, using largest video', largest?.src?.substring(0, 80));
      return largest;
    } catch (e) {
      logError('getMainVideo error:', e);
      return null;
    }
  }

  // Safe wrapper for runtime.sendMessage
  function safeSendMessage(msg) {
    try {
      api.runtime.sendMessage(msg).catch(() => {});
    } catch {}
  }

  // Report video state to background
  function reportVideoState(video) {
    if (!video) {
      safeSendMessage({ type: 'VIDEO_STATE_CHANGED', hasVideo: false, isPlaying: false, videoSrc: null });
      return;
    }
    safeSendMessage({ type: 'VIDEO_STATE_CHANGED', hasVideo: true, isPlaying: !video.paused, videoSrc: video.src });
  }

  // MutationObserver for dynamic content
  let observerMutationCount = 0;
  const observer = new MutationObserver((mutations) => {
    try {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          observerMutationCount++;
          if (observerMutationCount % 50 === 1) {
            log('MutationObserver: checked', observerMutationCount, 'mutations');
          }
          const video = getMainVideo();
          if (video && video !== currentVideo) {
            log('MutationObserver: new video detected');
            currentVideo = video;
            setupVideoListeners(video);
            reportVideoState(video);
          }
        }
      }
    } catch (e) {
      logError('MutationObserver error:', e);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Setup video event listeners
  function setupVideoListeners(video) {
    if (!video || video._miniPlayerSetup) {
      log('setupVideoListeners: skip', !video ? 'no video' : 'already setup');
      return;
    }
    video._miniPlayerSetup = true;
    log('setupVideoListeners: attaching to', video.src?.substring(0, 80));

    video.addEventListener('play', () => {
      log('video event: play', video.src?.substring(0, 80));
      reportVideoState(video);
    });
    video.addEventListener('pause', () => {
      log('video event: pause', video.src?.substring(0, 80));
      reportVideoState(video);
    });
    video.addEventListener('ended', () => {
      log('video event: ended', video.src?.substring(0, 80));
      reportVideoState(video);
    });

    video.addEventListener('loadeddata', () => {
      log('video event: loadeddata', video.src?.substring(0, 80));
      if (video !== currentVideo) {
        currentVideo = video;
        reportVideoState(video);

        if (miniPlayerActive && settings.mode === 'overlay' && overlayElement) {
          log('loadeddata: syncing overlay with new video');
          syncOverlayVideo(video);
        }
      }
    });
  }

  // Picture-in-Picture
  async function activatePiP(video) {
    if (!video) {
      log('activatePiP: no video provided');
      return;
    }
    if (isPiPActive) {
      log('activatePiP: already active');
      return;
    }

    log('activatePiP: attempting for', video.src?.substring(0, 80));
    log('activatePiP: PiP enabled?', document.pictureInPictureEnabled);
    log('activatePiP: video readyState:', video.readyState);
    log('activatePiP: video paused:', video.paused);

    try {
      if (!document.pictureInPictureEnabled) {
        logWarn('activatePiP: PiP not supported, falling back to overlay');
        activateOverlay(video);
        return;
      }

      await video.requestPictureInPicture();
      isPiPActive = true;
      miniPlayerActive = true;

      video.addEventListener('leavepictureinpicture', () => {
        log('PiP: left picture-in-picture');
        isPiPActive = false;
        miniPlayerActive = false;
      }, { once: true });

      log('activatePiP: SUCCESS');
    } catch (e) {
      logError('activatePiP: FAILED -', e.name, e.message);
      activateOverlay(video);
    }
  }

  function deactivatePiP() {
    if (!isPiPActive) return;
    log('deactivatePiP');
    document.exitPictureInPicture().catch(e => logError('exitPiP failed:', e));
    isPiPActive = false;
    miniPlayerActive = false;
  }

  // Overlay Mode
  function activateOverlay(video) {
    if (!video) {
      log('activateOverlay: no video provided');
      return;
    }
    if (miniPlayerActive) {
      log('activateOverlay: already active, skip');
      return;
    }

    log('activateOverlay: activating for', video.src?.substring(0, 80));

    if (!overlayElement) {
      overlayElement = createOverlayElement();
      log('activateOverlay: overlay element created');
    }

    syncOverlayVideo(video);
    positionOverlay();
    overlayElement.style.display = 'block';
    miniPlayerActive = true;

    log('activateOverlay: SUCCESS');
  }

  function deactivateOverlay() {
    if (!overlayElement) return;
    log('deactivateOverlay');
    overlayElement.style.display = 'none';
    miniPlayerActive = false;

    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    if (syncRafId) {
      cancelAnimationFrame(syncRafId);
      syncRafId = null;
    }

    const overlayVideo = overlayElement.querySelector('video');
    if (overlayVideo) {
      overlayVideo.src = '';
      overlayVideo.load();
    }
  }

  function createOverlayElement() {
    const overlay = document.createElement('div');
    overlay.id = 'mini-play-web-overlay';
    overlay.innerHTML = `
      <div class="mini-player-header">
        <span class="mini-player-title">Mini Play Web</span>
        <div class="mini-player-controls">
          ${settings.showNavigation ? '<button class="mini-player-btn mini-player-prev" title="Previous">&#9664;</button>' : ''}
          <button class="mini-player-btn mini-player-pip" title="PiP Mode">&#9634;</button>
          <button class="mini-player-btn mini-player-close" title="Close">&times;</button>
          ${settings.showNavigation ? '<button class="mini-player-btn mini-player-next" title="Next">&#9654;</button>' : ''}
        </div>
      </div>
      <div class="mini-player-body">
        <video class="mini-player-video" controls playsinline></video>
      </div>
      <div class="mini-player-resize-handle"></div>
    `;

    document.body.appendChild(overlay);
    setupOverlayEvents(overlay);
    return overlay;
  }

  function syncOverlayVideo(sourceVideo) {
    if (!overlayElement || !sourceVideo) {
      log('syncOverlayVideo: skip', !overlayElement ? 'no overlay' : 'no source');
      return;
    }

    const overlayVideo = overlayElement.querySelector('video');
    if (!overlayVideo) {
      log('syncOverlayVideo: no video element in overlay');
      return;
    }

    log('syncOverlayVideo: syncing from', sourceVideo.src?.substring(0, 80));

    if (sourceVideo.src) {
      overlayVideo.src = sourceVideo.src;
    } else {
      const source = sourceVideo.querySelector('source');
      if (source) {
        overlayVideo.src = source.src;
      } else {
        logWarn('syncOverlayVideo: source video has no src');
      }
    }

    overlayVideo.currentTime = sourceVideo.currentTime;
    overlayVideo.volume = sourceVideo.volume;
    overlayVideo.muted = sourceVideo.muted;

    if (!sourceVideo.paused) {
      overlayVideo.play().catch(e => logError('overlay video play failed:', e));
    }

    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    if (syncRafId) {
      cancelAnimationFrame(syncRafId);
      syncRafId = null;
    }

    const syncPlayback = () => {
      if (!miniPlayerActive || settings.mode !== 'overlay' || document.hidden) {
        syncRafId = null;
        return;
      }
      if (Math.abs(overlayVideo.currentTime - sourceVideo.currentTime) > 0.5) {
        overlayVideo.currentTime = sourceVideo.currentTime;
      }
      syncRafId = requestAnimationFrame(syncPlayback);
    };

    visibilityHandler = () => {
      if (!document.hidden && miniPlayerActive && settings.mode === 'overlay' && !syncRafId) {
        syncRafId = requestAnimationFrame(syncPlayback);
      }
    };

    document.addEventListener('visibilitychange', visibilityHandler);
    syncRafId = requestAnimationFrame(syncPlayback);
  }

  function positionOverlay() {
    if (!overlayElement) return;

    const size = {
      small: { width: 200, height: 150 },
      medium: { width: 300, height: 225 },
      large: { width: 400, height: 300 }
    }[settings.overlaySize] || { width: 300, height: 225 };

    overlayElement.style.width = `${size.width}px`;
    overlayElement.style.height = `${size.height + 30}px`;

    const margin = 20;
    const positions = {
      'bottom-right': { right: `${margin}px`, bottom: `${margin}px` },
      'bottom-left': { left: `${margin}px`, bottom: `${margin}px` },
      'top-right': { right: `${margin}px`, top: `${margin}px` },
      'top-left': { left: `${margin}px`, top: `${margin}px` }
    };

    overlayElement.style.left = 'auto';
    overlayElement.style.right = 'auto';
    overlayElement.style.top = 'auto';
    overlayElement.style.bottom = 'auto';

    const pos = positions[settings.overlayPosition] || positions['bottom-right'];
    Object.assign(overlayElement.style, pos);
  }

  function setupOverlayEvents(overlay) {
    const header = overlay.querySelector('.mini-player-header');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.mini-player-btn')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = overlay.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      overlay.style.transition = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      overlay.style.left = `${startLeft + dx}px`;
      overlay.style.top = `${startTop + dy}px`;
      overlay.style.right = 'auto';
      overlay.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      overlay.style.transition = '';
    });

    overlay.querySelector('.mini-player-close').addEventListener('click', () => {
      log('overlay: close button clicked');
      deactivateOverlay();
      deactivatePiP();
      safeSendMessage({ type: 'DEACTIVATE_MINI_PLAYER' });
    });

    overlay.querySelector('.mini-player-pip').addEventListener('click', async () => {
      log('overlay: PiP button clicked');
      const video = overlay.querySelector('video');
      if (video && document.pictureInPictureEnabled) {
        try {
          deactivateOverlay();
          await video.requestPictureInPicture();
          isPiPActive = true;
        } catch (e) {
          logError('PiP from overlay failed:', e);
        }
      }
    });

    if (settings.showNavigation) {
      const prevBtn = overlay.querySelector('.mini-player-prev');
      const nextBtn = overlay.querySelector('.mini-player-next');
      if (prevBtn) prevBtn.addEventListener('click', () => safeSendMessage({ type: 'NAVIGATE_PREV' }));
      if (nextBtn) nextBtn.addEventListener('click', () => safeSendMessage({ type: 'NAVIGATE_NEXT' }));
    }

    const resizeHandle = overlay.querySelector('.mini-player-resize-handle');
    let isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      overlay.style.width = `${Math.max(150, overlay.offsetWidth + dx)}px`;
      overlay.style.height = `${Math.max(100, overlay.offsetHeight + dy)}px`;
      startX = e.clientX;
      startY = e.clientY;
    });

    document.addEventListener('mouseup', () => { isResizing = false; });

    if (settings.showOnHover) {
      overlay.addEventListener('mouseenter', () => overlay.classList.add('mini-player-hover'));
      overlay.addEventListener('mouseleave', () => overlay.classList.remove('mini-player-hover'));
    }
  }

  // Navigation
  function scrollNext() {
    window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
  }

  function scrollPrev() {
    window.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
  }

  // Message handling
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('message received:', message.type, message);

    switch (message.type) {
      case 'SHOW_MINI_PLAYER': {
        settings = message.settings || settings;
        log('SHOW_MINI_PLAYER: mode =', settings.mode);
        const video = getMainVideo();
        if (video) {
          log('SHOW_MINI_PLAYER: video found, activating');
          if (settings.mode === 'pip') activatePiP(video);
          else if (settings.mode === 'overlay') activateOverlay(video);
          else log('SHOW_MINI_PLAYER: mode is', settings.mode, '- no action');
        } else {
          logWarn('SHOW_MINI_PLAYER: no video found on page');
        }
        sendResponse({ success: true });
        break;
      }

      case 'HIDE_MINI_PLAYER':
        log('HIDE_MINI_PLAYER');
        deactivateOverlay();
        deactivatePiP();
        sendResponse({ success: true });
        break;

      case 'TAB_ACTIVATED':
        settings = message.settings || settings;
        log('TAB_ACTIVATED: settings updated');
        sendResponse({ success: true });
        break;

      case 'SETTINGS_UPDATED':
        settings = message.settings;
        log('SETTINGS_UPDATED:', settings);
        positionOverlay();
        sendResponse({ success: true });
        break;

      case 'SCROLL_NEXT':
        log('SCROLL_NEXT');
        scrollNext();
        sendResponse({ success: true });
        break;

      case 'SCROLL_PREV':
        log('SCROLL_PREV');
        scrollPrev();
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  // Initialize
  function init() {
    log('init: content script on', window.location.href.substring(0, 60));
    try {
      const video = getMainVideo();
      if (video) {
        currentVideo = video;
        setupVideoListeners(video);
        reportVideoState(video);
      } else {
        log('init: no video found on page yet');
      }
    } catch (e) {
      logError('init error:', e);
    }
    log('init: done, readyState:', document.readyState);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
