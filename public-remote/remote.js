const channelButtons = document.getElementById('channelButtons');
const newsButton = document.getElementById('newsButton');
const weatherButton = document.getElementById('weatherButton');
const emergencyButton = document.getElementById('emergencyButton');
const menuButton = document.getElementById('menuButton');
const menuBackdrop = document.getElementById('menuBackdrop');
const remoteMenu = document.getElementById('remoteMenu');
const minimizeButton = document.getElementById('minimizeButton');
const fullscreenButton = document.getElementById('fullscreenButton');
const fullscreenButtonVolume = document.getElementById('fullscreenButtonVolume');
const refreshButton = document.getElementById('refreshButton');
const backButton = document.getElementById('backButton');
const powerButton = document.getElementById('powerButton');
const audioRedirectButton = document.getElementById('audioRedirectButton');
const audioResetButton = document.getElementById('audioResetButton');
const beepButton = document.getElementById('beepButton');
const audioRedirectPlayer = document.getElementById('audioRedirectPlayer');
const weatherCitySelect = document.getElementById('weatherCitySelect');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const volumeSlider = document.getElementById('volumeSlider');
const volumeLabel = document.getElementById('volumeLabel');
const muteButtonRemote = document.getElementById('muteButtonRemote');
const statusText = document.getElementById('statusText');

let channelsById = new Map();
let alertsChannelId = '14';
let weatherCities = [];
let currentWeatherCityId = 'bat-hefer';
let lastLiveChannelId = null;
let currentControlState = null;
let isMenuOpen = false;
let isAudioRedirectEnabled = false;
let currentAudioRedirectChannelId = null;
let currentAudioRedirectSourceUrl = '';
let lastAudibleVolume = 70;
let audioRedirectHls = null;
let audioRedirectAttemptToken = 0;
let beepHoldInterval = null;
let beepHoldInFlight = false;

