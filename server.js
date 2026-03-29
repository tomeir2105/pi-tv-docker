const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const QRCode = require('qrcode');
const WebSocket = require('ws');
require('dotenv').config();

const tvApp = express();
const remoteApp = express();

const tvPort = Number(process.env.PORT || 3000);
const remotePort = Number(process.env.REMOTE_PORT || 3001);
const remoteControlUrl = String(process.env.REMOTE_CONTROL_URL || '').trim();
const kioskRestartScriptPath = path.join(__dirname, 'scripts', 'restart-kiosk-browser.sh');
const logsDirPath = path.join(__dirname, 'logs');
const dataDirPath = path.join(__dirname, 'data');
const settingsFilePath = path.join(dataDirPath, 'settings.json');
const rtspRelayRootDirPath = path.join(__dirname, '.tmp', 'rtsp-relay');
const customBeepSoundPath = path.join(__dirname, 'public', 'beep.mp3');
const piBeepSoundPath = '/usr/share/sounds/alsa/Front_Center.wav';
const alsaBeepDevice = process.env.ALSA_BEEP_DEVICE || 'default';
const chromiumDebugOrigin = process.env.CHROMIUM_DEBUG_ORIGIN || 'http://127.0.0.1:9222';
const enableFileLogs = process.env.ENABLE_FILE_LOGS === '1';
const enableClientDiagnostics = process.env.ENABLE_CLIENT_DIAGNOSTICS === '1';
const verboseApiLogging = process.env.VERBOSE_API_LOGGING === '1';
const apiSlowRequestThresholdMs = Math.max(250, Number(process.env.API_SLOW_REQUEST_THRESHOLD_MS || 1500));
const maxStoredMessages = Math.max(1, Math.min(1000, Number(process.env.MAX_STORED_MESSAGES || 1000)));
const alertsCacheMs = Math.max(5000, Number(process.env.PIKUD_HAOREF_CACHE_MS || 15000));
const alertsHistoryLimit = Math.max(10, Math.min(maxStoredMessages, Number(process.env.PIKUD_HAOREF_HISTORY_LIMIT || 30)));
const newsCacheMs = Math.max(15000, Number(process.env.NEWS_CACHE_MS || 60000));
const newsItemsPerSource = Math.max(2, Math.min(maxStoredMessages, Number(process.env.NEWS_ITEMS_PER_SOURCE || 4)));
const newsMaxAgeMinutes = Math.max(1, Number(process.env.NEWS_MAX_AGE_MINUTES || 1440));
const maxDisplayedAlertCities = 10;
const alertsRefreshMs = Math.max(5000, Number(process.env.ALERTS_REFRESH_MS || 15000));
const hlsLowLatencyMode = process.env.HLS_LOW_LATENCY_MODE === '1';
const hlsLiveSyncDurationCount = Math.max(3, Number(process.env.HLS_LIVE_SYNC_DURATION_COUNT || 12));
const hlsLiveMaxLatencyDurationCount = Math.max(hlsLiveSyncDurationCount + 2, Number(process.env.HLS_LIVE_MAX_LATENCY_DURATION_COUNT || 20));
const hlsBackBufferLength = Math.max(30, Number(process.env.HLS_BACK_BUFFER_LENGTH || 90));
const hlsMaxBufferLength = Math.max(30, Number(process.env.HLS_MAX_BUFFER_LENGTH || 120));
const hlsMaxMaxBufferLength = Math.max(hlsMaxBufferLength, Number(process.env.HLS_MAX_MAX_BUFFER_LENGTH || 180));
const hlsMaxBufferHole = Math.max(0.1, Number(process.env.HLS_MAX_BUFFER_HOLE || 1.5));
const hlsHighBufferWatchdogPeriod = Math.max(1, Number(process.env.HLS_HIGH_BUFFER_WATCHDOG_PERIOD || 4));
const rtspRelaySegmentDuration = Math.max(1, Number(process.env.RTSP_RELAY_SEGMENT_DURATION || 2));
const rtspRelaySegmentCount = Math.max(3, Number(process.env.RTSP_RELAY_SEGMENT_COUNT || 6));
const rtspRelayStartupTimeoutMs = Math.max(2000, Number(process.env.RTSP_RELAY_STARTUP_TIMEOUT_MS || 12000));
const rtspRelayIdleTimeoutMs = Math.max(15000, Number(process.env.RTSP_RELAY_IDLE_TIMEOUT_MS || 120000));
const tvNewsPageLimit = Math.max(1, Math.min(maxStoredMessages, Number(process.env.TV_NEWS_PAGE_LIMIT || 48)));
const tvNewsMaxAgeMinutes = Math.max(1, Number(process.env.TV_NEWS_MAX_AGE_MINUTES || 120));
const alertsNewsScrollDurationMs = Math.max(1000, Number(process.env.ALERTS_NEWS_SCROLL_DURATION_MS || 120000));
const alertsNewsScrollPauseMs = Math.max(0, Number(process.env.ALERTS_NEWS_SCROLL_PAUSE_MS || 2500));
const defaultVolumePercent = Math.max(0, Math.min(100, Number(process.env.DEFAULT_VOLUME || 70)));
const pikudHaorefCurrentUrl =
  process.env.PIKUD_HAOREF_CURRENT_URL || 'https://www.oref.org.il/WarningMessages/alert/alerts.json';
const pikudHaorefHistoryUrl = process.env.PIKUD_HAOREF_HISTORY_URL || '';
const pikudHaorefReferer = process.env.PIKUD_HAOREF_REFERER || 'https://www.oref.org.il/12481-he/Pakar.aspx';
const ynetBreakingNewsUrl = process.env.YNET_BREAKING_NEWS_URL || 'https://www.ynet.co.il/';
const makoNewsRssUrl =
  process.env.MAKO_NEWS_RSS_URL || 'https://rcs.mako.co.il/rss/31750a2610f26110VgnVCM1000005201000aRCRD.xml';
const israelHayomNewsUrl = process.env.ISRAEL_HAYOM_NEWS_URL || 'https://www.israelhayom.co.il/';
const kanBreakingNewsUrl = process.env.KAN_BREAKING_NEWS_URL || 'https://www.kan.org.il/';
const kanHeadlinesUrl = process.env.KAN_HEADLINES_URL || 'https://www.kan.org.il/lobby/news/';
const weatherCitiesPriority = (process.env.WEATHER_CITIES_PRIORITY || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function getEmergencyContacts() {
  const rawValue = String(process.env.EMERGENCY_CONTACTS || '').trim();
  return parseEmergencyContacts(rawValue);
}

function parseEmergencyContacts(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      throw new Error('EMERGENCY_CONTACTS must be a JSON array');
    }

    return parsed
      .map((entry) => {
        const normalizedEntry = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
        const name = String(normalizedEntry.name || '').trim();
        const number = String(normalizedEntry.number || '').trim();
        const primary = normalizedEntry.primary === true;

        if (!name || !number) {
          return null;
        }

        return { name, number, primary };
      })
      .filter(Boolean);
  } catch (error) {
    console.error('Failed to parse EMERGENCY_CONTACTS, using an empty list:', error);
    return [];
  }
}

function parseEnvUrlList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function ensureDataDir() {
  try {
    fs.mkdirSync(dataDirPath, { recursive: true });
  } catch (error) {
    console.error('Failed creating data directory:', error);
  }
}

function isRtspUrl(url) {
  return /^rtsp:\/\//i.test(String(url || '').trim());
}

function redactUrlCredentials(url) {
  return String(url || '').replace(/(\/\/)([^/@]+)@/u, '$1***@');
}

function getRequestProtocol(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);

  return forwardedProto || req.protocol || 'http';
}

function getRequestHostname(req) {
  const forwardedHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);
  const hostHeader = forwardedHost || String(req.headers.host || '').trim();

  if (!hostHeader) {
    return 'localhost';
  }

  try {
    return new URL(`http://${hostHeader}`).hostname || 'localhost';
  } catch (_error) {
    return hostHeader.replace(/:\d+$/, '') || 'localhost';
  }
}

function isLoopbackHostname(hostname) {
  const normalizedHostname = String(hostname || '').trim().toLowerCase();
  return (
    !normalizedHostname ||
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]'
  );
}

