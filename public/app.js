const channelButtons = document.getElementById('channelButtons');
const newsButton = document.getElementById('newsButton');
const weatherButton = document.getElementById('weatherButton');
const setupButton = document.getElementById('setupButton');
const muteButton = document.getElementById('muteButton');
const fullscreenButton = document.getElementById('fullscreenButton');
const statusText = document.getElementById('statusText');
const videoWrap = document.getElementById('videoWrap');
const weatherView = document.getElementById('weatherView');
const alertsView = document.getElementById('alertsView');
const emergencyView = document.getElementById('emergencyView');
const setupView = document.getElementById('setupView');
const emergencyGrid = document.getElementById('emergencyGrid');
const emergencyEmpty = document.getElementById('emergencyEmpty');
const standbyScreen = document.getElementById('standbyScreen');
const sleepScreen = document.getElementById('sleepScreen');
const weatherCitySelect = document.getElementById('weatherCitySelect');
const weatherPanelCitySelect = document.getElementById('weatherPanelCitySelect');
const weatherCityTitle = document.getElementById('weatherCityTitle');
const weatherFavoriteButton = document.getElementById('weatherFavoriteButton');
const weatherIcon = document.getElementById('weatherIcon');
const weatherTemp = document.getElementById('weatherTemp');
const weatherCondition = document.getElementById('weatherCondition');
const weatherFeelsLike = document.getElementById('weatherFeelsLike');
const weatherHighLow = document.getElementById('weatherHighLow');
const weatherInsight = document.getElementById('weatherInsight');
const windValue = document.getElementById('windValue');
const windNote = document.getElementById('windNote');
const humidityValue = document.getElementById('humidityValue');
const humidityNote = document.getElementById('humidityNote');
const cloudValue = document.getElementById('cloudValue');
const cloudNote = document.getElementById('cloudNote');
const rainChanceValue = document.getElementById('rainChanceValue');
const rainChanceNote = document.getElementById('rainChanceNote');
const uvValue = document.getElementById('uvValue');
const uvNote = document.getElementById('uvNote');
const aqiValue = document.getElementById('aqiValue');
const aqiNote = document.getElementById('aqiNote');
const pressureValue = document.getElementById('pressureValue');
const pressureNote = document.getElementById('pressureNote');
const hourlyForecast = document.getElementById('hourlyForecast');
const forecastList = document.getElementById('forecastList');
const alertsTitle = document.getElementById('alertsTitle');
const alertsUpdatedAt = document.getElementById('alertsUpdatedAt');
const alertsActiveList = document.getElementById('alertsActiveList');
const alertsHistoryCount = document.getElementById('alertsHistoryCount');
const alertsHistoryList = document.getElementById('alertsHistoryList');
const alertsNewsMeta = document.getElementById('alertsNewsMeta');
const alertsNewsList = document.getElementById('alertsNewsList');
const player = document.getElementById('player');
const volumeDial = document.getElementById('volumeDial');
const remoteQrImage = document.getElementById('remoteQrImage');
const remoteQrLink = document.getElementById('remoteQrLink');

let hls = null;
let channelsById = new Map();
let latestControlTimestamp = 0;
let volumeSyncTimer = null;
let playbackAttemptToken = 0;
let playbackRetryTimer = null;
let sourceRecoveryTimer = null;
let recoverCurrentSource = null;
let restoreAudioAfterAutoplay = false;
let suppressPauseSync = false;
let currentMode = 'channel';
let currentChannelId = null;
let currentPlayback = 'playing';
let alertsRefreshTimer = null;
let weatherCities = [];
let currentWeatherCityId = 'bat-hefer';
let currentFullscreen = false;
let favoriteWeatherCityId = 'bat-hefer';
let lastLiveChannelId = null;
let latestRefreshRequestAt = loadLatestRefreshRequestAt();
let latestBrowserBackRequestAt = loadLatestBrowserBackRequestAt();
let weatherAutoscrollState = 'playing';
let weatherAutoscrollFrame = null;
let weatherAutoscrollLastTimestamp = 0;
let emergencyContacts = [];

const DIAL_MIN_ANGLE = -135;
const DIAL_MAX_ANGLE = 135;
const IDLE_DARK_MODE_MS = 30 * 60 * 1000;
const LOCAL_ACTIVITY_PING_THROTTLE_MS = 15000;
let currentVolume = loadSavedVolume();
let currentMuted = loadSavedMuted();
let lastAudibleVolume = loadSavedLastAudibleVolume();
let idleDarkModeTimer = null;
let lastActivityAt = Date.now();
let isIdleDarkMode = false;
let mutedBeforeIdleDarkMode = null;
let lastLocalActivityPingAt = 0;
let alertsNewsScrollFrame = null;
let alertsNewsScrollTimeout = null;
let alertsRefreshIntervalMs = 15000;
let alertsNewsPageLimit = 48;
let alertsNewsMaxAgeMinutes = 120;
let alertsNewsScrollDurationMs = 120000;
let alertsNewsScrollPauseMs = 2500;
let hlsRuntimeConfig = {
  lowLatencyMode: false,
  liveSyncDurationCount: 12,
  liveMaxLatencyDurationCount: 20,
  backBufferLength: 90,
  maxBufferLength: 120,
  maxMaxBufferLength: 180,
  maxBufferHole: 1.5,
  highBufferWatchdogPeriod: 4
};
let isAlertsNewsHovered = false;
let alertsNewsScrollDirection = 'down';
let clientDiagnosticsEnabled = false;
const WEATHER_AUTOSCROLL_PX_PER_SECOND = 26;
const CLIENT_SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const diagnosticsRateLimit = new Map();
const VOLUME_STORAGE_KEY = 'tv-volume';
const MUTED_STORAGE_KEY = 'tv-muted';
const LAST_AUDIBLE_VOLUME_STORAGE_KEY = 'tv-last-audible-volume';

function loadLatestRefreshRequestAt() {
  try {
    const rawValue = window.sessionStorage.getItem('tv-last-refresh-request-at');
    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  } catch (_error) {
    return 0;
  }
}

function loadLatestBrowserBackRequestAt() {
  try {
    const rawValue = window.sessionStorage.getItem('tv-last-browser-back-request-at');
    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  } catch (_error) {
    return 0;
  }
}

function loadSavedVolume() {
  try {
    const rawValue = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue)) {
      return 0.7;
    }

    return clamp(parsedValue, 0, 1);
  } catch (_error) {
    return 0.7;
  }
}

function rememberVolume(volume) {
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clamp(volume, 0, 1)));
  } catch (_error) {
    // Ignore storage failures and still keep the in-memory volume.
  }
}

function loadSavedMuted() {
  try {
    return window.localStorage.getItem(MUTED_STORAGE_KEY) === '1';
  } catch (_error) {
    return false;
  }
}

function rememberMuted(muted) {
  try {
    window.localStorage.setItem(MUTED_STORAGE_KEY, muted ? '1' : '0');
  } catch (_error) {
    // Ignore storage failures and still keep the in-memory mute state.
  }
}

function loadSavedLastAudibleVolume() {
  try {
    const rawValue = window.localStorage.getItem(LAST_AUDIBLE_VOLUME_STORAGE_KEY);
    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return 0.7;
    }

    return clamp(parsedValue, 0, 1);
  } catch (_error) {
    return 0.7;
  }
}

function rememberLastAudibleVolume(volume) {
  try {
    window.localStorage.setItem(LAST_AUDIBLE_VOLUME_STORAGE_KEY, String(clamp(volume, 0, 1)));
  } catch (_error) {
    // Ignore storage failures and still keep the in-memory last audible volume.
  }
}

function hasSavedVolume() {
  try {
    return window.localStorage.getItem(VOLUME_STORAGE_KEY) !== null;
  } catch (_error) {
    return false;
  }
}

function hasSavedMuted() {
  try {
    return window.localStorage.getItem(MUTED_STORAGE_KEY) !== null;
  } catch (_error) {
    return false;
  }
}

function rememberRefreshRequest(timestamp) {
  latestRefreshRequestAt = timestamp;
  try {
    window.sessionStorage.setItem('tv-last-refresh-request-at', String(timestamp));
  } catch (_error) {
    // Ignore storage failures and still honor the in-memory timestamp.
  }
}

function rememberBrowserBackRequest(timestamp) {
  latestBrowserBackRequestAt = timestamp;
  try {
    window.sessionStorage.setItem('tv-last-browser-back-request-at', String(timestamp));
  } catch (_error) {
    // Ignore storage failures and still honor the in-memory timestamp.
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function volumeToAngle(volume) {
  return DIAL_MIN_ANGLE + volume * (DIAL_MAX_ANGLE - DIAL_MIN_ANGLE);
}

function angleToVolume(angle) {
  return (angle - DIAL_MIN_ANGLE) / (DIAL_MAX_ANGLE - DIAL_MIN_ANGLE);
}

function updateRemoteLink(remoteUrl) {
  if (typeof remoteUrl !== 'string' || !remoteUrl.trim()) {
    return;
  }

  const resolvedUrl = remoteUrl.trim();

  if (remoteQrImage) {
    remoteQrImage.alt = `QR code for the remote control at ${resolvedUrl}`;
    remoteQrImage.src = `/api/remote-qr?t=${Date.now()}`;
  }

  if (remoteQrLink) {
    remoteQrLink.href = resolvedUrl;
    remoteQrLink.textContent = resolvedUrl;
  }
}

function renderEmergencyContacts() {
  if (!emergencyGrid || !emergencyEmpty) {
    return;
  }

  emergencyGrid.innerHTML = '';

  if (!Array.isArray(emergencyContacts) || emergencyContacts.length === 0) {
    emergencyEmpty.classList.remove('hidden');
    return;
  }

  emergencyEmpty.classList.add('hidden');
  emergencyContacts.forEach((contact) => {
    const article = document.createElement('article');
    article.className = `emergency-card${contact.primary ? ' emergency-card-primary' : ''}`;
    article.innerHTML = `
      <div class="emergency-name">${escapeHtml(contact.name)}</div>
      <div class="emergency-number">${escapeHtml(contact.number)}</div>
    `;
    emergencyGrid.appendChild(article);
  });
}

function postControlState(payload) {
  postDiagnosticLog('info', 'control_state_post', {
    payload,
    mode: currentMode,
    channelId: currentChannelId,
    playback: currentPlayback
  });

  fetch('/api/control/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, source: 'tv' })
  }).catch((error) => {
    console.error('Control sync error:', error);
    postDiagnosticLog('error', 'control_state_post_failed', {
      payload,
      message: error?.message || String(error)
    });
  });
}

function postDiagnosticLog(level, event, details = {}) {
  if (!clientDiagnosticsEnabled) {
    return;
  }

  const payload = {
    level,
    event,
    sessionId: CLIENT_SESSION_ID,
    href: window.location.href,
    visible: !document.hidden,
    mode: currentMode,
    channelId: currentChannelId,
    playback: currentPlayback,
    ts: new Date().toISOString(),
    details
  };

  fetch('/api/diagnostics/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {
    // Ignore logging endpoint failures.
  });
}

