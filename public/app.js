/**
 * StreamVibe — Modern YouTube Video & Audio Downloader Client
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const downloadForm = document.getElementById('download-form');
  const urlInput = document.getElementById('url-input');
  const clearBtn = document.getElementById('clear-btn');
  const pasteBtn = document.getElementById('paste-btn');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnIcon = submitBtn.querySelector('.btn-icon');
  const btnSpinner = document.getElementById('btn-spinner');

  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  const alertClose = document.getElementById('alert-close');

  const skeletonLoader = document.getElementById('skeleton-loader');
  const resultCard = document.getElementById('result-card');

  // Video Result Elements
  const resThumbnail = document.getElementById('res-thumbnail');
  const resDuration = document.getElementById('res-duration');
  const resTitle = document.getElementById('res-title');
  const resAuthor = document.getElementById('res-author');
  const resViewsCount = document.getElementById('res-views-count');
  const resDate = document.getElementById('res-date');
  const copyVideoLinkBtn = document.getElementById('copy-video-link');
  const resetSearchBtn = document.getElementById('reset-search-btn');
  const playPreviewBtn = document.getElementById('play-preview-btn');

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const videoFormatsList = document.getElementById('video-formats-list');
  const audioFormatsList = document.getElementById('audio-formats-list');
  const thumbnailFormatsList = document.getElementById('thumbnail-formats-list');

  // Modals
  const downloadModal = document.getElementById('download-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalFilename = document.getElementById('modal-filename');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressPercent = document.getElementById('progress-percent');
  const progressStatus = document.getElementById('progress-status');

  const previewModal = document.getElementById('preview-modal');
  const previewCloseBtn = document.getElementById('preview-close-btn');
  const videoIframeContainer = document.getElementById('video-iframe-container');

  // History
  const historySection = document.getElementById('history-section');
  const historyGrid = document.getElementById('history-grid');
  const historyCount = document.getElementById('history-count');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  // Theme
  const themeToggle = document.getElementById('theme-toggle');

  // Active video state
  let currentVideoData = null;
  const HISTORY_KEY = 'streamvibe_download_history';

  // =========================================================================
  // Theme Management
  // =========================================================================
  const savedTheme = localStorage.getItem('streamvibe_theme') || 'dark';
  applyTheme(savedTheme);

  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('streamvibe_theme', newTheme);
  });

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  }

  // =========================================================================
  // Input Handling & Helpers
  // =========================================================================
  urlInput.addEventListener('input', () => {
    clearBtn.style.display = urlInput.value.trim() ? 'flex' : 'none';
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.style.display = 'none';
    urlInput.focus();
    hideAlert();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        clearBtn.style.display = 'flex';
        hideAlert();
        handleFetchInfo(urlInput.value);
      }
    } catch (err) {
      urlInput.focus();
      showAlert('Unable to read clipboard. Please paste manually using Ctrl+V.', 'error');
    }
  });

  // Quick Demo Sample Chips
  document.querySelectorAll('.sample-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const sampleUrl = chip.getAttribute('data-url');
      urlInput.value = sampleUrl;
      clearBtn.style.display = 'flex';
      handleFetchInfo(sampleUrl);
    });
  });

  resetSearchBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.style.display = 'none';
    resultCard.style.display = 'none';
    urlInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  copyVideoLinkBtn.addEventListener('click', () => {
    if (currentVideoData && currentVideoData.url) {
      navigator.clipboard.writeText(currentVideoData.url);
      copyVideoLinkBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:#10b981;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span style="color:#10b981;">Copied!</span>
      `;
      setTimeout(() => {
        copyVideoLinkBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copy Link</span>
        `;
      }, 2000);
    }
  });

  // =========================================================================
  // Form Submission & API Fetching
  // =========================================================================
  downloadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) {
      showAlert('Please enter a YouTube video or Shorts link.', 'error');
      return;
    }
    handleFetchInfo(url);
  });

  async function handleFetchInfo(url) {
    hideAlert();
    setLoadingState(true);
    resultCard.style.display = 'none';
    skeletonLoader.style.display = 'block';

    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('API server returned HTML instead of JSON. Please ensure your backend API server is running and netlify.toml redirects point to your live backend domain.');
      }

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to extract video information.');
      }

      currentVideoData = data;
      renderVideoResult(data);
      saveToHistory(data);
    } catch (err) {
      console.error(err);
      showAlert(err.message || 'Error connecting to downloader service.', 'error');
    } finally {
      setLoadingState(false);
      skeletonLoader.style.display = 'none';
    }
  }

  function setLoadingState(loading) {
    if (loading) {
      submitBtn.disabled = true;
      btnText.style.display = 'none';
      btnIcon.style.display = 'none';
      btnSpinner.style.display = 'block';
    } else {
      submitBtn.disabled = false;
      btnText.style.display = 'block';
      btnIcon.style.display = 'block';
      btnSpinner.style.display = 'none';
    }
  }

  // =========================================================================
  // Render Result & Formats
  // =========================================================================
  function renderVideoResult(data) {
    resThumbnail.src = data.thumbnail;
    resDuration.textContent = data.duration || 'HD';
    resTitle.textContent = data.title;
    resAuthor.textContent = data.author ? data.author.name : 'YouTube Creator';
    resViewsCount.textContent = `${data.views || 'Verified'} views`;
    resDate.textContent = data.uploadDate || 'Available';

    // Render Video formats
    videoFormatsList.innerHTML = '';
    (data.videoFormats || []).forEach(vf => {
      const row = document.createElement('div');
      row.className = 'format-item';
      row.innerHTML = `
        <div class="format-col-info">
          <span class="format-pill">${(vf.format || 'MP4').toUpperCase()}</span>
          <span class="format-quality">${vf.quality}</span>
          ${vf.fps ? `<span class="format-fps">${vf.fps} FPS</span>` : ''}
        </div>
        <div class="format-col-meta">
          <span class="format-size">${vf.size || 'HD Stream'}</span>
          <button type="button" class="download-action-btn" data-itag="${vf.itag || ''}" data-format="mp4" data-quality="${vf.quality}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download MP4</span>
          </button>
        </div>
      `;
      videoFormatsList.appendChild(row);
    });

    // Render Audio formats
    audioFormatsList.innerHTML = '';
    (data.audioFormats || []).forEach(af => {
      const row = document.createElement('div');
      row.className = 'format-item';
      row.innerHTML = `
        <div class="format-col-info">
          <span class="format-pill" style="background:rgba(16,185,129,0.12);color:#34d399;border-color:rgba(16,185,129,0.25);">MP3</span>
          <span class="format-quality">${af.quality}</span>
        </div>
        <div class="format-col-meta">
          <span class="format-size">${af.size || 'Audio Stream'}</span>
          <button type="button" class="download-action-btn" data-itag="${af.itag || ''}" data-format="mp3" data-quality="${af.quality}" style="background:linear-gradient(135deg,#059669,#10b981);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
            <span>Download MP3</span>
          </button>
        </div>
      `;
      audioFormatsList.appendChild(row);
    });

    // Render Thumbnails
    thumbnailFormatsList.innerHTML = '';
    (data.thumbnails || []).forEach(th => {
      const col = document.createElement('div');
      col.className = 'thumb-card';
      col.innerHTML = `
        <img src="${th.url}" class="thumb-preview-img" alt="${th.quality}" loading="lazy">
        <div class="thumb-card-body">
          <span class="thumb-name">${th.quality}</span>
          <a href="${th.url}" target="_blank" download="thumbnail.jpg" class="action-btn" style="text-decoration:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Save</span>
          </a>
        </div>
      `;
      thumbnailFormatsList.appendChild(col);
    });

    // Attach download handlers
    document.querySelectorAll('.download-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itag = btn.getAttribute('data-itag');
        const format = btn.getAttribute('data-format');
        const quality = btn.getAttribute('data-quality');
        initiateDownload(itag, format, quality);
      });
    });

    resultCard.style.display = 'block';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // =========================================================================
  // Download Modal & Direct Streaming Trigger
  // =========================================================================
  async function initiateDownload(itag, format, quality) {
    if (!currentVideoData) return;

    const title = currentVideoData.title || 'video';
    const ext = format === 'mp3' ? 'mp3' : 'mp4';
    const displayFilename = `${title.substring(0, 45)}... [${quality}].${ext}`;

    modalFilename.textContent = displayFilename;
    downloadModal.style.display = 'flex';
    progressBarFill.style.width = '5%';
    progressPercent.textContent = '5%';
    progressStatus.textContent = 'Connecting to downloader service...';

    const downloadUrl = `/api/download?url=${encodeURIComponent(currentVideoData.url)}&itag=${itag}&format=${format}&title=${encodeURIComponent(title)}&quality=${encodeURIComponent(quality || '')}`;

    // Dynamic progress stage timer while waiting for server processing
    let currentPct = 5;
    const stages = [
      { maxPct: 22, status: 'Connecting to high-speed stream pipeline...', inc: 2.5 },
      { maxPct: 45, status: 'Fetching video & audio stream fragments...', inc: 1.8 },
      { maxPct: 65, status: 'Merging high-definition video & audio...', inc: 1.0 },
      { maxPct: 78, status: 'Finalizing MP4 media stream package...', inc: 0.5 }
    ];

    let stageIdx = 0;
    const progressTimer = setInterval(() => {
      const stage = stages[stageIdx];
      if (stage) {
        if (currentPct < stage.maxPct) {
          currentPct += stage.inc;
          const rounded = Math.floor(currentPct);
          progressBarFill.style.width = `${rounded}%`;
          progressPercent.textContent = `${rounded}%`;
          progressStatus.textContent = stage.status;
        } else if (stageIdx < stages.length - 1) {
          stageIdx++;
        }
      }
    }, 250);

    try {
      const response = await fetch(downloadUrl);

      clearInterval(progressTimer);

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || contentType.includes('text/html')) {
        let errorMsg = 'Failed to download video.';
        if (contentType.includes('application/json')) {
          try {
            const errData = await response.json();
            if (errData && errData.error) errorMsg = errData.error;
          } catch {}
        } else if (contentType.includes('text/html')) {
          errorMsg = 'Backend download server is unreachable (HTML 404 page returned). Please ensure backend server is deployed and netlify.toml API redirect is set.';
        } else {
          errorMsg = `Server error (${response.status} ${response.statusText})`;
        }
        throw new Error(errorMsg);
      }

      progressStatus.textContent = 'Receiving stream data...';
      currentPct = Math.max(currentPct, 80);
      progressBarFill.style.width = `${Math.floor(currentPct)}%`;
      progressPercent.textContent = `${Math.floor(currentPct)}%`;

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      let receivedBytes = 0;

      const reader = response.body.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedBytes += value.length;

        if (totalBytes > 0) {
          const streamPct = Math.floor((receivedBytes / totalBytes) * 20); // 80% -> 100%
          const finalPct = Math.min(100, 80 + streamPct);
          progressBarFill.style.width = `${finalPct}%`;
          progressPercent.textContent = `${finalPct}%`;
          progressStatus.textContent = `Downloading: ${(receivedBytes / (1024 * 1024)).toFixed(1)} MB / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
        } else {
          const mb = (receivedBytes / (1024 * 1024)).toFixed(1);
          progressBarFill.style.width = '90%';
          progressPercent.textContent = '90%';
          progressStatus.textContent = `Streaming data: ${mb} MB received...`;
        }
      }

      progressBarFill.style.width = '100%';
      progressPercent.textContent = '100%';
      progressStatus.textContent = 'Download completed! Saving file...';

      const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
      const objectUrl = URL.createObjectURL(blob);

      let filenameHeader = `${title}.${ext}`;
      const disposition = response.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
        if (match && match[1]) {
          filenameHeader = decodeURIComponent(match[1].replace(/['"]/g, ''));
        }
      }

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filenameHeader;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        downloadModal.style.display = 'none';
      }, 1500);

    } catch (err) {
      clearInterval(progressTimer);
      console.error('Download error:', err);
      downloadModal.style.display = 'none';
      showAlert(err.message || 'Error occurred during file download.', 'error');
    }
  }

  modalCloseBtn.addEventListener('click', () => {
    downloadModal.style.display = 'none';
  });

  downloadModal.addEventListener('click', (e) => {
    if (e.target === downloadModal) {
      downloadModal.style.display = 'none';
    }
  });

  // =========================================================================
  // Video Preview Modal
  // =========================================================================
  playPreviewBtn.addEventListener('click', () => {
    if (!currentVideoData) return;
    const videoId = currentVideoData.id;
    videoIframeContainer.innerHTML = `
      <iframe 
        src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" 
        title="Video Player" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen>
      </iframe>
    `;
    previewModal.style.display = 'flex';
  });

  previewCloseBtn.addEventListener('click', closePreviewModal);
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) closePreviewModal();
  });

  function closePreviewModal() {
    videoIframeContainer.innerHTML = '';
    previewModal.style.display = 'none';
  }

  // =========================================================================
  // Tabs Switcher
  // =========================================================================
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = btn.getAttribute('data-tab');
      const targetPanel = document.getElementById(target);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // =========================================================================
  // History Management (LocalStorage)
  // =========================================================================
  function loadHistory() {
    const list = getSavedHistory();
    historyCount.textContent = list.length;

    if (list.length === 0) {
      historySection.style.display = 'none';
      return;
    }

    historySection.style.display = 'block';
    historyGrid.innerHTML = '';

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-card';
      card.innerHTML = `
        <img src="${item.thumbnail}" class="history-thumb" alt="${item.title}" loading="lazy">
        <div class="history-body">
          <h4 class="history-title" title="${item.title}">${item.title}</h4>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.75rem;">
            <span class="history-date">${item.date || 'Recently'}</span>
            <button type="button" class="action-btn reanalyze-btn" data-url="${item.url}">
              <span>Analyze</span>
            </button>
          </div>
        </div>
      `;
      historyGrid.appendChild(card);
    });

    document.querySelectorAll('.reanalyze-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = btn.getAttribute('data-url');
        urlInput.value = u;
        clearBtn.style.display = 'flex';
        handleFetchInfo(u);
      });
    });
  }

  function saveToHistory(data) {
    let list = getSavedHistory();
    list = list.filter(item => item.id !== data.id);
    list.unshift({
      id: data.id,
      title: data.title,
      url: data.url,
      thumbnail: data.thumbnail,
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    });

    if (list.length > 8) list = list.slice(0, 8);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    loadHistory();
  }

  function getSavedHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    loadHistory();
  });

  // Initial history load
  loadHistory();

  // =========================================================================
  // Alert Helpers
  // =========================================================================
  function showAlert(msg, type = 'error') {
    alertBox.className = `alert-box ${type}`;
    alertMessage.textContent = msg;
    alertBox.style.display = 'flex';
  }

  function hideAlert() {
    alertBox.style.display = 'none';
  }

  alertClose.addEventListener('click', hideAlert);
});