function getPreferredLanIp() {
  const networkInterfaces = os.networkInterfaces();
  const candidateAddresses = [];

  for (const interfaceEntries of Object.values(networkInterfaces)) {
    for (const entry of interfaceEntries || []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') {
        continue;
      }

      const address = String(entry.address || '').trim();
      if (!address) {
        continue;
      }

      candidateAddresses.push(address);
    }
  }

  const preferredAddress =
    candidateAddresses.find((address) => address.startsWith('192.168.')) ||
    candidateAddresses.find((address) => address.startsWith('10.')) ||
    candidateAddresses.find((address) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) ||
    candidateAddresses.find((address) => !address.startsWith('172.17.') && !address.startsWith('172.18.')) ||
    candidateAddresses[0];

  return preferredAddress || null;
}

function getRemoteControlUrl(req) {
  if (remoteControlUrl) {
    return remoteControlUrl;
  }

  const requestHostname = getRequestHostname(req);
  const hostname = isLoopbackHostname(requestHostname) ? (getPreferredLanIp() || requestHostname) : requestHostname;

  return `${getRequestProtocol(req)}://${hostname}:${remotePort}`;
}

const defaultWeatherCitiesConfig = {
  'bat-hefer': {
    name: 'Bat-Hefer',
    aliases: ['Bat Hefer', 'בת חפר']
  },
  yokneam: {
    name: 'Yokneam',
    aliases: ['Yokneam', 'Yoqneam', 'Yokneam Illit', 'יקנעם', 'יוקנעם']
  }
};

const weatherGeocodeCache = new Map();

function loadPersistedSettings() {
  ensureDataDir();

  try {
    if (!fs.existsSync(settingsFilePath)) {
      return {};
    }

    const parsed = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error('Failed loading persisted settings, using defaults:', error);
    return {};
  }
}

let persistedSettings = loadPersistedSettings();

function getCurrentSettings() {
  return persistedSettings;
}

function savePersistedSettings(nextSettings) {
  ensureDataDir();
  fs.writeFileSync(settingsFilePath, JSON.stringify(nextSettings, null, 2));
  persistedSettings = nextSettings;
  weatherGeocodeCache.clear();
}

function getWeatherCitiesConfig() {
  const rawValue = String(process.env.WEATHER_CITIES || '').trim();
  return parseWeatherCitiesConfig(rawValue);
}

function parseWeatherCitiesConfig(rawValue) {
  if (!rawValue) {
    return defaultWeatherCitiesConfig;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('WEATHER_CITIES must be a JSON object keyed by city id');
    }

    const normalizedEntries = Object.entries(parsed)
      .map(([id, value]) => {
        const entry = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const name = String(entry.name || '').trim();
        const lat = entry.lat === undefined || entry.lat === null || entry.lat === '' ? null : Number(entry.lat);
        const lon = entry.lon === undefined || entry.lon === null || entry.lon === '' ? null : Number(entry.lon);
        const aliases = Array.isArray(entry.aliases)
          ? entry.aliases.map((alias) => String(alias || '').trim()).filter(Boolean)
          : [];
        const query = String(entry.query || name).trim();

        if (!id || !name) {
          return null;
        }

        if ((lat === null) !== (lon === null)) {
          return null;
        }

        if (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lon))) {
          return null;
        }

        return [id, { name, lat, lon, aliases, query }];
      })
      .filter(Boolean);

    if (normalizedEntries.length === 0) {
      throw new Error('WEATHER_CITIES produced no valid city entries');
    }

    return Object.fromEntries(normalizedEntries);
  } catch (error) {
    console.error('Failed to parse WEATHER_CITIES, using defaults:', error);
    return defaultWeatherCitiesConfig;
  }
}

function buildLiveChannel(id, name) {
  const currentSettings = getCurrentSettings();
  const configuredChannelUrls =
    currentSettings.channelUrls && typeof currentSettings.channelUrls === 'object' && !Array.isArray(currentSettings.channelUrls)
      ? currentSettings.channelUrls
      : {};
  const sourceUrl = String(configuredChannelUrls[id] || process.env[`CHANNEL${id}_URL`] || '').trim();
  const usesRtspRelay = isRtspUrl(sourceUrl);

  return {
    id,
    name,
    url: usesRtspRelay ? `/api/streams/channel-${id}/index.m3u8` : sourceUrl,
    sourceUrl,
    usesRtspRelay,
    fallbackUrls: parseEnvUrlList(`CHANNEL${id}_FALLBACK_URLS`)
  };
}

function getChannels() {
  return [
    buildLiveChannel('11', 'Channel 11'),
    buildLiveChannel('12', 'Channel 12'),
    buildLiveChannel('13', 'Channel 13'),
    buildLiveChannel('16', 'Camera'),
    { id: '14', name: 'Alerts', type: 'alerts' },
    { id: '15', name: 'Emergency', type: 'emergency' }
  ];
}

function getChannelById(channelId) {
  return getChannels().find((channel) => channel.id === String(channelId || '').trim()) || null;
}

function getDefaultChannelId() {
  const channelIds = new Set(getChannels().map((channel) => channel.id));
  const persistedDefault = String(getCurrentSettings().defaultChannelId || '').trim();
  const envDefault = String(process.env.DEFAULT_CHANNEL_ID || '').trim();
  if (persistedDefault && channelIds.has(persistedDefault)) {
    return persistedDefault;
  }
  if (envDefault && channelIds.has(envDefault)) {
    return envDefault;
  }
  return '11';
}

function getCurrentWeatherCitiesConfig() {
  const rawValue = String(getCurrentSettings().weatherCitiesRaw || process.env.WEATHER_CITIES || '').trim();
  return parseWeatherCitiesConfig(rawValue);
}

function getCurrentEmergencyContacts() {
  const rawValue = String(getCurrentSettings().emergencyContactsRaw || process.env.EMERGENCY_CONTACTS || '').trim();
  return parseEmergencyContacts(rawValue);
}

function getWeatherCities() {
  return Object.entries(getCurrentWeatherCitiesConfig()).map(([id, city]) => ({
    id,
    name: city.name,
    lat: city.lat ?? null,
    lon: city.lon ?? null,
    query: city.query || city.name
  }));
}