function getRemoteChannelMarkup(channel) {
  if (channel?.id === '16') {
    return `
      <span class="channel-number remote-camera-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <rect x="2" y="5" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect>
          <path d="M17 7.5l5-3v13l-5-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
        </svg>
      </span>
    `;
  }

  return `<span class="channel-number">${channel.id}</span>`;
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

function setStatus(text) {
  statusText.textContent = text;
}

function setMenuOpen(open) {
  isMenuOpen = open;
  remoteMenu.hidden = !open;
  menuBackdrop.hidden = !open;
  menuButton.classList.toggle('active', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.title = open ? 'Close menu' : 'Open menu';
  menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

function closeMenu() {
  setMenuOpen(false);
}

function destroyAudioRedirectPlayback() {
  audioRedirectAttemptToken += 1;
  currentAudioRedirectChannelId = null;
  currentAudioRedirectSourceUrl = '';

  if (audioRedirectHls) {
    audioRedirectHls.destroy();
    audioRedirectHls = null;
  }

  audioRedirectPlayer.pause();
  audioRedirectPlayer.removeAttribute('src');
  audioRedirectPlayer.load();
}

function setAudioRedirectEnabled(enabled) {
  isAudioRedirectEnabled = enabled;
  audioRedirectButton.classList.toggle('active', enabled);
  audioRedirectButton.title = enabled ? 'Stop audio redirect' : 'Start audio redirect';
  audioRedirectButton.setAttribute('aria-label', enabled ? 'Stop audio redirect' : 'Start audio redirect');

  if (!enabled) {
    destroyAudioRedirectPlayback();
  }
}

function getPrimaryChannelSource(channelId) {
  const channel = channelsById.get(channelId);
  if (!channel || isSpecialChannel(channel)) {
    return null;
  }

  const sources = [channel.url, ...(Array.isArray(channel.fallbackUrls) ? channel.fallbackUrls : [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return sources[0] || null;
}

async function startAudioRedirectForChannel(channelId) {
  const attemptToken = ++audioRedirectAttemptToken;
  const sourceUrl = getPrimaryChannelSource(channelId);
  const channel = channelsById.get(channelId);

  if (!sourceUrl || !channel) {
    throw new Error('This channel does not have a redirectable audio stream');
  }

  if (currentAudioRedirectChannelId === channelId && currentAudioRedirectSourceUrl === sourceUrl && !audioRedirectPlayer.paused) {
    return;
  }

  destroyAudioRedirectPlayback();

  audioRedirectPlayer.volume = 1;
  audioRedirectPlayer.muted = false;
  audioRedirectPlayer.autoplay = true;

  if (window.Hls && window.Hls.isSupported() && sourceUrl.toLowerCase().includes('.m3u8')) {
    await new Promise((resolve, reject) => {
      const hls = new window.Hls();
      audioRedirectHls = hls;

      const cleanup = () => {
        hls.off(window.Hls.Events.MANIFEST_PARSED, handleManifestParsed);
        hls.off(window.Hls.Events.ERROR, handleError);
      };

      const handleManifestParsed = async () => {
        cleanup();
        try {
          if (attemptToken !== audioRedirectAttemptToken) {
            resolve();
            return;
          }
          await audioRedirectPlayer.play();
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      const handleError = (_event, data) => {
        if (!data?.fatal) {
          return;
        }

        cleanup();
        reject(new Error('Audio redirect stream failed to load'));
      };

      hls.on(window.Hls.Events.MANIFEST_PARSED, handleManifestParsed);
      hls.on(window.Hls.Events.ERROR, handleError);
      hls.loadSource(sourceUrl);
      hls.attachMedia(audioRedirectPlayer);
    });
  } else {
    audioRedirectPlayer.src = sourceUrl;
    if (attemptToken !== audioRedirectAttemptToken) {
      return;
    }
    await audioRedirectPlayer.play();
  }

  if (attemptToken !== audioRedirectAttemptToken) {
    return;
  }

  currentAudioRedirectChannelId = channelId;
  currentAudioRedirectSourceUrl = sourceUrl;
  setStatus(`Audio redirect: ${channel.name}`);
}

async function syncAudioRedirect(state = currentControlState) {
  if (!isAudioRedirectEnabled) {
    return;
  }

  if (
    !state ||
    state.mode !== 'channel' ||
    state.playback === 'stopped' ||
    state.playback === 'paused' ||
    !state.channelId ||
    isSpecialChannel(channelsById.get(state.channelId))
  ) {
    destroyAudioRedirectPlayback();
    setStatus('Audio redirect unavailable for this screen');
    return;
  }

  try {
    await startAudioRedirectForChannel(state.channelId);
  } catch (error) {
    setStatus(error?.message || 'Audio redirect failed');
    setAudioRedirectEnabled(false);
  }
}

async function postControlState(payload) {
  const response = await fetch('/api/control/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, source: 'remote' })
  });

  if (!response.ok) {
    throw new Error('Control command failed');
  }

  return response.json();
}

async function refreshTvBrowser() {
  const response = await fetch('/api/browser/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error('Browser refresh failed');
  }

  return response.json();
}

async function navigateTvBrowserBack() {
  const response = await fetch('/api/browser/back', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error('Browser back failed');
  }

  return response.json();
}

async function closeTvBrowser() {
  const response = await fetch('/api/browser/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error('Browser close failed');
  }

  return response.json();
}

async function triggerPiBeep() {
  const response = await fetch('/api/audio/beep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error('Beep test failed');
  }

  return response.json();
}

async function resetPiAudio() {
  const response = await fetch('/api/audio/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || 'Audio reset failed');
  }

  return payload;
}

async function runBeepOnce() {
  if (beepHoldInFlight) {
    return;
  }

  beepHoldInFlight = true;
  try {
    await triggerPiBeep();
    setStatus('Playing Pi beep...');
  } catch (error) {
    setStatus(error?.message || 'Beep test failed');
  } finally {
    beepHoldInFlight = false;
  }
}

function stopBeepHold() {
  if (beepHoldInterval) {
    clearInterval(beepHoldInterval);
    beepHoldInterval = null;
  }
}

function startBeepHold() {
  if (beepHoldInterval) {
    return;
  }

  runBeepOnce();
  beepHoldInterval = setInterval(() => {
    runBeepOnce();
  }, 900);
}

function populateWeatherCityOptions(cities, defaultCityId) {
  weatherCities = cities;
  currentWeatherCityId = defaultCityId || currentWeatherCityId;
  weatherCitySelect.innerHTML = '';

  cities.forEach((city) => {
    const option = document.createElement('option');
    option.value = city.id;
    option.textContent = city.name;
    option.selected = city.id === currentWeatherCityId;
    weatherCitySelect.appendChild(option);
  });
}

async function loadWeatherCities() {
  const response = await fetch('/api/weather/cities');
  if (!response.ok) {
    throw new Error('Failed to load weather cities');
  }

  const data = await response.json();
  populateWeatherCityOptions(data.cities || [], data.defaultCityId);
}

function clearActiveChannelButtons() {
  document.querySelectorAll('.btn[data-channel-id]').forEach((button) => button.classList.remove('active'));
  newsButton.classList.remove('active');
  weatherButton.classList.remove('active');
  emergencyButton.classList.remove('active');
}

function clearActivePlaybackButtons() {
  [startButton, pauseButton].forEach((button) => button.classList.remove('active'));
}

function applyControlState(state) {
  if (!state) return;
  currentControlState = state;

  if (typeof state.volume === 'number') {
    volumeSlider.value = String(state.volume);
    volumeLabel.textContent = `${state.volume}%`;
  }

  if (typeof state.lastVolume === 'number' && Number.isFinite(state.lastVolume) && state.lastVolume > 0) {
    lastAudibleVolume = Math.round(state.lastVolume);
  }

  const muted = state.muted === true || Number(state.volume) === 0;
  if (muteButtonRemote) {
    muteButtonRemote.classList.toggle('active', muted);
    muteButtonRemote.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    muteButtonRemote.setAttribute('title', muted ? 'Unmute audio' : 'Mute audio');
  }

  if (typeof state.weatherCityId === 'string' && weatherCities.some((city) => city.id === state.weatherCityId)) {
    currentWeatherCityId = state.weatherCityId;
    weatherCitySelect.value = currentWeatherCityId;
  }

  fullscreenButton.classList.toggle('active', state.fullscreen === true);
  fullscreenButton.title = state.fullscreen === true ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreenButton.setAttribute('aria-label', state.fullscreen === true ? 'Exit fullscreen' : 'Enter fullscreen');
  fullscreenButtonVolume.classList.toggle('active', state.fullscreen === true);
  fullscreenButtonVolume.title = state.fullscreen === true ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreenButtonVolume.setAttribute('aria-label', state.fullscreen === true ? 'Exit fullscreen' : 'Enter fullscreen');
  minimizeButton.title = state.fullscreen === true ? 'Minimize TV' : 'TV is already minimized';
  minimizeButton.setAttribute('aria-label', state.fullscreen === true ? 'Minimize TV' : 'TV is already minimized');
  powerButton.classList.toggle('active', state.playback === 'stopped');
  powerButton.title = state.playback === 'stopped' ? 'Turn TV on' : 'Turn TV off';
  powerButton.setAttribute('aria-label', state.playback === 'stopped' ? 'Turn TV on' : 'Turn TV off');

  clearActiveChannelButtons();
  clearActivePlaybackButtons();

  if (state.mode === 'weather') {
    if (state.weatherAutoscroll === 'paused') {
      pauseButton.classList.add('active');
    } else {
      startButton.classList.add('active');
    }
  } else if (state.playback === 'paused') {
    pauseButton.classList.add('active');
  } else {
    startButton.classList.add('active');
  }

  if (state.mode === 'weather') {
    weatherButton.classList.add('active');
    if (state.playback === 'stopped') {
      setStatus('TV stopped');
    } else if (state.weatherAutoscroll === 'paused') {
      setStatus('Weather scroll paused');
    } else {
      const city = weatherCities.find((entry) => entry.id === currentWeatherCityId);
      setStatus(`Weather scrolling${city ? `: ${city.name}` : ''}`);
    }
    syncAudioRedirect(state);
    return;
  }

  if (state.mode === 'channel' && state.channelId) {
    const channel = channelsById.get(state.channelId);
    if (isAlertsChannel(channel)) {
      newsButton.classList.add('active');
      if (state.playback === 'paused') {
        setStatus('Paused News');
      } else if (state.playback === 'stopped') {
        setStatus('Stopped News');
      } else {
        setStatus('News on TV');
      }
      syncAudioRedirect(state);
      return;
    }

    if (isEmergencyChannel(channel)) {
      emergencyButton.classList.add('active');
      if (state.playback === 'paused') {
        setStatus('Paused Emergency');
      } else if (state.playback === 'stopped') {
        setStatus('Stopped Emergency');
      } else {
        setStatus('Emergency on TV');
      }
      syncAudioRedirect(state);
      return;
    }

    lastLiveChannelId = state.channelId;

    const button = document.querySelector(`[data-channel-id="${state.channelId}"]`);
    if (button) {
      button.classList.add('active');
      const channelName = channel ? channel.name : `CH ${state.channelId}`;
      if (state.playback === 'paused') {
        setStatus(`Paused ${channelName}`);
      } else if (state.playback === 'stopped') {
        setStatus(`Stopped ${channelName}`);
      } else {
        setStatus(`Playing ${channelName}`);
      }
    }
  }

  syncAudioRedirect(state);
}

async function init() {
  await loadWeatherCities();

  const channels = await fetch('/api/channels').then((res) => res.json());
  channelsById = new Map(channels.map((ch) => [ch.id, ch]));
  alertsChannelId = channels.find((channel) => channel.type === 'alerts')?.id || alertsChannelId;

  channels.forEach((channel) => {
    if (isSpecialChannel(channel)) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn channel-key';
    button.dataset.channelId = channel.id;
    button.innerHTML = getRemoteChannelMarkup(channel);
    button.addEventListener('click', async () => {
      await postControlState({ mode: 'channel', channelId: channel.id, playback: 'playing' });
    });
    channelButtons.appendChild(button);
  });

  newsButton.addEventListener('click', async () => {
    await postControlState({ mode: 'channel', channelId: alertsChannelId, playback: 'playing' });
  });

  emergencyButton.addEventListener('click', async () => {
    const emergencyChannelId = Array.from(channelsById.values()).find((channel) => isEmergencyChannel(channel))?.id;
    if (emergencyChannelId) {
      await postControlState({ mode: 'channel', channelId: emergencyChannelId, playback: 'playing' });
    }
  });

  weatherButton.addEventListener('click', async () => {
    if (weatherButton.classList.contains('active')) {
      const fallbackChannelId =
        lastLiveChannelId ||
        Array.from(channelsById.values())
          .filter((channel) => !isSpecialChannel(channel))
          .sort((left, right) => Number(left.id) - Number(right.id))[0]?.id;

      if (fallbackChannelId) {
        await postControlState({ mode: 'channel', channelId: fallbackChannelId, playback: 'playing' });
      }
      return;
    }

    await postControlState({ mode: 'weather', weatherCityId: currentWeatherCityId });
  });

  menuButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(!isMenuOpen);
  });

  menuBackdrop.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    closeMenu();
  });

  remoteMenu.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  minimizeButton.addEventListener('click', async () => {
    try {
      const result = await closeTvBrowser();
      setStatus(result?.ok ? 'Closing TV browser...' : 'TV browser already closed');
    } catch (_error) {
      setStatus('Failed to close TV browser');
    }
    closeMenu();
  });

  fullscreenButton.addEventListener('click', async () => {
    const shouldEnableFullscreen = !fullscreenButton.classList.contains('active');
    await postControlState({ fullscreen: shouldEnableFullscreen });
    closeMenu();
  });

  fullscreenButtonVolume.addEventListener('click', async () => {
    const shouldEnableFullscreen = !fullscreenButtonVolume.classList.contains('active');
    await postControlState({ fullscreen: shouldEnableFullscreen });
  });

  refreshButton.addEventListener('click', async () => {
    try {
      await refreshTvBrowser();
      setStatus('Refreshing TV browser...');
    } catch (_error) {
      await postControlState({ refresh: true });
      setStatus('Refreshing TV...');
    }
    closeMenu();
  });

  backButton.addEventListener('click', async () => {
    try {
      const result = await navigateTvBrowserBack();
      if (result?.ok) {
        setStatus('TV browser going back...');
        closeMenu();
        return;
      }
    } catch (_error) {
      // Fall through to the page-level fallback.
    }

    await postControlState({ browserBack: true });
    setStatus('TV page going back...');
    closeMenu();
  });

  audioRedirectButton.addEventListener('click', async () => {
    if (isAudioRedirectEnabled) {
      setAudioRedirectEnabled(false);
      setStatus('Audio redirect off');
      closeMenu();
      return;
    }

    setAudioRedirectEnabled(true);
    await syncAudioRedirect(currentControlState);
    closeMenu();
  });

  audioResetButton.addEventListener('click', async () => {
    try {
      const result = await resetPiAudio();
      const summary = String(result?.output || '')
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('sink_description='));

      if (summary) {
        setStatus(`Audio reset: ${summary.replace('sink_description=', '')}`);
      } else {
        setStatus('Audio reset complete');
      }
    } catch (error) {
      setStatus(error?.message || 'Audio reset failed');
    }

    closeMenu();
  });

  beepButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    startBeepHold();
  });

  beepButton.addEventListener('pointerup', stopBeepHold);
  beepButton.addEventListener('pointercancel', stopBeepHold);
  beepButton.addEventListener('pointerleave', stopBeepHold);

  powerButton.addEventListener('click', async () => {
    if (currentControlState?.playback === 'stopped') {
      const payload = {};

      if (currentControlState?.mode === 'weather') {
        payload.mode = 'weather';
        payload.weatherCityId = currentControlState.weatherCityId || currentWeatherCityId;
      } else {
        const fallbackChannelId =
          currentControlState?.channelId ||
          lastLiveChannelId ||
          Array.from(channelsById.values())
            .filter((channel) => !isSpecialChannel(channel))
            .sort((left, right) => Number(left.id) - Number(right.id))[0]?.id;

        if (fallbackChannelId) {
          payload.mode = 'channel';
          payload.channelId = fallbackChannelId;
        }
      }

      payload.playback = 'playing';
      await postControlState(payload);
      setStatus('Turning TV on...');
      closeMenu();
      return;
    }

    await postControlState({ playback: 'stopped' });
    setStatus('Turning TV off...');
    closeMenu();
  });

  weatherCitySelect.addEventListener('change', async () => {
    currentWeatherCityId = weatherCitySelect.value;
    const payload = { weatherCityId: currentWeatherCityId };
    if (document.body && weatherButton.classList.contains('active')) {
      payload.mode = 'weather';
    }
    await postControlState(payload);
  });

  startButton.addEventListener('click', async () => {
    if (weatherButton.classList.contains('active')) {
      const payload = { weatherAutoscroll: 'playing' };
      if (powerButton.classList.contains('active')) {
        payload.playback = 'playing';
      }
      await postControlState(payload);
      return;
    }

    await postControlState({ playback: 'playing' });
  });

  pauseButton.addEventListener('click', async () => {
    if (weatherButton.classList.contains('active')) {
      await postControlState({ weatherAutoscroll: 'paused' });
      return;
    }

    await postControlState({ playback: 'paused' });
  });

  volumeSlider.addEventListener('input', async () => {
    const value = Number(volumeSlider.value);
    volumeLabel.textContent = `${value}%`;
    if (value > 0) {
      lastAudibleVolume = value;
    }
    await postControlState({
      volume: value,
      lastVolume: value > 0 ? value : lastAudibleVolume,
      muted: value === 0
    });
  });

  muteButtonRemote?.addEventListener('click', async () => {
    const currentlyMuted = currentControlState?.muted === true || Number(currentControlState?.volume) === 0;
    if (currentlyMuted) {
      const restoredVolume = Math.max(1, Number(currentControlState?.lastVolume) || lastAudibleVolume || 70);
      lastAudibleVolume = restoredVolume;
      await postControlState({ muted: false, volume: restoredVolume, lastVolume: restoredVolume });
      return;
    }

    const rememberedVolume = Math.max(1, Number(currentControlState?.volume) || lastAudibleVolume || 70);
    lastAudibleVolume = rememberedVolume;
    await postControlState({ muted: true, volume: 0, lastVolume: rememberedVolume });
  });

  const initialState = await fetch('/api/control/state').then((res) => res.json());
  applyControlState(initialState);

  const events = new EventSource('/api/control/events');
  events.onmessage = (event) => {
    try {
      const state = JSON.parse(event.data);
      applyControlState(state);
    } catch (error) {
      console.error(error);
    }
  };

  events.onerror = () => {
    setStatus('Connection lost. Reconnecting...');
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isMenuOpen) {
      closeMenu();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isMenuOpen) {
      return;
    }

    if (menuButton.contains(event.target) || remoteMenu.contains(event.target)) {
      return;
    }

    closeMenu();
  });
}

init().catch((error) => {
  console.error(error);
  setStatus('Failed to initialize remote');
});