function postDiagnosticLogRateLimited(key, minIntervalMs, level, event, details = {}) {
  const now = Date.now();
  const previous = diagnosticsRateLimit.get(key) || 0;
  if (now - previous < minIntervalMs) {
    return;
  }

  diagnosticsRateLimit.set(key, now);
  postDiagnosticLog(level, event, details);
}

function shouldLogHeartbeat() {
  if (currentMode !== 'channel') {
    return false;
  }

  return currentPlayback !== 'playing' || player.paused || player.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
}

function pingControlActivity(source = 'tv') {
  fetch('/api/control/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source })
  }).catch((error) => {
    console.error('Control activity ping error:', error);
  });
}

function queueVolumeSync() {
  clearTimeout(volumeSyncTimer);
  volumeSyncTimer = setTimeout(() => {
    postControlState({
      volume: Math.round(currentVolume * 100),
      lastVolume: Math.round(lastAudibleVolume * 100),
      muted: currentMuted
    });
  }, 80);
}

function isEffectivelyMuted() {
  return currentMuted || currentVolume === 0;
}

function updateMuteUi() {
  if (!muteButton) return;
  const muted = isEffectivelyMuted();
  muteButton.classList.toggle('active', muted);
  muteButton.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
  muteButton.setAttribute('title', muted ? 'Unmute audio' : 'Mute audio');
}

function syncPlayerAudioState() {
  player.volume = currentVolume;

  if (isEffectivelyMuted()) {
    player.muted = true;
    return;
  }

  if (restoreAudioAfterAutoplay || !player.paused) {
    player.muted = false;
    restoreAudioAfterAutoplay = false;
  }
}

function stopWeatherAutoscroll() {
  if (weatherAutoscrollFrame !== null) {
    cancelAnimationFrame(weatherAutoscrollFrame);
    weatherAutoscrollFrame = null;
  }

  weatherAutoscrollLastTimestamp = 0;
}

function runWeatherAutoscrollFrame(timestamp) {
  if (currentMode !== 'weather' || currentPlayback === 'stopped' || weatherAutoscrollState !== 'playing') {
    stopWeatherAutoscroll();
    return;
  }

  const maxScrollTop = Math.max(0, weatherView.scrollHeight - weatherView.clientHeight);
  if (maxScrollTop <= 0) {
    weatherAutoscrollFrame = requestAnimationFrame(runWeatherAutoscrollFrame);
    return;
  }

  if (weatherAutoscrollLastTimestamp === 0) {
    weatherAutoscrollLastTimestamp = timestamp;
  }

  const deltaMs = timestamp - weatherAutoscrollLastTimestamp;
  weatherAutoscrollLastTimestamp = timestamp;
  weatherView.scrollTop = Math.min(maxScrollTop, weatherView.scrollTop + (deltaMs / 1000) * WEATHER_AUTOSCROLL_PX_PER_SECOND);

  if (weatherView.scrollTop >= maxScrollTop - 1) {
    stopWeatherAutoscroll();
    return;
  }

  weatherAutoscrollFrame = requestAnimationFrame(runWeatherAutoscrollFrame);
}

function syncWeatherAutoscroll(options = {}) {
  const { reset = false } = options;

  if (reset) {
    weatherView.scrollTop = 0;
  }

  if (currentMode !== 'weather' || currentPlayback === 'stopped' || weatherAutoscrollState !== 'playing') {
    stopWeatherAutoscroll();
    return;
  }

  if (weatherAutoscrollFrame === null) {
    weatherAutoscrollLastTimestamp = 0;
    weatherAutoscrollFrame = requestAnimationFrame(runWeatherAutoscrollFrame);
  }
}

function setVolume(volume, options = {}) {
  const { showStatus = true, sync = true, unmuteOnVolumeChange = false } = options;

  currentVolume = clamp(volume, 0, 1);
  if (currentVolume > 0) {
    lastAudibleVolume = currentVolume;
    rememberLastAudibleVolume(lastAudibleVolume);
  }

  if (currentVolume === 0) {
    currentMuted = true;
  } else if (unmuteOnVolumeChange) {
    currentMuted = false;
  }
  syncPlayerAudioState();

  const angle = volumeToAngle(currentVolume);
  volumeDial.style.setProperty('--dial-angle', `${angle}deg`);
  volumeDial.setAttribute('aria-valuenow', String(Math.round(currentVolume * 100)));
  rememberVolume(currentVolume);
  rememberMuted(currentMuted);
  updateMuteUi();

  if (showStatus) {
    statusText.textContent = `Volume ${Math.round(currentVolume * 100)}%`;
  }

  if (sync) {
    queueVolumeSync();
  }
}

function setMuted(muted, options = {}) {
  const { showStatus = true, sync = true } = options;

  if (muted) {
    if (currentVolume > 0) {
      lastAudibleVolume = currentVolume;
      rememberLastAudibleVolume(lastAudibleVolume);
    }
    currentMuted = true;
    currentVolume = 0;
  } else {
    currentMuted = false;
    currentVolume = clamp(lastAudibleVolume > 0 ? lastAudibleVolume : 0.7, 0, 1);
  }

  rememberMuted(currentMuted);
  updateMuteUi();
  syncPlayerAudioState();

  const angle = volumeToAngle(currentVolume);
  volumeDial.style.setProperty('--dial-angle', `${angle}deg`);
  volumeDial.setAttribute('aria-valuenow', String(Math.round(currentVolume * 100)));
  rememberVolume(currentVolume);

  if (showStatus) {
    statusText.textContent = isEffectivelyMuted() ? 'Audio muted' : 'Audio unmuted';
  }

  if (sync) {
    queueVolumeSync();
  }
}

function volumeFromPointer(event) {
  const rect = volumeDial.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  const normalizedAngle = clamp(angle, DIAL_MIN_ANGLE, DIAL_MAX_ANGLE);
  return clamp(angleToVolume(normalizedAngle), 0, 1);
}

function setupVolumeDial() {
  let pointerId = null;

  setVolume(currentVolume, { showStatus: false, sync: false });

  volumeDial.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId;
    volumeDial.setPointerCapture(pointerId);
    volumeDial.classList.add('active');
    setVolume(volumeFromPointer(event), { sync: false, unmuteOnVolumeChange: true });
  });

  volumeDial.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    setVolume(volumeFromPointer(event), { sync: false, unmuteOnVolumeChange: true });
  });

  function endPointer(event) {
    if (event.pointerId !== pointerId) return;
    volumeDial.classList.remove('active');
    volumeDial.releasePointerCapture(pointerId);
    pointerId = null;
  }

  volumeDial.addEventListener('pointerup', endPointer);
  volumeDial.addEventListener('pointercancel', endPointer);

  volumeDial.addEventListener('wheel', (event) => {
    event.preventDefault();
    const step = event.deltaY > 0 ? -0.03 : 0.03;
    setVolume(currentVolume + step, { sync: false, unmuteOnVolumeChange: true });
  });

  volumeDial.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setVolume(currentVolume + 0.05, { sync: false, unmuteOnVolumeChange: true });
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setVolume(currentVolume - 0.05, { sync: false, unmuteOnVolumeChange: true });
    }
  });
}

function clearActiveButtons() {
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.remove('active'));
}

function isAlertsChannel(channel) {
  return channel?.type === 'alerts';
}

function isEmergencyChannel(channel) {
  return channel?.type === 'emergency';
}

function isSpecialChannel(channel) {
  return isAlertsChannel(channel) || isEmergencyChannel(channel);
}

function getChannelButtonLabel(channel) {
  if (channel?.id === '16') {
    return `
      <span class="camera-channel-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M6.5 8.5h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
          <path d="M16.5 11.2l3-1.9v7.4l-3-1.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
          <path d="M8.4 8.5l1-1.8h2.8l1 1.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </span>
    `;
  }

  if (isEmergencyChannel(channel)) {
    return '☎';
  }

  return String(channel.id);
}

function sortChannelsForPanel(channels = []) {
  return [...channels].sort((left, right) => {
    if (isAlertsChannel(left) && !isAlertsChannel(right)) return 1;
    if (!isAlertsChannel(left) && isAlertsChannel(right)) return -1;
    if (isEmergencyChannel(left) && !isEmergencyChannel(right)) return 1;
    if (!isEmergencyChannel(left) && isEmergencyChannel(right)) return -1;
    return Number(left.id) - Number(right.id);
  });
}

function getDefaultLiveChannel() {
  return Array.from(channelsById.values())
    .filter((channel) => !isSpecialChannel(channel))
    .sort((left, right) => Number(left.id) - Number(right.id))[0] || null;
}

function getReturnChannel() {
  if (lastLiveChannelId && channelsById.has(lastLiveChannelId)) {
    return channelsById.get(lastLiveChannelId);
  }

  return getDefaultLiveChannel();
}