function normalizeCityMatchValue(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/['"`׳״-]/g, '')
    .replace(/\s+/g, '');
}

function getWeatherCityAliasesById() {
  return Object.fromEntries(
    Object.entries(getCurrentWeatherCitiesConfig()).map(([id, city]) => [id, Array.isArray(city.aliases) ? city.aliases : []])
  );
}

function getWeatherCityMatchKeys(city) {
  const aliasValues = getWeatherCityAliasesById()[city.id] || [];
  return new Set(
    [city.id, city.name, ...aliasValues]
      .map(normalizeCityMatchValue)
      .filter(Boolean)
  );
}

function sortWeatherCities(cities, preferredValues = []) {
  const priorityKeys = preferredValues.map(normalizeCityMatchValue).filter(Boolean);

  if (priorityKeys.length === 0) {
    return [...cities];
  }

  return [...cities].sort((left, right) => {
    const leftKeys = getWeatherCityMatchKeys(left);
    const rightKeys = getWeatherCityMatchKeys(right);
    const leftRank = priorityKeys.findIndex((key) => leftKeys.has(key));
    const rightRank = priorityKeys.findIndex((key) => rightKeys.has(key));
    const normalizedLeftRank = leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank;
    const normalizedRightRank = rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank;

    if (normalizedLeftRank !== normalizedRightRank) {
      return normalizedLeftRank - normalizedRightRank;
    }

    return left.name.localeCompare(right.name);
  });
}

function getPriorityMatchKeys(preferredValue) {
  const preferredKey = normalizeCityMatchValue(preferredValue);
  if (!preferredKey) {
    return [];
  }

  const matchingAliasEntry = Object.entries(getWeatherCityAliasesById()).find(([_cityId, aliases]) => {
    const normalizedAliases = aliases.map(normalizeCityMatchValue);
    return normalizedAliases.includes(preferredKey);
  });

  if (!matchingAliasEntry) {
    return [preferredKey];
  }

  const [cityId, aliases] = matchingAliasEntry;
  const city = getWeatherCities().find((entry) => entry.id === cityId);

  return Array.from(new Set(
    [preferredValue, cityId, city?.name, ...aliases]
      .map(normalizeCityMatchValue)
      .filter(Boolean)
  ));
}

function getAlertLocationPriorityRank(location) {
  const locationKey = normalizeCityMatchValue(location);
  if (!locationKey) {
    return Number.MAX_SAFE_INTEGER;
  }

  for (let index = 0; index < weatherCitiesPriority.length; index += 1) {
    const matchKeys = getPriorityMatchKeys(weatherCitiesPriority[index]);
    if (matchKeys.some((key) => locationKey === key || locationKey.includes(key) || key.includes(locationKey))) {
      return index;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

function sortAndLimitAlertLocations(locations, limit = maxDisplayedAlertCities) {
  const uniqueLocations = Array.from(new Set((Array.isArray(locations) ? locations : []).filter(Boolean)));

  return uniqueLocations
    .sort((left, right) => {
      const leftRank = getAlertLocationPriorityRank(left);
      const rightRank = getAlertLocationPriorityRank(right);

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return String(left).localeCompare(String(right), 'he');
    })
    .slice(0, limit);
}

async function resolveWeatherCityCoordinates(city) {
  if (Number.isFinite(city?.lat) && Number.isFinite(city?.lon)) {
    return {
      lat: city.lat,
      lon: city.lon
    };
  }

  const query = String(city?.query || city?.name || '').trim();
  if (!query) {
    throw new Error(`Weather city "${city?.id || 'unknown'}" has no coordinates or geocoding query`);
  }

  const cacheKey = query.toLowerCase();
  if (weatherGeocodeCache.has(cacheKey)) {
    return weatherGeocodeCache.get(cacheKey);
  }

  const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodeUrl.searchParams.set('name', query);
  geocodeUrl.searchParams.set('count', '1');
  geocodeUrl.searchParams.set('language', 'en');
  geocodeUrl.searchParams.set('format', 'json');

  const response = await fetch(geocodeUrl);
  if (!response.ok) {
    throw new Error(`Geocoding request failed with ${response.status}`);
  }

  const payload = await response.json();
  const match = Array.isArray(payload?.results) ? payload.results[0] : null;
  const lat = Number(match?.latitude);
  const lon = Number(match?.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`No geocoding result for "${query}"`);
  }

  const resolved = { lat, lon };
  weatherGeocodeCache.set(cacheKey, resolved);
  return resolved;
}

function getSortedWeatherCities() {
  return sortWeatherCities(getWeatherCities(), weatherCitiesPriority);
}

function getDefaultWeatherCityId() {
  const weatherCities = getWeatherCities();
  const persistedDefault = String(getCurrentSettings().defaultWeatherCityId || '').trim();
  const envDefault = String(process.env.DEFAULT_WEATHER_CITY || '').trim();
  return (
    weatherCities.find((city) => city.id === persistedDefault)?.id ||
    weatherCities.find((city) => city.id === envDefault)?.id ||
    weatherCities[0]?.id ||
    'bat-hefer'
  );
}

function ensureLogsDir() {
  try {
    fs.mkdirSync(logsDirPath, { recursive: true });
  } catch (error) {
    console.error('Failed creating logs directory:', error);
  }
}

function getLogFilePath(prefix) {
  const datePart = new Date().toISOString().slice(0, 10);
  return path.join(logsDirPath, `${prefix}-${datePart}.log`);
}

function toSerializable(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return {
      note: 'unserializable-payload',
      text: String(value)
    };
  }
}

function writeLog(prefix, level, event, details = {}) {
  if (!enableFileLogs) {
    return;
  }

  ensureLogsDir();

  const entry = {
    ts: new Date().toISOString(),
    pid: process.pid,
    level,
    event,
    details: toSerializable(details)
  };

  fs.appendFile(getLogFilePath(prefix), `${JSON.stringify(entry)}\n`, (error) => {
    if (error) {
      console.error('Failed writing log file:', error);
    }
  });
}

function logServerEvent(level, event, details = {}) {
  writeLog('server', level, event, details);
}

function logClientEvent(level, event, details = {}) {
  writeLog('client', level, event, details);
}

function runDetachedCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve(code);
    });
  });
}

async function closeKioskBrowser() {
  const results = await Promise.all([
    runDetachedCommand('pkill', ['-f', 'chromium.*--kiosk']),
    runDetachedCommand('pkill', ['-f', '(^|/)chromium-browser( |$)']),
    runDetachedCommand('pkill', ['-f', '(^|/)chromium( |$)'])
  ]);

  return results.some((code) => code === 0);
}

function createApiRequestLogger(appName) {
  return (req, res, next) => {
    if (!verboseApiLogging) {
      next();
      return;
    }

    if (!String(req.path || '').startsWith('/api/')) {
      next();
      return;
    }

    const startedAt = Date.now();
    const requestId = `${startedAt}-${Math.random().toString(36).slice(2, 10)}`;

    logServerEvent('info', 'api_request_start', {
      app: appName,
      requestId,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || ''
    });

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const isSlowRequest = durationMs >= apiSlowRequestThresholdMs;
      const isErrorResponse = res.statusCode >= 400;

      if (!isSlowRequest && !isErrorResponse) {
        return;
      }

      logServerEvent(isErrorResponse ? 'warn' : 'info', 'api_request_finish', {
        app: appName,
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs
      });
    });

    next();
  };
}

function ensureRtspRelayRootDir() {
  try {
    fs.mkdirSync(rtspRelayRootDirPath, { recursive: true });
  } catch (error) {
    console.error('Failed creating RTSP relay directory:', error);
  }
}

function getRtspRelayOutputDir(channelId) {
  return path.join(rtspRelayRootDirPath, `channel-${channelId}`);
}

