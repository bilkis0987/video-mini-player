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
// Smooth scroll animation
// Message handling
(function() {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;

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

  // Find all video elements on page
  function findVideos() {
    const videos = Array.from(document.querySelectorAll('video'));
    return videos.filter(v => v.src || v.querySelector('source'));
  }

  // Get the main/playing video
  function getMainVideo() {
    const videos = findVideos();
    if (videos.length === 0) return null;

    const playing = videos.find(v => !v.paused && !v.ended);
    if (playing) return playing;

    return videos.reduce((largest, v) => {
      const area = v.clientWidth * v.clientHeight;
      const largestArea = largest.clientWidth * largest.clientHeight;
      return area > largestArea ? v : largest;
    });
  }

  // Report video state to background
  function reportVideoState(video) {
    if (!video) {
      api.runtime.sendMessage({
        type: 'VIDEO_STATE_CHANGED',
        hasVideo: false,
        isPlaying: false,
        videoSrc: null
      });
      return;
    }

    api.runtime.sendMessage({
      type: 'VIDEO_STATE_CHANGED',
      hasVideo: true,
      isPlaying: !video.paused,
      videoSrc: video.src
    });
  }

  // MutationObserver for dynamic content
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        const video = getMainVideo();
        if (video && video !== currentVideo) {
          currentVideo = video;
          setupVideoListeners(video);
          reportVideoState(video);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Setup video event listeners
  function setupVideoListeners(video) {
    if (!video || video._miniPlayerSetup) return;
    video._miniPlayerSetup = true;

    video.addEventListener('play', () => reportVideoState(video));
    video.addEventListener('pause', () => reportVideoState(video));
    video.addEventListener('ended', () => reportVideoState(video));

    video.addEventListener('loadeddata', () => {
      if (video !== currentVideo) {
        currentVideo = video;
        reportVideoState(video);

        if (miniPlayerActive && settings.mode === 'overlay' && overlayElement) {
          syncOverlayVideo(video);
        }
      }
    });
  }

  // Picture-in-Picture
  async function activatePiP(video) {
    if (!video || isPiPActive) return;

    try {
      if (!document.pictureInPictureEnabled) {
        console.log('Mini Play Web: PiP not supported, falling back to overlay');
        activateOverlay(video);
        return;
      }

      await video.requestPictureInPicture();
      isPiPActive = true;
      miniPlayerActive = true;

      video.addEventListener('leavepictureinpicture', () => {
        isPiPActive = false;
        miniPlayerActive = false;
      }, { once: true });

      console.log('Mini Play Web: PiP activated');
    } catch (e) {
      console.log('Mini Play Web: PiP failed, falling back to overlay:', e.message);
      activateOverlay(video);
    }
  }

  function deactivatePiP() {
    if (!isPiPActive) return;
    document.exitPictureInPicture().catch(() => {});
    isPiPActive = false;
    miniPlayerActive = false;
  }

  // Overlay Mode
  function activateOverlay(video) {
    if (!video || miniPlayerActive) return;

    if (!overlayElement) {
      overlayElement = createOverlayElement();
    }

    syncOverlayVideo(video);
    positionOverlay();
    overlayElement.style.display = 'block';
    miniPlayerActive = true;

    console.log('Mini Play Web: Overlay activated');
  }

  function deactivateOverlay() {
    if (!overlayElement) return;
    overlayElement.style.display = 'none';
    miniPlayerActive = false;

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
    if (!overlayElement || !sourceVideo) return;

    const overlayVideo = overlayElement.querySelector('video');
    if (!overlayVideo) return;

    if (sourceVideo.src) {
      overlayVideo.src = sourceVideo.src;
    } else {
      const source = sourceVideo.querySelector('source');
      if (source) {
        overlayVideo.src = source.src;
      }
    }

    overlayVideo.currentTime = sourceVideo.currentTime;
    overlayVideo.volume = sourceVideo.volume;
    overlayVideo.muted = sourceVideo.muted;

    if (!sourceVideo.paused) {
      overlayVideo.play().catch(() => {});
    }

    const syncPlayback = () => {
      if (!miniPlayerActive || settings.mode !== 'overlay') return;
      if (Math.abs(overlayVideo.currentTime - sourceVideo.currentTime) > 0.5) {
        overlayVideo.currentTime = sourceVideo.currentTime;
      }
      requestAnimationFrame(syncPlayback);
    };

    requestAnimationFrame(syncPlayback);
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
      deactivateOverlay();
      deactivatePiP();
      api.runtime.sendMessage({ type: 'DEACTIVATE_MINI_PLAYER' });
    });

    overlay.querySelector('.mini-player-pip').addEventListener('click', async () => {
      const video = overlay.querySelector('video');
      if (video && document.pictureInPictureEnabled) {
        try {
          deactivateOverlay();
          await video.requestPictureInPicture();
          isPiPActive = true;
        } catch (e) {
          console.log('Mini Play Web: PiP from overlay failed');
        }
      }
    });

    if (settings.showNavigation) {
      const prevBtn = overlay.querySelector('.mini-player-prev');
      const nextBtn = overlay.querySelector('.mini-player-next');
      if (prevBtn) prevBtn.addEventListener('click', () => api.runtime.sendMessage({ type: 'NAVIGATE_PREV' }));
      if (nextBtn) nextBtn.addEventListener('click', () => api.runtime.sendMessage({ type: 'NAVIGATE_NEXT' }));
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
    switch (message.type) {
      case 'SHOW_MINI_PLAYER':
        settings = message.settings || settings;
        const video = getMainVideo();
        if (video) {
          if (settings.mode === 'pip') activatePiP(video);
          else if (settings.mode === 'overlay') activateOverlay(video);
        }
        sendResponse({ success: true });
        break;

      case 'HIDE_MINI_PLAYER':
        deactivateOverlay();
        deactivatePiP();
        sendResponse({ success: true });
        break;

      case 'TAB_ACTIVATED':
        settings = message.settings || settings;
        sendResponse({ success: true });
        break;

      case 'SETTINGS_UPDATED':
        settings = message.settings;
        positionOverlay();
        sendResponse({ success: true });
        break;

      case 'SCROLL_NEXT':
        scrollNext();
        sendResponse({ success: true });
        break;

      case 'SCROLL_PREV':
        scrollPrev();
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  // Initialize
  function init() {
    const video = getMainVideo();
    if (video) {
      currentVideo = video;
      setupVideoListeners(video);
      reportVideoState(video);
    }
    console.log('Mini Play Web: Content script loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