function returnToLiveChannel(options = {}) {
  const { sync = true, playback = 'playing' } = options;
  const channel = getReturnChannel();

  if (!channel) {
    statusText.textContent = 'No channel is available to return to.';
    return;
  }

  playChannel(channel, { sync, playback });
}

function hideScreenViews() {
  videoWrap.classList.add('hidden');
  weatherView.classList.add('hidden');
  alertsView.classList.add('hidden');
  emergencyView.classList.add('hidden');
  setupView?.classList.add('hidden');
}

function stopAlertsRefresh() {
  clearTimeout(alertsRefreshTimer);
  alertsRefreshTimer = null;
}

function scheduleAlertsRefresh(delay = alertsRefreshIntervalMs) {
  stopAlertsRefresh();

  if (currentMode !== 'alerts' || currentPlayback === 'stopped') {
    return;
  }

  alertsRefreshTimer = setTimeout(() => {
    loadAlertsData();
  }, delay);
}

function formatDisplayTime(value) {
  if (!value) return 'Just now';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  });
}

function stopAlertsNewsAutoscroll() {
  if (alertsNewsScrollFrame !== null) {
    cancelAnimationFrame(alertsNewsScrollFrame);
    alertsNewsScrollFrame = null;
  }

  clearTimeout(alertsNewsScrollTimeout);
  alertsNewsScrollTimeout = null;
}

function canRunAlertsNewsAutoscroll() {
  return Boolean(
    alertsNewsList &&
    currentMode === 'alerts' &&
    currentPlayback === 'playing' &&
    !isAlertsNewsHovered
  );
}

function isCompactTvLayout() {
  return window.matchMedia('(max-width: 980px)').matches;
}

function shouldUseGentleLiveRecovery() {
  return isCompactTvLayout();
}

function animateAlertsNewsScroll(targetScrollTop, durationMs, onComplete) {
  const startScrollTop = alertsNewsList.scrollTop;
  const scrollDistance = targetScrollTop - startScrollTop;
  const startTime = performance.now();

  function step(now) {
    if (!canRunAlertsNewsAutoscroll()) {
      alertsNewsScrollFrame = null;
      return;
    }

    const progress = Math.min(1, (now - startTime) / durationMs);
    alertsNewsList.scrollTop = startScrollTop + scrollDistance * progress;

    if (progress < 1) {
      alertsNewsScrollFrame = requestAnimationFrame(step);
      return;
    }

    alertsNewsScrollFrame = null;
    if (typeof onComplete === 'function') {
      onComplete();
    }
  }

  alertsNewsScrollFrame = requestAnimationFrame(step);
}

function getAlertsNewsScrollDurationMs(scrollDistance) {
  const viewportHeight = Math.max(1, alertsNewsList.clientHeight);
  const normalizedDistance = Math.max(1, Math.abs(scrollDistance));
  const durationMultiplier = isCompactTvLayout() ? 0.45 : 1;
  return Math.max(800, (normalizedDistance / viewportHeight) * alertsNewsScrollDurationMs * durationMultiplier);
}

function startAlertsNewsAutoscroll() {
  stopAlertsNewsAutoscroll();

  if (!canRunAlertsNewsAutoscroll()) {
    return;
  }

  const maxScrollTop = Math.max(0, alertsNewsList.scrollHeight - alertsNewsList.clientHeight);

  if (maxScrollTop <= 4) {
    return;
  }

  function scrollCycle(direction = alertsNewsScrollDirection) {
    alertsNewsScrollDirection = direction;
    const nextScrollTop = direction === 'down' ? maxScrollTop : 0;
    const scrollDistance = nextScrollTop - alertsNewsList.scrollTop;
    const durationMs = getAlertsNewsScrollDurationMs(scrollDistance);

    animateAlertsNewsScroll(nextScrollTop, durationMs, () => {
      if (!canRunAlertsNewsAutoscroll()) {
        return;
      }

      alertsNewsScrollTimeout = setTimeout(() => {
        scrollCycle(direction === 'down' ? 'up' : 'down');
      }, isCompactTvLayout() ? Math.min(900, alertsNewsScrollPauseMs) : alertsNewsScrollPauseMs);
    });
  }

  alertsNewsScrollTimeout = setTimeout(() => {
    scrollCycle(alertsNewsScrollDirection);
  }, isCompactTvLayout() ? Math.min(900, alertsNewsScrollPauseMs) : alertsNewsScrollPauseMs);
}

function renderAlertsNews(items = [], fetchedAt = null) {
  const newsItems = Array.isArray(items) ? items : [];
  alertsNewsMeta.textContent =
    newsItems.length > 0 ? `Last update ${formatDisplayTime(fetchedAt)}` : 'No headlines available';

  stopAlertsNewsAutoscroll();
  alertsNewsList.innerHTML = '';

  if (newsItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'alerts-empty';
    empty.textContent = 'No news headlines are available right now.';
    alertsNewsList.appendChild(empty);
    return;
  }

  newsItems.forEach((item) => {
    const article = document.createElement('article');
    article.className = 'alerts-news-item';
    const sourceText = item.source || 'Source';
    const safeHref = item.link || '#';

    article.innerHTML = `
      <div class="alerts-news-line" dir="rtl">
        <a class="alerts-news-title" dir="rtl" href="${safeHref}" target="_blank" rel="noopener noreferrer">${item.title || 'Untitled headline'}</a>
        <span class="alerts-news-source" dir="rtl">${sourceText}</span>
      </div>
    `;
    alertsNewsList.appendChild(article);
  });

  requestAnimationFrame(() => {
    if (canRunAlertsNewsAutoscroll()) {
      startAlertsNewsAutoscroll();
    }
  });
}

function renderAlertsData(current, historyItems = []) {
  const activeItems = Array.isArray(current?.items) ? current.items : [];
  const history = Array.isArray(historyItems) ? historyItems : [];
  const active = activeItems.length > 0;

  alertsTitle.textContent = active
    ? `Pikud HaOref: ${activeItems.length} active area${activeItems.length === 1 ? '' : 's'} detected.`
    : 'Pikud HaOref: no active Home Front Command alerts.';
  alertsUpdatedAt.textContent = `Updated ${formatDisplayTime(current?.fetchedAt || current?.alertedAt)}`;
  alertsHistoryCount.textContent = `${history.length} item${history.length === 1 ? '' : 's'}`;

  alertsActiveList.innerHTML = '';
  if (active) {
    activeItems.forEach((area) => {
      const item = document.createElement('div');
      item.className = 'alerts-area-item';
      item.textContent = area;
      alertsActiveList.appendChild(item);
    });
  } else {
    const empty = document.createElement('div');
    empty.className = 'alerts-empty';
    empty.textContent = 'No active alert areas right now.';
    alertsActiveList.appendChild(empty);
  }

  alertsHistoryList.innerHTML = '';
  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'alerts-empty';
    empty.textContent = 'Recent alerts will appear here when Pikud HaOref publishes them.';
    alertsHistoryList.appendChild(empty);
    return;
  }

  history.forEach((entry) => {
    const item = document.createElement('article');
    item.className = 'alerts-history-item';
    const locations = Array.isArray(entry.locations) ? entry.locations.filter(Boolean) : [];
    item.innerHTML = `
      <div class="alerts-history-title">${entry.title || 'Alert'}</div>
      <div class="alerts-history-time">${formatDisplayTime(entry.occurredAt)}</div>
      <div class="alerts-history-locations">${locations.length > 0 ? locations.join(', ') : 'Location unavailable'}</div>
    `;
    alertsHistoryList.appendChild(item);
  });
}

async function loadAlertsData() {
  if (currentMode !== 'alerts') {
    return;
  }

  try {
    const [currentResponse, historyResponse, newsResponse] = await Promise.all([
      fetch('/api/alerts/current'),
      fetch('/api/alerts/history?limit=12'),
      fetch(`/api/news/combined?limit=${alertsNewsPageLimit}&maxAgeMinutes=${alertsNewsMaxAgeMinutes}`)
    ]);

    const currentPayload = await currentResponse.json();
    const historyPayload = await historyResponse.json();
    const newsPayload = await newsResponse.json();

    const current = currentResponse.ok ? currentPayload : currentPayload.cached || null;
    const history = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
    const newsItems = Array.isArray(newsPayload?.items) ? newsPayload.items : [];

    if (!current) {
      throw new Error('Alerts payload unavailable');
    }

    renderAlertsData(current, history);
    renderAlertsNews(newsItems, newsPayload?.fetchedAt || current.fetchedAt);
    statusText.textContent = current.active ? 'Active alerts on screen' : 'Alerts channel ready';
  } catch (error) {
    console.error('Failed to load alerts:', error);
    renderAlertsData(
      {
        title: 'Alerts unavailable',
        desc: 'Unable to load Pikud HaOref alerts right now.',
        items: [],
        fetchedAt: new Date().toISOString()
      },
      []
    );
    renderAlertsNews([], new Date().toISOString());
    statusText.textContent = 'Alerts unavailable';
  } finally {
    scheduleAlertsRefresh();
  }
}