function resetRtspRelayOutputDir(channelId) {
  const outputDir = getRtspRelayOutputDir(channelId);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function waitForFile(filePath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    function check() {
      fs.stat(filePath, (error, stats) => {
        if (!error && stats.isFile() && stats.size > 0) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${path.basename(filePath)}`));
          return;
        }

        setTimeout(check, 200);
      });
    }

    check();
  });
}

const rtspRelayStates = new Map();

function stopRtspRelay(channelId, reason = 'manual') {
  const relayState = rtspRelayStates.get(channelId);
  if (!relayState) {
    return;
  }

  rtspRelayStates.delete(channelId);

  if (relayState.shutdownTimer) {
    clearTimeout(relayState.shutdownTimer);
  }

  relayState.stopped = true;

  if (relayState.process && !relayState.process.killed) {
    relayState.process.kill('SIGTERM');
    relayState.shutdownTimer = setTimeout(() => {
      if (relayState.process && !relayState.process.killed) {
        relayState.process.kill('SIGKILL');
      }
    }, 3000);
  }

  logServerEvent('info', 'rtsp_relay_stopped', {
    channelId,
    reason
  });
}

function stopAllRtspRelays(reason = 'shutdown') {
  Array.from(rtspRelayStates.keys()).forEach((channelId) => stopRtspRelay(channelId, reason));
}

function startRtspRelay(channel) {
  const sourceUrl = String(channel?.sourceUrl || '').trim();
  if (!channel?.usesRtspRelay || !sourceUrl) {
    return null;
  }

  const existingRelay = rtspRelayStates.get(channel.id);
  if (existingRelay && existingRelay.sourceUrl === sourceUrl && existingRelay.process && !existingRelay.exited) {
    existingRelay.lastAccessedAt = Date.now();
    return existingRelay;
  }

  if (existingRelay) {
    stopRtspRelay(channel.id, 'restart');
  }

  ensureRtspRelayRootDir();

  const outputDir = resetRtspRelayOutputDir(channel.id);
  const playlistPath = path.join(outputDir, 'index.m3u8');
  const segmentPattern = path.join(outputDir, 'segment-%03d.ts');
  const ffmpegArgs = [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-rtsp_transport',
    'tcp',
    '-i',
    sourceUrl,
    '-an',
    '-map',
    '0:v:0',
    '-c:v',
    'copy',
    '-f',
    'hls',
    '-hls_time',
    String(rtspRelaySegmentDuration),
    '-hls_list_size',
    String(rtspRelaySegmentCount),
    '-hls_flags',
    'delete_segments+append_list+omit_endlist+program_date_time',
    '-hls_segment_filename',
    segmentPattern,
    playlistPath
  ];

  const relayProcess = spawn('ffmpeg', ffmpegArgs, {
    stdio: ['ignore', 'ignore', 'pipe']
  });

  const relayState = {
    channelId: channel.id,
    sourceUrl,
    outputDir,
    playlistPath,
    process: relayProcess,
    exited: false,
    lastAccessedAt: Date.now(),
    startedAt: Date.now(),
    shutdownTimer: null,
    stopped: false
  };

  relayProcess.stderr.on('data', (chunk) => {
    const message = String(chunk || '').trim();
    if (!message) {
      return;
    }

    logServerEvent('debug', 'rtsp_relay_ffmpeg', {
      channelId: channel.id,
      message
    });
  });

  relayProcess.on('error', (error) => {
    logServerEvent('error', 'rtsp_relay_error', {
      channelId: channel.id,
      sourceUrl: redactUrlCredentials(sourceUrl),
      message: error?.message || String(error)
    });
  });

  relayProcess.on('exit', (code, signal) => {
    relayState.exited = true;
    if (relayState.shutdownTimer) {
      clearTimeout(relayState.shutdownTimer);
      relayState.shutdownTimer = null;
    }

    logServerEvent(relayState.stopped ? 'info' : 'warn', 'rtsp_relay_exit', {
      channelId: channel.id,
      sourceUrl: redactUrlCredentials(sourceUrl),
      code,
      signal,
      uptimeMs: Date.now() - relayState.startedAt
    });

    if (rtspRelayStates.get(channel.id) === relayState) {
      rtspRelayStates.delete(channel.id);
    }
  });

  rtspRelayStates.set(channel.id, relayState);

  logServerEvent('info', 'rtsp_relay_started', {
    channelId: channel.id,
    sourceUrl: redactUrlCredentials(sourceUrl),
    outputDir,
    segmentDuration: rtspRelaySegmentDuration,
    segmentCount: rtspRelaySegmentCount
  });

  return relayState;
}

async function ensureRtspRelayReady(channel) {
  const relayState = startRtspRelay(channel);
  if (!relayState) {
    throw new Error(`Channel ${channel?.id || 'unknown'} is not configured for RTSP relay`);
  }

  relayState.lastAccessedAt = Date.now();
  await waitForFile(relayState.playlistPath, rtspRelayStartupTimeoutMs);
  return relayState;
}

ensureLogsDir();
ensureRtspRelayRootDir();
logServerEvent('info', 'server_boot', {
  tvPort,
  remotePort,
  nodeEnv: process.env.NODE_ENV || 'development'
});

process.on('uncaughtException', (error) => {
  logServerEvent('error', 'uncaught_exception', {
    message: error?.message || String(error),
    stack: error?.stack || ''
  });
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  logServerEvent('error', 'unhandled_rejection', {
    reason: typeof reason === 'string' ? reason : (reason?.message || String(reason)),
    stack: reason?.stack || ''
  });
  console.error('Unhandled rejection:', reason);
});

setInterval(() => {
  const cutoff = Date.now() - rtspRelayIdleTimeoutMs;

  for (const [channelId, relayState] of rtspRelayStates.entries()) {
    if (relayState.lastAccessedAt < cutoff) {
      stopRtspRelay(channelId, 'idle_timeout');
    }
  }
}, Math.max(5000, Math.min(30000, Math.floor(rtspRelayIdleTimeoutMs / 2)))).unref();

process.on('SIGINT', () => {
  stopAllRtspRelays('sigint');
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopAllRtspRelays('sigterm');
  process.exit(0);
});

let controlState = {
  mode: 'channel',
  channelId: getDefaultChannelId(),
  weatherCityId: getDefaultWeatherCityId(),
  fullscreen: false,
  playback: 'playing',
  weatherAutoscroll: 'playing',
  volume: defaultVolumePercent,
  lastVolume: defaultVolumePercent,
  muted: false,
  refreshRequestedAt: 0,
  browserBackRequestedAt: 0,
  updatedAt: Date.now(),
  source: 'server'
};

const sseClients = new Set();
const alertsState = {
  current: {
    active: false,
    title: 'No active alerts',
    desc: 'No current Pikud HaOref alerts',
    items: [],
    id: null,
    alertedAt: null,
    fetchedAt: null
  },
  history: [],
  currentFetchedAt: 0,
  historyFetchedAt: 0,
  lastHistorySignature: null
};
const newsState = {
  items: [],
  fetchedAt: 0
};

function parseLooseJson(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;

  const cleaned = value.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch (_error) {
    return JSON.parse(cleaned.replace(/\r?\n/g, ''));
  }
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeadlineText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-:|,.;/]+|[\s\-:|,.;/]+$/g, '')
    .trim();
}

function isGenericNewsTitle(value) {
  const normalized = normalizeHeadlineText(value)
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (!normalized) {
    return true;
  }

  const genericTitles = new Set([
    'לצפייה בכתבה',
    'לכתבה המלאה',
    'לכתבה',
    'לצפייה',
    'צפו בכתבה',
    'watch article',
    'read more',
    'read the full article',
    'full article'
  ]);

  return genericTitles.has(normalized);
}

function pickHeadlineCandidate(...values) {
  for (const value of values) {
    const candidate = normalizeHeadlineText(stripTags(value));
    if (!candidate || candidate.length < 8 || isGenericNewsTitle(candidate)) {
      continue;
    }

    return candidate;
  }

  return '';
}

function extractAttributeValue(tagText, attributeName) {
  const pattern = new RegExp(`${attributeName}="([^"]+)"`, 'i');
  return decodeHtmlEntities(tagText.match(pattern)?.[1] || '');
}

function extractAnchorHeadline(anchorHtml) {
  const innerHtml = anchorHtml.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '';
  const directText = stripTags(innerHtml);
  const ariaLabel = extractAttributeValue(anchorHtml, 'aria-label');
  const titleAttr = extractAttributeValue(anchorHtml, 'title');
  const imageAlt = decodeHtmlEntities(innerHtml.match(/<img[^>]+alt="([^"]+)"/i)?.[1] || '');

  return pickHeadlineCandidate(directText, ariaLabel, titleAttr, imageAlt);
}

function makeAbsoluteUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch (_error) {
    return String(url || '');
  }
}

function parseRssItems(xmlText, source) {
  const items = [];
  const itemMatches = String(xmlText || '').match(/<item\b[\s\S]*?<\/item>/gi) || [];

  itemMatches.forEach((entry) => {
    const title = pickHeadlineCandidate(
      entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '',
      entry.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || ''
    );
    const link = stripTags(entry.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '');
    const pubDate = stripTags(entry.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || '');

    if (!title || !link) {
      return;
    }

    items.push({
      title,
      link: makeAbsoluteUrl(link, source.homepageUrl || source.url),
      publishedAt: normalizeAlertTime(pubDate),
      source: source.label
    });
  });

  return items;
}

function parseKanNewsPage(htmlText, baseUrl, sourceLabel) {
  const items = [];
  const matches = String(htmlText || '').match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi) || [];
  const seen = new Set();

  for (const match of matches) {
    const href = match.match(/href="([^"]+)"/i)?.[1] || '';
    const text = extractAnchorHeadline(match);
    if (!href || !text) continue;
    const link = makeAbsoluteUrl(href, baseUrl);
    if (!/^https?:\/\/www\.kan\.org\.il\//i.test(link)) continue;
    if (!/\/content\/[^/]+\/[^/]+\/\d+(?:[/?#]|$)/i.test(link)) continue;
    if (text.length < 14) continue;
    const key = `${text}|${link}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      title: text,
      link,
      publishedAt: null,
      source: sourceLabel
    });

    if (items.length >= newsItemsPerSource) {
      break;
    }
  }

  return items;
}

function parseGenericNewsPage(htmlText, baseUrl, sourceLabel, hrefPattern) {
  const items = [];
  const seen = new Set();
  const matches = String(htmlText || '').match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi) || [];

  for (const match of matches) {
    const href = match.match(/href="([^"]+)"/i)?.[1] || '';
    const text = extractAnchorHeadline(match);
    if (!href || !text) continue;
    if (hrefPattern && !hrefPattern.test(href)) continue;
    if (text.length < 14) continue;

    const link = makeAbsoluteUrl(href, baseUrl);
    const key = `${text}|${link}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      title: text,
      link,
      publishedAt: null,
      source: sourceLabel
    });

    if (items.length >= newsItemsPerSource) {
      break;
    }
  }

  return items;
}

function isLikelyYnetArticleUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;

  const normalized = makeAbsoluteUrl(value, 'https://www.ynet.co.il/');

  if (!/^https?:\/\/www\.ynet\.co\.il\//i.test(normalized)) {
    return false;
  }

  return /\/(?:news\/)?(?:article|blogs\/article)\/[a-z0-9_-]+(?:[/?#]|$)/i.test(normalized);
}

function parseYnetNewsPage(htmlText, baseUrl, sourceLabel) {
  const items = [];
  const seen = new Set();
  const matches = String(htmlText || '').match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi) || [];

  for (const match of matches) {
    const href = match.match(/href="([^"]+)"/i)?.[1] || '';
    const text = extractAnchorHeadline(match);
    if (!href || !text) continue;
    if (!isLikelyYnetArticleUrl(makeAbsoluteUrl(href, baseUrl))) continue;
    if (text.length < 14) continue;

    const link = makeAbsoluteUrl(href, baseUrl);
    const key = `${text}|${link}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      title: text,
      link,
      publishedAt: null,
      source: sourceLabel
    });

    if (items.length >= newsItemsPerSource) {
      break;
    }
  }

  return items;
}

function parseIsraelHayomPage(htmlText, baseUrl, sourceLabel) {
  const items = [];
  const seen = new Set();
  const matches = String(htmlText || '').match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi) || [];

  for (const match of matches) {
    const href = match.match(/href="([^"]+)"/i)?.[1] || '';
    const text = extractAnchorHeadline(match);
    if (!href || !text) continue;
    if (!/^https?:\/\/www\.israelhayom\.co\.il\/|^\//.test(href)) continue;
    if (text.length < 14) continue;

    const link = makeAbsoluteUrl(href, baseUrl);
    const key = `${text}|${link}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      title: text,
      link,
      publishedAt: null,
      source: sourceLabel
    });

    if (items.length >= newsItemsPerSource) {
      break;
    }
  }

  return items;
}

