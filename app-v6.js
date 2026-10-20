/* ==========================================================================
   ලංකාweather · v6 add-on module – the dynamic, real-time layer
   Dynamic 1–20: live updates without reloading, animated map, map pop-ups,
   sky backgrounds, rain/snow/lightning effects, animated counters, draggable
   hourly timeline, in-place charts, recent searches, alert pop-ups, instant
   layers, location transitions, animated wind, live sun timers, comparison
   charts, drag-and-drop layout, hour-by-hour recommendations, refresh
   interval, instant unit/time conversion and network status with retry.
   Loaded after app.js, app-v4.js and app-v5.js.
   ========================================================================== */
(function () {
  'use strict';
  if (!window.V4 || !window.V5) { console.error('app-v6.js needs app-v4.js and app-v5.js'); return; }

  const V6 = window.V6 = { charts: {} };
  const safe = V6.safe = (name, fn) => { try { return fn(); } catch (e) { console.error(`[v6:${name}]`, e); return undefined; } };
  const LIVE_KEY = 'lanka_weather_live_v1';
  const Live = Object.assign({ interval: 900, pauseHidden: true, fx: 'auto', counters: true, popups: true, sound: false, timeFormat: '12' }, store.get(LIVE_KEY, {}) || {});
  const saveLive = () => store.set(LIVE_KEY, Live);
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionOn = () => Live.counters && !reducedMotion();
  const pad = (n) => String(n).padStart(2, '0');
  const currentData = () => { try { return weatherFor(activeLoc()); } catch (e) { return null; } };
  const isTyping = () => { const a = document.activeElement; return a && (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable); };
  const modalOpen = () => !!document.querySelector('.modal-backdrop:not(.hidden)');
  const colomboHour = (iso) => Number(new Date(iso).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Colombo' })) % 24;
  const colomboDay = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
  const relDayIso = (iso) => { const d = colomboDay(iso), t = colomboDay(Date.now()); if (d === t) return 'Today'; if (d === colomboDay(Date.now() + 86400000)) return 'Tomorrow'; return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Colombo' }); };
  const fmtInterval = (sec) => (sec >= 3600 ? `${sec / 3600}h` : `${sec / 60}m`);
  const hms = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${pad(m)}m ${pad(s % 60)}s` : `${m}m ${pad(s % 60)}s`; };
  const DEFAULT_ORDER6 = [...document.querySelectorAll('#main-content > [data-widget]')].map(n => n.dataset.widget);

  AppState.refreshIntervalSec = Number.isFinite(+Live.interval) ? +Live.interval : 900;
  AppState.timeFormat = Live.timeFormat === '24' ? '24' : '12';

  // ------------------------------------------------------------------------
  // Dynamic 19 · Instant unit & time-format conversion (no reload)
  // ------------------------------------------------------------------------
  const origColomboTime = window.colomboTime, origHourLabel = window.hourLabel;
  window.colomboTime = function (date, opts = {}) {
    if (AppState.timeFormat !== '24') return origColomboTime(date, opts);
    return origColomboTime(date, Object.assign({}, opts, { hour12: undefined, hourCycle: 'h23' }));
  };
  window.hourLabel = function (iso) {
    if (AppState.timeFormat !== '24') return origHourLabel(iso);
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Colombo' });
  };
  function syncTimeFmtButtons() {
    document.querySelectorAll('#v6-timefmt button').forEach(b => { const on = b.dataset.value === AppState.timeFormat; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  }
  function setTimeFormat(v) {
    AppState.timeFormat = v === '24' ? '24' : '12';
    Live.timeFormat = AppState.timeFormat; saveLive();
    syncTimeFmtButtons();
    rerenderForUnits();
    showToast(`Times now shown in ${AppState.timeFormat}-hour format`, 'info', 1800);
  }

  // ------------------------------------------------------------------------
  // Dynamic 6 · Animated counters (numbers count to their new value)
  // ------------------------------------------------------------------------
  const NUM_RE = /-?\d+(?:\.\d+)?/g;
  function animateChange(el, oldText, { flash = true } = {}) {
    if (!el) return;
    const newText = el.textContent;
    if (oldText == null || oldText === newText) return;
    const a = oldText.match(NUM_RE), b = newText.match(NUM_RE);
    const skeleton = (t) => t.replace(NUM_RE, '#');
    if (flash && a && b) {
      const dir = parseFloat(b[0]) > parseFloat(a[0]) ? 'v6-up' : parseFloat(b[0]) < parseFloat(a[0]) ? 'v6-down' : '';
      if (dir) { el.classList.remove('v6-up', 'v6-down'); void el.offsetWidth; el.classList.add(dir); clearTimeout(el._v6f); el._v6f = setTimeout(() => el.classList.remove(dir), 1400); }
    }
    if (!motionOn() || !a || !b || a.length !== b.length || skeleton(oldText) !== skeleton(newText) || el.children.length) return;
    const dec = b.map(s => (s.split('.')[1] || '').length);
    const from = a.map(Number), to = b.map(Number);
    if (from.every((v, i) => Math.abs(v - to[i]) > 400)) return; // e.g. timestamps – don't count
    cancelAnimationFrame(el._v6raf);
    const t0 = performance.now(), dur = 700;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      let i = 0;
      el.textContent = newText.replace(NUM_RE, () => { const v = from[i] + (to[i] - from[i]) * e; const s = v.toFixed(dec[i]); i++; return s === '-0' ? '0' : s; });
      if (k < 1) el._v6raf = requestAnimationFrame(step); else el.textContent = newText;
    };
    el._v6raf = requestAnimationFrame(step);
  }
  V6.animateChange = animateChange;
  const COUNTER_SEL = '#current-temp, #today-max-temp, #today-min-temp, #feels-like-temp, #current-humidity, #current-rain, #current-uv, #current-wind, #surface-pressure, #visibility-dist, #cloud-cover-val, #dew-point-val, #spotlight-temp-val';
  const origHero = window.renderHeroWeather;
  window.renderHeroWeather = function (data) {
    const els = [...document.querySelectorAll(COUNTER_SEL)];
    const before = els.map(e => e.textContent);
    const r = origHero.apply(this, arguments);
    if (AppState.hasLoadedOnce) els.forEach((e, i) => animateChange(e, before[i]));
    safe('delta', () => renderDelta(data));
    return r;
  };

  // ------------------------------------------------------------------------
  // Dynamic 18 · Automatic refresh with a customisable interval
  // ------------------------------------------------------------------------
  window.startCountdownTimer = function () {
    clearInterval(AppState.countdownIntervalId);
    AppState.hourlyUpdateSecondsLeft = AppState.refreshIntervalSec || 0;
    AppState.countdownIntervalId = setInterval(tickCountdown, 1000);
    window.renderCountdownDisplay();
  };
  function tickCountdown() {
    const sec = AppState.refreshIntervalSec;
    if (sec && !(Live.pauseHidden && document.hidden)) {
      AppState.hourlyUpdateSecondsLeft = Math.max(0, AppState.hourlyUpdateSecondsLeft - 1);
      if (AppState.hourlyUpdateSecondsLeft === 0 && !AppState.isRefreshing) liveRefresh('timer');
    }
    window.renderCountdownDisplay();
  }
  window.renderCountdownDisplay = function () {
    const el = $('countdown-timer');
    if (!el) return;
    const sec = AppState.refreshIntervalSec;
    if (!sec) { el.textContent = 'Paused'; return; }
    if (Live.pauseHidden && document.hidden) { el.textContent = 'Paused'; return; }
    const s = AppState.hourlyUpdateSecondsLeft;
    el.textContent = s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  };
  function syncIntervalUI() {
    const sec = AppState.refreshIntervalSec;
    document.querySelectorAll('#v6-interval button').forEach(b => { const on = +b.dataset.sec === sec; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    const lbl = $('update-label');
    if (lbl) lbl.textContent = sec ? `Live Sync (${fmtInterval(sec)})` : 'Live Sync (off)';
    $('update-pill').classList.toggle('is-paused', !sec);
    renderLiveStatus();
  }
  function setRefreshInterval(sec) {
    AppState.refreshIntervalSec = sec;
    Live.interval = sec; saveLive();
    window.startCountdownTimer();
    syncIntervalUI();
    showToast(sec ? `Weather will refresh automatically every ${sec >= 3600 ? `${sec / 3600} hour${sec > 3600 ? 's' : ''}` : `${sec / 60} minutes`}` : 'Automatic refresh is off – use the ↻ button to refresh', 'info', 2400);
  }
  async function liveRefresh() {
    if (AppState.isRefreshing) return;
    // make sure the exact place being viewed is re-fetched too
    const p = AppState.selectedPlace;
    if (p && AppState.placeWeatherCache[placeKey(p)]) AppState.placeWeatherCache[placeKey(p)].fetchedAt = 0;
    // Big model grids are only forced hourly – shorter intervals reuse their caches (keeps within free API limits)
    await window.refreshAllData({ isAuto: (AppState.refreshIntervalSec || 3600) >= 3600, silent: true, live: true });
  }
  function renderLiveStatus() {
    const el = $('v6-live-status');
    if (!el) return;
    const at = AppState.lastFetchedAt;
    const src = { live: 'live data', cache: 'saved data', sample: 'sample data' }[AppState.dataSource] || 'loading';
    el.innerHTML = `${at ? `Last update <strong>${colomboTime(at, { second: '2-digit' })}</strong> (${timeAgo(at)}) · ${src}` : 'Waiting for the first update…'}${Live.lastChanges ? `<br>${escapeHtml(Live.lastChanges)}` : ''}`;
  }

  // ------------------------------------------------------------------------
  // Dynamic 1 · Real-time updates without reloading (with change highlights)
  // ------------------------------------------------------------------------
  const Delta = { prev: null };
  function snapshot() {
    const x = currentData();
    const districts = {};
    Object.entries(AppState.districtWeatherCache || {}).forEach(([n, d]) => { districts[n] = { t: d.currentTemp, r: d.rainProb, w: d.windSpeed }; });
    return { key: activeLoc().key, x: x ? { t: x.currentTemp, r: x.rainProb, w: x.windSpeed, h: x.humidity, at: x.fetchedAt } : null, districts, src: AppState.dataSource, at: AppState.lastFetchedAt };
  }
  const origRefresh = window.refreshAllData;
  window.refreshAllData = async function (opts = {}) {
    if (AppState.isRefreshing) return origRefresh.call(this, opts);
    const before = snapshot();
    const r = await origRefresh.call(this, opts);
    safe('after-refresh', () => afterRefresh(before, opts));
    return r;
  };
  function afterRefresh(before, opts) {
    renderLiveStatus();
    scheduleRetry();
    if (AppState.dataSource !== 'live' || !before.at) return;
    // what changed?
    const changed = [];
    Object.entries(AppState.districtWeatherCache).forEach(([n, d]) => {
      const p = before.districts[n];
      if (!p) return;
      if (Math.abs(d.currentTemp - p.t) >= 0.5 || Math.abs(d.rainProb - p.r) >= 10) changed.push(n);
    });
    if (motionOn()) changed.forEach(n => {
      const path = document.getElementById(districtId(findDistrict(n)));
      if (path) { path.classList.remove('v6-changed'); void path.getBoundingClientRect(); path.classList.add('v6-changed'); setTimeout(() => path.classList.remove('v6-changed'), 3300); }
      const pin = document.querySelector(`.map-pin-group[data-name="${CSS.escape(n)}"]`);
      if (pin) { pin.classList.add('v6-pin-pulse'); setTimeout(() => pin.classList.remove('v6-pin-pulse'), 2400); }
    });
    const x = currentData(), loc = activeLoc();
    const sameLoc = before.key === loc.key && before.x && x;
    if (sameLoc) Delta.prev = { t: before.x.t, at: before.at };
    const dt = sameLoc ? x.currentTemp - before.x.t : 0;
    Live.lastChanges = `${changed.length} district${changed.length === 1 ? '' : 's'} changed${sameLoc && Math.abs(dt) >= 0.1 ? ` · ${loc.name} ${dt > 0 ? '▲' : '▼'} ${Math.abs(cToUnit(x.currentTemp) - cToUnit(before.x.t)).toFixed(1)}°` : ''}`;
    renderLiveStatus();
    if (x) renderDelta(x);
    if (opts.silent && x) liveBubble(`<i class="fa-solid fa-satellite-dish"></i> Live update · ${escapeHtml(loc.name)} <strong>${formatTemp(x.currentTemp)}</strong>${sameLoc && Math.abs(dt) >= 0.1 ? ` <span class="${dt > 0 ? 'up' : 'down'}">${dt > 0 ? '▲' : '▼'}${Math.abs(cToUnit(x.currentTemp) - cToUnit(before.x.t)).toFixed(1)}°</span>` : ''} · ${changed.length} change${changed.length === 1 ? '' : 's'}`);
    safe('popup', refreshPopup);
  }
  function renderDelta(x) {
    const wrap = document.querySelector('.hero-temp-display');
    if (!wrap) return;
    let chip = $('v6-temp-delta');
    if (!chip) { chip = document.createElement('span'); chip.id = 'v6-temp-delta'; chip.className = 'v6-temp-delta'; wrap.appendChild(chip); }
    const p = Delta.prev;
    if (!p || !x || !isNum(p.t)) { chip.hidden = true; return; }
    const d = cToUnit(x.currentTemp) - cToUnit(p.t);
    chip.hidden = false;
    chip.className = `v6-temp-delta ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : 'flat'}`;
    chip.innerHTML = `${d > 0.05 ? '▲' : d < -0.05 ? '▼' : '●'} ${Math.abs(d).toFixed(1)}° <small>since ${colomboTime(p.at)}</small>`;
    chip.title = 'Change since the previous live update';
  }
  function liveBubble(html) {
    if (!motionOn() && !Live.counters) return;
    let b = $('v6-live-bubble');
    if (!b) { b = document.createElement('div'); b.id = 'v6-live-bubble'; b.className = 'v6-live-bubble'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.innerHTML = html;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), 4500);
  }
  // keep "x min ago" labels honest without re-rendering
  function tickAges() {
    const x = currentData();
    const el = $('last-updated-timestamp');
    if (x && x.fetchedAt && el) el.textContent = `${colomboTime(x.fetchedAt, { second: undefined })} (${timeAgo(x.fetchedAt)})`;
    if (!$('live-menu').classList.contains('hidden')) renderLiveStatus();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    window.renderCountdownDisplay();
    const sec = AppState.refreshIntervalSec;
    if (sec && AppState.lastFetchedAt && Date.now() - AppState.lastFetchedAt > sec * 1000 && !AppState.isRefreshing) liveRefresh('visible');
  });

  // ------------------------------------------------------------------------
  // Dynamic 20 · Loading indicators, error messages and retry buttons
  // ------------------------------------------------------------------------
  const SOURCES = [
    [/api\.open-meteo\.com\/v1\/forecast/, 'forecast', 'Weather forecast', null],
    [/air-quality-api/, 'air', 'Air quality', null],
    [/marine-api/, 'marine', 'Sea conditions', null],
    [/archive-api/, 'archive', 'Climate history', 'history'],
    [/flood-api/, 'flood', 'River flows (GloFAS)', 'floodacc'],
    [/previous-runs-api/, 'accuracy', 'Forecast accuracy', 'floodacc'],
    [/rainviewer/, 'radar', 'Rain radar', 'radar'],
    [/gdacs/, 'gdacs', 'Disaster alerts (GDACS)', 'news'],
    [/eonet/, 'eonet', 'NASA Earth events', 'news'],
    [/nominatim|geocoding-api/, 'geocode', 'Online place search', null]
  ];
  const Net = { inflight: new Map(), failed: new Map(), retryN: 0, retryAt: 0, retryTimer: null, showTimer: null };
  function sourceOf(url) {
    const s = SOURCES.find(([re]) => re.test(String(url)));
    return s ? { id: s[1], name: s[2], widget: s[3] } : { id: 'other', name: 'Data feed', widget: null };
  }
  const origFetchJSON = window.fetchJSON;
  window.fetchJSON = async function (url, opts) {
    // best-effort feeds that are expected to fail in some browsers (no CORS) are not reported
    if (/pocketworld/.test(String(url))) return origFetchJSON.call(this, url, opts);
    const src = sourceOf(url);
    Net.inflight.set(src.id, (Net.inflight.get(src.id) || 0) + 1);
    renderNet();
    try {
      const r = await origFetchJSON.call(this, url, opts);
      if (Net.failed.delete(src.id)) clearSectionError(src);
      return r;
    } catch (e) {
      if (navigator.onLine !== false) { Net.failed.set(src.id, { src, url: String(url).slice(0, 160), msg: (e && e.message) || 'network error', at: Date.now() }); showSectionError(src, e); }
      throw e;
    } finally {
      const n = (Net.inflight.get(src.id) || 1) - 1;
      if (n <= 0) Net.inflight.delete(src.id); else Net.inflight.set(src.id, n);
      renderNet();
    }
  };
  function netBox() {
    let box = $('v6-netbox');
    if (!box) {
      box = document.createElement('div'); box.id = 'v6-netbox'; box.className = 'v6-netbox hidden'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-retry]');
        if (b) { retrySource(b.dataset.retry); return; }
        if (e.target.closest('.nb-close')) { Net.failed.clear(); renderNet(); }
        if (e.target.closest('.nb-retry-all')) [...Net.failed.keys()].forEach(retrySource);
      });
    }
    return box;
  }
  function renderNet() {
    const box = netBox();
    const loading = [...Net.inflight.keys()].map(id => (SOURCES.find(s => s[1] === id) || [0, 0, 'Data'])[2]);
    const fails = [...Net.failed.values()];
    const bar = $('v6-progress') || (() => { const b = document.createElement('div'); b.id = 'v6-progress'; b.className = 'v6-progress'; document.body.appendChild(b); return b; })();
    bar.classList.toggle('active', loading.length > 0);
    if (fails.length) {
      clearTimeout(Net.showTimer);
      box.className = 'v6-netbox error';
      box.innerHTML = `<div class="nb-head"><i class="fa-solid fa-triangle-exclamation"></i> <strong>${fails.length} data feed${fails.length > 1 ? 's' : ''} didn't load</strong><button class="nb-close" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button></div>
        <ul>${fails.map(f => `<li><span>${escapeHtml(f.src.name)}<small>${escapeHtml(friendlyError(f.msg))}</small></span><button class="nb-retry" data-retry="${f.src.id}"><i class="fa-solid fa-rotate-right"></i> Retry</button></li>`).join('')}</ul>
        ${fails.length > 1 ? '<button class="nb-retry-all"><i class="fa-solid fa-rotate"></i> Retry all</button>' : ''}${loading.length ? `<p class="nb-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading ${escapeHtml(loading.slice(0, 2).join(', '))}…</p>` : ''}`;
      return;
    }
    if (loading.length) {
      clearTimeout(Net.showTimer);
      // only show the pill when loading takes a moment (avoids flicker)
      Net.showTimer = setTimeout(() => {
        const now = [...Net.inflight.keys()].map(id => (SOURCES.find(s => s[1] === id) || [0, 0, 'Data'])[2]);
        if (!now.length || Net.failed.size) return;
        box.className = 'v6-netbox loading';
        box.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating ${escapeHtml(now.slice(0, 3).join(', '))}${now.length > 3 ? '…' : ''}`;
      }, 700);
      return;
    }
    clearTimeout(Net.showTimer);
    box.className = 'v6-netbox hidden';
  }
  function friendlyError(msg) {
    const m = String(msg || '');
    if (/abort|timeout|timed out/i.test(m)) return 'The service took too long to answer.';
    if (/429/.test(m)) return 'Too many requests – try again in a minute.';
    if (/5\d\d/.test(m)) return 'The service is having problems right now.';
    if (/fetch|network/i.test(m)) return 'Network problem – check your connection.';
    return m.slice(0, 80);
  }
  function retrySource(id) {
    const f = Net.failed.get(id);
    Net.failed.delete(id);
    if (f) clearSectionError(f.src);
    renderNet();
    if (['forecast', 'air', 'marine', 'other'].includes(id)) window.refreshAllData({ manual: true });
    else if (id === 'archive') { delete AppState.historyCache[activeLoc().key]; renderHistorical(activeLoc()); }
    else if (id === 'gdacs' || id === 'eonet') { if (V5.News) V5.News.at = 0; V4.onDataRefresh({ manual: true }); }
    else if (id !== 'geocode') V4.onDataRefresh({ manual: true });
  }
  function showSectionError(src, err) {
    if (!src.widget) return;
    const sec = document.querySelector(`#main-content > [data-widget="${src.widget}"]`);
    if (!sec) return;
    let box = sec.querySelector(`.v6-section-error[data-src="${src.id}"]`);
    if (!box) {
      box = document.createElement('div'); box.className = 'v6-section-error'; box.dataset.src = src.id; box.setAttribute('role', 'alert');
      const head = sec.querySelector('.section-header-row');
      if (head) head.after(box); else sec.prepend(box);
      box.addEventListener('click', (e) => { if (e.target.closest('button')) retrySource(src.id); });
    }
    box.innerHTML = `<i class="fa-solid fa-plug-circle-exclamation"></i><span><strong>${escapeHtml(src.name)} couldn't be loaded.</strong> ${escapeHtml(friendlyError(err && err.message))}</span><button type="button" class="btn-soft"><i class="fa-solid fa-rotate-right"></i> Retry</button>`;
  }
  function clearSectionError(src) { document.querySelectorAll(`.v6-section-error[data-src="${src.id}"]`).forEach(b => b.remove()); }
  // Main forecast failed but we're online → retry automatically with back-off, and say so
  function scheduleRetry() {
    clearInterval(Net.retryTimer);
    if (AppState.dataSource === 'live' || navigator.onLine === false) { Net.retryN = 0; return; }
    // rate-limited (HTTP 429) → don't hammer the API; otherwise 30 s, 60 s, 120 s … up to 5 min
    const f = Net.failed.get('forecast');
    const limited = f && /429|limit/i.test(f.msg);
    const delay = limited ? 600 : Math.min(300, 30 * Math.pow(2, Net.retryN++));
    Net.retryAt = Date.now() + delay * 1000;
    const tick = () => {
      const left = Math.round((Net.retryAt - Date.now()) / 1000);
      const t = $('offline-banner-text');
      if (t) {
        let s = t.querySelector('.v6-retry-in');
        if (!s) { s = document.createElement('span'); s.className = 'v6-retry-in'; t.appendChild(s); }
        s.textContent = left > 0 ? ` Retrying automatically in ${left} s.` : ' Retrying now…';
      }
      if (left <= 0) { clearInterval(Net.retryTimer); window.refreshAllData({ silent: true }); }
    };
    tick();
    Net.retryTimer = setInterval(tick, 1000);
  }
  window.addEventListener('online', () => { Net.failed.clear(); document.querySelectorAll('.v6-section-error').forEach(b => b.remove()); renderNet(); });

  // ------------------------------------------------------------------------
  // Dynamic 11 · More map layers with instant switching (+ keys 1–8)
  // ------------------------------------------------------------------------
  Object.assign(LAYER_SCALES, {
    feels: { stops: [[22, '#06b6d4'], [27, '#10b981'], [31, '#facc15'], [35, '#f97316'], [39, '#dc2626'], [43, '#7f1d1d']], value: x => x.feelsLike, title: 'Feels-like temperature' },
    humidity: { stops: [[40, '#fde68a'], [55, '#a7f3d0'], [70, '#5eead4'], [80, '#38bdf8'], [90, '#3b82f6'], [100, '#4338ca']], value: x => x.humidity, title: 'Humidity now' },
    uv: { stops: [[0, '#22c55e'], [3, '#eab308'], [6, '#f97316'], [8, '#dc2626'], [11, '#9333ea'], [13, '#6b21a8']], value: x => x.uvMax, title: "Today's UV peak" },
    aqi: { stops: [[0, '#22c55e'], [50, '#eab308'], [100, '#f97316'], [150, '#dc2626'], [200, '#9333ea'], [300, '#7f1d1d']], value: x => (AppState.aqiCache[x.district] || {}).aqi, title: 'Air quality' }
  });
  const NEW_LAYERS = {
    feels: { icon: 'fa-temperature-arrow-up', pin: x => `${formatRawNum(x.feelsLike)}°`, fmt: v => `${formatRawNum(v)}°`, unit: () => `°${AppState.unit.toUpperCase()}` },
    humidity: { icon: 'fa-droplet', pin: x => `${Math.round(x.humidity)}%`, fmt: v => `${v}%`, unit: () => '%' },
    uv: { icon: 'fa-sun', pin: x => `${Math.round(x.uvMax || 0)}`, fmt: v => `${v}`, unit: () => 'UV index' },
    aqi: { icon: 'fa-smog', pin: x => { const a = (AppState.aqiCache[x.district] || {}).aqi; return isNum(a) ? `${Math.round(a)}` : '--'; }, fmt: v => `${v}`, unit: () => 'US AQI' }
  };
  const LAYER_KEYS = ['standard', 'temp', 'rain', 'wind', 'feels', 'humidity', 'uv', 'aqi'];
  const Map6 = { lastLayer: undefined };
  const origApplyMapLayer = window.applyMapLayer;
  window.applyMapLayer = function () {
    const pins = [...document.querySelectorAll('.map-pin-group .map-pin-text')];
    const before = pins.map(p => p.textContent);
    origApplyMapLayer.apply(this, arguments);
    const L = NEW_LAYERS[AppState.mapLayer];
    if (L) document.querySelectorAll('.map-pin-group').forEach(g => {
      const x = AppState.districtWeatherCache[g.dataset.name];
      const t = g.querySelector('.map-pin-text');
      if (!t) return;
      t.textContent = x ? L.pin(x) : '--';
      t.classList.toggle('small', t.textContent.length >= 4);
    });
    pins.forEach((p, i) => animateChange(p, before[i], { flash: false }));
    if (Map6.lastLayer !== undefined && Map6.lastLayer !== AppState.mapLayer && motionOn()) {
      const st = $('map-stage-wrapper');
      st.classList.remove('v6-sweep'); void st.offsetWidth; st.classList.add('v6-sweep');
      setTimeout(() => st.classList.remove('v6-sweep'), 900);
    }
    Map6.lastLayer = AppState.mapLayer;
    safe('popup', refreshPopup);
  };
  const origLegend = window.renderMapLegend;
  window.renderMapLegend = function () {
    const L = NEW_LAYERS[AppState.mapLayer];
    if (!L) return origLegend.apply(this, arguments);
    const scale = LAYER_SCALES[AppState.mapLayer], stops = scale.stops;
    const min = stops[0][0], max = stops[stops.length - 1][0];
    const gradient = stops.map(([v, c]) => `${c} ${((v - min) / (max - min) * 100).toFixed(0)}%`).join(', ');
    const legend = $('map-legend');
    legend.innerHTML = `<div class="legend-title">${scale.title} (${L.unit()})</div><div class="legend-bar" style="background: linear-gradient(90deg, ${gradient})"></div><div class="legend-labels"><span>${L.fmt(min)}</span><span>${L.fmt(Math.round((min + max) / 2))}</span><span>${L.fmt(max)}+</span></div>`;
    legend.classList.remove('hidden');
    $('map-layer-legend').innerHTML = `<i class="fa-solid ${L.icon}"></i> ${scale.title} layer`;
  };
  function setMapLayer(layer) { AppState.mapLayer = layer; window.applyMapLayer(); }

  // ------------------------------------------------------------------------
  // Dynamic 3 · Interactive map markers with weather pop-ups
  // ------------------------------------------------------------------------
  const Popup = { name: null, isPlace: false };
  function popupData() {
    if (Popup.isPlace) { const loc = activeLoc(); return { loc, x: weatherFor(loc), title: loc.name, sub: `${loc.district.name} District`, si: loc.sinhala, aqi: (AppState.placeAqiCache[loc.key] || AppState.aqiCache[loc.district.name] || {}).aqi, fav: AppState.selectedPlace }; }
    const d = findDistrict(Popup.name);
    return d ? { d, x: AppState.districtWeatherCache[d.name], title: d.name, sub: `${d.province} Province`, si: d.sinhala, aqi: (AppState.aqiCache[d.name] || {}).aqi, fav: d.name } : null;
  }
  function openPopup(name, isPlace = false) {
    Popup.name = name; Popup.isPlace = isPlace;
    renderPopup();
    const pop = $('map-popup');
    pop.classList.remove('hidden');
    if (motionOn()) { pop.classList.remove('pop-in'); void pop.offsetWidth; pop.classList.add('pop-in'); }
    positionPopup();
    // follow the zoom animation
    let n = 0; const follow = () => { positionPopup(); if (++n < 45) requestAnimationFrame(follow); }; requestAnimationFrame(follow);
  }
  function closePopup() { Popup.name = null; const p = $('map-popup'); if (p) p.classList.add('hidden'); }
  function refreshPopup() { if (Popup.name && !$('map-popup').classList.contains('hidden')) { renderPopup(); positionPopup(); } }
  function renderPopup() {
    const P = popupData(), pop = $('map-popup');
    if (!P) { closePopup(); return; }
    const x = P.x;
    if (!x) { pop.innerHTML = `<button class="mp-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><header><div><h4>${escapeHtml(P.title)}</h4><span>${escapeHtml(P.sub)}</span></div></header><p class="mp-cond"><i class="fa-solid fa-spinner fa-spin"></i> Loading weather…</p>`; return; }
    const w = getWeatherInfo(x.weatherCode, x.isDay);
    const fav = isFavorite(P.fav);
    const hrs = (x.hourly || []).slice(1, 7);
    const a = P.aqi;
    pop.innerHTML = `
      <button class="mp-close" aria-label="Close pop-up"><i class="fa-solid fa-xmark"></i></button>
      <header><i class="fa-solid ${w.icon} mp-icon" style="color:${w.color}"></i><div><h4>${escapeHtml(P.title)}</h4><span>${P.si ? `<span lang="si">${escapeHtml(P.si)}</span> · ` : ''}${escapeHtml(P.sub)}</span></div><strong class="mp-temp">${formatTemp(x.currentTemp)}</strong></header>
      <p class="mp-cond">${w.label} · feels ${formatTemp(x.feelsLike)} · ${formatTemp(x.todayMax)} / ${formatTemp(x.todayMin)}</p>
      <div class="mp-stats">
        <span title="Chance of rain today"><i class="fa-solid fa-umbrella"></i> ${Math.round(x.rainProb)}%</span>
        <span title="Wind"><svg class="mp-arrow" viewBox="-6 -6 12 12" style="transform:rotate(${((x.windDeg || 0) + 180) % 360}deg)"><path d="M0,-5 L3.5,3 L0,1.4 L-3.5,3 Z"/></svg> ${formatWind(x.windSpeed)} ${x.windDirection || ''}</span>
        <span title="Humidity"><i class="fa-solid fa-droplet"></i> ${Math.round(x.humidity)}%</span>
        <span title="Air quality"><i class="fa-solid fa-leaf"></i> ${isNum(a) ? `AQI ${Math.round(a)}` : 'AQI --'}</span>
      </div>
      ${hrs.length ? `<div class="mp-hours">${hrs.map(h => { const hw = getWeatherInfo(h.code, h.isDay); return `<div><span>${hourLabel(h.isoTime)}</span><i class="fa-solid ${hw.icon}" style="color:${hw.color}"></i><strong>${formatTemp(h.temp)}</strong><small>${Math.round(h.rainProb)}%</small></div>`; }).join('')}</div>` : ''}
      <div class="mp-actions">
        <button type="button" data-act="open"><i class="fa-solid fa-gauge-high"></i> Full forecast</button>
        <button type="button" data-act="fav" aria-pressed="${fav}"><i class="fa-${fav ? 'solid' : 'regular'} fa-star"></i> ${fav ? 'Saved' : 'Save'}</button>
        ${Popup.isPlace ? '' : '<button type="button" data-act="compare"><i class="fa-solid fa-code-compare"></i> Compare</button>'}
      </div>`;
  }
  function positionPopup() {
    const pop = $('map-popup');
    if (!pop || pop.classList.contains('hidden') || !Popup.name) return;
    const wrap = $('map-stage-wrapper');
    if (window.innerWidth < 640) { pop.classList.add('docked'); pop.style.left = ''; pop.style.top = ''; pop.classList.remove('offscreen'); return; }
    pop.classList.remove('docked');
    const svg = $('sri-lanka-svg');
    const g = Popup.isPlace ? document.querySelector('#map-pins-group .map-place-marker') : document.querySelector(`#map-pins-group .map-pin-group[data-name="${CSS.escape(Popup.name)}"]`);
    const m = svg.getScreenCTM();
    if (!g || !m) return;
    const pt = svg.createSVGPoint(); pt.x = +g.dataset.cx; pt.y = +g.dataset.cy;
    const sp = pt.matrixTransform(m), wr = wrap.getBoundingClientRect();
    const x = sp.x - wr.left, y = sp.y - wr.top;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const left = clamp(x - pw / 2, 8, Math.max(8, wr.width - pw - 8));
    let top = y - ph - 16, below = false;
    if (top < 8) { top = y + 18; below = true; }
    pop.style.left = `${left}px`; pop.style.top = `${top}px`;
    pop.style.setProperty('--arrow-x', `${clamp(x - left, 18, pw - 18)}px`);
    pop.classList.toggle('below', below);
    pop.classList.toggle('offscreen', x < -10 || x > wr.width + 10 || y < -10 || y > wr.height + 10);
  }
  const origSetViewBox = window.setViewBox;
  window.setViewBox = function () { const r = origSetViewBox.apply(this, arguments); positionPopup(); return r; };
  function initPopups() {
    const svg = $('sri-lanka-svg');
    // capture phase: pins stop propagation of their own clicks
    svg.addEventListener('click', (e) => {
      const place = e.target.closest('.map-place-marker');
      if (place) { openPopup(activeLoc().name, true); return; }
      const el = e.target.closest('.district-path, .map-pin-group');
      if (!el) { if (!e.target.closest('#map-popup')) closePopup(); return; }
      const name = el.dataset.name;
      // only when the click selected the district (not after a drag-to-pan)
      setTimeout(() => { if (!e.defaultPrevented && AppState.selectedDistrict.name === name) openPopup(name); }, 0);
    }, true);
    svg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('.district-path');
      if (el) setTimeout(() => openPopup(el.dataset.name), 0);
    });
    $('map-popup').addEventListener('click', (e) => {
      if (e.target.closest('.mp-close')) { closePopup(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const P = popupData();
      if (!P) return;
      if (b.dataset.act === 'open') {
        if (!Popup.isPlace && AppState.selectedDistrict.name !== P.d.name) selectDistrictAndZoom(P.d, { toast: false });
        closePopup();
        $('primary-weather-card').scrollIntoView({ behavior: motionOn() ? 'smooth' : 'auto', block: 'start' });
      } else if (b.dataset.act === 'fav') {
        toggleFavorite(P.fav); renderPopup();
      } else if (b.dataset.act === 'compare') {
        const other = activeLoc().isPlace ? `p:${activeLoc().key}` : (activeLoc().district.name !== P.d.name ? activeLoc().district.name : (P.d.name === 'Colombo' ? 'Nuwara Eliya' : 'Colombo'));
        openModal('compare-modal-backdrop');
        prepareComparison(P.d.name, other);
      }
    });
    window.addEventListener('resize', positionPopup);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && Popup.name && !modalOpen()) closePopup();
      // Dynamic 11: number keys switch map layers instantly
      if (isTyping() || modalOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = Number(e.key);
      if (i >= 1 && i <= LAYER_KEYS.length && document.querySelector(`.map-layer-btn[data-layer="${LAYER_KEYS[i - 1]}"]`)) setMapLayer(LAYER_KEYS[i - 1]);
    });
    document.querySelectorAll('.map-layer-btn').forEach(b => { const i = LAYER_KEYS.indexOf(b.dataset.layer); if (i >= 0) b.title = `${b.title} (key ${i + 1})`; });
  }

  // ------------------------------------------------------------------------
  // Dynamic 4 · Backgrounds that follow the weather and the time of day
  // ------------------------------------------------------------------------
  const SKY = {
    'clear-day': 'linear-gradient(180deg, rgba(56,189,248,0.38) 0%, rgba(125,211,252,0.16) 38%, rgba(125,211,252,0) 72%)',
    'partly-day': 'linear-gradient(180deg, rgba(96,165,250,0.32) 0%, rgba(203,213,225,0.18) 40%, rgba(203,213,225,0) 72%)',
    cloudy: 'linear-gradient(180deg, rgba(100,116,139,0.38) 0%, rgba(148,163,184,0.18) 42%, rgba(148,163,184,0) 74%)',
    drizzle: 'linear-gradient(180deg, rgba(71,85,105,0.38) 0%, rgba(56,189,248,0.12) 45%, rgba(56,189,248,0) 75%)',
    rain: 'linear-gradient(180deg, rgba(51,65,85,0.45) 0%, rgba(14,165,233,0.14) 45%, rgba(14,165,233,0) 76%)',
    'heavy-rain': 'linear-gradient(180deg, rgba(30,41,59,0.55) 0%, rgba(30,64,175,0.18) 48%, rgba(30,64,175,0) 78%)',
    storm: 'linear-gradient(180deg, rgba(49,46,129,0.55) 0%, rgba(91,33,182,0.22) 45%, rgba(91,33,182,0) 78%)',
    fog: 'linear-gradient(180deg, rgba(203,213,225,0.55) 0%, rgba(226,232,240,0.3) 45%, rgba(226,232,240,0) 80%)',
    snow: 'linear-gradient(180deg, rgba(224,242,254,0.65) 0%, rgba(241,245,249,0.32) 45%, rgba(241,245,249,0) 80%)',
    night: 'linear-gradient(180deg, rgba(30,27,75,0.5) 0%, rgba(30,58,138,0.2) 45%, rgba(30,58,138,0) 78%)'
  };
  const PART = {
    dawn: 'radial-gradient(ellipse 70% 55% at 12% 0%, rgba(251,146,60,0.42), rgba(244,114,182,0.18) 45%, rgba(244,114,182,0) 75%)',
    dusk: 'radial-gradient(ellipse 70% 55% at 88% 0%, rgba(249,115,22,0.42), rgba(192,38,211,0.2) 45%, rgba(192,38,211,0) 75%)',
    day: 'linear-gradient(transparent, transparent)', night: 'radial-gradient(ellipse 40% 35% at 85% 6%, rgba(199,210,254,0.28), rgba(199,210,254,0) 70%)'
  };
  const Sky = { key: '', flip: false };
  function dayPart(x) {
    if (!x || !x.sunriseISO || !x.sunsetISO) return x && x.isDay === false ? 'night' : 'day';
    const now = Date.now(), rise = +new Date(x.sunriseISO), set = +new Date(x.sunsetISO), M = 60000;
    const nextRise = x.nextSunriseISO ? +new Date(x.nextSunriseISO) : rise + 86400000;
    if (Math.abs(now - rise) <= 45 * M || Math.abs(now - nextRise) <= 45 * M) return 'dawn';
    if (now >= set - 60 * M && now <= set + 30 * M) return 'dusk';
    return now > rise && now < set ? 'day' : 'night';
  }
  function updateSky() {
    const x = currentData();
    const scene = document.body.dataset.weatherScene || 'clear-day';
    const part = dayPart(x);
    document.body.dataset.daypart = part;
    const base = scene.endsWith('night') ? (scene === 'cloudy-night' ? SKY.cloudy : SKY.night) : (SKY[scene] || SKY['clear-day']);
    const key = `${scene}|${part}`;
    const hero = $('primary-weather-card');
    if (hero) { hero.dataset.scene = scene; hero.dataset.daypart = part; }
    const art = $('weather-art-icon');
    if (art) art.dataset.fx = scene;
    if (key === Sky.key) return;
    Sky.key = key;
    const layers = document.querySelectorAll('#sky-layer .sky');
    if (layers.length < 2) return;
    Sky.flip = !Sky.flip;
    const on = layers[Sky.flip ? 1 : 0], off = layers[Sky.flip ? 0 : 1];
    on.style.backgroundImage = `${PART[part] || PART.day}, ${base}`;
    on.classList.add('on'); off.classList.remove('on');
  }

  // ------------------------------------------------------------------------
  // Dynamic 5 · Animated rain, snow, lightning and cloud effects
  // ------------------------------------------------------------------------
  const origSceneFor = Ambient.sceneFor.bind(Ambient);
  Ambient.sceneFor = function (x) {
    if (Live.fx && Live.fx !== 'auto' && Live.fx !== 'off') return Live.fx;
    const c = x.weatherCode;
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    return origSceneFor(x);
  };
  const origSetScene = Ambient.setSceneFromData.bind(Ambient);
  Ambient.setSceneFromData = function (x) { origSetScene(x); safe('sky', updateSky); };
  const origStart = Ambient.start.bind(Ambient);
  Ambient.start = function () {
    if (Live.fx === 'off') { this.stop(); if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h); return; }
    origStart();
  };
  const origBuild = Ambient.build.bind(Ambient);
  Ambient.build = function () {
    origBuild();
    const s = this.scene;
    const area = (this.w * this.h) / (1400 * 900), count = n => Math.round(n * clamp(area, 0.35, 1.6));
    if (s === 'snow') {
      for (let i = 0; i < count(160); i++) this.particles.push({ k: 'flake', x: this.rand(0, this.w), y: this.rand(-this.h, this.h), r: this.rand(1.2, 3.6), v: this.rand(25, 70), sway: this.rand(10, 40), ph: this.rand(0, Math.PI * 2) });
      for (let i = 0; i < 5; i++) this.particles.push({ k: 'cloud', x: this.rand(-200, this.w), y: this.rand(10, this.h * 0.3), s: this.rand(0.8, 1.6), v: this.rand(5, 12), a: this.rand(0.05, 0.1) });
    }
    if (s === 'cloudy' && !this.particles.some(p => p.k === 'cloud')) {
      for (let i = 0; i < 7; i++) this.particles.push({ k: 'cloud', x: this.rand(-200, this.w), y: this.rand(20, this.h * 0.45), s: this.rand(0.7, 1.6), v: this.rand(6, 18), a: this.rand(0.05, 0.12) });
    }
    this.splashes = [];
    this.bolt = null;
  };
  function makeBolt(w, h) {
    const pts = [[w * (0.2 + Math.random() * 0.6), 0]];
    let [x, y] = pts[0];
    const branches = [];
    while (y < h * (0.45 + Math.random() * 0.25)) {
      x += (Math.random() - 0.5) * 70; y += 18 + Math.random() * 34;
      pts.push([x, y]);
      if (Math.random() < 0.18) { const b = [[x, y]]; let bx = x, by = y; for (let i = 0; i < 4; i++) { bx += (Math.random() - 0.3) * 50; by += 15 + Math.random() * 25; b.push([bx, by]); } branches.push(b); }
    }
    return { pts, branches };
  }
  const origDraw = Ambient.drawFrame.bind(Ambient);
  Ambient.drawFrame = function (dt, now = performance.now()) {
    const prevFlash = this.flash;
    origDraw(dt, now);
    const { ctx, w, h } = this;
    const dark = AppState.theme === 'dark', s = this.scene;
    if (s === 'snow') {
      for (const p of this.particles) {
        if (p.k !== 'flake') continue;
        p.y += p.v * dt; p.x += Math.sin(now / 1000 + p.ph) * p.sway * dt;
        if (p.y > h + 5) { p.y = this.rand(-40, -5); p.x = this.rand(0, w); }
        ctx.fillStyle = dark ? 'rgba(241,245,249,0.85)' : 'rgba(148,163,184,0.75)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (['rain', 'heavy-rain', 'storm'].includes(s) && dt > 0) {
      const rate = s === 'rain' ? 10 : 22;
      if (Math.random() < rate * dt * 4) this.splashes.push({ x: this.rand(0, w), y: h - this.rand(2, 30), t: 0 });
      ctx.strokeStyle = dark ? 'rgba(147,197,253,0.5)' : 'rgba(2,132,199,0.4)';
      ctx.lineWidth = 1;
      this.splashes = this.splashes.filter(sp => {
        sp.t += dt * 2.6;
        if (sp.t >= 1) return false;
        ctx.globalAlpha = 1 - sp.t;
        ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 2 + sp.t * 10, 0.8 + sp.t * 2.5, 0, 0, Math.PI * 2); ctx.stroke();
        return true;
      });
      ctx.globalAlpha = 1;
    }
    if (s === 'storm' && this.flash > 0) {
      if (prevFlash <= 0 || !this.bolt) this.bolt = makeBolt(w, h);
      const a = Math.min(1, this.flash * 1.4);
      const line = (pts, width) => { ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.lineWidth = width; ctx.stroke(); };
      ctx.save();
      ctx.shadowColor = 'rgba(196,181,253,0.95)'; ctx.shadowBlur = 18;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      line(this.bolt.pts, 2.6);
      this.bolt.branches.forEach(b => line(b, 1.2));
      ctx.restore();
    } else if (this.flash <= 0) this.bolt = null;
  };
  function setEffects(fx) {
    Live.fx = fx; saveLive();
    document.querySelectorAll('#v6-effects button').forEach(b => { const on = b.dataset.fx === fx; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    Ambient.scene = null;
    const x = currentData() || { weatherCode: 1, isDay: true };
    Ambient.setSceneFromData(x);
    if (fx === 'off') Ambient.start();
  }

  // ------------------------------------------------------------------------
  // Dynamic 12 · Cards animate when the location changes
  // ------------------------------------------------------------------------
  const Loc6 = { key: null };
  function locationSwap() {
    const key = activeLoc().key;
    if (Loc6.key === key) return false;
    const first = Loc6.key === null;
    Loc6.key = key;
    Delta.prev = null;
    if (first || !motionOn()) return true;
    const targets = [$('primary-weather-card'), ...document.querySelectorAll('.side-insights-column > *'), ...[...document.querySelectorAll('#main-content .loc-label')].map(l => l.closest('.glass-card, .section-container')).filter(Boolean)];
    [...new Set(targets)].forEach((el, i) => {
      el.classList.remove('v6-swap'); void el.offsetWidth;
      el.style.setProperty('--swap-delay', `${Math.min(i, 8) * 40}ms`);
      el.classList.add('v6-swap');
      clearTimeout(el._swap); el._swap = setTimeout(() => el.classList.remove('v6-swap'), 900);
    });
    return true;
  }

  // ------------------------------------------------------------------------
  // Dynamic 13 · Animated wind direction and speed
  // ------------------------------------------------------------------------
  const Wind = { cur: null, target: 0, amp: 1, raf: null, visible: true, streaks: [], last: 0 };
  function windTarget() {
    const x = currentData();
    if (!x) return;
    const to = ((x.windDeg ?? 0) + 180) % 360;
    if (Wind.cur === null) Wind.cur = to;
    // shortest way round
    Wind.target = Wind.cur + ((((to - Wind.cur) % 360) + 540) % 360) - 180;
    Wind.amp = clamp(((x.gusts || x.windSpeed || 0) - (x.windSpeed || 0)) / 3 + (x.windSpeed || 0) / 10, 0.8, 7);
    Wind.speed = x.windSpeed || 0;
    // small arrow in the hero card
    const info = $('current-wind') && $('current-wind').closest('.stat-bubble');
    if (info) {
      let arr = info.querySelector('.v6-mini-arrow');
      if (!arr) { arr = document.createElement('span'); arr.className = 'v6-mini-arrow'; arr.setAttribute('aria-hidden', 'true'); arr.innerHTML = '<svg viewBox="-6 -6 12 12"><path d="M0,-5 L3.5,3 L0,1.4 L-3.5,3 Z"/></svg>'; info.querySelector('i').after(arr); }
      const prev = arr._deg ?? Wind.target;
      const next = prev + ((((to - prev) % 360) + 540) % 360) - 180;
      arr._deg = next;
      arr.style.transform = `rotate(${next}deg)`;
      arr.style.setProperty('--spin', `${clamp(3 - (x.windSpeed || 0) / 15, 0.6, 3)}s`);
    }
    startWindLoop();
  }
  function startWindLoop() {
    if (Wind.raf || !motionOn()) { if (!motionOn()) drawNeedle(Wind.target, 0); return; }
    const loop = (now) => {
      Wind.raf = requestAnimationFrame(loop);
      if (!Wind.visible || document.hidden) return;
      const dt = Math.min(0.05, (now - (Wind.last || now)) / 1000); Wind.last = now;
      Wind.cur += (Wind.target - Wind.cur) * Math.min(1, dt * 3.2);
      const wob = Wind.amp * (Math.sin(now / 230) * 0.6 + Math.sin(now / 71) * 0.4);
      drawNeedle(Wind.cur, wob);
      drawStreaks(dt);
    };
    Wind.raf = requestAnimationFrame(loop);
  }
  function drawNeedle(angle, wob) {
    const g = document.querySelector('#wind-compass .needle');
    if (g) g.setAttribute('transform', `rotate(${(angle + wob).toFixed(2)} 100 100)`);
  }
  function drawStreaks(dt) {
    const wrap = document.querySelector('.wind-card .compass-wrap');
    if (!wrap) return;
    let cv = wrap.querySelector('.v6-streaks');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'v6-streaks'; cv.setAttribute('aria-hidden', 'true'); wrap.prepend(cv); }
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const n = Math.round(clamp(6 + Wind.speed * 0.8, 6, 40));
    while (Wind.streaks.length < n) Wind.streaks.push({ u: Math.random() * 2 - 1, v: Math.random() * 2 - 1, len: 0.08 + Math.random() * 0.12, sp: 0.6 + Math.random() * 0.8 });
    Wind.streaks.length = n;
    const ang = (Wind.cur - 90) * Math.PI / 180;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.44;
    const vel = clamp(0.15 + Wind.speed / 60, 0.15, 1.4);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = AppState.theme === 'dark' ? 'rgba(45,212,191,0.35)' : 'rgba(13,148,136,0.3)';
    ctx.lineWidth = 1.4 * dpr; ctx.lineCap = 'round';
    for (const s of Wind.streaks) {
      s.u += vel * s.sp * dt;
      if (s.u > 1.2) { s.u = -1.2; s.v = Math.random() * 2 - 1; }
      // u along the wind, v across it
      const px = cx + (Math.cos(ang) * s.u - Math.sin(ang) * s.v) * R, py = cy + (Math.sin(ang) * s.u + Math.cos(ang) * s.v) * R;
      const tx = px - Math.cos(ang) * s.len * R, ty = py - Math.sin(ang) * s.len * R;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px, py); ctx.stroke();
    }
    ctx.restore();
  }
  function watchWindCard() {
    const card = document.querySelector('.wind-card');
    if (!card || !('IntersectionObserver' in window)) return;
    new IntersectionObserver((es) => { Wind.visible = es.some(e => e.isIntersecting); }).observe(card);
  }

  // ------------------------------------------------------------------------
  // Dynamic 14 · Live sunrise / sunset countdown timers
  // ------------------------------------------------------------------------
  function tickSun() {
    const x = currentData();
    const el = $('astro-countdown');
    if (!x || !x.sunriseISO || !x.sunsetISO || !el) return;
    const now = Date.now(), M = 60000;
    const rise = +new Date(x.sunriseISO), set = +new Date(x.sunsetISO);
    const nextRise = x.nextSunriseISO ? +new Date(x.nextSunriseISO) : rise + 86400000;
    let label, target, pct;
    if (now < rise) { label = 'Sunrise in'; target = rise; pct = 0; }
    else if (now < set) { label = 'Sunset in'; target = set; pct = (now - rise) / (set - rise) * 100; }
    else { label = 'Sunrise in'; target = nextRise; pct = 100; }
    el.innerHTML = `${label} <strong class="v6-tick">${hms(target - now)}</strong>`;
    let gold = $('v6-golden');
    if (!gold) { gold = document.createElement('span'); gold.id = 'v6-golden'; gold.className = 'v6-golden'; el.after(gold); }
    const gStart = set - 60 * M, mStart = rise, mEnd = rise + 60 * M;
    if (now >= mStart && now < mEnd) gold.textContent = `✨ Morning golden hour – ends in ${hms(mEnd - now)}`;
    else if (now >= gStart && now < set) gold.textContent = `✨ Golden hour now – sunset in ${hms(set - now)}`;
    else if (now < gStart && now >= mEnd) gold.textContent = `Golden hour at ${colomboTime(gStart)} (in ${hms(gStart - now).replace(/ \d+s$/, '')})`;
    else gold.textContent = `Blue hour ${colomboTime(set)}–${colomboTime(set + 25 * M)}`;
    const fill = $('sun-progress-fill'), icon = $('sun-orbit-icon');
    if (fill) fill.style.width = `${pct.toFixed(2)}%`;
    if (icon) icon.style.left = `${pct.toFixed(2)}%`;
    // the sky changes at dawn / dusk
    if (Math.floor(now / 1000) % 30 === 0) safe('sky', updateSky);
  }

  // ------------------------------------------------------------------------
  // Dynamic 7 · Draggable hourly timeline  +  Dynamic 17 · hour-by-hour advice
  // ------------------------------------------------------------------------
  const Scrub = { i: 0, key: null, hours: [], playing: null, suppressClick: false };
  function tempColor(c) {
    const stops = LAYER_SCALES.temp.stops;
    if (c <= stops[0][0]) return stops[0][1];
    for (let k = 1; k < stops.length; k++) {
      const [v1, c1] = stops[k - 1], [v2, c2] = stops[k];
      if (c <= v2) {
        const t = (c - v1) / (v2 - v1);
        const h = (s) => [1, 3, 5].map(j => parseInt(s.slice(j, j + 2), 16));
        const a = h(c1), b = h(c2);
        return `rgb(${a.map((x, j) => Math.round(x + (b[j] - x) * t)).join(',')})`;
      }
    }
    return stops[stops.length - 1][1];
  }
  function recsForHour(h) {
    const t = h.temp, rp = h.rainProb || 0, ra = h.rainAmount || 0, wind = h.wind || 0, uv = h.uv || 0, hum = h.humidity || 0, code = h.code, day = h.isDay;
    const wear = [], good = [], avoid = [];
    if (t >= 32) wear.push(['fa-shirt', 'Loose, light cotton or linen']);
    else if (t >= 27) wear.push(['fa-shirt', 'T-shirt and light trousers or a skirt']);
    else if (t >= 22) wear.push(['fa-vest', 'Light layers – a thin long-sleeve top']);
    else if (t >= 16) wear.push(['fa-user-tie', 'Long sleeves and a light jacket']);
    else wear.push(['fa-mitten', 'Warm jacket – it gets cold in the hills']);
    if (rp >= 60 || ra >= 1) wear.push(['fa-umbrella', 'Raincoat or umbrella, waterproof sandals']);
    else if (rp >= 30) wear.push(['fa-umbrella', 'Carry a compact umbrella']);
    if (day && uv >= 6) wear.push(['fa-glasses', 'Hat, sunglasses and SPF 30+']);
    if (wind >= 30) wear.push(['fa-wind', 'A windproof layer']);
    if (hum >= 85 && t >= 28) wear.push(['fa-droplet', 'Quick-dry, breathable fabric']);
    const dry = rp < 30 && ra < 0.3 && code < 61;
    if (dry && t <= 29 && (!day || uv < 6)) good.push(['fa-person-running', 'Running or a brisk walk']);
    if (dry && day && t >= 26 && wind < 30 && code < 95) good.push(['fa-umbrella-beach', 'Beach or a swim']);
    if (dry && wind < 25 && t <= 31) good.push(['fa-bicycle', 'Cycling']);
    if (code <= 2 && rp < 30 && day) good.push(['fa-camera', 'Sightseeing and photos']);
    if (dry && day && hum < 80) good.push(['fa-shirt', 'Drying laundry outside']);
    if (!day && (h.cloud ?? 100) < 35 && rp < 20) good.push(['fa-star', 'Stargazing']);
    if (dry && wind >= 15 && wind <= 35 && day) good.push(['fa-wind', 'Kite flying']);
    if (rp >= 60 || ra >= 2) good.push(['fa-mug-hot', 'Indoor plans – a café, museum or movie']);
    if (!good.length) good.push(['fa-house', 'Short errands and indoor activities']);
    if (code >= 95) avoid.push(['fa-bolt', 'Open fields, hilltops and swimming (lightning)']);
    if (ra >= 5 || rp >= 80) avoid.push(['fa-water', 'Low-lying roads that flood quickly']);
    if (day && uv >= 8) avoid.push(['fa-sun', 'Long stays in direct sun']);
    if (t >= 33) avoid.push(['fa-dumbbell', 'Hard outdoor exercise']);
    if (wind >= 40 || (h.gust || 0) >= 55) avoid.push(['fa-sailboat', 'Sea bathing and small boats']);
    if (isNum(h.visKm) && h.visKm < 1) avoid.push(['fa-car', 'Driving without fog lights']);
    return { wear: wear.slice(0, 4), good: good.slice(0, 4), avoid: avoid.slice(0, 3) };
  }
  V6.recsForHour = recsForHour;
  const chipList = (arr, cls) => arr.map(([i, t]) => `<li class="${cls}"><i class="fa-solid ${i}"></i>${escapeHtml(t)}</li>`).join('');
  function renderScrub() {
    const x = currentData();
    const box = $('v6-scrub');
    if (!box) return;
    const hours = (x && x.hourly) || [];
    Scrub.hours = hours;
    box.hidden = !hours.length;
    if (!hours.length) return;
    const key = activeLoc().key;
    if (Scrub.key !== key) { Scrub.key = key; Scrub.i = 0; stopPlay(); }
    Scrub.i = Math.min(Scrub.i, hours.length - 1);
    const range = $('scrub-range');
    range.max = hours.length - 1;
    const pct = (i) => (hours.length > 1 ? i / (hours.length - 1) * 100 : 0);
    range.style.setProperty('--track', `linear-gradient(90deg, ${hours.map((h, i) => `${tempColor(h.temp)} ${pct(i).toFixed(1)}%`).join(', ')})`);
    // rain bars + time labels under the track
    $('scrub-ticks').innerHTML = hours.map((h, i) => {
      const hr = colomboHour(h.isoTime);
      const lbl = i % 6 === 0 ? `<span class="tick-lbl">${i === 0 ? 'Now' : hr === 0 ? relDayIso(h.isoTime).slice(0, 3) : hourLabel(h.isoTime)}</span>` : '';
      return `<i style="left:${pct(i).toFixed(2)}%;--rp:${Math.round(h.rainProb || 0)}" class="${hr === 0 ? 'midnight' : ''}" title="${hourLabel(h.isoTime)} · ${Math.round(h.rainProb || 0)}% rain">${lbl}</i>`;
    }).join('');
    setScrub(Scrub.i, { from: 'render' });
  }
  function setScrub(i, { from = '' } = {}) {
    const hours = Scrub.hours;
    if (!hours.length) return;
    i = clamp(Math.round(i), 0, hours.length - 1);
    Scrub.i = i;
    const h = hours[i];
    const range = $('scrub-range');
    if (from !== 'range') range.value = i;
    range.style.setProperty('--pos', `${(hours.length > 1 ? i / (hours.length - 1) * 100 : 0).toFixed(2)}%`);
    range.setAttribute('aria-valuetext', `${i === 0 ? 'Now' : hourLabel(h.isoTime)} ${relDayIso(h.isoTime)}, ${formatTemp(h.temp)}, ${Math.round(h.rainProb)}% chance of rain`);
    $('scrub-time').textContent = i === 0 ? `Now · ${hourLabel(h.isoTime)}` : hourLabel(h.isoTime);
    $('scrub-day').textContent = `${relDayIso(h.isoTime)}${i ? ` · in ${i} h` : ''}`;
    const w = getWeatherInfo(h.code, h.isDay);
    const r = recsForHour(h);
    const det = $('scrub-detail');
    const oldTemp = det.querySelector('.sd-temp') && det.querySelector('.sd-temp').textContent;
    det.innerHTML = `
      <div class="sd-main"><i class="fa-solid ${w.icon} sd-icon" style="color:${w.color}"></i><div><strong class="sd-temp">${formatTemp(h.temp)}</strong><span>${w.label}</span></div></div>
      <div class="sd-stats">
        <span><i class="fa-solid fa-umbrella"></i> ${Math.round(h.rainProb || 0)}% · ${formatRain(h.rainAmount || 0)}</span>
        <span><svg class="mp-arrow" viewBox="-6 -6 12 12" style="transform:rotate(${(((h.windDeg ?? 0) + 180) % 360)}deg)"><path d="M0,-5 L3.5,3 L0,1.4 L-3.5,3 Z"/></svg> ${formatWind(h.wind)}${isNum(h.gust) ? ` <small>gusts ${Math.round(windValue(h.gust))}</small>` : ''}</span>
        <span><i class="fa-solid fa-droplet"></i> ${Math.round(h.humidity)}%</span>
        <span><i class="fa-solid fa-sun"></i> UV ${isNum(h.uv) ? Math.round(h.uv) : '--'}</span>
        <span><i class="fa-solid fa-cloud"></i> ${Math.round(h.cloud ?? 0)}% cloud</span>
      </div>
      <div class="sd-recs" aria-live="polite">
        <div><h5><i class="fa-solid fa-shirt"></i> Wear</h5><ul>${chipList(r.wear, 'wear')}</ul></div>
        <div><h5><i class="fa-solid fa-thumbs-up"></i> Good for</h5><ul>${chipList(r.good, 'good')}</ul></div>
        ${r.avoid.length ? `<div><h5><i class="fa-solid fa-ban"></i> Avoid</h5><ul>${chipList(r.avoid, 'avoid')}</ul></div>` : ''}
      </div>`;
    if (oldTemp) animateChange(det.querySelector('.sd-temp'), oldTemp, { flash: false });
    // cards
    const slider = $('hourly-cards-slider');
    slider.querySelectorAll('.hourly-mini-card').forEach((c, k) => c.classList.toggle('v6-active', k === i));
    const card = slider.children[i];
    if (card && from !== 'card') {
      const left = card.offsetLeft - slider.clientWidth / 2 + card.offsetWidth / 2;
      slider.scrollTo({ left, behavior: motionOn() && from !== 'render' ? 'smooth' : 'auto' });
    }
    // chart
    if (from !== 'chart') syncChart(i);
    document.querySelectorAll('#scrub-jumps button').forEach(b => b.classList.toggle('active', jumpIndex(b.dataset.jump) === i));
  }
  function syncChart(i) {
    const ch = AppState.charts.hourly;
    if (!ch || !ch.data || !ch.data.labels) return;
    try {
      if (i < ch.data.labels.length) {
        const els = ch.data.datasets.map((d, k) => ({ datasetIndex: k, index: i }));
        ch.setActiveElements(els);
        const meta = ch.getDatasetMeta(0), pt = meta.data[i];
        ch.tooltip.setActiveElements(els, pt ? { x: pt.x, y: pt.y } : { x: 0, y: 0 });
      } else { ch.setActiveElements([]); ch.tooltip.setActiveElements([], { x: 0, y: 0 }); }
      ch.update('none');
    } catch (e) { /* chart not ready */ }
  }
  function jumpIndex(j) {
    const hours = Scrub.hours;
    if (!hours.length) return -1;
    if (j === 'now') return 0;
    if (j === '3') return Math.min(3, hours.length - 1);
    const today = colomboDay(Date.now()), tomorrow = colomboDay(Date.now() + 86400000);
    if (j === 'evening') { const k = hours.findIndex((h, i) => i > 0 && colomboHour(h.isoTime) === 19); return k; }
    if (j === 'tomorrow') return hours.findIndex(h => colomboDay(h.isoTime) === tomorrow && colomboHour(h.isoTime) === 8);
    return -1;
  }
  function stopPlay() {
    clearInterval(Scrub.playing); Scrub.playing = null;
    const b = $('scrub-play');
    if (b) { b.innerHTML = '<i class="fa-solid fa-play"></i>'; b.setAttribute('aria-label', 'Play through the hours'); b.classList.remove('on'); }
  }
  function togglePlay() {
    if (Scrub.playing) { stopPlay(); return; }
    if (Scrub.i >= Scrub.hours.length - 1) setScrub(0);
    const b = $('scrub-play');
    b.innerHTML = '<i class="fa-solid fa-pause"></i>'; b.setAttribute('aria-label', 'Pause'); b.classList.add('on');
    Scrub.playing = setInterval(() => { if (Scrub.i >= Scrub.hours.length - 1) { stopPlay(); return; } setScrub(Scrub.i + 1); }, 700);
  }
  V6.onHourlyChart = function () {
    const ch = AppState.charts.hourly;
    if (!ch) return;
    if (!ch.$v6) {
      ch.$v6 = true;
      ch.options.onClick = (e, els) => { if (els && els.length) setScrub(els[0].index, { from: 'chart' }); };
      ch.options.onHover = (e, els) => { e.native && (e.native.target.style.cursor = els && els.length ? 'pointer' : 'default'); };
    }
    if (Scrub.hours.length) setTimeout(() => syncChart(Scrub.i), 50);
  };
  function initScrubber() {
    const range = $('scrub-range');
    range.addEventListener('input', () => { stopPlay(); setScrub(+range.value, { from: 'range' }); });
    $('scrub-play').addEventListener('click', togglePlay);
    $('scrub-jumps').addEventListener('click', (e) => {
      const b = e.target.closest('[data-jump]'); if (!b) return;
      const k = jumpIndex(b.dataset.jump);
      stopPlay();
      if (k >= 0) setScrub(k); else showToast('That hour is beyond the 48-hour forecast', 'info', 1800);
    });
    const slider = $('hourly-cards-slider');
    slider.addEventListener('click', (e) => {
      if (Scrub.suppressClick) { Scrub.suppressClick = false; return; }
      const c = e.target.closest('.hourly-mini-card'); if (!c || c.classList.contains('skeleton-card')) return;
      stopPlay();
      setScrub([...slider.children].indexOf(c), { from: 'card' });
    });
    // drag-to-scroll with a mouse (touch already scrolls natively)
    let drag = null;
    slider.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, left: slider.scrollLeft, moved: false, id: e.pointerId };
    });
    slider.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; slider.classList.add('v6-dragging'); try { slider.setPointerCapture(drag.id); } catch (er) { /* ignore */ } }
      if (drag.moved) slider.scrollLeft = drag.left - dx;
    });
    const end = () => { if (!drag) return; if (drag.moved) { Scrub.suppressClick = true; setTimeout(() => { Scrub.suppressClick = false; }, 50); } slider.classList.remove('v6-dragging'); drag = null; };
    slider.addEventListener('pointerup', end);
    slider.addEventListener('pointercancel', end);
    slider.querySelectorAll('.hourly-mini-card').forEach(c => c.setAttribute('tabindex', '-1'));
  }
  const origHourlySlider = window.renderHourlySlider;
  window.renderHourlySlider = function () {
    const r = origHourlySlider.apply(this, arguments);
    safe('scrub', renderScrub);
    return r;
  };

  // ------------------------------------------------------------------------
  // Dynamic 9 · Search suggestions: recent searches + popular places on focus
  // ------------------------------------------------------------------------
  const RECENT_KEY = 'lanka_weather_recent_v1';
  const POPULAR = ['Colombo', 'Kandy', 'Galle', 'Nuwara Eliya', 'Jaffna', 'Trincomalee', 'Anuradhapura', 'Badulla'];
  const getRecents = () => (store.get(RECENT_KEY, []) || []).filter(r => r && (r.type === 'district' ? findDistrict(r.name) : r.place));
  function districtResult(d) { return { type: 'district', district: d, title: d.name, sub: `${d.sinhala} · ${d.province} Province`, score: 0 }; }
  const origChoose = window.chooseSearchResult;
  window.chooseSearchResult = function (r) {
    safe('recent', () => {
      if (!r || r.type === 'online') return;
      const item = r.type === 'district' ? { type: 'district', name: r.district.name } : { type: 'place', title: r.title, sub: r.sub, badge: r.badge, place: r.place };
      const id = (it) => (it.type === 'district' ? `d:${it.name}` : `p:${placeKey(it.place)}`);
      const list = getRecents().filter(it => id(it) !== id(item));
      list.unshift(item);
      store.set(RECENT_KEY, list.slice(0, 6));
    });
    return origChoose.apply(this, arguments);
  };
  function showRecents() {
    const input = $('district-search');
    if (input.value.trim()) return;
    const rec = getRecents().map(it => (it.type === 'district' ? districtResult(findDistrict(it.name)) : Object.assign({ type: 'place', score: 0 }, it)));
    const recNames = rec.map(r => r.title);
    const pop = POPULAR.filter(n => !recNames.includes(n)).slice(0, rec.length ? 4 : 8).map(n => districtResult(findDistrict(n)));
    Search.results = [...rec, ...pop];
    Search.highlighted = -1;
    Search.query = '';
    renderSuggestions('');
    const box = $('search-suggestions');
    box.querySelectorAll('.suggestion-item.empty').forEach(n => n.remove());
    const items = box.querySelectorAll('.suggestion-item');
    const head = (html) => { const d = document.createElement('div'); d.className = 'v6-sugg-head'; d.innerHTML = html; return d; };
    if (rec.length) {
      const h = head('<span><i class="fa-solid fa-clock-rotate-left"></i> Recent searches</span><button type="button" class="v6-clear-recent">Clear</button>');
      h.querySelector('button').addEventListener('mousedown', (e) => e.preventDefault());
      h.querySelector('button').addEventListener('click', () => { store.set(RECENT_KEY, []); showRecents(); });
      box.insertBefore(h, items[0]);
      items.forEach((it, k) => { if (k < rec.length) it.classList.add('v6-recent'); });
    }
    if (pop.length) box.insertBefore(head('<span><i class="fa-solid fa-fire"></i> Popular places</span>'), items[rec.length] || null);
    box.classList.remove('hidden');
  }
  function initSearchRecents() {
    const input = $('district-search');
    input.addEventListener('focus', () => safe('recents', showRecents));
    input.addEventListener('input', () => { if (!input.value.trim() && document.activeElement === input) safe('recents', showRecents); });
  }

  // ------------------------------------------------------------------------
  // Dynamic 10 · Real-time alert pop-ups (+ optional chime)
  // ------------------------------------------------------------------------
  let audioCtx = null;
  function chime(level) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = level === 'red' ? [880, 660, 880, 660] : [660, 880];
      notes.forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * 0.22;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.22);
      });
    } catch (e) { /* audio not available */ }
  }
  function alertStack() {
    let s = $('v6-alert-stack');
    if (!s) { s = document.createElement('div'); s.id = 'v6-alert-stack'; s.className = 'v6-alert-stack'; s.setAttribute('aria-live', 'assertive'); document.body.appendChild(s); }
    return s;
  }
  function popupAlert(a, places, { test = false } = {}) {
    const s = alertStack();
    const el = document.createElement('div');
    el.className = `v6-alert-pop level-${a.level}`;
    el.setAttribute('role', 'alert');
    const sticky = a.level === 'red';
    el.innerHTML = `
      <i class="fa-solid ${a.icon || 'fa-triangle-exclamation'} ap-icon"></i>
      <div class="ap-body">
        <span class="ap-level">${test ? 'TEST · ' : ''}${a.level === 'red' ? 'Warning' : a.level === 'amber' ? 'Advisory' : 'Caution'} · ${escapeHtml(places.join(', '))}</span>
        <strong>${escapeHtml(a.title)}</strong>
        <p>${escapeHtml(a.message || '')}</p>
        ${a.advice && a.advice[0] ? `<p class="ap-advice"><i class="fa-solid fa-shield-heart"></i> ${escapeHtml(a.advice[0])}</p>` : ''}
        <div class="ap-actions"><button type="button" class="ap-details">Details</button><button type="button" class="ap-dismiss">Dismiss</button></div>
      </div>
      <button type="button" class="ap-x" aria-label="Dismiss alert"><i class="fa-solid fa-xmark"></i></button>
      ${sticky ? '' : '<span class="ap-timer"></span>'}`;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 350); };
    el.querySelector('.ap-x').addEventListener('click', close);
    el.querySelector('.ap-dismiss').addEventListener('click', close);
    el.querySelector('.ap-details').addEventListener('click', () => { close(); $('view-alerts-center-btn').click(); });
    s.prepend(el);
    while (s.children.length > 4) s.lastElementChild.remove();
    if (!sticky) {
      let left = 15000, last = Date.now();
      const timer = setInterval(() => {
        if (!el.isConnected) { clearInterval(timer); return; }
        if (!el.matches(':hover')) left -= Date.now() - last;
        last = Date.now();
        el.style.setProperty('--left', `${Math.max(0, left / 150)}%`);
        if (left <= 0) { clearInterval(timer); close(); }
      }, 200);
    }
    if (Live.sound) chime(a.level);
    return el;
  }
  V6.popupAlert = popupAlert;
  window.maybeNotify = function (alerts) {
    if (!alerts || !alerts.length) return;
    const mine = [AppState.selectedDistrict.name, ...AppState.favorites.map(f => (typeof f === 'string' ? f : f.district))];
    const notified = store.get(KEYS.notified, {}) || {};
    const today = colomboDay(Date.now());
    alerts.forEach(a => {
      const affected = [...new Set(a.districts.filter(n => mine.includes(n)))];
      if (!affected.length) return;
      const key = `${today}:${a.id}:${affected.join(',')}`;
      if (notified[key]) return;
      notified[key] = 1;
      if (Live.popups) popupAlert(a, affected); else showToast(`${a.title}: ${affected.join(', ')}`, 'warning', 7000);
      if (AppState.notifyEnabled && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
        try { new Notification(`ලංකාweather · ${a.title}`, { body: `${affected.join(', ')} – ${a.advice[0]}`, icon: 'sl-flag.svg', tag: a.id }); } catch (e) { /* ignore */ }
      }
    });
    Object.keys(notified).forEach(k => { if (!k.startsWith(today)) delete notified[k]; });
    store.set(KEYS.notified, notified);
  };

  // ------------------------------------------------------------------------
  // Dynamic 15 · City comparison with switchable, animated charts
  // ------------------------------------------------------------------------
  const Cmp = { m: 'temp', r: '24' };
  const CMP_METRICS = {
    temp: { label: () => `Temperature (°${AppState.unit.toUpperCase()})`, h: h => +cToUnit(h.temp).toFixed(1), suffix: () => `°${AppState.unit.toUpperCase()}` },
    rainProb: { label: () => 'Chance of rain (%)', h: h => h.rainProb, d: d => d.rainProb, suffix: () => '%' },
    rain: { label: () => `Rainfall (${AppState.rainUnit})`, h: h => +rainValue(h.rainAmount || 0).toFixed(2), d: d => +rainValue(d.rainSum || 0).toFixed(1), suffix: () => ` ${AppState.rainUnit}`, bar: true },
    wind: { label: () => `Wind (${WIND_UNITS[AppState.windUnit].label})`, h: h => +windValue(h.wind).toFixed(1), d: d => +windValue(d.windMax).toFixed(1), suffix: () => ` ${WIND_UNITS[AppState.windUnit].label}` },
    humidity: { label: () => 'Humidity (%)', h: h => h.humidity, suffix: () => '%' },
    uv: { label: () => 'UV index', h: h => (isNum(h.uv) ? +h.uv.toFixed(1) : null), d: d => d.uvMax, suffix: () => '' }
  };
  const CMP_COLORS = ['#38bdf8', '#a78bfa'];
  V6.compareChart = function (ds, xs) {
    const daily = Cmp.r === '7d';
    if (daily && Cmp.m === 'humidity') Cmp.m = 'temp';
    syncCmpButtons();
    const M = CMP_METRICS[Cmp.m];
    const t = chartTheme();
    let labels, sets;
    if (daily) {
      const days = xs[0].sevenDay || [];
      labels = days.map((d, i) => dayLabel(d.isoDate, i));
      if (Cmp.m === 'temp') {
        sets = xs.flatMap((x, i) => [
          { label: `${ds[i].name} high`, data: (x.sevenDay || []).map(d => +cToUnit(d.maxTemp).toFixed(1)), borderColor: CMP_COLORS[i], backgroundColor: `${CMP_COLORS[i]}22`, fill: false, tension: 0.35, pointRadius: 3 },
          { label: `${ds[i].name} low`, data: (x.sevenDay || []).map(d => +cToUnit(d.minTemp).toFixed(1)), borderColor: CMP_COLORS[i], borderDash: [5, 4], backgroundColor: 'transparent', fill: false, tension: 0.35, pointRadius: 2 }
        ]);
      } else sets = xs.map((x, i) => ({ label: ds[i].name, data: (x.sevenDay || []).map(M.d) }));
    } else {
      const n = Math.min(+Cmp.r, ...xs.map(x => (x.hourly || []).length));
      labels = xs[0].hourly.slice(0, n).map((h, i) => (i === 0 ? 'Now' : `${hourLabel(h.isoTime)}${colomboHour(h.isoTime) === 0 ? ` ${relDayIso(h.isoTime).slice(0, 3)}` : ''}`));
      sets = xs.map((x, i) => ({ label: ds[i].name, data: x.hourly.slice(0, n).map(M.h) }));
    }
    const type = M.bar ? 'bar' : 'line';
    sets.forEach((s, k) => {
      const i = daily && Cmp.m === 'temp' ? Math.floor(k / 2) : k;
      Object.assign(s, { type, borderColor: s.borderColor || CMP_COLORS[i], backgroundColor: s.backgroundColor || (type === 'bar' ? `${CMP_COLORS[i]}aa` : `${CMP_COLORS[i]}1f`), fill: s.fill ?? (type === 'line'), tension: 0.35, pointRadius: s.pointRadius ?? (labels.length > 24 ? 0 : 2), borderWidth: 2.2, borderRadius: 4 });
    });
    const key = `${Cmp.m}|${Cmp.r}|${t.dark}|${AppState.unit}|${AppState.windUnit}|${AppState.rainUnit}|${AppState.timeFormat}|${sets.length}`;
    const old = AppState.charts.compare;
    if (old && old.$key === key) {
      old.data.labels = labels;
      old.data.datasets.forEach((d, k) => { d.data = sets[k].data; d.label = sets[k].label; });
      old.update();
    } else {
      if (old) old.destroy();
      AppState.charts.compare = new Chart($('compareChart'), {
        type, data: { labels, datasets: sets },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          animation: { duration: motionOn() ? 650 : 0 },
          plugins: { legend: { labels: { color: t.text, boxWidth: 12 } }, title: { display: true, text: `${M.label()} · ${daily ? 'next 7 days' : `next ${Cmp.r} hours`}`, color: t.text, font: { size: 12 } }, tooltip: { ...t.tooltip, callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y ?? '--'}${M.suffix()}` } } },
          scales: { x: { grid: { color: t.grid }, ticks: { color: t.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { grid: { color: t.grid }, beginAtZero: Cmp.m !== 'temp', ticks: { color: t.text } } }
        }
      });
      AppState.charts.compare.$key = key;
    }
    // biggest difference insight
    const a = sets[0].data, b = sets[daily && Cmp.m === 'temp' ? 2 : 1].data;
    let best = -1, gap = 0;
    a.forEach((v, k) => { if (isNum(v) && isNum(b[k]) && Math.abs(v - b[k]) > gap) { gap = Math.abs(v - b[k]); best = k; } });
    const ins = $('cmp-insight') || (() => { const s = document.createElement('p'); s.id = 'cmp-insight'; s.className = 'cmp-insight'; $('compareChart').parentElement.after(s); return s; })();
    ins.innerHTML = best >= 0 && gap > 0 ? `<i class="fa-solid fa-arrows-left-right"></i> Biggest gap: <strong>${+gap.toFixed(1)}${M.suffix()}</strong> at ${escapeHtml(String(labels[best]))} – ${escapeHtml(a[best] > b[best] ? ds[0].name : ds[1].name)} is ${Cmp.m === 'temp' ? 'warmer' : 'higher'}${daily && Cmp.m === 'temp' ? ' (daily high)' : ''}.` : 'Both places look the same on this measure.';
  };
  function syncCmpButtons() {
    document.querySelectorAll('#cmp-metric button').forEach(b => { const on = b.dataset.m === Cmp.m; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); b.disabled = Cmp.r === '7d' && b.dataset.m === 'humidity'; b.title = b.disabled ? 'Daily humidity is not in the 7-day forecast' : ''; });
    document.querySelectorAll('#cmp-range button').forEach(b => { const on = b.dataset.r === Cmp.r; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  }
  function initCompareControls() {
    const m = $('cmp-metric'), r = $('cmp-range');
    if (m) m.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b || b.disabled) return; Cmp.m = b.dataset.m; renderComparison(); });
    if (r) r.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; Cmp.r = b.dataset.r; renderComparison(); });
    syncCmpButtons();
  }

  // ------------------------------------------------------------------------
  // Dynamic 16 · Drag-and-drop dashboard layout
  // ------------------------------------------------------------------------
  const Edit = { on: false, snap: null };
  const widgetEls = () => [...document.querySelectorAll('#main-content > [data-widget]')];
  function flip(nodes, mutate) {
    const before = new Map(nodes.map(n => [n, n.getBoundingClientRect().top]));
    mutate();
    if (!motionOn()) return;
    nodes.forEach(n => {
      const d = before.get(n) - n.getBoundingClientRect().top;
      if (!d || n.classList.contains('v6-lifted')) return;
      n.style.transition = 'none'; n.style.transform = `translateY(${d}px)`;
      requestAnimationFrame(() => { n.style.transition = 'transform .22s ease'; n.style.transform = ''; });
    });
  }
  function enterEdit() {
    if (Edit.on) return;
    Edit.on = true;
    $('live-menu').classList.add('hidden');
    Edit.snap = { order: widgetEls().map(n => n.dataset.widget), hidden: widgetEls().filter(n => n.classList.contains('widget-hidden')).map(n => n.dataset.widget) };
    document.body.classList.add('v6-layout-edit');
    widgetEls().forEach(sec => {
      const bar = document.createElement('div');
      bar.className = 'v6-drag-bar';
      const hidden = sec.classList.contains('widget-hidden');
      bar.innerHTML = `<span class="db-grip" aria-hidden="true"><i class="fa-solid fa-grip-vertical"></i></span><span class="db-title">${escapeHtml(sec.dataset.widgetTitle || sec.dataset.widget)}</span>
        <label class="db-show"><input type="checkbox" ${hidden ? '' : 'checked'}> Show</label>
        <button type="button" class="db-up" aria-label="Move up"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="db-down" aria-label="Move down"><i class="fa-solid fa-arrow-down"></i></button>`;
      sec.prepend(bar);
    });
    let tb = $('v6-layout-toolbar');
    if (!tb) {
      tb = document.createElement('div'); tb.id = 'v6-layout-toolbar'; tb.className = 'v6-layout-toolbar glass-card';
      tb.innerHTML = '<span><i class="fa-solid fa-grip"></i> Drag sections to reorder · untick to hide</span><button type="button" class="btn-soft" data-act="reset"><i class="fa-solid fa-rotate-left"></i> Reset</button><button type="button" class="btn-soft" data-act="cancel">Cancel</button><button type="button" class="btn-primary-soft" data-act="done"><i class="fa-solid fa-check"></i> Done</button>';
      document.body.appendChild(tb);
      tb.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; ({ done: () => exitEdit(true), cancel: () => exitEdit(false), reset: resetLayout })[b.dataset.act](); });
    }
    tb.hidden = false;
    $('main-content').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Edit mode: drag the bars to rearrange your dashboard', 'info', 3000);
  }
  function applyOrder(order, hidden) {
    const main = $('main-content'), byId = Object.fromEntries(widgetEls().map(n => [n.dataset.widget, n]));
    const all = widgetEls();
    const anchor = all[all.length - 1].nextSibling;
    flip(all, () => order.filter(id => byId[id]).forEach(id => main.insertBefore(byId[id], anchor)));
    all.forEach(n => { const h = hidden.includes(n.dataset.widget); n.classList.toggle('widget-hidden', h); const cb = n.querySelector('.v6-drag-bar input'); if (cb) cb.checked = !h; });
  }
  function resetLayout() { applyOrder(DEFAULT_ORDER6, []); showToast('Default layout restored – press Done to keep it', 'info', 2200); }
  function exitEdit(save) {
    if (!Edit.on) return;
    if (!save && Edit.snap) applyOrder(Edit.snap.order, Edit.snap.hidden);
    if (save) {
      V4.Prefs.order = widgetEls().map(n => n.dataset.widget);
      V4.Prefs.hidden = widgetEls().filter(n => n.classList.contains('widget-hidden')).map(n => n.dataset.widget);
      store.set('lanka_weather_prefs_v1', V4.Prefs);
    }
    document.querySelectorAll('.v6-drag-bar').forEach(b => b.remove());
    document.body.classList.remove('v6-layout-edit');
    $('v6-layout-toolbar').hidden = true;
    Edit.on = false;
    setTimeout(() => {
      Object.values(AppState.charts).concat(Object.values(V4.charts || {}), Object.values(V5.charts || {})).forEach(c => c && c.resize && c.resize());
      window.dispatchEvent(new Event('resize'));
    }, 80);
    if (save) showToast('Dashboard layout saved', 'success', 2000);
  }
  function initLayoutEdit() {
    $('v6-edit-layout').addEventListener('click', enterEdit);
    const main = $('main-content');
    main.addEventListener('click', (e) => {
      if (!Edit.on) return;
      const bar = e.target.closest('.v6-drag-bar'); if (!bar) return;
      const sec = bar.parentElement, all = widgetEls(), i = all.indexOf(sec);
      if (e.target.closest('.db-up') && i > 0) flip(all, () => main.insertBefore(sec, all[i - 1]));
      if (e.target.closest('.db-down') && i < all.length - 1) flip(all, () => main.insertBefore(sec, all[i + 1].nextSibling));
    });
    main.addEventListener('change', (e) => {
      if (!Edit.on || !e.target.closest('.db-show')) return;
      e.target.closest('[data-widget]').classList.toggle('widget-hidden', !e.target.checked);
    });
    // pointer-based sortable (works with mouse, pen and touch)
    let drag = null;
    main.addEventListener('pointerdown', (e) => {
      if (!Edit.on) return;
      const bar = e.target.closest('.v6-drag-bar');
      if (!bar || e.target.closest('button, input, label')) return;
      e.preventDefault();
      const sec = bar.parentElement;
      drag = { sec, y: e.clientY, id: e.pointerId, top: sec.getBoundingClientRect().top };
      sec.classList.add('v6-lifted');
      bar.setPointerCapture(e.pointerId);
    });
    main.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const all = widgetEls().filter(n => n !== drag.sec);
      const target = all.find(n => { const r = n.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      const nextEl = drag.sec.nextElementSibling;
      if ((target || null) !== (nextEl && nextEl.matches('[data-widget]') ? nextEl : null)) {
        flip(widgetEls(), () => { if (target) main.insertBefore(drag.sec, target); else { const last = all[all.length - 1]; main.insertBefore(drag.sec, last.nextSibling); } });
      }
      // edge auto-scroll
      if (e.clientY < 70) window.scrollBy(0, -12); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
    });
    const end = () => { if (!drag) return; drag.sec.classList.remove('v6-lifted'); drag = null; };
    main.addEventListener('pointerup', end);
    main.addEventListener('pointercancel', end);
    document.addEventListener('keydown', (e) => { if (Edit.on && e.key === 'Escape') exitEdit(false); });
    // drag inside the "Personalise" modal list too (re-uses its up/down buttons)
    const list = $('pref-widgets');
    if (list) {
      let ld = null;
      list.addEventListener('pointerdown', (e) => {
        const li = e.target.closest('li'); if (!li || e.target.closest('button, input, label')) return;
        e.preventDefault();
        ld = { id: li.dataset.id };
        li.classList.add('v6-lifted');
        list.setPointerCapture(e.pointerId);
      });
      list.addEventListener('pointermove', (e) => {
        if (!ld) return;
        list.querySelectorAll('li').forEach(li => li.classList.remove('v6-drop-before', 'v6-drop-after'));
        const items = [...list.querySelectorAll('li')];
        const t = items.find(li => { const r = li.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
        if (t) t.classList.add('v6-drop-before'); else items[items.length - 1].classList.add('v6-drop-after');
      });
      list.addEventListener('pointerup', (e) => {
        if (!ld) return;
        const items = [...list.querySelectorAll('li')];
        const from = items.findIndex(li => li.dataset.id === ld.id);
        let to = items.findIndex(li => { const r = li.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
        if (to < 0) to = items.length;
        if (to > from) to -= 1;
        const steps = to - from, id = ld.id;
        ld = null;
        list.querySelectorAll('li').forEach(li => li.classList.remove('v6-lifted', 'v6-drop-before', 'v6-drop-after'));
        for (let k = 0; k < Math.abs(steps); k++) {
          const li = list.querySelector(`li[data-id="${CSS.escape(id)}"]`);
          const btn = li && li.querySelector(steps < 0 ? '.w-up' : '.w-down');
          if (btn) btn.click();
        }
        const moved = list.querySelector(`li[data-id="${CSS.escape(id)}"]`);
        if (moved && steps) { moved.classList.add('v6-just-moved'); setTimeout(() => moved.classList.remove('v6-just-moved'), 700); }
      });
      list.addEventListener('pointercancel', () => { ld = null; list.querySelectorAll('li').forEach(li => li.classList.remove('v6-lifted', 'v6-drop-before', 'v6-drop-after')); });
    }
  }

  // ------------------------------------------------------------------------
  // Hooks & start-up
  // ------------------------------------------------------------------------
  function locLabels() { document.querySelectorAll('#main-content .loc-label').forEach(l => { if (l.closest('[data-widget="hourly"]')) l.textContent = activeLoc().name; }); }
  function wrapV4(name, after) {
    const orig = V4[name];
    V4[name] = function () { const r = orig ? orig.apply(this, arguments) : undefined; safe(name, () => after.apply(this, arguments)); return r; };
  }
  let ready = false;
  function onAnyUpdate() { if (!ready) return; windTarget(); tickSun(); updateSky(); locLabels(); refreshPopup(); renderLiveStatus(); }
  function initLiveMenu() {
    const btn = $('live-menu-btn'), menu = $('live-menu');
    btn.addEventListener('click', (e) => { e.stopPropagation(); const open = menu.classList.toggle('hidden') === false; btn.setAttribute('aria-expanded', String(open)); if (open) renderLiveStatus(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#update-pill')) { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.classList.contains('hidden')) { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
    $('v6-interval').addEventListener('click', (e) => { const b = e.target.closest('[data-sec]'); if (b) setRefreshInterval(+b.dataset.sec); });
    $('v6-effects').addEventListener('click', (e) => { const b = e.target.closest('[data-fx]'); if (b) setEffects(b.dataset.fx); });
    const checks = { 'v6-pause-hidden': 'pauseHidden', 'v6-counters': 'counters', 'v6-popups': 'popups', 'v6-sound': 'sound' };
    Object.entries(checks).forEach(([id, k]) => {
      const cb = $(id); if (!cb) return;
      cb.checked = !!Live[k];
      cb.addEventListener('change', () => { Live[k] = cb.checked; saveLive(); if (k === 'counters') { document.body.classList.toggle('v6-no-motion', !cb.checked); if (cb.checked) startWindLoop(); } if (k === 'sound' && cb.checked) chime('amber'); window.renderCountdownDisplay(); });
    });
    document.body.classList.toggle('v6-no-motion', !Live.counters);
    $('v6-test-alert').addEventListener('click', () => {
      const n = activeLoc().name;
      popupAlert({ id: 'test', level: 'amber', icon: 'fa-cloud-bolt', title: 'Thunderstorm advisory (example)', message: `This is how a real alert for ${n} will pop up when the forecast crosses a warning threshold.`, advice: ['Stay indoors or in a closed vehicle during lightning.'] }, [n], { test: true });
      if (!Live.sound) chime('amber');
    });
    document.querySelectorAll('#v6-effects button').forEach(b => { const on = b.dataset.fx === Live.fx; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    $('v6-timefmt').addEventListener('click', (e) => { const b = e.target.closest('[data-value]'); if (b && b.dataset.value !== AppState.timeFormat) setTimeFormat(b.dataset.value); });
    syncTimeFmtButtons();
  }
  function init() {
    clearInterval(AppState.autoRefreshIntervalId);
    AppState.autoRefreshIntervalId = null;
    [initLiveMenu, initPopups, watchWindCard, initScrubber, initSearchRecents, initCompareControls, initLayoutEdit].forEach(f => safe(f.name, f));
    window.startCountdownTimer();
    syncIntervalUI();
    wrapV4('onLocationChange', () => { locationSwap(); safe('scrub', renderScrub); onAnyUpdate(); if (Popup.name && !Popup.isPlace && Popup.name !== AppState.selectedDistrict.name) closePopup(); });
    wrapV4('onDataRefresh', () => { onAnyUpdate(); });
    wrapV4('onUnitsChange', () => { safe('scrub', renderScrub); onAnyUpdate(); });
    wrapV4('onThemeChange', () => { Sky.key = ''; onAnyUpdate(); });
    setInterval(() => { tickSun(); if (Math.floor(Date.now() / 1000) % 15 === 0) tickAges(); }, 1000);
    ready = true;
    if (Object.keys(AppState.districtWeatherCache || {}).length) { Loc6.key = activeLoc().key; renderScrub(); onAnyUpdate(); }
    if (Live.fx !== 'auto') safe('fx', () => setEffects(Live.fx));
  }
  Object.assign(V6, { Live, Net, Scrub, Cmp, Edit, setRefreshInterval, setTimeFormat, setEffects, setMapLayer, openPopup, closePopup, setScrub, liveRefresh, renderScrub, enterEdit, exitEdit, updateSky });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ==========================================================================
   Scroll-aware header – blurs away when you scroll down, glides back
   (frosted) as soon as you scroll up. Stays put while a menu, the search
   box, a modal or layout-edit mode is in use.
   ========================================================================== */
(function () {
  'use strict';
  const header = document.querySelector('.app-header');
  if (!header) return;
  const root = document.documentElement;
  let lastY = window.scrollY, ticking = false, hidden = false;
  const TOP_ZONE = 12;      // at the very top: plain header
  const HIDE_AFTER = 8;     // px scrolled down before it hides (avoids jitter)
  const SHOW_AFTER = 4;     // px scrolled up before it comes back

  function measure() { root.style.setProperty('--hdr-h', `${header.offsetHeight}px`); }
  function busy() {
    if (document.body.classList.contains('v6-layout-edit')) return true;
    if (header.matches(':focus-within')) return true;
    if (document.querySelector('.modal-backdrop:not(.hidden)')) return true;
    if (header.querySelector('.units-menu:not(.hidden)')) return true;
    const sugg = document.getElementById('search-suggestions');
    return !!(sugg && !sugg.classList.contains('hidden'));
  }
  // Phones: switch to a compact two-row header while it is out of view, keeping the
  // page perfectly still (works with or without the browser's own scroll anchoring)
  function setCompact(on) {
    if (header.classList.contains('hdr-compact') === on) return;
    if (window.scrollY <= TOP_ZONE) { header.classList.toggle('hdr-compact', on); return; }
    const probe = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const anchor = probe && !header.contains(probe) ? probe : document.getElementById('main-content');
    const before = anchor ? anchor.getBoundingClientRect().top : 0;
    header.classList.toggle('hdr-compact', on);
    const fix = () => { if (!anchor) return; const d = anchor.getBoundingClientRect().top - before; if (Math.abs(d) > 0.5) window.scrollBy({ top: d, behavior: 'instant' }); };
    fix();
    requestAnimationFrame(fix);
    lastY = window.scrollY;
  }
  function setHidden(h) {
    if (h === hidden) return;
    hidden = h;
    if (h) setCompact(true);
    header.classList.toggle('hdr-hidden', h);
    document.body.classList.toggle('header-hidden', h);
    header.setAttribute('aria-hidden', h ? 'true' : 'false');
    if (h) header.setAttribute('inert', ''); else header.removeAttribute('inert');
  }
  function update() {
    ticking = false;
    const y = Math.max(0, window.scrollY);
    const dy = y - lastY;
    header.classList.toggle('hdr-scrolled', y > TOP_ZONE);
    if (y <= TOP_ZONE) { setHidden(false); setCompact(false); lastY = y; return; }
    if (dy > HIDE_AFTER) {
      if (y > header.offsetHeight && !busy()) setHidden(true);
      lastY = y;
    } else if (dy < -SHOW_AFTER) {
      setHidden(false);
      lastY = y;
    }
  }
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', measure);
  // Bring it back if the mouse goes to the top edge, or the keyboard tabs into it
  document.addEventListener('mousemove', (e) => { if (hidden && e.clientY < 14) setHidden(false); }, { passive: true });
  document.addEventListener('keydown', (e) => { if (hidden && (e.key === 'Tab' || e.key === '/')) setHidden(false); });
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(header);
  measure();
  update();
  if (window.V6) Object.assign(window.V6, { header: { show: () => setHidden(false), hide: () => setHidden(true) } });
})();