function updateFullscreenUi() {
  if (!fullscreenButton) return;
  document.body.classList.toggle('fullscreen-mode', currentFullscreen);
  fullscreenButton.classList.toggle('active', currentFullscreen);
  fullscreenButton.setAttribute('aria-label', currentFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
  fullscreenButton.setAttribute('title', currentFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
}

async function setFullscreen(nextFullscreen, options = {}) {
  const { sync = true, preferBrowser = true } = options;

  currentFullscreen = nextFullscreen;
  updateFullscreenUi();

  if (preferBrowser) {
    try {
      if (nextFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (!nextFullscreen && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen toggle failed:', error);
    }
  }

  if (sync) {
    postControlState({ fullscreen: currentFullscreen });
  }
}

function setupFullscreenButton() {
  if (!fullscreenButton) return;

  updateFullscreenUi();
  fullscreenButton.addEventListener('click', () => {
    setFullscreen(!currentFullscreen);
  });
  document.addEventListener('fullscreenchange', () => {
    const isBrowserFullscreen = Boolean(document.fullscreenElement);

    if (currentFullscreen !== isBrowserFullscreen) {
      currentFullscreen = isBrowserFullscreen;
      updateFullscreenUi();
      postControlState({ fullscreen: currentFullscreen });
    }
  });
}

function cancelPendingPlayback() {
  playbackAttemptToken += 1;
  clearTimeout(playbackRetryTimer);
  playbackRetryTimer = null;
  clearTimeout(sourceRecoveryTimer);
  sourceRecoveryTimer = null;
  recoverCurrentSource = null;
}

function showStandbyScreen(show) {
  standbyScreen.classList.toggle('hidden', !show);
}

function showSleepScreen(show) {
  if (!sleepScreen) return;
  sleepScreen.classList.toggle('hidden', !show);
}

function updateScreenOverlays(playback = currentPlayback) {
  document.body.classList.toggle('power-off-mode', playback === 'stopped');
  showStandbyScreen(false);
  showSleepScreen(playback !== 'stopped' && isIdleDarkMode);
}

function exitIdleDarkMode() {
  if (!isIdleDarkMode) return;
  isIdleDarkMode = false;
  updateScreenOverlays();

  if (currentVolume === 0) {
    player.muted = true;
  } else if (mutedBeforeIdleDarkMode !== null) {
    player.muted = mutedBeforeIdleDarkMode;
  }

  mutedBeforeIdleDarkMode = null;
  updateStatusForState();
}

function enterIdleDarkMode() {
  if (isIdleDarkMode) return;
  isIdleDarkMode = true;
  mutedBeforeIdleDarkMode = player.muted;
  player.muted = true;
  updateScreenOverlays();
  statusText.textContent = 'Dark mode active';
}

function scheduleIdleDarkModeCheck() {
  clearTimeout(idleDarkModeTimer);
  const remaining = Math.max(0, IDLE_DARK_MODE_MS - (Date.now() - lastActivityAt));
  idleDarkModeTimer = setTimeout(() => {
    enterIdleDarkMode();
  }, remaining);
}

function registerActivity(timestamp = Date.now()) {
  lastActivityAt = Math.max(lastActivityAt, timestamp);
  exitIdleDarkMode();
  scheduleIdleDarkModeCheck();
}

function registerLocalActivity() {
  const now = Date.now();
  registerActivity(now);

  if (now - lastLocalActivityPingAt < LOCAL_ACTIVITY_PING_THROTTLE_MS) {
    return;
  }

  lastLocalActivityPingAt = now;
  pingControlActivity('tv-local');
}

function shouldTreatControlUpdateAsActivity(source) {
  if (typeof source !== 'string') {
    return true;
  }

  return !source.startsWith('tv');
}

function updateStatusForState() {
  if (currentPlayback === 'stopped') {
    statusText.textContent = 'TV stopped';
    return;
  }

  if (currentMode === 'weather') {
    statusText.textContent = weatherAutoscrollState === 'paused' ? 'Weather scroll paused' : 'Weather scrolling';
    return;
  }

  if (currentMode === 'alerts') {
    statusText.textContent = currentPlayback === 'paused' ? 'Alerts paused' : 'Alerts channel ready';
    return;
  }

  if (currentMode === 'emergency') {
    statusText.textContent = currentPlayback === 'paused' ? 'Emergency page paused' : 'Emergency numbers ready';
    return;
  }

  if (currentMode === 'setup') {
    statusText.textContent = 'Setup screen ready';
    return;
  }

  if (!currentChannelId) {
    statusText.textContent = currentPlayback === 'paused' ? 'Playback paused' : 'Select a channel';
    return;
  }

  const channel = channelsById.get(currentChannelId);
  const channelName = channel ? channel.name : `CH ${currentChannelId}`;
  statusText.textContent = currentPlayback === 'paused' ? `Paused ${channelName}` : `Playing ${channelName}`;
}

function weatherCodeText(code) {
  const map = {
    0: 'Clear',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Cloudy',
    45: 'Fog',
    48: 'Rime fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Heavy drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    71: 'Light snow',
    73: 'Snow',
    75: 'Heavy snow',
    80: 'Rain showers',
    81: 'Rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm'
  };
  return map[code] || `Code ${code}`;
}

function weatherCodeIcon(code) {
  const map = {
    0: '☀',
    1: '🌤',
    2: '⛅',
    3: '☁',
    45: '🌫',
    48: '🌫',
    51: '🌦',
    53: '🌦',
    55: '🌧',
    61: '🌦',
    63: '🌧',
    65: '⛈',
    71: '🌨',
    73: '❄',
    75: '❄',
    80: '🌦',
    81: '🌧',
    82: '⛈',
    95: '⛈'
  };
  return map[code] || '☀';
}

function windDirectionText(degrees) {
  if (!Number.isFinite(degrees)) return 'Variable';
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round((((degrees % 360) + 360) % 360) / 45) % labels.length];
}

function humidityComfortText(humidity) {
  if (humidity < 35) return 'Dry air';
  if (humidity < 60) return 'Comfortable';
  if (humidity < 75) return 'Humid';
  return 'Very humid';
}

function cloudCoverText(cloudCover) {
  if (cloudCover < 15) return 'Mostly clear';
  if (cloudCover < 40) return 'Light clouds';
  if (cloudCover < 70) return 'Partly cloudy';
  return 'Overcast';
}

function rainChanceText(chance) {
  if (chance < 15) return 'Dry outlook';
  if (chance < 40) return 'Slight chance';
  if (chance < 70) return 'Showers possible';
  return 'Rain likely';
}

function uvSeverityText(uvIndex) {
  if (uvIndex < 3) return 'Low';
  if (uvIndex < 6) return 'Moderate';
  if (uvIndex < 8) return 'High';
  if (uvIndex < 11) return 'Very high';
  return 'Extreme';
}

function aqiLabel(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

function pressureTrendText(current, next) {
  if (!Number.isFinite(current) || !Number.isFinite(next)) return 'Trend unavailable';
  const delta = next - current;
  if (delta > 1.5) return 'Rising';
  if (delta < -1.5) return 'Falling';
  return 'Steady';
}

function formatHourLabel(timeText) {
  return new Date(timeText).toLocaleTimeString([], { hour: 'numeric' });
}

function getHourlyStartIndex(hourly, currentTime) {
  if (!hourly?.time?.length) return 0;
  const currentTimestamp = new Date(currentTime).getTime();
  const index = hourly.time.findIndex((time) => new Date(time).getTime() >= currentTimestamp);
  return index >= 0 ? index : 0;
}

function updateFavoriteButton() {
  weatherFavoriteButton.classList.toggle('active', favoriteWeatherCityId === currentWeatherCityId);
}

function buildWeatherGraphPath(values, width, height, padding = 12) {
  if (!Array.isArray(values) || values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    const centerY = height / 2;
    return `M ${padding} ${centerY} L ${width - padding} ${centerY}`;
  }

  const numericValues = values.map((value) => Number(value));
  const minValue = Math.min(...numericValues);
  const maxValue = Math.max(...numericValues);
  const range = Math.max(1, maxValue - minValue);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return numericValues.map((value, index) => {
    const x = padding + (usableWidth * index) / (numericValues.length - 1);
    const y = padding + ((maxValue - value) / range) * usableHeight;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function renderHourlyForecast(hourly, startIndex) {
  hourlyForecast.innerHTML = '';
  if (!hourly?.time?.length) return;
  const end = Math.min(startIndex + 6, hourly.time.length);
  const sliceIndexes = [];

  for (let idx = startIndex; idx < end; idx += 1) {
    sliceIndexes.push(idx);
  }

  if (sliceIndexes.length === 0) return;

  const temperatures = sliceIndexes.map((idx) => Math.round(hourly.temperature_2m[idx]));
  const graphPath = buildWeatherGraphPath(temperatures, 320, 84, 10);

  hourlyForecast.innerHTML = `
    <div class="weather-graph-shell">
      <svg class="weather-graph-svg hourly-graph-svg" viewBox="0 0 320 84" preserveAspectRatio="none" aria-hidden="true">
        <path class="weather-graph-line hourly-graph-line" d="${graphPath}"></path>
      </svg>
      <div class="weather-graph-labels">
        ${sliceIndexes.map((idx, position) => {
          const chance = Math.round(hourly.precipitation_probability[idx] ?? 0);
          return `
            <div class="weather-graph-label">
              <div class="weather-graph-name">${formatHourLabel(hourly.time[idx])}</div>
              <div class="weather-graph-value">${temperatures[position]}°</div>
              <div class="weather-graph-note">${chance}%</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderDailyForecast(daily) {
  forecastList.innerHTML = '';
  if (!daily?.time?.length) return;

  const days = daily.time.slice(0, 5);
  const maxTemps = days.map((_day, idx) => Math.round(daily.temperature_2m_max[idx]));
  const minTemps = days.map((_day, idx) => Math.round(daily.temperature_2m_min[idx]));
  const maxPath = buildWeatherGraphPath(maxTemps, 320, 84, 10);
  const minPath = buildWeatherGraphPath(minTemps, 320, 84, 10);

  forecastList.innerHTML = `
    <div class="weather-graph-shell">
      <svg class="weather-graph-svg weekly-graph-svg" viewBox="0 0 320 84" preserveAspectRatio="none" aria-hidden="true">
        <path class="weather-graph-line weekly-graph-line weekly-high-line" d="${maxPath}"></path>
        <path class="weather-graph-line weekly-graph-line weekly-low-line" d="${minPath}"></path>
      </svg>
      <div class="weather-graph-labels">
        ${days.map((day, idx) => {
          const prettyDay = new Date(day).toLocaleDateString(undefined, { weekday: 'short' });
          return `
            <div class="weather-graph-label">
              <div class="weather-graph-name">${prettyDay}</div>
              <div class="weather-graph-value">${maxTemps[idx]}° / ${minTemps[idx]}°</div>
              <div class="weather-graph-note">${Math.round(daily.precipitation_probability_max[idx] ?? 0)}%</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function buildWeatherInsight({ current, daily, hourly, currentIndex }) {
  const nextRainChance = Math.round(hourly.precipitation_probability[currentIndex] ?? 0);
  const nextCloudCover = Math.round(hourly.cloud_cover[currentIndex] ?? 0);
  const tonightCloudCover = Math.round(hourly.cloud_cover[Math.min(currentIndex + 6, hourly.cloud_cover.length - 1)] ?? nextCloudCover);

  if (current.wind_gusts_10m >= 30) {
    return 'Windy afternoon expected';
  }

  if ((hourly.relative_humidity_2m?.[Math.min(currentIndex + 4, hourly.relative_humidity_2m.length - 1)] ?? current.relative_humidity_2m) >
      current.relative_humidity_2m + 8) {
    return 'Humidity rising tonight';
  }

  if (nextRainChance >= 45 || Math.round(daily.precipitation_probability_max[0] ?? 0) >= 50) {
    return 'Rain chance builds later today';
  }

  if (tonightCloudCover < 25) {
    return 'Clear skies tonight';
  }

  if (nextCloudCover > 70) {
    return 'Clouds will thicken through the day';
  }

  return 'Comfortable conditions for the next few hours';
}

function populateWeatherCityOptions(cities, defaultCityId) {
  weatherCities = cities;
  currentWeatherCityId = defaultCityId || currentWeatherCityId;
  [weatherCitySelect, weatherPanelCitySelect].filter(Boolean).forEach((selectElement) => {
    selectElement.innerHTML = '';

    cities.forEach((city) => {
      const option = document.createElement('option');
      option.value = city.id;
      option.textContent = city.name;
      option.selected = city.id === currentWeatherCityId;
      selectElement.appendChild(option);
    });
  });
}

async function loadWeatherCities() {
  const response = await fetch('/api/weather/cities');
  if (!response.ok) {
    throw new Error('Failed to load weather cities');
  }

  const data = await response.json();
  populateWeatherCityOptions(data.cities || [], data.defaultCityId);
  favoriteWeatherCityId = data.defaultCityId || favoriteWeatherCityId;
  updateFavoriteButton();
}

function stopCurrentPlayback() {
  postDiagnosticLog('info', 'playback_stop_current', {
    hadHlsInstance: Boolean(hls),
    hadSrc: Boolean(player.currentSrc)
  });
  clearTimeout(sourceRecoveryTimer);
  sourceRecoveryTimer = null;
  recoverCurrentSource = null;
  restoreAudioAfterAutoplay = false;
  if (hls) {
    hls.destroy();
    hls = null;
  }
  suppressPauseSync = true;
  player.pause();
  player.removeAttribute('src');
  player.load();
  syncPlayerAudioState();
  suppressPauseSync = false;
}

function pauseCurrentPlayback() {
  suppressPauseSync = true;
  if (!player.paused) {
    player.pause();
  }
  suppressPauseSync = false;
}

function restorePlayerAudio() {
  if (isEffectivelyMuted()) return;

  if (!restoreAudioAfterAutoplay && !player.muted) {
    return;
  }

  player.muted = false;
  player.volume = currentVolume;
  restoreAudioAfterAutoplay = false;
}

function shouldKeepTryingPlayback(expectedAttemptToken = playbackAttemptToken) {
  return (
    expectedAttemptToken === playbackAttemptToken &&
    currentMode === 'channel' &&
    currentPlayback === 'playing' &&
    !document.hidden &&
    Boolean(player.currentSrc)
  );
}

async function attemptPlaybackStart(options = {}) {
  const {
    allowMutedFallback = true,
    failureText = 'Playback is ready. Press Start on the remote if it stays paused.'
  } = options;

  if (currentMode !== 'channel' || currentPlayback !== 'playing') {
    return false;
  }

  try {
    await player.play();
    restorePlayerAudio();
    updateStatusForState();
    return true;
  } catch (error) {
    console.error('Playback start failed:', error);

    if (allowMutedFallback && !player.muted && currentVolume > 0) {
      player.muted = true;
      restoreAudioAfterAutoplay = true;

      try {
        await player.play();
        statusText.textContent = 'Channel is playing. Turn the volume knob if audio stays muted.';
        return true;
      } catch (mutedError) {
        console.error('Muted playback start failed:', mutedError);
        restoreAudioAfterAutoplay = false;
        player.muted = currentVolume === 0;
      }
    }

    statusText.textContent = failureText;
    return false;
  }
}

function schedulePlaybackRetry(delay = 900) {
  clearTimeout(playbackRetryTimer);
  const expectedAttemptToken = playbackAttemptToken;
  playbackRetryTimer = setTimeout(async () => {
    playbackRetryTimer = null;

    if (!shouldKeepTryingPlayback(expectedAttemptToken)) {
      return;
    }

    const started = await attemptPlaybackStart({
      allowMutedFallback: true,
      failureText: 'Playback is loaded but still waiting for the stream.'
    });

    if (!started && shouldKeepTryingPlayback(expectedAttemptToken) && player.paused) {
      schedulePlaybackRetry(Math.max(delay, 1200));
    }
  }, delay);
}

function applyPlaybackState(playback, options = {}) {
  const { afterLoad = false } = options;

  if (playback === 'stopped') {
    cancelPendingPlayback();
    stopWeatherAutoscroll();
    stopAlertsNewsAutoscroll();
    stopCurrentPlayback();
    videoWrap.classList.add('hidden');
    currentPlayback = 'stopped';
    updateScreenOverlays('stopped');
    updateStatusForState();
    return;
  }

  currentPlayback = playback === 'paused' ? 'paused' : 'playing';
  updateScreenOverlays();

  if (currentMode === 'weather') {
    hideScreenViews();
    weatherView.classList.remove('hidden');
    syncWeatherAutoscroll();
    updateStatusForState();
    return;
  }

  if (currentMode === 'alerts') {
    hideScreenViews();
    alertsView.classList.remove('hidden');
    stopWeatherAutoscroll();
    if (currentPlayback === 'paused') {
      stopAlertsNewsAutoscroll();
    } else {
      startAlertsNewsAutoscroll();
    }
    updateStatusForState();
    return;
  }

  if (currentMode === 'emergency') {
    hideScreenViews();
    emergencyView.classList.remove('hidden');
    stopWeatherAutoscroll();
    updateStatusForState();
    return;
  }

  if (currentMode === 'setup') {
    hideScreenViews();
    setupView?.classList.remove('hidden');
    stopWeatherAutoscroll();
    updateStatusForState();
    return;
  }

  stopWeatherAutoscroll();
  videoWrap.classList.remove('hidden');

  if (currentPlayback === 'paused') {
    pauseCurrentPlayback();
    updateStatusForState();
    return;
  }

  if (afterLoad || player.paused) {
    attemptPlaybackStart();
  }

  updateStatusForState();
}

function isHlsStream(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.pathname.toLowerCase().endsWith('.m3u8');
  } catch (_error) {
    return url.toLowerCase().includes('.m3u8');
  }
}

function getPreferredAudioTrackIndex(audioTracks = []) {
  if (!Array.isArray(audioTracks) || audioTracks.length === 0) {
    return -1;
  }

  const isPolishTrack = (lang, name) =>
    lang === 'pol' ||
    lang.startsWith('pl') ||
    name.includes('polish') ||
    name.includes('pol-') ||
    name.startsWith('pol');

  const rankedTrackIndex = (predicate) => audioTracks.findIndex((track) => {
    const lang = String(track?.lang || '').toLowerCase();
    const name = String(track?.name || '').toLowerCase();
    return predicate(lang, name);
  });

  const hebrewIndex = rankedTrackIndex((lang, name) =>
    lang.startsWith('he') || lang.startsWith('iw') || name.includes('hebrew') || name.includes('עבר')
  );
  if (hebrewIndex !== -1) return hebrewIndex;

  const englishIndex = rankedTrackIndex((lang, name) =>
    lang.startsWith('en') || name.includes('english')
  );
  if (englishIndex !== -1) return englishIndex;

  const nonPolishIndex = rankedTrackIndex((lang, name) =>
    !isPolishTrack(lang, name)
  );
  if (nonPolishIndex !== -1) return nonPolishIndex;

  return 0;
}

function applyVideoPresentation(channel) {
  const shouldFitFrame = Boolean(channel?.usesRtspRelay);
  videoWrap.classList.toggle('fit-frame', shouldFitFrame);
}

function playChannel(channel, options = {}) {
  const { sync = true, playback = currentPlayback } = options;
  const normalizedPlayback = playback === 'paused' ? 'paused' : 'playing';

  if (
    currentMode === 'channel' &&
    currentChannelId === channel?.id &&
    currentPlayback === normalizedPlayback &&
    Boolean(player.currentSrc)
  ) {
    postDiagnosticLogRateLimited('channel_switch_skipped', 1000, 'debug', 'channel_switch_skipped', {
      channelId: channel?.id,
      channelName: channel?.name,
      sync,
      playback: normalizedPlayback,
      src: player.currentSrc
    });

    if (normalizedPlayback === 'playing' && player.paused) {
      schedulePlaybackRetry(80);
    } else {
      updateStatusForState();
    }
    return;
  }

  postDiagnosticLog('info', 'channel_switch_requested', {
    targetChannelId: channel?.id,
    targetName: channel?.name,
    targetType: channel?.type,
    sync,
    playback: normalizedPlayback
  });

  if (isAlertsChannel(channel)) {
    showAlerts({ sync, playback, channelId: channel.id });
    return;
  }

  if (isEmergencyChannel(channel)) {
    showEmergency({ sync, playback, channelId: channel.id });
    return;
  }

  const sourceQueue = [channel.url, ...(Array.isArray(channel.fallbackUrls) ? channel.fallbackUrls : [])].filter(Boolean);
  const attemptToken = ++playbackAttemptToken;
  clearTimeout(playbackRetryTimer);
  playbackRetryTimer = null;

  currentMode = 'channel';
  currentPlayback = normalizedPlayback;
  currentChannelId = channel.id;
  lastLiveChannelId = channel.id;

  clearActiveButtons();
  const btn = document.querySelector(`[data-channel-id="${channel.id}"]`);
  if (btn) btn.classList.add('active');

  weatherView.classList.add('hidden');
  alertsView.classList.add('hidden');
  emergencyView.classList.add('hidden');
  updateScreenOverlays(playback);
  videoWrap.classList.remove('hidden');
  applyVideoPresentation(channel);
  stopAlertsRefresh();

  stopCurrentPlayback();

  if (sourceQueue.length === 0) {
    statusText.textContent = `${channel.name} stream URL is not configured`;
    return;
  }

  function playSourceAt(index) {
    if (attemptToken !== playbackAttemptToken) return;

    const sourceUrl = sourceQueue[index];
    if (!sourceUrl) {
      postDiagnosticLog('error', 'channel_source_missing', {
        channelId: channel.id,
        sourceIndex: index
      });
      statusText.textContent = `Unable to play ${channel.name} from available sources`;
      return;
    }

    postDiagnosticLog('info', 'channel_source_attempt', {
      channelId: channel.id,
      channelName: channel.name,
      sourceIndex: index,
      sourceCount: sourceQueue.length,
      sourceUrl
    });

    statusText.textContent =
      index === 0 ? `Playing ${channel.name}` : `Trying backup stream ${index + 1} for ${channel.name}`;

    clearTimeout(playbackRetryTimer);
    playbackRetryTimer = null;
    stopCurrentPlayback();

    recoverCurrentSource = (reason, options = {}) => {
      const {
        delay = 350,
        useNextSource = false
      } = options;

      clearTimeout(sourceRecoveryTimer);
      postDiagnosticLogRateLimited(`source_recovery_${reason}`, 1200, 'warn', 'source_recovery_scheduled', {
        reason,
        channelId: channel.id,
        channelName: channel.name,
        sourceIndex: index,
        sourceCount: sourceQueue.length,
        sourceUrl,
        useNextSource
      });

      sourceRecoveryTimer = setTimeout(() => {
        sourceRecoveryTimer = null;
        if (attemptToken !== playbackAttemptToken) return;

        if (useNextSource && index + 1 < sourceQueue.length) {
          playSourceAt(index + 1);
          return;
        }

        playSourceAt(index);
      }, delay);
    };

    if (isHlsStream(sourceUrl) && window.Hls && Hls.isSupported()) {
      hls = new Hls({
        lowLatencyMode: hlsRuntimeConfig.lowLatencyMode,
        liveSyncDurationCount: hlsRuntimeConfig.liveSyncDurationCount,
        liveMaxLatencyDurationCount: hlsRuntimeConfig.liveMaxLatencyDurationCount,
        backBufferLength: hlsRuntimeConfig.backBufferLength,
        maxBufferLength: hlsRuntimeConfig.maxBufferLength,
        maxMaxBufferLength: hlsRuntimeConfig.maxMaxBufferLength,
        maxBufferHole: hlsRuntimeConfig.maxBufferHole,
        highBufferWatchdogPeriod: hlsRuntimeConfig.highBufferWatchdogPeriod
      });
      hls.loadSource(sourceUrl);
      hls.attachMedia(player);

      const selectPreferredAudioTrack = (audioTracks = hls.audioTracks || []) => {
        const preferredIndex = getPreferredAudioTrackIndex(audioTracks);
        if (preferredIndex === -1 || hls.audioTrack === preferredIndex) {
          return;
        }

        hls.audioTrack = preferredIndex;
        postDiagnosticLog('info', 'hls_audio_track_selected', {
          channelId: channel.id,
          sourceIndex: index,
          sourceUrl,
          audioTrackIndex: preferredIndex,
          audioTrack: audioTracks[preferredIndex] || null
        });
      };

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        selectPreferredAudioTrack();
        postDiagnosticLog('info', 'hls_manifest_parsed', {
          channelId: channel.id,
          sourceIndex: index,
          sourceUrl
        });
        applyPlaybackState(playback, { afterLoad: true });
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
        selectPreferredAudioTrack(data?.audioTracks || []);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('HLS error', data);
        postDiagnosticLogRateLimited('hls_error', 1000, 'error', 'hls_error', {
          channelId: channel.id,
          sourceIndex: index,
          sourceUrl,
          data
        });

        const detail = String(data?.details || '');
        const isAudioPipelineError = data?.parent === 'audio' || detail === 'bufferAppendError';

        if (!data?.fatal) {
          if (detail === 'bufferStalledError') {
            if (!shouldUseGentleLiveRecovery()) {
              hls.startLoad();
              schedulePlaybackRetry(250);
            }
            return;
          }

          if (isAudioPipelineError) {
            recoverCurrentSource?.('nonfatal_audio_pipeline_error', {
              delay: 300,
              useNextSource: index + 1 < sourceQueue.length
            });
            return;
          }

          return;
        }

        if (data?.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
            schedulePlaybackRetry(200);
            recoverCurrentSource?.('fatal_network_error', {
              delay: 1400,
              useNextSource: index + 1 < sourceQueue.length
            });
            return;
          }

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            if (isAudioPipelineError || detail === 'fragParsingError') {
              recoverCurrentSource?.('fatal_media_reload', {
                delay: 300,
                useNextSource: index + 1 < sourceQueue.length
              });
              return;
            }

            hls.recoverMediaError();
            schedulePlaybackRetry(150);
            return;
          }

          if (index + 1 < sourceQueue.length) {
            playSourceAt(index + 1);
            return;
          }

          recoverCurrentSource?.('fatal_unknown_error', { delay: 500 });
          return;
        }
        statusText.textContent = `Error while playing ${channel.name}`;
      });
      return;
    }

    player.src = sourceUrl;
    player.load();
    postDiagnosticLog('info', 'html5_source_loaded', {
      channelId: channel.id,
      sourceIndex: index,
      sourceUrl
    });
    if (playback === 'paused') {
      applyPlaybackState(playback);
      return;
    }

    attemptPlaybackStart({
      failureText: `Loaded ${channel.name}. Press Start on the remote if autoplay is blocked.`
    }).then((started) => {
      if (started) {
        applyPlaybackState(playback);
        return;
      }

      if (index + 1 < sourceQueue.length) {
        playSourceAt(index + 1);
        return;
      }
    });
  }

  playSourceAt(0);

  if (sync) {
    postControlState({ mode: 'channel', channelId: channel.id, playback: 'playing' });
  }
}

async function showWeather(options = {}) {
  const { sync = true, playback = currentPlayback, cityId = currentWeatherCityId } = options;

  currentMode = 'weather';
  currentChannelId = null;

  clearActiveButtons();
  weatherButton.classList.add('active');

  cancelPendingPlayback();
  stopAlertsRefresh();
  stopCurrentPlayback();
  hideScreenViews();
  updateScreenOverlays(playback);
  weatherView.classList.remove('hidden');
  weatherView.scrollTop = 0;

  statusText.textContent = 'Loading weather...';

  try {
    const query = new URLSearchParams();
    if (cityId) {
      query.set('city', cityId);
    }

    const response = await fetch(`/api/weather/current?${query.toString()}`);
    if (!response.ok) throw new Error('Weather fetch failed');
    const data = await response.json();
    currentWeatherCityId = data.city?.id || cityId || currentWeatherCityId;
    weatherCitySelect.value = currentWeatherCityId;
    if (weatherPanelCitySelect) {
      weatherPanelCitySelect.value = currentWeatherCityId;
    }
    updateFavoriteButton();

    const current = data.current;
    const hourly = data.hourly || {};
    const daily = data.daily || {};
    const airQuality = data.airQuality?.current || {};
    const currentIndex = getHourlyStartIndex(hourly, current.time);
    const currentRainChance = Math.round(hourly.precipitation_probability?.[currentIndex] ?? daily.precipitation_probability_max?.[0] ?? 0);
    const currentUv = Number(hourly.uv_index?.[currentIndex] ?? daily.uv_index_max?.[0] ?? 0);
    const nextPressure = Number(hourly.pressure_msl?.[Math.min(currentIndex + 1, (hourly.pressure_msl?.length || 1) - 1)] ?? current.pressure_msl);
    const aqi = Number.isFinite(airQuality.us_aqi) ? Math.round(airQuality.us_aqi) : null;

    weatherCityTitle.textContent = `📍 ${data.city?.name || 'Selected city'}`;
    weatherIcon.textContent = weatherCodeIcon(current.weather_code);
    weatherTemp.textContent = `${Math.round(current.temperature_2m)}°C`;
    weatherCondition.textContent = weatherCodeText(current.weather_code);
    weatherFeelsLike.textContent = `${Math.round(current.apparent_temperature)}°C`;
    weatherHighLow.textContent = `${Math.round(daily.temperature_2m_max?.[0] ?? current.temperature_2m)}° / ${Math.round(
      daily.temperature_2m_min?.[0] ?? current.temperature_2m
    )}°`;
    weatherInsight.textContent = buildWeatherInsight({ current, daily, hourly, currentIndex });

    windValue.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    windNote.textContent = `${windDirectionText(current.wind_direction_10m)} gusts ${Math.round(current.wind_gusts_10m ?? current.wind_speed_10m)} km/h`;

    humidityValue.textContent = `${Math.round(current.relative_humidity_2m)}%`;
    humidityNote.textContent = humidityComfortText(current.relative_humidity_2m);

    cloudValue.textContent = `${Math.round(current.cloud_cover)}%`;
    cloudNote.textContent = cloudCoverText(current.cloud_cover);

    rainChanceValue.textContent = `${currentRainChance}%`;
    rainChanceNote.textContent = rainChanceText(currentRainChance);

    uvValue.textContent = currentUv.toFixed(1);
    uvNote.textContent = uvSeverityText(currentUv);

    aqiValue.textContent = aqi === null ? '--' : `${aqi}`;
    aqiNote.textContent = aqi === null ? 'Unavailable' : aqiLabel(aqi);

    pressureValue.textContent = `${Math.round(current.pressure_msl)} hPa`;
    pressureNote.textContent = pressureTrendText(current.pressure_msl, nextPressure);

    renderHourlyForecast(hourly, currentIndex);
    renderDailyForecast(daily);

    statusText.textContent = 'Weather updated';
  } catch (error) {
    console.error(error);
    weatherCityTitle.textContent = '📍 Weather unavailable';
    weatherTemp.textContent = '--°C';
    weatherCondition.textContent = 'Failed to load weather data';
    weatherFeelsLike.textContent = '--°C';
    weatherHighLow.textContent = '-- / --';
    weatherInsight.textContent = 'Unable to gather weather insight right now.';
    windValue.textContent = '--';
    windNote.textContent = '--';
    humidityValue.textContent = '--';
    humidityNote.textContent = '--';
    cloudValue.textContent = '--';
    cloudNote.textContent = '--';
    rainChanceValue.textContent = '--';
    rainChanceNote.textContent = '--';
    uvValue.textContent = '--';
    uvNote.textContent = '--';
    aqiValue.textContent = '--';
    aqiNote.textContent = '--';
    pressureValue.textContent = '--';
    pressureNote.textContent = '--';
    hourlyForecast.innerHTML = '';
    forecastList.innerHTML = '';
    statusText.textContent = 'Weather unavailable';
  }

  applyPlaybackState(playback);
  syncWeatherAutoscroll({ reset: true });

  if (sync) {
    postControlState({ mode: 'weather', weatherCityId: currentWeatherCityId, playback: 'playing' });
  }
}

async function showAlerts(options = {}) {
  const { sync = true, playback = currentPlayback, channelId = '14' } = options;

  currentMode = 'alerts';
  currentChannelId = channelId;

  clearActiveButtons();
  const btn = document.querySelector(`[data-channel-id="${channelId}"]`);
  if (btn) btn.classList.add('active');
  if (newsButton) newsButton.classList.add('active');

  cancelPendingPlayback();
  stopCurrentPlayback();
  hideScreenViews();
  updateScreenOverlays(playback);
  alertsView.classList.remove('hidden');
  stopWeatherAutoscroll();

  statusText.textContent = 'Loading alerts...';
  await loadAlertsData();
  applyPlaybackState(playback);

  if (sync) {
    postControlState({ mode: 'channel', channelId, playback: 'playing' });
  }
}

function showEmergency(options = {}) {
  const { sync = true, playback = currentPlayback, channelId = '15' } = options;

  currentMode = 'emergency';
  currentChannelId = channelId;

  clearActiveButtons();
  const btn = document.querySelector(`[data-channel-id="${channelId}"]`);
  if (btn) btn.classList.add('active');

  cancelPendingPlayback();
  stopAlertsRefresh();
  stopCurrentPlayback();
  hideScreenViews();
  updateScreenOverlays(playback);
  emergencyView.classList.remove('hidden');
  stopWeatherAutoscroll();

  statusText.textContent = 'Emergency numbers ready';
  applyPlaybackState(playback);

  if (sync) {
    postControlState({ mode: 'channel', channelId, playback: 'playing' });
  }
}

function showSetup(options = {}) {
  const { playback = currentPlayback } = options;

  currentMode = 'setup';
  currentChannelId = null;

  clearActiveButtons();
  setupButton?.classList.add('active');

  cancelPendingPlayback();
  stopAlertsRefresh();
  stopCurrentPlayback();
  hideScreenViews();
  updateScreenOverlays(playback);
  setupView?.classList.remove('hidden');
  stopWeatherAutoscroll();

  statusText.textContent = 'Setup screen ready';
  applyPlaybackState(playback);
}

async function applyControlState(state) {
  if (!state || typeof state !== 'object') return;

  postDiagnosticLogRateLimited('control_apply', 250, 'debug', 'control_state_apply', {
    source: state.source,
    updatedAt: state.updatedAt,
    mode: state.mode,
    channelId: state.channelId,
    playback: state.playback,
    weatherCityId: state.weatherCityId,
    refreshRequestedAt: state.refreshRequestedAt,
    browserBackRequestedAt: state.browserBackRequestedAt
  });

  if (typeof state.refreshRequestedAt === 'number' && state.refreshRequestedAt > latestRefreshRequestAt) {
    rememberRefreshRequest(state.refreshRequestedAt);
    postDiagnosticLog('warn', 'browser_refresh_requested_via_state', {
      refreshRequestedAt: state.refreshRequestedAt,
      source: state.source
    });
    window.location.reload();
    return;
  }

  if (typeof state.browserBackRequestedAt === 'number' && state.browserBackRequestedAt > latestBrowserBackRequestAt) {
    rememberBrowserBackRequest(state.browserBackRequestedAt);
    postDiagnosticLog('warn', 'browser_back_requested_via_state', {
      browserBackRequestedAt: state.browserBackRequestedAt,
      source: state.source,
      historyLength: window.history.length
    });
    window.history.back();
    return;
  }

  const previousMode = currentMode;
  const previousChannelId = currentChannelId;
  const previousWeatherCityId = currentWeatherCityId;

  if (typeof state.updatedAt === 'number') {
    if (state.updatedAt <= latestControlTimestamp) return;
    latestControlTimestamp = state.updatedAt;
    if (shouldTreatControlUpdateAsActivity(state.source)) {
      registerActivity(state.updatedAt);
    }
  }

  if (typeof state.volume === 'number') {
    setVolume(state.volume / 100, { showStatus: false, sync: false });
  }

  if (typeof state.lastVolume === 'number' && Number.isFinite(state.lastVolume)) {
    lastAudibleVolume = clamp(state.lastVolume / 100, 0, 1);
    if (lastAudibleVolume > 0) {
      rememberLastAudibleVolume(lastAudibleVolume);
    }
  }

  if (typeof state.muted === 'boolean') {
    setMuted(state.muted, { showStatus: false, sync: false });
  }

  if (typeof state.weatherCityId === 'string' && weatherCities.some((city) => city.id === state.weatherCityId)) {
    currentWeatherCityId = state.weatherCityId;
    weatherCitySelect.value = currentWeatherCityId;
    if (weatherPanelCitySelect) {
      weatherPanelCitySelect.value = currentWeatherCityId;
    }
  }

  if (state.weatherAutoscroll === 'playing' || state.weatherAutoscroll === 'paused') {
    weatherAutoscrollState = state.weatherAutoscroll;
  }

  if (typeof state.fullscreen === 'boolean' && state.fullscreen !== currentFullscreen) {
    await setFullscreen(state.fullscreen, { sync: false });
  }

  const playback = state.playback === 'paused' || state.playback === 'stopped' ? state.playback : 'playing';

  if (state.mode === 'weather') {
    const shouldReloadWeather =
      previousMode !== 'weather' ||
      state.weatherCityId !== undefined && state.weatherCityId !== previousWeatherCityId;

    if (shouldReloadWeather) {
      await showWeather({ sync: false, playback, cityId: currentWeatherCityId });
    } else {
      applyPlaybackState(playback);
      syncWeatherAutoscroll();
      updateStatusForState();
    }
    return;
  }

  if (state.mode === 'channel' && typeof state.channelId === 'string') {
    const channel = channelsById.get(state.channelId);
    if (channel) {
      const shouldReloadChannel = previousMode !== 'channel' || previousChannelId !== state.channelId;
      if (shouldReloadChannel) {
        playChannel(channel, { sync: false, playback });
      } else {
        applyPlaybackState(playback);
        updateStatusForState();
      }
      return;
    }
  }

  applyPlaybackState(playback);
}

function setupControlSync() {
  postDiagnosticLog('info', 'control_sync_setup_start', {});
  fetch('/api/control/state')
    .then((res) => res.json())
    .then((state) => {
      postDiagnosticLog('info', 'control_sync_initial_state_loaded', {
        source: state?.source,
        updatedAt: state?.updatedAt
      });
      applyControlState(state);
    })
    .catch((error) => {
      console.error('Failed to load control state:', error);
      postDiagnosticLog('error', 'control_sync_initial_state_failed', {
        message: error?.message || String(error)
      });
    });

  const events = new EventSource('/api/control/events');
  events.onmessage = (event) => {
    try {
      const state = JSON.parse(event.data);
      applyControlState(state);
    } catch (error) {
      console.error('Control event parse error:', error);
      postDiagnosticLog('error', 'control_event_parse_error', {
        message: error?.message || String(error),
        raw: String(event?.data || '').slice(0, 500)
      });
    }
  };

  events.onerror = () => {
    statusText.textContent = 'Remote link lost, reconnecting...';
    postDiagnosticLogRateLimited('control_event_error', 2000, 'error', 'control_event_stream_error', {});
  };
}

function setupIdleDarkMode() {
  registerActivity(Date.now());

  ['pointerdown', 'pointermove', 'mousemove', 'keydown', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      registerLocalActivity();
    }, { passive: true });
  });

  window.addEventListener('focus', () => {
    registerLocalActivity();
    setVolume(currentVolume, { showStatus: false, sync: false });
  });

  window.addEventListener('pageshow', () => {
    registerLocalActivity();
    setVolume(currentVolume, { showStatus: false, sync: false });
    if (currentMode === 'channel' && currentPlayback === 'playing' && player.paused) {
      schedulePlaybackRetry(80);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setVolume(currentVolume, { showStatus: false, sync: false });
    }
    if (!document.hidden && currentMode === 'channel' && currentPlayback === 'playing' && player.paused) {
      schedulePlaybackRetry(80);
    }
  });
}

function setupPlayerEvents() {
  player.playsInline = true;
  player.autoplay = true;
  player.preload = 'auto';

  player.addEventListener('playing', () => {
    clearTimeout(playbackRetryTimer);
    playbackRetryTimer = null;
    restorePlayerAudio();
    postDiagnosticLogRateLimited('player_playing', 5000, 'info', 'player_playing', {
      src: player.currentSrc,
      paused: player.paused,
      muted: player.muted,
      volume: player.volume
    });
    updateStatusForState();
  });

  player.addEventListener('loadedmetadata', () => {
    setVolume(currentVolume, { showStatus: false, sync: false });
    if (currentMode === 'channel' && currentPlayback === 'playing') {
      schedulePlaybackRetry(120);
    }
  });

  player.addEventListener('loadeddata', () => {
    setVolume(currentVolume, { showStatus: false, sync: false });
    if (currentMode === 'channel' && currentPlayback === 'playing' && player.paused) {
      schedulePlaybackRetry(120);
    }
  });

  player.addEventListener('canplay', () => {
    setVolume(currentVolume, { showStatus: false, sync: false });
    if (currentMode === 'channel' && currentPlayback === 'playing' && player.paused) {
      schedulePlaybackRetry(150);
    }
  });

  player.addEventListener('pause', () => {
    postDiagnosticLogRateLimited('player_pause', 800, 'warn', 'player_pause', {
      src: player.currentSrc,
      currentTime: player.currentTime,
      readyState: player.readyState,
      networkState: player.networkState,
      suppressPauseSync
    });

    if (suppressPauseSync) {
      return;
    }

    if (currentMode === 'channel' && currentPlayback === 'playing' && Boolean(player.currentSrc)) {
      postDiagnosticLogRateLimited('player_pause_retry', 1200, 'warn', 'player_pause_retry', {
        src: player.currentSrc,
        currentTime: player.currentTime,
        readyState: player.readyState,
        networkState: player.networkState
      });
      if (shouldUseGentleLiveRecovery() && player.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        updateStatusForState();
        return;
      }
      statusText.textContent = 'Playback paused unexpectedly. Retrying...';
      schedulePlaybackRetry(120);
      updateStatusForState();
    }
  });

  player.addEventListener('stalled', () => {
    postDiagnosticLogRateLimited('player_stalled', 1200, 'error', 'player_stalled', {
      src: player.currentSrc,
      currentTime: player.currentTime,
      readyState: player.readyState,
      networkState: player.networkState
    });

    if (currentMode === 'channel' && currentPlayback === 'playing') {
      statusText.textContent = shouldUseGentleLiveRecovery() ? 'Stream buffering...' : 'Stream stalled. Retrying...';
      if (!shouldUseGentleLiveRecovery()) {
        schedulePlaybackRetry();
      }
    }
  });

  player.addEventListener('waiting', () => {
    postDiagnosticLogRateLimited('player_waiting', 2000, 'warn', 'player_waiting', {
      src: player.currentSrc,
      currentTime: player.currentTime,
      readyState: player.readyState,
      networkState: player.networkState
    });

    if (currentMode === 'channel' && currentPlayback === 'playing') {
      statusText.textContent = 'Buffering live stream...';
    }
  });

  player.addEventListener('error', () => {
    const mediaError = player.error
      ? {
          code: player.error.code,
          message: player.error.message || ''
        }
      : null;

    postDiagnosticLog('error', 'player_error', {
      src: player.currentSrc,
      currentTime: player.currentTime,
      readyState: player.readyState,
      networkState: player.networkState,
      mediaError
    });

    if (currentMode === 'channel' && currentPlayback === 'playing') {
      statusText.textContent = 'Video error detected. Retrying...';
      if (mediaError?.code === 3) {
        recoverCurrentSource?.('player_decode_error', { delay: 250 });
        return;
      }
      schedulePlaybackRetry();
    }
  });
}

async function init() {
  window.addEventListener('error', (event) => {
    postDiagnosticLog('error', 'window_error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error?.stack || ''
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    postDiagnosticLog('error', 'window_unhandled_rejection', {
      message: typeof reason === 'string' ? reason : (reason?.message || String(reason)),
      stack: reason?.stack || ''
    });
  });

  postDiagnosticLog('info', 'tv_client_init', {
    userAgent: navigator.userAgent,
    language: navigator.language
  });

  setInterval(() => {
    if (!shouldLogHeartbeat()) {
      return;
    }

    postDiagnosticLog('debug', 'tv_client_heartbeat', {
      mode: currentMode,
      channelId: currentChannelId,
      playback: currentPlayback,
      hidden: document.hidden,
      paused: player.paused,
      readyState: player.readyState,
      networkState: player.networkState,
      src: player.currentSrc
    });
  }, 60000);

  await fetch('/api/runtime-config')
    .then((res) => res.ok ? res.json() : null)
    .then((config) => {
      if (!config || typeof config !== 'object') return;

      if (typeof config.alertsRefreshMs === 'number' && Number.isFinite(config.alertsRefreshMs)) {
        alertsRefreshIntervalMs = Math.max(5000, Math.round(config.alertsRefreshMs));
      }

      if (typeof config.clientDiagnosticsEnabled === 'boolean') {
        clientDiagnosticsEnabled = config.clientDiagnosticsEnabled;
      }

      if (typeof config.remoteControlUrl === 'string') {
        updateRemoteLink(config.remoteControlUrl);
      }

      if (config.hlsConfig && typeof config.hlsConfig === 'object') {
        hlsRuntimeConfig = {
          ...hlsRuntimeConfig,
          ...config.hlsConfig
        };
      }

      if (typeof config.tvNewsPageLimit === 'number' && Number.isFinite(config.tvNewsPageLimit)) {
        alertsNewsPageLimit = Math.max(1, Math.round(config.tvNewsPageLimit));
      }

      if (typeof config.tvNewsMaxAgeMinutes === 'number' && Number.isFinite(config.tvNewsMaxAgeMinutes)) {
        alertsNewsMaxAgeMinutes = Math.max(1, Math.round(config.tvNewsMaxAgeMinutes));
      }

      if (typeof config.alertsNewsScrollDurationMs === 'number' && Number.isFinite(config.alertsNewsScrollDurationMs)) {
        alertsNewsScrollDurationMs = Math.max(1000, Math.round(config.alertsNewsScrollDurationMs));
      }

      if (typeof config.alertsNewsScrollPauseMs === 'number' && Number.isFinite(config.alertsNewsScrollPauseMs)) {
        alertsNewsScrollPauseMs = Math.max(0, Math.round(config.alertsNewsScrollPauseMs));
      }

      if (Array.isArray(config.emergencyContacts)) {
        emergencyContacts = config.emergencyContacts
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => ({
            name: String(entry.name || '').trim(),
            number: String(entry.number || '').trim(),
            primary: entry.primary === true
          }))
          .filter((entry) => entry.name && entry.number);
      }

      if (!hasSavedVolume() && typeof config.defaultVolume === 'number' && Number.isFinite(config.defaultVolume)) {
        currentVolume = clamp(config.defaultVolume / 100, 0, 1);
      }

      if (!hasSavedMuted() && typeof config.defaultMuted === 'boolean') {
        currentMuted = config.defaultMuted;
      }
    })
    .catch((error) => {
      console.error('Failed to load runtime config:', error);
    });

  renderEmergencyContacts();

  await loadWeatherCities();

  const response = await fetch('/api/channels');
  const channels = await response.json();

  channelsById = new Map(channels.map((ch) => [ch.id, ch]));

  sortChannelsForPanel(channels).forEach((channel) => {
    if (isAlertsChannel(channel)) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-btn';
    button.dataset.channelId = channel.id;
    if (isEmergencyChannel(channel)) {
      button.classList.add('emergency-nav-btn');
    }
    button.setAttribute('aria-label', channel.name);
    button.setAttribute('title', channel.name);
    button.innerHTML = `<span class="channel-number">${getChannelButtonLabel(channel)}</span>`;
    button.addEventListener('click', () => playChannel(channel));
    channelButtons.appendChild(button);
  });

  newsButton.addEventListener('click', () => showAlerts());
  alertsNewsList.addEventListener('mouseenter', () => {
    isAlertsNewsHovered = true;
    stopAlertsNewsAutoscroll();
  });
  alertsNewsList.addEventListener('mouseleave', () => {
    isAlertsNewsHovered = false;
    startAlertsNewsAutoscroll();
  });
  weatherButton.addEventListener('click', () => {
    if (currentMode === 'weather') {
      returnToLiveChannel();
      return;
    }

    showWeather();
  });
  setupButton?.addEventListener('click', () => {
    if (currentMode === 'setup') {
      returnToLiveChannel();
      return;
    }

    showSetup();
  });
  muteButton?.addEventListener('click', () => {
    setMuted(!isEffectivelyMuted());
  });
  weatherCitySelect.addEventListener('change', () => {
    currentWeatherCityId = weatherCitySelect.value;
    if (weatherPanelCitySelect) {
      weatherPanelCitySelect.value = currentWeatherCityId;
    }
    if (currentMode === 'weather') {
      showWeather({ sync: true, playback: currentPlayback, cityId: currentWeatherCityId });
    }
  });
  weatherPanelCitySelect?.addEventListener('change', () => {
    currentWeatherCityId = weatherPanelCitySelect.value;
    weatherCitySelect.value = currentWeatherCityId;
    showWeather({ sync: true, playback: 'playing', cityId: currentWeatherCityId });
  });
  weatherFavoriteButton.addEventListener('click', () => {
    favoriteWeatherCityId = currentWeatherCityId;
    updateFavoriteButton();
  });
  weatherView.addEventListener('dblclick', () => {
    if (currentMode === 'weather' && currentFullscreen) {
      returnToLiveChannel();
    }
  });
  emergencyView.addEventListener('dblclick', () => {
    if (currentMode === 'emergency' && currentFullscreen) {
      returnToLiveChannel();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (currentMode === 'weather' || currentMode === 'emergency' || currentMode === 'setup')) {
      if (currentFullscreen) {
        return;
      }

      returnToLiveChannel({ sync: true, playback: currentPlayback });
    }
  });

  setupVolumeDial();
  setupFullscreenButton();
  setupPlayerEvents();
  setupControlSync();
  setupIdleDarkMode();
}

init().catch((error) => {
  console.error(error);
  statusText.textContent = 'Initialization failed';
});