async function fetchText(url, referer = '') {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/xml, text/xml, text/html, application/rss+xml, application/atom+xml, text/plain, */*',
      Referer: referer || url,
      'User-Agent': 'Mozilla/5.0 PI-TV'
    }
  });

  if (!response.ok) {
    throw new Error(`Feed/page fetch failed: ${response.status}`);
  }

  return response.text();
}

async function fetchNewsSource(source) {
  const fetchedAt = new Date().toISOString();

  if (source.kind === 'rss') {
    const xmlText = await fetchText(source.url, source.homepageUrl || source.url);
    return parseRssItems(xmlText, source).slice(0, newsItemsPerSource);
  }

  const htmlText = await fetchText(source.url, source.url);
  let items = [];

  if (source.kind === 'kan-page') {
    items = parseKanNewsPage(htmlText, source.url, source.label);
  }
  else if (source.kind === 'ynet-page') {
    items = parseYnetNewsPage(htmlText, source.url, source.label);
  }
  else if (source.kind === 'israel-hayom-page') {
    items = parseIsraelHayomPage(htmlText, source.url, source.label);
  }

  return items.map((item) => ({
    ...item,
    // Page scrapes rarely expose a reliable publish time, so use fetch time
    // to keep current source headlines eligible for the recent-news window.
    publishedAt: item.publishedAt || fetchedAt
  }));
}

function mergeNewsItems(existingItems, incomingItems) {
  const merged = [];
  const seen = new Set();

  [...incomingItems, ...existingItems].forEach((item) => {
    if (!item?.title || !item?.link) {
      return;
    }

    const key = `${item.title}|${item.link}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push(item);
  });

  return merged.sort((left, right) => {
    const rightTime = new Date(right?.publishedAt || 0).getTime();
    const leftTime = new Date(left?.publishedAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function getRecentNewsItems(items, now = Date.now(), maxAgeMinutesOverride = newsMaxAgeMinutes) {
  const maxAgeMs = Math.max(1, Number(maxAgeMinutesOverride || newsMaxAgeMinutes)) * 60 * 1000;

  return items.filter((item) => {
    if (!item?.publishedAt) {
      return false;
    }

    const publishedAtMs = new Date(item.publishedAt).getTime();
    if (Number.isNaN(publishedAtMs)) {
      return false;
    }

    return now - publishedAtMs <= maxAgeMs;
  });
}

function getConfiguredNewsUrls() {
  const newsUrls =
    getCurrentSettings().newsUrls && typeof getCurrentSettings().newsUrls === 'object' && !Array.isArray(getCurrentSettings().newsUrls)
      ? getCurrentSettings().newsUrls
      : {};

  return {
    ynetBreakingNewsUrl: String(newsUrls.ynetBreakingNewsUrl || ynetBreakingNewsUrl || '').trim(),
    makoNewsRssUrl: String(newsUrls.makoNewsRssUrl || makoNewsRssUrl || '').trim(),
    israelHayomNewsUrl: String(newsUrls.israelHayomNewsUrl || israelHayomNewsUrl || '').trim(),
    kanBreakingNewsUrl: String(newsUrls.kanBreakingNewsUrl || kanBreakingNewsUrl || '').trim(),
    kanHeadlinesUrl: String(newsUrls.kanHeadlinesUrl || kanHeadlinesUrl || '').trim()
  };
}

async function refreshNewsCombined(force = false) {
  const now = Date.now();
  if (!force && now - newsState.fetchedAt < newsCacheMs && newsState.items.length > 0) {
    return newsState.items;
  }

  const configuredNewsUrls = getConfiguredNewsUrls();
  const sources = [
    { kind: 'ynet-page', label: 'ynet Breaking', url: configuredNewsUrls.ynetBreakingNewsUrl },
    { kind: 'rss', label: 'mako / N12', url: configuredNewsUrls.makoNewsRssUrl, homepageUrl: 'https://www.mako.co.il/news' },
    { kind: 'israel-hayom-page', label: 'Israel Hayom', url: configuredNewsUrls.israelHayomNewsUrl },
    { kind: 'kan-page', label: 'Kan Breaking', url: configuredNewsUrls.kanBreakingNewsUrl },
    { kind: 'kan-page', label: 'Kan Headlines', url: configuredNewsUrls.kanHeadlinesUrl }
  ].filter((source) => source.url);

  const results = await Promise.allSettled(sources.map((source) => fetchNewsSource(source)));
  const items = [];

  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      console.error(`News source failed: ${sources[index].label}`, result.reason);
      return;
    }

    items.push(...result.value);
  });

  newsState.items = mergeNewsItems(newsState.items, items).slice(0, maxStoredMessages);
  newsState.fetchedAt = now;
  return newsState.items;
}

function normalizeAlertTime(value) {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function normalizeAlertItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        return String(item.label || item.name || item.area || item.city || item.value || '').trim();
      }
      return '';
    })
    .filter(Boolean);
}

function normalizeCurrentAlerts(payload) {
  const items = Array.isArray(payload)
    ? normalizeAlertItems(payload)
    : normalizeAlertItems(payload?.data);
  return {
    active: items.length > 0,
    title: String(payload?.title || payload?.cat || (items.length ? 'Active alerts' : 'No active alerts')),
    desc: String(payload?.desc || payload?.message || (items.length ? 'Home Front Command alerts are active.' : 'No current Pikud HaOref alerts.')),
    items: sortAndLimitAlertLocations(items),
    id: payload?.id ? String(payload.id) : null,
    alertedAt: normalizeAlertTime(payload?.alertDate || payload?.time || payload?.date || payload?.timestamp),
    fetchedAt: new Date().toISOString()
  };
}

function normalizeHistoryEntry(entry) {
  if (typeof entry === 'string') {
    return {
      title: 'Alert',
      locations: [entry],
      occurredAt: null
    };
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const locations = normalizeAlertItems(
    entry.data || entry.locations || entry.areas || entry.cities || [entry.city || entry.area || entry.label].filter(Boolean)
  );

  return {
    title: String(entry.title || entry.cat || entry.type || 'Alert'),
    locations: sortAndLimitAlertLocations(locations),
    occurredAt: normalizeAlertTime(entry.alertDate || entry.date || entry.time || entry.timestamp),
    desc: entry.desc ? String(entry.desc) : '',
    id: entry.id ? String(entry.id) : null
  };
}

function addCurrentAlertToHistory(current) {
  if (!current?.active || current.items.length === 0) return;

  const signature = JSON.stringify({
    title: current.title,
    desc: current.desc,
    items: current.items
  });

  if (signature === alertsState.lastHistorySignature) {
    return;
  }

  alertsState.lastHistorySignature = signature;
  alertsState.history.unshift({
    title: current.title,
    locations: [...current.items],
    occurredAt: current.alertedAt || current.fetchedAt,
    desc: current.desc,
    id: current.id || null,
    source: 'current'
  });
  alertsState.history = alertsState.history.slice(0, maxStoredMessages);
}

async function fetchPikudHaorefJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: pikudHaorefReferer,
      'User-Agent': 'Mozilla/5.0 PI-TV',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!response.ok) {
    throw new Error(`Pikud HaOref API error: ${response.status}`);
  }

  return parseLooseJson(await response.text());
}

async function refreshAlertsCurrent(force = false) {
  const now = Date.now();
  if (!force && now - alertsState.currentFetchedAt < alertsCacheMs) {
    return alertsState.current;
  }

  const payload = await fetchPikudHaorefJson(pikudHaorefCurrentUrl);
  const current = normalizeCurrentAlerts(payload);
  alertsState.current = current;
  alertsState.currentFetchedAt = now;
  addCurrentAlertToHistory(current);
  return current;
}

async function refreshAlertsHistory(force = false) {
  const now = Date.now();
  if (!pikudHaorefHistoryUrl) {
    return alertsState.history;
  }

  if (!force && now - alertsState.historyFetchedAt < alertsCacheMs) {
    return alertsState.history;
  }

  const payload = await fetchPikudHaorefJson(pikudHaorefHistoryUrl);
  const entries = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const normalized = entries.map(normalizeHistoryEntry).filter(Boolean);

  if (normalized.length > 0) {
    alertsState.history = normalized.slice(0, maxStoredMessages);
    alertsState.historyFetchedAt = now;
  }

  return alertsState.history;
}

function broadcastControlState() {
  const payload = `data: ${JSON.stringify(controlState)}\n\n`;
  logServerEvent('debug', 'control_state_broadcast', {
    sseClientCount: sseClients.size,
    mode: controlState.mode,
    channelId: controlState.channelId,
    playback: controlState.playback,
    source: controlState.source,
    updatedAt: controlState.updatedAt
  });
  for (const res of sseClients) {
    res.write(payload);
  }
}

function updateControlState(nextState, source = 'unknown') {
  const previous = controlState;
  controlState = {
    ...controlState,
    ...nextState,
    updatedAt: Date.now(),
    source
  };

  logServerEvent('info', 'control_state_update', {
    source,
    patch: nextState,
      previous: {
        mode: previous.mode,
        channelId: previous.channelId,
        playback: previous.playback,
        weatherCityId: previous.weatherCityId,
        fullscreen: previous.fullscreen,
        volume: previous.volume,
        lastVolume: previous.lastVolume,
        muted: previous.muted
      },
      next: {
        mode: controlState.mode,
        channelId: controlState.channelId,
        playback: controlState.playback,
        weatherCityId: controlState.weatherCityId,
        fullscreen: controlState.fullscreen,
        volume: controlState.volume,
        lastVolume: controlState.lastVolume,
        muted: controlState.muted,
        refreshRequestedAt: controlState.refreshRequestedAt,
        browserBackRequestedAt: controlState.browserBackRequestedAt
      }
  });

  broadcastControlState();
  return controlState;
}

async function sendChromiumCommand(method, params = {}) {
  logServerEvent('debug', 'chromium_command_start', { method, params });
  const response = await fetch(`${chromiumDebugOrigin}/json/list`);
  if (!response.ok) {
    logServerEvent('error', 'chromium_debug_list_failed', {
      method,
      status: response.status
    });
    throw new Error(`Chromium debug list failed with ${response.status}`);
  }

  const targets = await response.json();
  const target = Array.isArray(targets)
    ? targets.find((entry) => entry.type === 'page' && typeof entry.webSocketDebuggerUrl === 'string')
    : null;

  if (!target?.webSocketDebuggerUrl) {
    logServerEvent('error', 'chromium_target_missing', {
      method,
      chromiumDebugOrigin
    });
    throw new Error('No Chromium page target available');
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const commandId = Date.now();

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: commandId, method, params }));
    });

    ws.on('message', (rawMessage) => {
      try {
        const payload = JSON.parse(String(rawMessage));
        if (payload.id !== commandId) {
          return;
        }

        ws.close();
        if (payload.error) {
          logServerEvent('error', 'chromium_command_failed', {
            method,
            params,
            error: payload.error
          });
          reject(new Error(payload.error.message || 'Chromium command failed'));
          return;
        }

        logServerEvent('debug', 'chromium_command_success', {
          method,
          params,
          result: payload.result || {}
        });
        resolve(payload.result || {});
      } catch (error) {
        logServerEvent('error', 'chromium_command_parse_error', {
          method,
          message: error?.message || String(error)
        });
        reject(error);
      }
    });

    ws.on('error', (error) => {
      logServerEvent('error', 'chromium_socket_error', {
        method,
        message: error?.message || String(error)
      });
      reject(error);
    });
  });
}

async function navigateChromiumBack() {
  const historyLength = await sendChromiumCommand('Runtime.evaluate', {
    expression: 'window.history.length',
    returnByValue: true
  });
  const canGoBack = Number(historyLength?.result?.value) > 1;

  if (!canGoBack) {
    return false;
  }

  await sendChromiumCommand('Runtime.evaluate', {
    expression: 'window.history.back()',
    awaitPromise: false
  });
  return true;
}

function registerRtspRelayRoutes(app) {
  app.get('/api/streams/channel-:channelId/index.m3u8', async (req, res) => {
    const channel = getChannelById(req.params.channelId);
    if (!channel?.usesRtspRelay) {
      res.status(404).json({ error: 'Unknown RTSP relay channel' });
      return;
    }

    try {
      const relayState = await ensureRtspRelayReady(channel);
      relayState.lastAccessedAt = Date.now();
      res.setHeader('Cache-Control', 'no-store');
      res.type('application/vnd.apple.mpegurl');
      res.sendFile(relayState.playlistPath);
    } catch (error) {
      logServerEvent('error', 'rtsp_relay_playlist_failed', {
        channelId: channel.id,
        sourceUrl: redactUrlCredentials(channel.sourceUrl),
        message: error?.message || String(error)
      });
      res.status(502).json({ error: `Failed to start RTSP relay for channel ${channel.id}` });
    }
  });

  app.get('/api/streams/channel-:channelId/:fileName', async (req, res) => {
    const channel = getChannelById(req.params.channelId);
    const fileName = String(req.params.fileName || '').trim();
    if (!channel?.usesRtspRelay || !/^[A-Za-z0-9._-]+$/u.test(fileName)) {
      res.status(404).end();
      return;
    }

    try {
      const relayState = await ensureRtspRelayReady(channel);
      const filePath = path.join(relayState.outputDir, fileName);
      const relativePath = path.relative(relayState.outputDir, filePath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        res.status(400).end();
        return;
      }

      await waitForFile(filePath, 5000);
      relayState.lastAccessedAt = Date.now();
      res.setHeader('Cache-Control', 'no-store');
      if (fileName.toLowerCase().endsWith('.ts')) {
        res.type('video/mp2t');
      }
      res.sendFile(filePath);
    } catch (error) {
      logServerEvent('warn', 'rtsp_relay_segment_failed', {
        channelId: channel.id,
        fileName,
        message: error?.message || String(error)
      });
      res.status(404).end();
    }
  });
}

function buildSetupConfigResponse() {
  const currentSettings = getCurrentSettings();

  return {
    channelUrls: {
      '11': String(currentSettings.channelUrls?.['11'] || process.env.CHANNEL11_URL || ''),
      '12': String(currentSettings.channelUrls?.['12'] || process.env.CHANNEL12_URL || ''),
      '13': String(currentSettings.channelUrls?.['13'] || process.env.CHANNEL13_URL || ''),
      '16': String(currentSettings.channelUrls?.['16'] || process.env.CHANNEL16_URL || '')
    },
    emergencyContactsRaw: String(currentSettings.emergencyContactsRaw || process.env.EMERGENCY_CONTACTS || ''),
    weatherCitiesRaw: String(currentSettings.weatherCitiesRaw || process.env.WEATHER_CITIES || ''),
    newsUrls: getConfiguredNewsUrls()
  };
}

function registerApiRoutes(app, appName) {
  app.use(createApiRequestLogger(appName));
  app.use(express.json());

  app.post('/api/diagnostics/client-log', (req, res) => {
    if (!enableClientDiagnostics) {
      return res.status(202).json({ ok: true, skipped: true });
    }

    const payload = req.body || {};
    logClientEvent(
      typeof payload.level === 'string' ? payload.level : 'info',
      typeof payload.event === 'string' ? payload.event : 'client_event',
      {
        app: appName,
        ...payload,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || ''
      }
    );

    res.status(202).json({ ok: true });
  });

  app.get('/api/setup/config', (_req, res) => {
    res.json(buildSetupConfigResponse());
  });

  app.post('/api/setup/config', (req, res) => {
    try {
      const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const incomingChannelUrls =
        payload.channelUrls && typeof payload.channelUrls === 'object' && !Array.isArray(payload.channelUrls)
          ? payload.channelUrls
          : {};
      const nextSettings = {
        ...getCurrentSettings(),
        channelUrls: {
          '11': String(incomingChannelUrls['11'] || '').trim(),
          '12': String(incomingChannelUrls['12'] || '').trim(),
          '13': String(incomingChannelUrls['13'] || '').trim(),
          '16': String(incomingChannelUrls['16'] || '').trim()
        },
        emergencyContactsRaw: String(payload.emergencyContactsRaw || '').trim(),
        weatherCitiesRaw: String(payload.weatherCitiesRaw || '').trim(),
        newsUrls: {
          ynetBreakingNewsUrl: String(payload.newsUrls?.ynetBreakingNewsUrl || '').trim(),
          makoNewsRssUrl: String(payload.newsUrls?.makoNewsRssUrl || '').trim(),
          israelHayomNewsUrl: String(payload.newsUrls?.israelHayomNewsUrl || '').trim(),
          kanBreakingNewsUrl: String(payload.newsUrls?.kanBreakingNewsUrl || '').trim(),
          kanHeadlinesUrl: String(payload.newsUrls?.kanHeadlinesUrl || '').trim()
        }
      };

      parseEmergencyContacts(nextSettings.emergencyContactsRaw);
      parseWeatherCitiesConfig(nextSettings.weatherCitiesRaw);
      savePersistedSettings(nextSettings);

      const availableChannelIds = new Set(getChannels().map((channel) => channel.id));
      const availableWeatherCityIds = new Set(getWeatherCities().map((city) => city.id));
      if (!availableChannelIds.has(controlState.channelId)) {
        controlState.channelId = getDefaultChannelId();
      }
      if (!availableWeatherCityIds.has(controlState.weatherCityId)) {
        controlState.weatherCityId = getDefaultWeatherCityId();
      }
      controlState.updatedAt = Date.now();

      res.json({ ok: true, config: buildSetupConfigResponse() });
    } catch (error) {
      res.status(400).json({ error: error?.message || 'Failed to save setup config' });
    }
  });

  app.get('/api/channels', (_req, res) => {
    res.json(getChannels());
  });

  app.get('/api/control/state', (_req, res) => {
    res.json(controlState);
  });

  app.get('/api/runtime-config', (req, res) => {
    res.json({
      alertsRefreshMs,
      hlsConfig: {
        lowLatencyMode: hlsLowLatencyMode,
        liveSyncDurationCount: hlsLiveSyncDurationCount,
        liveMaxLatencyDurationCount: hlsLiveMaxLatencyDurationCount,
        backBufferLength: hlsBackBufferLength,
        maxBufferLength: hlsMaxBufferLength,
        maxMaxBufferLength: hlsMaxMaxBufferLength,
        maxBufferHole: hlsMaxBufferHole,
        highBufferWatchdogPeriod: hlsHighBufferWatchdogPeriod
      },
      tvNewsPageLimit,
      tvNewsMaxAgeMinutes,
      alertsNewsScrollDurationMs,
      alertsNewsScrollPauseMs,
      defaultVolume: defaultVolumePercent,
      newsItemsPerSource,
      newsMaxAgeMinutes,
      maxStoredMessages,
      remoteControlUrl: getRemoteControlUrl(req),
      emergencyContacts: getCurrentEmergencyContacts(),
      clientDiagnosticsEnabled: enableClientDiagnostics
    });
  });

  app.get('/api/remote-qr', async (req, res) => {
    try {
      const svg = await QRCode.toString(getRemoteControlUrl(req), {
        type: 'svg',
        margin: 1,
        width: 160,
        color: {
          dark: '#16110b',
          light: '#f7edd8'
        }
      });

      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(svg);
    } catch (error) {
      console.error('Failed to generate remote QR:', error);
      res.status(500).send('QR generation failed');
    }
  });

  app.post('/api/control/state', (req, res) => {
    const { mode, channelId, weatherCityId, fullscreen, playback, weatherAutoscroll, volume, lastVolume, muted, refresh, browserBack, source } = req.body || {};
    logServerEvent('info', 'control_state_request', {
      app: appName,
      body: req.body || {}
    });

    const next = {};

    if (mode === 'channel' || mode === 'weather') {
      next.mode = mode;
    }

    if (typeof channelId === 'string' && getChannels().some((ch) => ch.id === channelId)) {
      next.channelId = channelId;
    }

    if (typeof weatherCityId === 'string' && getWeatherCities().some((city) => city.id === weatherCityId)) {
      next.weatherCityId = weatherCityId;
    }

    if (typeof fullscreen === 'boolean') {
      next.fullscreen = fullscreen;
    }

    if (playback === 'playing' || playback === 'paused' || playback === 'stopped') {
      next.playback = playback;
    }

    if (weatherAutoscroll === 'playing' || weatherAutoscroll === 'paused') {
      next.weatherAutoscroll = weatherAutoscroll;
    }

    if (typeof volume === 'number' && Number.isFinite(volume)) {
      next.volume = Math.max(0, Math.min(100, Math.round(volume)));
      if (next.volume > 0 && !(typeof lastVolume === 'number' && Number.isFinite(lastVolume))) {
        next.lastVolume = next.volume;
      }
    }

    if (typeof lastVolume === 'number' && Number.isFinite(lastVolume)) {
      next.lastVolume = Math.max(0, Math.min(100, Math.round(lastVolume)));
    }

    if (typeof muted === 'boolean') {
      next.muted = muted;
    }

    if (refresh === true) {
      next.refreshRequestedAt = Date.now();
    }

    if (browserBack === true) {
      next.browserBackRequestedAt = Date.now();
    }

    if (Object.keys(next).length === 0) {
      logServerEvent('warn', 'control_state_rejected', {
        app: appName,
        body: req.body || {}
      });
      return res.status(400).json({ error: 'No valid control fields provided' });
    }

    const updated = updateControlState(next, typeof source === 'string' ? source : 'client');
    return res.json(updated);
  });

  app.post('/api/browser/refresh', (_req, res) => {
    logServerEvent('info', 'browser_refresh_requested', { app: appName });
    if (!fs.existsSync(kioskRestartScriptPath)) {
      logServerEvent('error', 'browser_refresh_script_missing', {
        app: appName,
        kioskRestartScriptPath
      });
      return res.status(404).json({ error: 'Kiosk restart script not found' });
    }

    try {
      const child = spawn('bash', [kioskRestartScriptPath], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          CHROMIUM_BIN: process.env.CHROMIUM_BIN || '/usr/bin/chromium'
        }
      });
      child.unref();
      logServerEvent('info', 'browser_refresh_accepted', {
        app: appName,
        script: kioskRestartScriptPath
      });
      return res.status(202).json({ ok: true });
    } catch (error) {
      console.error('Failed to refresh kiosk browser:', error);
      logServerEvent('error', 'browser_refresh_failed', {
        app: appName,
        message: error?.message || String(error)
      });
      return res.status(500).json({ error: 'Failed to refresh browser' });
    }
  });

  app.post('/api/browser/back', async (_req, res) => {
    try {
      logServerEvent('info', 'browser_back_requested', { app: appName });
      const navigated = await navigateChromiumBack();
      logServerEvent(navigated ? 'info' : 'warn', 'browser_back_result', {
        app: appName,
        navigated
      });
      return res.status(navigated ? 202 : 409).json({ ok: navigated });
    } catch (error) {
      console.error('Failed to navigate browser back:', error);
      logServerEvent('error', 'browser_back_failed', {
        app: appName,
        message: error?.message || String(error),
        stack: error?.stack || ''
      });
      return res.status(500).json({ error: 'Failed to navigate browser back' });
    }
  });

  app.post('/api/browser/close', async (_req, res) => {
    try {
      logServerEvent('info', 'browser_close_requested', { app: appName });
      const closed = await closeKioskBrowser();
      logServerEvent(closed ? 'info' : 'warn', 'browser_close_result', {
        app: appName,
        closed
      });
      return res.status(closed ? 202 : 409).json({ ok: closed });
    } catch (error) {
      console.error('Failed to close browser:', error);
      logServerEvent('error', 'browser_close_failed', {
        app: appName,
        message: error?.message || String(error),
        stack: error?.stack || ''
      });
      return res.status(500).json({ error: 'Failed to close browser' });
    }
  });

  app.post('/api/audio/beep', (_req, res) => {
    logServerEvent('info', 'audio_beep_requested', { app: appName });

    try {
      const command = fs.existsSync(customBeepSoundPath)
        ? {
            bin: 'ffplay',
            args: [
              '-nodisp',
              '-autoexit',
              '-loglevel',
              'error',
              customBeepSoundPath
            ]
          }
        : fs.existsSync(piBeepSoundPath)
          ? { bin: 'aplay', args: ['-D', alsaBeepDevice, piBeepSoundPath] }
          : { bin: 'speaker-test', args: ['-t', 'sine', '-f', '880', '-l', '1'] };

      const child = spawn(command.bin, command.args, {
        detached: true,
        stdio: 'ignore',
        env: process.env
      });
      child.unref();

      logServerEvent('info', 'audio_beep_accepted', {
        app: appName,
        command: command.bin,
        args: command.args
      });
      return res.status(202).json({ ok: true });
    } catch (error) {
      logServerEvent('error', 'audio_beep_failed', {
        app: appName,
        message: error?.message || String(error)
      });
      return res.status(500).json({ error: 'Failed to play beep' });
    }
  });

  app.post('/api/control/ping', (req, res) => {
    const { source } = req.body || {};
    const updated = updateControlState({}, typeof source === 'string' ? source : 'client');
    return res.json(updated);
  });

  app.get('/api/control/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    logServerEvent('info', 'sse_client_connected', {
      app: appName,
      sseClientCount: sseClients.size,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || ''
    });
    res.write(`data: ${JSON.stringify(controlState)}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
      logServerEvent('info', 'sse_client_disconnected', {
        app: appName,
        sseClientCount: sseClients.size,
        ip: req.ip
      });
      res.end();
    });
  });

  app.get('/api/weather/cities', (_req, res) => {
    res.json({
      defaultCityId: getDefaultWeatherCityId(),
      cities: getSortedWeatherCities().map(({ id, name }) => ({ id, name }))
    });
  });

  app.get('/api/weather/current', async (req, res) => {
    try {
      const weatherCities = getWeatherCities();
      const defaultWeatherCityId = getDefaultWeatherCityId();
      const requestedCityId = typeof req.query.city === 'string' ? req.query.city : defaultWeatherCityId;
      const city = weatherCities.find((entry) => entry.id === requestedCityId) || weatherCities.find((entry) => entry.id === defaultWeatherCityId);
      const resolvedCoordinates = await resolveWeatherCityCoordinates(city);
      const timezone = process.env.TIMEZONE || 'Asia/Jerusalem';

      const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
      weatherUrl.searchParams.set('latitude', String(resolvedCoordinates.lat));
      weatherUrl.searchParams.set('longitude', String(resolvedCoordinates.lon));
      weatherUrl.searchParams.set(
        'current',
        'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,cloud_cover,pressure_msl'
      );
      weatherUrl.searchParams.set(
        'hourly',
        'temperature_2m,weather_code,precipitation_probability,cloud_cover,uv_index,pressure_msl,relative_humidity_2m'
      );
      weatherUrl.searchParams.set(
        'daily',
        'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,uv_index_max'
      );
      weatherUrl.searchParams.set('timezone', timezone);
      weatherUrl.searchParams.set('forecast_days', '7');

      const airQualityUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
      airQualityUrl.searchParams.set('latitude', String(resolvedCoordinates.lat));
      airQualityUrl.searchParams.set('longitude', String(resolvedCoordinates.lon));
      airQualityUrl.searchParams.set('current', 'us_aqi,pm2_5');
      airQualityUrl.searchParams.set('timezone', timezone);

      const [weatherResponse, airQualityResponse] = await Promise.all([fetch(weatherUrl), fetch(airQualityUrl)]);

      if (!weatherResponse.ok) {
        throw new Error(`Weather API error: ${weatherResponse.status}`);
      }

      if (!airQualityResponse.ok) {
        throw new Error(`Air quality API error: ${airQualityResponse.status}`);
      }

      const [data, airQuality] = await Promise.all([weatherResponse.json(), airQualityResponse.json()]);
      res.json({
        city: {
          id: city.id,
          name: city.name,
          lat: resolvedCoordinates.lat,
          lon: resolvedCoordinates.lon
        },
        airQuality,
        ...data
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch weather data' });
    }
  });

  app.get('/api/alerts/current', async (_req, res) => {
    try {
      const current = await refreshAlertsCurrent();
      res.json(current);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: 'Failed to fetch current alerts',
        cached: alertsState.current
      });
    }
  });

  app.get('/api/alerts/history', async (req, res) => {
    try {
      await refreshAlertsCurrent();
      const history = await refreshAlertsHistory();
      const limit = Math.max(1, Math.min(maxStoredMessages, Number(req.query.limit || alertsHistoryLimit)));
      res.json({
        items: history.slice(0, limit),
        source: pikudHaorefHistoryUrl ? 'official-or-cache' : 'local-cache'
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: 'Failed to fetch alert history',
        items: alertsState.history.slice(0, maxStoredMessages)
      });
    }
  });

  app.get('/api/news/combined', async (req, res) => {
    try {
      const force = req.query.force === '1' || req.query.force === 'true';
      const items = await refreshNewsCombined(force);
      const limit = Math.max(1, Math.min(maxStoredMessages, Number(req.query.limit || newsItemsPerSource * 4)));
      const maxAgeMinutes = Math.max(1, Number(req.query.maxAgeMinutes || newsMaxAgeMinutes));
      const visibleItems = getRecentNewsItems(items, Date.now(), maxAgeMinutes);
      res.json({
        items: visibleItems.slice(0, limit),
        fetchedAt: new Date(newsState.fetchedAt || Date.now()).toISOString()
      });
    } catch (error) {
      console.error(error);
      const maxAgeMinutes = Math.max(1, Number(req.query.maxAgeMinutes || newsMaxAgeMinutes));
      const visibleItems = getRecentNewsItems(newsState.items, Date.now(), maxAgeMinutes);
      res.status(500).json({
        error: 'Failed to fetch combined news',
        items: visibleItems.slice(0, maxStoredMessages),
        fetchedAt: new Date(newsState.fetchedAt || Date.now()).toISOString()
      });
    }
  });
}

registerApiRoutes(tvApp, 'tv');
registerApiRoutes(remoteApp, 'remote');
registerRtspRelayRoutes(tvApp);
registerRtspRelayRoutes(remoteApp);

tvApp.use(express.static(path.join(__dirname, 'public')));
remoteApp.use(express.static(path.join(__dirname, 'public-remote')));

tvApp.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

remoteApp.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public-remote', 'index.html'));
});

tvApp.listen(tvPort, '0.0.0.0', () => {
  logServerEvent('info', 'tv_app_listening', {
    host: '0.0.0.0',
    port: tvPort
  });
  console.log(`TV app running at http://0.0.0.0:${tvPort}`);
});

remoteApp.listen(remotePort, '0.0.0.0', () => {
  logServerEvent('info', 'remote_app_listening', {
    host: '0.0.0.0',
    port: remotePort
  });
  console.log(`Remote control running at http://0.0.0.0:${remotePort}`);
});
