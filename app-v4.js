/* ==========================================================================
   ලංකාweather · v4 add-on module
   Rainfall radar & precipitation tracking, forecast accuracy (21), wind (22),
   lightning (23), flood risk (24), UV & sun protection (25), timeline
   playback (26), personalised dashboard (27), travel & activities (28),
   weather data layers & map overlays (29).
   Loaded after app.js and reuses its helpers (AppState, $, store, fetchJSON…).
   ========================================================================== */
(function () {
  'use strict';

  const V4 = window.V4 = {
    safe(name, fn) { try { return fn(); } catch (e) { console.error(`[v4:${name}]`, e); return undefined; } },
    charts: {}
  };

  // Serif typography for every chart (app.js charts are created after this runs, on DOMContentLoaded)
  if (window.Chart && Chart.defaults && Chart.defaults.font) Chart.defaults.font.family = "'Noto Serif', 'Noto Serif Sinhala', Georgia, 'Times New Roman', serif";

  const K = {
    grid: 'lanka_weather_grid_v1',
    flood: 'lanka_weather_flood_v1',
    prefs: 'lanka_weather_prefs_v1'
  };
  const DEFAULT_PREFS = { name: '', home: null, am: 8, pm: 17, activities: ['beach', 'hiking', 'sightseeing'], skin: 'III', hidden: [], order: [], compact: false };
  const Prefs = Object.assign({}, DEFAULT_PREFS, store.get(K.prefs, {}) || {});
  if (Prefs.home && typeof Prefs.home !== 'string') Prefs.home = sanitizePlace(Prefs.home);
  if (typeof Prefs.home === 'string' && !findDistrict(Prefs.home)) Prefs.home = null;
  function savePrefs() { store.set(K.prefs, Prefs); }

  const fmtDayHour = (t) => new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', timeZone: 'Asia/Colombo' });
  const fmtHour = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Colombo' });
  const colomboHour = (t = Date.now()) => Number(new Date(t).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Colombo' })) % 24;
  const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
  const sum = (arr) => arr.reduce((s, v) => s + (isNum(v) ? v : 0), 0);
  const maxOf = (arr, fb = 0) => { const v = arr.filter(isNum); return v.length ? Math.max(...v) : fb; };
  const mapToGeo = (x, y) => ({ lon: (x - GEO_PROJ.bx) / GEO_PROJ.ax, lat: (y - GEO_PROJ.by) / GEO_PROJ.ay });
  function isLand(lat, lon) {
    const { x, y } = geoToMap(lat, lon);
    for (const { district, rings } of districtPolys()) {
      const [x0, y0, x1, y1] = district.bbox;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (rings.reduce((inside, r) => (pointInRing(x, y, r) ? !inside : inside), false)) return district;
    }
    return null;
  }
  function currentData() { return weatherFor(activeLoc()) || AppState.districtWeatherCache[AppState.selectedDistrict.name]; }

  // ------------------------------------------------------------------------
  // Colour scales for map layers
  // ------------------------------------------------------------------------
  const SCALES = {
    precip: { unit: 'mm/h', fade: true, stops: [[0.1, '#a5f3fc', 0.35], [0.5, '#38bdf8', 0.7], [1.5, '#2563eb', 0.8], [4, '#16a34a', 0.85], [8, '#facc15', 0.9], [15, '#f97316', 0.92], [25, '#dc2626', 0.95], [40, '#c026d3', 0.95]] },
    accum: { unit: 'mm', fade: true, stops: [[1, '#a5f3fc', 0.35], [5, '#38bdf8', 0.7], [15, '#2563eb', 0.8], [30, '#16a34a', 0.85], [50, '#facc15', 0.9], [100, '#f97316', 0.92], [150, '#dc2626', 0.95], [250, '#c026d3', 0.95]] },
    temp: { unit: '°C', stops: [[14, '#3b82f6', 0.8], [20, '#06b6d4', 0.8], [24, '#22c55e', 0.8], [27, '#eab308', 0.8], [30, '#f97316', 0.82], [33, '#ef4444', 0.85], [36, '#991b1b', 0.88]] },
    wind: { unit: 'km/h', stops: [[0, '#e0f2fe', 0.45], [10, '#7dd3fc', 0.6], [20, '#34d399', 0.7], [30, '#facc15', 0.78], [45, '#f97316', 0.85], [60, '#dc2626', 0.9], [80, '#7e22ce', 0.92]] },
    clouds: { unit: '%', fade: true, stops: [[10, '#f1f5f9', 0.05], [40, '#e2e8f0', 0.35], [70, '#cbd5e1', 0.6], [100, '#94a3b8', 0.82]] },
    cape: { unit: 'J/kg', fade: true, stops: [[150, '#fef9c3', 0.25], [500, '#fde047', 0.55], [1000, '#fb923c', 0.7], [2000, '#ef4444', 0.82], [3500, '#a21caf', 0.9]] },
    uv: { unit: '', stops: [[0, '#64748b', 0.25], [1, '#4ade80', 0.65], [3, '#facc15', 0.75], [6, '#fb923c', 0.8], [8, '#ef4444', 0.85], [11, '#a855f7', 0.9]] }
  };
  function scaleRGBA(name, v) {
    const sc = SCALES[name];
    const st = sc.stops;
    if (!isNum(v)) return [0, 0, 0, 0];
    if (v < st[0][0]) {
      if (sc.fade) return [0, 0, 0, 0];
      const [r, g, b] = hexToRgb(st[0][1]); return [r, g, b, st[0][2]];
    }
    for (let i = 1; i < st.length; i++) {
      if (v <= st[i][0]) {
        const t = (v - st[i - 1][0]) / (st[i][0] - st[i - 1][0]);
        const a = hexToRgb(st[i - 1][1]), b = hexToRgb(st[i][1]);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, st[i - 1][2] + (st[i][2] - st[i - 1][2]) * t];
      }
    }
    const l = st[st.length - 1]; const [r, g, b] = hexToRgb(l[1]); return [r, g, b, l[2]];
  }

  // ------------------------------------------------------------------------
  // Model grid: 150 points (0.3°) covering the island and nearby sea
  // ------------------------------------------------------------------------
  const GRID = { lat0: 5.8, lon0: 79.45, step: 0.3, rows: 15, cols: 10 };
  const GRID_VARS = [['precipitation', 'precip', 10], ['temperature_2m', 'temp', 10], ['wind_speed_10m', 'ws', 1], ['wind_direction_10m', 'wd', 1], ['cloud_cover', 'cloud', 1], ['weather_code', 'code', 1], ['cape', 'cape', 1], ['uv_index', 'uv', 10]];
  const Grid = { pts: [], land: [], times: [], v: null, fetchedAt: 0, status: 'idle', error: null };
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) Grid.pts.push({ lat: +(GRID.lat0 + r * GRID.step).toFixed(2), lon: +(GRID.lon0 + c * GRID.step).toFixed(2), r, c });
  }
  function gridLand() {
    if (!Grid.land.length) Grid.land = Grid.pts.map(p => isLand(p.lat, p.lon));
    return Grid.land;
  }

  function restoreGrid() {
    const saved = store.get(K.grid);
    if (saved && saved.times && saved.v && saved.times.length && Date.now() - saved.fetchedAt < 36 * 3600000) {
      Object.assign(Grid, { times: saved.times, v: saved.v, fetchedAt: saved.fetchedAt, status: 'cache' });
      return true;
    }
    return false;
  }

  async function loadGrid(force = false) {
    if (!force && Grid.v && Grid.status === 'live' && Date.now() - Grid.fetchedAt < 45 * 60000) return;
    if (navigator.onLine === false) { if (!Grid.v) restoreGrid(); Grid.status = Grid.v ? 'cache' : 'error'; Grid.error = 'offline'; return; }
    Grid.status = Grid.v ? Grid.status : 'loading';
    const url = `${API.forecast}?${coordsQuery(Grid.pts)}&hourly=${GRID_VARS.map(g => g[0]).join(',')}&past_days=1&forecast_days=2&timezone=Asia%2FColombo&timeformat=unixtime`;
    try {
      const json = await fetchJSON(url, { timeout: 35000, retries: 1 });
      const list = Array.isArray(json) ? json : [json];
      if (list.length !== Grid.pts.length) throw new Error('Unexpected grid response');
      const v = {};
      GRID_VARS.forEach(([api, key, k]) => {
        v[key] = list.map(p => (p.hourly[api] || []).map(x => (isNum(x) ? Math.round(x * k) / k : null)));
      });
      Object.assign(Grid, { times: list[0].hourly.time.map(t => t * 1000), v, fetchedAt: Date.now(), status: 'live', error: null });
      store.set(K.grid, { times: Grid.times, v: Grid.v, fetchedAt: Grid.fetchedAt });
    } catch (err) {
      console.warn('Grid fetch failed', err);
      Grid.error = err.message;
      if (!Grid.v) restoreGrid();
      Grid.status = Grid.v ? 'cache' : 'error';
    }
  }
  function gridNowIndex() {
    const now = Date.now();
    let idx = 0;
    Grid.times.forEach((t, i) => { if (t <= now) idx = i; });
    return idx;
  }
  // Value of a grid variable at frame t for any lat/lon (bilinear)
  function gridValueAt(key, t, lat, lon) {
    if (!Grid.v) return null;
    const fr = clamp((lat - GRID.lat0) / GRID.step, 0, GRID.rows - 1), fc = clamp((lon - GRID.lon0) / GRID.step, 0, GRID.cols - 1);
    const r0 = Math.floor(fr), c0 = Math.floor(fc), r1 = Math.min(r0 + 1, GRID.rows - 1), c1 = Math.min(c0 + 1, GRID.cols - 1);
    const dr = fr - r0, dc = fc - c0;
    const g = (r, c) => fieldValue(key, r * GRID.cols + c, t);
    const v00 = g(r0, c0), v01 = g(r0, c1), v10 = g(r1, c0), v11 = g(r1, c1);
    if (![v00, v01, v10, v11].every(isNum)) return [v00, v01, v10, v11].find(isNum) ?? null;
    return v00 * (1 - dr) * (1 - dc) + v01 * (1 - dr) * dc + v10 * dr * (1 - dc) + v11 * dr * dc;
  }
  function fieldValue(key, i, t) {
    if (key === 'accum') {
      const arr = Grid.v.precip[i];
      let s = 0;
      for (let k = Math.max(0, t - 23); k <= t; k++) s += arr[k] || 0;
      return s;
    }
    const arr = Grid.v[key === 'precip' ? 'precip' : key];
    return arr && arr[i] ? arr[i][t] : null;
  }

  // ------------------------------------------------------------------------
  // Observed radar frames (RainViewer)
  // ------------------------------------------------------------------------
  const Radar = { frames: [], host: '', fetchedAt: 0, status: 'idle', z: 7 };
  async function loadRadarFrames(force = false) {
    if (!force && Radar.frames.length && Date.now() - Radar.fetchedAt < 9 * 60000) return;
    if (navigator.onLine === false) { Radar.status = 'error'; return; }
    try {
      const json = await fetchJSON('https://api.rainviewer.com/public/weather-maps.json', { timeout: 12000, retries: 1 });
      Radar.host = json.host;
      Radar.frames = ((json.radar && json.radar.past) || []).concat((json.radar && json.radar.nowcast) || []).map(f => ({ time: f.time * 1000, path: f.path }));
      Radar.fetchedAt = Date.now();
      Radar.status = Radar.frames.length ? 'live' : 'error';
    } catch (err) {
      console.warn('Radar frames failed', err);
      Radar.status = 'error';
    }
  }
  function tileBounds(z, x, y) {
    const n = 2 ** z;
    const lon = (xx) => xx / n * 360 - 180;
    const lat = (yy) => Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI;
    return { west: lon(x), east: lon(x + 1), north: lat(y), south: lat(y + 1) };
  }
  function radarTiles(z) {
    const n = 2 ** z;
    const tx = (lon) => Math.floor((lon + 180) / 360 * n);
    const ty = (lat) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n); };
    const tiles = [];
    for (let x = tx(79.3); x <= tx(82.2); x++) for (let y = ty(10.1); y <= ty(5.7); y++) tiles.push({ x, y, z });
    return tiles;
  }

  // ------------------------------------------------------------------------
  // Live lightning strikes (best effort; community Blitzortung feed)
  // ------------------------------------------------------------------------
  const Strikes = { list: [], fetchedAt: 0, status: 'idle' };
  async function loadStrikes() {
    if (Strikes.status === 'blocked' || navigator.onLine === false) return;
    if (Date.now() - Strikes.fetchedAt < 5 * 60000) return;
    Strikes.fetchedAt = Date.now();
    try {
      const json = await fetchJSON('https://pocketworld.org/api/lightning', { timeout: 10000, retries: 0 });
      const cutoff = Date.now() - 3600000;
      const fresh = (json.strikes || []).filter(s => s.lat > 4.5 && s.lat < 11.5 && s.lng > 78 && s.lng < 83.5)
        .map(s => ({ lat: s.lat, lon: s.lng, t: (s.timestamp || 0) * 1000 })).filter(s => s.t > cutoff);
      Strikes.list = fresh.concat(Strikes.list.filter(s => s.t > cutoff)).slice(0, 500);
      Strikes.status = 'live';
    } catch (err) {
      Strikes.status = 'blocked'; // CORS or network – fall back to forecast cells only
    }
  }

  // ------------------------------------------------------------------------
  // Radar / layers map
  // ------------------------------------------------------------------------
  const MapState = {
    layer: 'precip', overlays: { wind: true, lightning: true, labels: true, borders: true }, opacity: 0.8,
    frame: 0, radarFrame: 0, playing: null, built: false, followNow: true
  };
  const LABEL_TOWNS = [
    ['Colombo', 6.93, 79.85], ['Kandy', 7.29, 80.63], ['Galle', 6.05, 80.22], ['Jaffna', 9.66, 80.02], ['Trincomalee', 8.59, 81.22],
    ['Batticaloa', 7.73, 81.69], ['Anuradhapura', 8.31, 80.41], ['Nuwara Eliya', 6.97, 80.78], ['Ratnapura', 6.69, 80.4],
    ['Hambantota', 6.12, 81.12], ['Kurunegala', 7.49, 80.36], ['Badulla', 6.99, 81.06], ['Mannar', 8.98, 79.9],
    ['Puttalam', 8.04, 79.84], ['Ampara', 7.3, 81.67], ['Vavuniya', 8.75, 80.5], ['Matara', 5.95, 80.54], ['Arugam Bay', 6.84, 81.84]
  ];
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  }

  function buildRadarMap() {
    if (MapState.built || !$('radar-svg')) return;
    MapState.built = true;
    const land = $('radar-land'), borders = $('radar-borders'), clip = $('radar-island-clip'), labels = $('radar-labels');
    SRI_LANKA_DISTRICTS.forEach(d => {
      el('path', { d: d.path, class: 'radar-district', 'data-name': d.name, 'fill-rule': 'evenodd' }, land);
      el('path', { d: d.path, class: 'radar-border', 'fill-rule': 'evenodd' }, borders);
      el('path', { d: d.path }, clip);
    });
    LABEL_TOWNS.forEach(([name, lat, lon]) => {
      const { x, y } = geoToMap(lat, lon);
      const g = el('g', { class: 'radar-town', transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` }, labels);
      el('circle', { r: 2.2 }, g);
      const t = el('text', { x: 4, y: 3 }, g); t.textContent = name;
    });

    const svg = $('radar-svg');
    const hover = $('radar-hover');
    const toMap = (e) => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      return mapToGeo(p.x, p.y);
    };
    svg.addEventListener('mousemove', (e) => {
      const { lat, lon } = toMap(e);
      if (lat < 5.6 || lat > 10.2 || lon < 79.2 || lon > 82.4) { hover.hidden = true; return; }
      hover.innerHTML = hoverText(lat, lon);
      const rect = $('radar-stage').getBoundingClientRect();
      hover.style.left = `${clamp(e.clientX - rect.left + 14, 0, rect.width - 190)}px`;
      hover.style.top = `${clamp(e.clientY - rect.top + 14, 0, rect.height - 70)}px`;
      hover.hidden = false;
    });
    svg.addEventListener('mouseleave', () => { hover.hidden = true; });
    svg.addEventListener('click', (e) => {
      const { lat, lon } = toMap(e);
      const d = isLand(lat, lon);
      if (!d) return;
      const near = typeof nearestGazetteerPlace === 'function' ? nearestGazetteerPlace(lat, lon) : null;
      if (near && near.km < 6) selectPlace(near.place);
      else selectPlace({ name: `${lat.toFixed(3)}° N, ${lon.toFixed(3)}° E`, lat, lon, district: d.name, type: 'o', typeLabel: 'Map point' });
    });

    // Controls
    document.querySelectorAll('#radar-layer-buttons .layer-chip').forEach(btn => btn.addEventListener('click', () => setLayer(btn.dataset.layer)));
    document.querySelectorAll('.overlay-toggles input').forEach(cb => cb.addEventListener('change', () => {
      MapState.overlays[cb.dataset.overlay] = cb.checked;
      renderRadar();
    }));
    $('radar-opacity').addEventListener('input', (e) => { MapState.opacity = e.target.value / 100; applyOpacity(); });
    $('timeline-slider').addEventListener('input', (e) => { stopPlay(); setFrame(+e.target.value, { user: true }); });
    $('timeline-play').addEventListener('click', togglePlay);
    $('timeline-back').addEventListener('click', () => { stopPlay(); stepFrame(-1); });
    $('timeline-fwd').addEventListener('click', () => { stopPlay(); stepFrame(1); });
    $('timeline-now').addEventListener('click', () => { stopPlay(); MapState.followNow = true; setFrame(MapState.layer === 'radar' ? Radar.frames.length - 1 : gridNowIndex()); });
    $('timeline-speed').addEventListener('change', () => { if (MapState.playing) { stopPlay(); togglePlay(); } });
    $('radar-section').addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
      if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); togglePlay(); }
    });
  }

  function hoverText(lat, lon) {
    const d = isLand(lat, lon);
    const where = d ? `${d.name} District` : 'Sea';
    const t = MapState.frame;
    const parts = [];
    if (Grid.v) {
      const L = MapState.layer;
      if (L === 'flood') {
        const f = d && Flood.island && Flood.island[d.name];
        parts.push(f ? `Flood risk: <b>${f.level}</b> (${f.score}/100)` : 'Flood risk: --');
      } else if (L !== 'radar') {
        const key = { precip: 'precip', accum: 'accum', temp: 'temp', wind: 'ws', clouds: 'cloud', cape: 'cape', uv: 'uv' }[L];
        const v = gridValueAt(key, t, lat, lon);
        parts.push(`${layerTitle(L)}: <b>${formatLayerValue(L, v)}</b>`);
      }
      const rain = gridValueAt('precip', t, lat, lon);
      if (L !== 'precip') parts.push(`Rain: ${formatRain(rain || 0)}/h`);
      const ws = gridValueAt('ws', t, lat, lon);
      if (L !== 'wind' && isNum(ws)) parts.push(`Wind: ${formatWind(ws)}`);
    }
    return `<strong>${where}</strong><br>${lat.toFixed(2)}° N, ${lon.toFixed(2)}° E<br>${parts.join('<br>')}<br><em>Click to see this spot's forecast</em>`;
  }
  function layerTitle(L) {
    return { radar: 'Observed radar', precip: 'Rainfall', accum: '24 h rainfall', temp: 'Temperature', wind: 'Wind speed', clouds: 'Cloud cover', cape: 'Storm energy (CAPE)', uv: 'UV index', flood: 'Flood risk' }[L];
  }
  function formatLayerValue(L, v) {
    if (!isNum(v)) return '--';
    switch (L) {
      case 'precip': return `${formatRain(v)}/h`;
      case 'accum': return formatRain(v);
      case 'temp': return formatTemp(v, 1);
      case 'wind': return formatWind(v);
      case 'clouds': return `${Math.round(v)}%`;
      case 'cape': return `${Math.round(v)} J/kg`;
      case 'uv': return v.toFixed(1);
      default: return String(v);
    }
  }

  function setLayer(layer) {
    MapState.layer = layer;
    document.querySelectorAll('#radar-layer-buttons .layer-chip').forEach(b => b.classList.toggle('active', b.dataset.layer === layer));
    stopPlay();
    if (layer === 'radar') {
      loadRadarFrames().then(() => { MapState.radarFrame = Math.max(0, Radar.frames.length - 1); setupTimeline(); renderRadar(); });
    } else if (layer === 'flood' && !Flood.island) {
      loadFloodIsland().then(() => { renderRadar(); renderFloodCard(); });
    }
    setupTimeline();
    renderRadar();
  }

  // ------------------------------------------------------------------------
  // Timeline playback (Feature 26)
  // ------------------------------------------------------------------------
  function frameCount() { return MapState.layer === 'radar' ? Radar.frames.length : Grid.times.length; }
  function setupTimeline() {
    const slider = $('timeline-slider');
    const ticks = $('timeline-ticks');
    if (!slider) return;
    const n = frameCount();
    slider.max = Math.max(0, n - 1);
    slider.disabled = n < 2;
    ticks.innerHTML = '';
    if (MapState.layer === 'radar') {
      slider.value = MapState.radarFrame;
      Radar.frames.forEach((f, i) => {
        if (i % 3 !== 0 && i !== n - 1) return;
        ticks.insertAdjacentHTML('beforeend', `<span style="left:${n > 1 ? i / (n - 1) * 100 : 0}%">${i === n - 1 ? 'Latest' : fmtHour(f.time).replace(':00', '')}</span>`);
      });
    } else if (n) {
      if (MapState.followNow) MapState.frame = gridNowIndex();
      slider.value = MapState.frame;
      const now = gridNowIndex();
      Grid.times.forEach((t, i) => {
        const h = colomboHour(t);
        if (i === now) ticks.insertAdjacentHTML('beforeend', `<span class="now" style="left:${i / (n - 1) * 100}%">Now</span>`);
        else if (h === 0) ticks.insertAdjacentHTML('beforeend', `<span class="day" style="left:${i / (n - 1) * 100}%">${new Date(t).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Colombo' })}</span>`);
        else if (h === 12 && Math.abs(i - now) > 6) ticks.insertAdjacentHTML('beforeend', `<span class="noon" style="left:${i / (n - 1) * 100}%">12 PM</span>`);
      });
    }
  }
  function setFrame(i, { user = false } = {}) {
    const n = frameCount();
    if (!n) return;
    i = clamp(Math.round(i), 0, n - 1);
    if (MapState.layer === 'radar') MapState.radarFrame = i;
    else { MapState.frame = i; if (user) MapState.followNow = i === gridNowIndex(); }
    $('timeline-slider').value = i;
    renderRadar();
  }
  function stepFrame(d) {
    const n = frameCount();
    const cur = MapState.layer === 'radar' ? MapState.radarFrame : MapState.frame;
    MapState.followNow = false;
    setFrame((cur + d + n) % n);
  }
  function togglePlay() {
    if (MapState.playing) { stopPlay(); return; }
    if (frameCount() < 2) return;
    MapState.followNow = false;
    $('timeline-play').innerHTML = '<i class="fa-solid fa-pause"></i>';
    $('timeline-play').classList.add('playing');
    MapState.playing = setInterval(() => stepFrame(1), +$('timeline-speed').value);
  }
  function stopPlay() {
    if (!MapState.playing) return;
    clearInterval(MapState.playing);
    MapState.playing = null;
    $('timeline-play').innerHTML = '<i class="fa-solid fa-play"></i>';
    $('timeline-play').classList.remove('playing');
  }

  // ------------------------------------------------------------------------
  // Rendering the layers
  // ------------------------------------------------------------------------
  const fieldCanvas = document.createElement('canvas');
  const FIELD_W = 120, FIELD_H = 180;
  fieldCanvas.width = FIELD_W; fieldCanvas.height = FIELD_H;
  const FIELD_BOUNDS = {
    west: GRID.lon0 - GRID.step / 2, east: GRID.lon0 + (GRID.cols - 1) * GRID.step + GRID.step / 2,
    south: GRID.lat0 - GRID.step / 2, north: GRID.lat0 + (GRID.rows - 1) * GRID.step + GRID.step / 2
  };

  function renderField(key, scaleName, t) {
    const ctx = fieldCanvas.getContext('2d');
    const img = ctx.createImageData(FIELD_W, FIELD_H);
    const vals = new Float32Array(Grid.pts.length);
    for (let i = 0; i < Grid.pts.length; i++) { const v = fieldValue(key, i, t); vals[i] = isNum(v) ? v : NaN; }
    const { west, east, south, north } = FIELD_BOUNDS;
    for (let py = 0; py < FIELD_H; py++) {
      const lat = north - (py + 0.5) / FIELD_H * (north - south);
      const fr = clamp((lat - GRID.lat0) / GRID.step, 0, GRID.rows - 1);
      const r0 = Math.floor(fr), r1 = Math.min(r0 + 1, GRID.rows - 1), dr = fr - r0;
      for (let px = 0; px < FIELD_W; px++) {
        const lon = west + (px + 0.5) / FIELD_W * (east - west);
        const fc = clamp((lon - GRID.lon0) / GRID.step, 0, GRID.cols - 1);
        const c0 = Math.floor(fc), c1 = Math.min(c0 + 1, GRID.cols - 1), dc = fc - c0;
        const a = vals[r0 * GRID.cols + c0], b = vals[r0 * GRID.cols + c1], c = vals[r1 * GRID.cols + c0], d = vals[r1 * GRID.cols + c1];
        let v = a * (1 - dr) * (1 - dc) + b * (1 - dr) * dc + c * dr * (1 - dc) + d * dr * dc;
        if (key === 'wd') v = a;
        const [R, G, B, A] = scaleRGBA(scaleName, v);
        // soft edges so the rectangle of data fades into the background
        const edge = Math.min(px, FIELD_W - 1 - px, py, FIELD_H - 1 - py);
        const fade = edge < 10 ? edge / 10 : 1;
        const o = (py * FIELD_W + px) * 4;
        img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = Math.round(A * 255 * fade);
      }
    }
    ctx.putImageData(img, 0, 0);
    return fieldCanvas.toDataURL('image/png');
  }

  function applyOpacity() {
    const g1 = $('radar-field'), g2 = $('radar-observed');
    if (g1) g1.setAttribute('opacity', MapState.opacity);
    if (g2) g2.setAttribute('opacity', Math.min(1, MapState.opacity + 0.1));
  }

  function renderRadar() {
    if (!MapState.built) return;
    const L = MapState.layer;
    const field = $('radar-field'), observed = $('radar-observed');
    field.innerHTML = '';
    applyOpacity();
    $('radar-borders').style.display = MapState.overlays.borders ? '' : 'none';
    $('radar-labels').style.display = MapState.overlays.labels ? '' : 'none';
    const status = $('radar-status');

    // time frame for model overlays
    let t = MapState.frame;
    if (L === 'radar' && Radar.frames.length && Grid.times.length) {
      const rt = Radar.frames[MapState.radarFrame].time;
      t = Grid.times.reduce((best, gt, i) => (Math.abs(gt - rt) < Math.abs(Grid.times[best] - rt) ? i : best), 0);
    }

    // Base layer
    observed.querySelectorAll('g.radar-frame').forEach(g => { g.style.display = 'none'; });
    if (L === 'radar') renderObserved();
    else if (L === 'flood') renderFloodLayer(field);
    else if (Grid.v && Grid.times.length) {
      const key = { precip: 'precip', accum: 'accum', temp: 'temp', wind: 'ws', clouds: 'cloud', cape: 'cape', uv: 'uv' }[L];
      const href = renderField(key, L, t);
      const p1 = geoToMap(FIELD_BOUNDS.north, FIELD_BOUNDS.west), p2 = geoToMap(FIELD_BOUNDS.south, FIELD_BOUNDS.east);
      const image = el('image', { x: p1.x, y: p1.y, width: p2.x - p1.x, height: p2.y - p1.y, preserveAspectRatio: 'none', class: 'radar-field-img' }, field);
      image.setAttribute('href', href);
      if (L === 'temp' || L === 'uv') image.setAttribute('clip-path', 'url(#radar-island-clip)');
    }

    renderWindOverlay(t);
    renderLightningOverlay(t);
    renderRadarPin();
    renderLegend();
    renderTimeBadge(t);

    if (L === 'radar') {
      status.innerHTML = Radar.status === 'live'
        ? `<i class="fa-solid fa-circle-check"></i> Observed radar · ${Radar.frames.length} frames (10 min)`
        : '<i class="fa-solid fa-triangle-exclamation"></i> Observed radar unavailable (needs internet)';
    } else if (Grid.status === 'live') status.innerHTML = `<i class="fa-solid fa-circle-check"></i> Model layers updated ${timeAgo(Grid.fetchedAt)}`;
    else if (Grid.status === 'cache') status.innerHTML = `<i class="fa-solid fa-box-archive"></i> Saved layers from ${timeAgo(Grid.fetchedAt)}`;
    else if (Grid.status === 'error') status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Layers unavailable – connect to the internet';
    else status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading layers…';
    $('radar-stage').classList.toggle('is-loading', L !== 'radar' && L !== 'flood' && !Grid.v);
    renderRainTracker();
    renderLightningPanel();
  }

  function renderObserved() {
    const observed = $('radar-observed');
    if (Radar.status !== 'live' || !Radar.frames.length) return;
    const f = Radar.frames[MapState.radarFrame];
    let g = observed.querySelector(`g.radar-frame[data-t="${f.time}"]`);
    if (!g) {
      g = el('g', { class: 'radar-frame', 'data-t': f.time }, observed);
      radarTiles(Radar.z).forEach(({ x, y, z }) => {
        const b = tileBounds(z, x, y);
        const p1 = geoToMap(b.north, b.west), p2 = geoToMap(b.south, b.east);
        const im = el('image', { x: p1.x, y: p1.y, width: p2.x - p1.x, height: p2.y - p1.y, preserveAspectRatio: 'none' }, g);
        im.setAttribute('href', `${Radar.host}${f.path}/256/${z}/${x}/${y}/2/1_1.png`);
      });
      // keep memory bounded
      const all = observed.querySelectorAll('g.radar-frame');
      if (all.length > 16) all[0].remove();
    }
    g.style.display = '';
    // pre-load the next frame for smooth playback
    const next = Radar.frames[(MapState.radarFrame + 1) % Radar.frames.length];
    radarTiles(Radar.z).forEach(({ x, y, z }) => { const i = new Image(); i.src = `${Radar.host}${next.path}/256/${z}/${x}/${y}/2/1_1.png`; });
  }

  function renderWindOverlay(t) {
    const g = $('radar-wind');
    g.innerHTML = '';
    if (!(MapState.overlays.wind || MapState.layer === 'wind') || !Grid.v) return;
    Grid.pts.forEach((p, i) => {
      const ws = fieldValue('ws', i, t), wd = fieldValue('wd', i, t);
      if (!isNum(ws) || !isNum(wd)) return;
      const { x, y } = geoToMap(p.lat, p.lon);
      const len = clamp(7 + ws * 0.45, 8, 24);
      const [R, G, B] = scaleRGBA('wind', ws);
      const color = MapState.layer === 'wind' ? 'rgba(15,23,42,0.85)' : `rgb(${R | 0},${G | 0},${B | 0})`;
      const a = el('g', { class: 'wind-arrow', transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(wd + 180) % 360})` }, g);
      el('path', { d: `M0,${len / 2} L0,${-len / 2} M-3.2,${-len / 2 + 4.5} L0,${-len / 2} L3.2,${-len / 2 + 4.5}`, stroke: color, style: `animation-delay:${(i % 7) * 0.15}s` }, a);
    });
  }

  function renderLightningOverlay(t) {
    const g = $('radar-lightning');
    g.innerHTML = '';
    if (!(MapState.overlays.lightning || MapState.layer === 'cape') || !Grid.v) return;
    const bolt = 'M1.5,-9 L-4,1 L-0.5,1 L-2,9 L4.5,-2 L0.8,-2 L2.8,-9 Z';
    Grid.pts.forEach((p, i) => {
      const code = fieldValue('code', i, t), cape = fieldValue('cape', i, t), rain = fieldValue('precip', i, t);
      const storm = code >= 95;
      const possible = !storm && cape >= 1500 && rain >= 1;
      if (!storm && !possible) return;
      const { x, y } = geoToMap(p.lat, p.lon);
      const b = el('g', { class: `bolt ${storm ? 'storm' : 'possible'}`, transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`, style: `animation-delay:${(i % 5) * 0.37}s` }, g);
      if (storm) el('circle', { r: 14, fill: 'url(#bolt-glow)' }, b);
      el('path', { d: bolt }, b);
    });
    // Live strikes, only meaningful close to "now"
    if (Strikes.list.length && Math.abs(t - gridNowIndex()) <= 1) {
      Strikes.list.forEach(s => {
        const { x, y } = geoToMap(s.lat, s.lon);
        const age = (Date.now() - s.t) / 60000;
        el('path', { class: 'strike', d: `M${x - 3},${y} L${x + 3},${y} M${x},${y - 3} L${x},${y + 3}`, opacity: clamp(1 - age / 60, 0.25, 1) }, g);
      });
    }
  }

  function renderRadarPin() {
    const g = $('radar-pin');
    g.innerHTML = '';
    const loc = activeLoc();
    const { x, y } = geoToMap(loc.lat, loc.lon);
    const p = el('g', { transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`, class: 'radar-you' }, g);
    el('circle', { r: 9, class: 'pulse' }, p);
    el('circle', { r: 4 }, p);
    const tx = el('text', { x: 7, y: -7 }, p); tx.textContent = loc.name;
    // avoid a duplicate town label right under the pin
    document.querySelectorAll('#radar-labels .radar-town').forEach(t => {
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(t.getAttribute('transform'));
      t.style.display = m && Math.hypot(+m[1] - x, +m[2] - y) < 16 ? 'none' : '';
    });
  }

  function renderLegend() {
    const box = $('radar-legend');
    const L = MapState.layer;
    if (L === 'radar') {
      box.innerHTML = `<div class="legend-title">Observed radar reflectivity</div><div class="legend-bar" style="background:linear-gradient(90deg,#88ddee,#0099cc,#0077aa,#ffee00,#ffaa00,#ff4400,#c10000,#ff99ff)"></div><div class="legend-ends"><span>Light</span><span>Heavy</span><span>Hail</span></div>`;
      return;
    }
    if (L === 'flood') {
      box.innerHTML = `<div class="legend-title">Flood risk</div><div class="legend-swatches">${FLOOD_LEVELS.map(l => `<span><i style="background:${l.color}"></i>${l.name}</span>`).join('')}</div>`;
      return;
    }
    const sc = SCALES[L];
    const grad = sc.stops.map((s, i) => `${s[1]} ${(i / (sc.stops.length - 1) * 100).toFixed(0)}%`).join(',');
    const label = (v) => (L === 'temp' ? formatTemp(v) : L === 'wind' ? `${Math.round(windValue(v))}` : L === 'precip' || L === 'accum' ? `${+rainValue(v).toFixed(AppState.rainUnit === 'in' ? 2 : 1)}` : v);
    const unit = L === 'wind' ? WIND_UNITS[AppState.windUnit].label : L === 'precip' ? `${AppState.rainUnit}/h` : L === 'accum' ? AppState.rainUnit : L === 'temp' ? '' : sc.unit;
    box.innerHTML = `<div class="legend-title">${layerTitle(L)} ${unit ? `(${unit})` : ''}</div><div class="legend-bar" style="background:linear-gradient(90deg,${grad})"></div>
      <div class="legend-ends">${[sc.stops[0], sc.stops[Math.floor(sc.stops.length / 2)], sc.stops[sc.stops.length - 1]].map(s => `<span>${label(s[0])}</span>`).join('')}</div>
      ${L === 'cape' ? '<p class="legend-note">CAPE = energy available for thunderstorms. Above 1,000 J/kg storms can grow quickly.</p>' : ''}`;
  }

  function renderTimeBadge(t) {
    const badge = $('radar-time-badge');
    if (MapState.layer === 'radar') {
      const f = Radar.frames[MapState.radarFrame];
      badge.innerHTML = f ? `<i class="fa-solid fa-satellite-dish"></i> Observed · ${fmtHour(f.time)}${MapState.radarFrame === Radar.frames.length - 1 ? ' (latest)' : ''}` : 'Radar unavailable';
      return;
    }
    if (!Grid.times.length) { badge.textContent = '--'; return; }
    const diff = t - gridNowIndex();
    const rel = diff === 0 ? 'Now' : diff > 0 ? `Forecast +${diff} h` : `${-diff} h ago`;
    badge.innerHTML = `<i class="fa-regular fa-clock"></i> ${fmtDayHour(Grid.times[t])} · <strong>${rel}</strong>`;
    badge.classList.toggle('future', diff > 0);
  }

  // ------------------------------------------------------------------------
  // Precipitation tracking panel
  // ------------------------------------------------------------------------
  function rainCentroid(t) {
    let w = 0, lat = 0, lon = 0;
    Grid.pts.forEach((p, i) => { const v = fieldValue('precip', i, t) || 0; if (v >= 0.2) { w += v; lat += p.lat * v; lon += p.lon * v; } });
    return w >= 3 ? { lat: lat / w, lon: lon / w, w } : null;
  }
  function bearingName(deg) { return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((deg % 360) + 360) % 360 / 45) % 8]; }

  function renderRainTracker() {
    const box = $('rain-tracker');
    if (!box) return;
    if (!Grid.v) { box.innerHTML = '<p class="muted-note">Rainfall tracking needs the model layers (internet).</p>'; return; }
    const t = MapState.layer === 'radar' ? gridNowIndex() : MapState.frame;
    const land = gridLand();
    const landIdx = Grid.pts.map((p, i) => i).filter(i => land[i]);
    const wet = landIdx.filter(i => (fieldValue('precip', i, t) || 0) >= 0.2);
    const pct = Math.round(wet.length / Math.max(1, landIdx.length) * 100);
    let heaviest = null;
    Grid.pts.forEach((p, i) => { const v = fieldValue('precip', i, t) || 0; if (!heaviest || v > heaviest.v) heaviest = { v, p, d: land[i] || nearestDistrict(p.lat, p.lon).district }; });
    const c0 = rainCentroid(Math.max(0, t - 2)), c1 = rainCentroid(t);
    let motion = 'Not enough rain to track movement.';
    if (c0 && c1) {
      const km = haversineKm(c0.lat, c0.lon, c1.lat, c1.lon);
      if (km < 8) motion = 'Rain areas are mostly stationary (building and fading in place).';
      else {
        const brg = Math.atan2((c1.lon - c0.lon) * Math.cos(c1.lat * Math.PI / 180), c1.lat - c0.lat) * 180 / Math.PI;
        motion = `Rain areas drifting <strong>${bearingName(brg)}</strong> at about ${Math.round(km / 2)} km/h.`;
      }
    }
    // Selected location: next 6 hours from this frame
    const loc = activeLoc();
    const bars = [];
    for (let k = 0; k < 8 && t + k < Grid.times.length; k++) bars.push({ t: Grid.times[t + k], v: gridValueAt('precip', t + k, loc.lat, loc.lon) || 0 });
    const maxBar = Math.max(1, ...bars.map(b => b.v));
    const firstWet = bars.find(b => b.v >= 0.3);
    let past24 = 0; for (let k = Math.max(0, t - 23); k <= t; k++) past24 += gridValueAt('precip', k, loc.lat, loc.lon) || 0;
    box.innerHTML = `
      <div class="tracker-stats">
        <div><span>Island raining</span><strong>${pct}%</strong></div>
        <div><span>Heaviest</span><strong>${heaviest && heaviest.v >= 0.2 ? `${formatRain(heaviest.v)}/h` : 'None'}</strong><small>${heaviest && heaviest.v >= 0.2 ? `near ${heaviest.d.name}` : ''}</small></div>
        <div><span>24 h total here</span><strong>${formatRain(past24)}</strong></div>
      </div>
      <p class="tracker-motion"><i class="fa-solid fa-compass"></i> ${motion}</p>
      <div class="tracker-bars-head"><span>${escapeHtml(loc.name)} – next hours</span><span>${firstWet ? `Rain from ~${fmtHour(firstWet.t)}` : 'Looks dry'}</span></div>
      <div class="tracker-bars">${bars.map(b => `<div class="tbar" title="${fmtHour(b.t)}: ${formatRain(b.v)}"><i style="height:${Math.max(3, b.v / maxBar * 100)}%;background:${b.v >= 0.1 ? `rgb(${scaleRGBA('precip', Math.max(0.1, b.v)).slice(0, 3).map(n => n | 0).join(',')})` : 'var(--border-strong)'}"></i><span>${fmtHour(b.t).replace(':00', '').replace(' ', '')}</span></div>`).join('')}</div>`;
  }

  // ------------------------------------------------------------------------
  // Lightning panel (Feature 23)
  // ------------------------------------------------------------------------
  function stormDistricts(fromT, toT) {
    const land = gridLand();
    const set = new Map();
    for (let t = fromT; t <= toT && t < Grid.times.length; t++) {
      Grid.pts.forEach((p, i) => {
        if (fieldValue('code', i, t) >= 95) {
          const d = land[i] || nearestDistrict(p.lat, p.lon).district;
          if (!set.has(d.name)) set.set(d.name, Grid.times[t]);
        }
      });
    }
    return set;
  }
  // Weather codes can't be interpolated: look for any storm cell within `km` of the point
  function stormNear(t, lat, lon, km) {
    return Grid.pts.some((p, i) => fieldValue('code', i, t) >= 95 && haversineKm(lat, lon, p.lat, p.lon) <= km);
  }
  function renderLightningPanel() {
    const box = $('lightning-panel');
    if (!box) return;
    if (!Grid.v) { box.innerHTML = '<p class="muted-note">Lightning risk needs the model layers (internet).</p>'; return; }
    const now = gridNowIndex();
    const t = MapState.layer === 'radar' ? now : MapState.frame;
    const cellsNow = Grid.pts.filter((p, i) => fieldValue('code', i, t) >= 95).length;
    const next12 = stormDistricts(now, now + 12);
    const loc = activeLoc();
    let nextHere = null;
    for (let k = now; k < Math.min(Grid.times.length, now + 24); k++) {
      if (stormNear(k, loc.lat, loc.lon, 25) || (gridValueAt('cape', k, loc.lat, loc.lon) >= 1500 && gridValueAt('precip', k, loc.lat, loc.lon) >= 2)) { nextHere = Grid.times[k]; break; }
    }
    const capeHere = gridValueAt('cape', t, loc.lat, loc.lon);
    const strikeNear = Strikes.list.filter(s => haversineKm(s.lat, s.lon, loc.lat, loc.lon) < 30);
    const live = Strikes.status === 'live'
      ? `<p class="strike-note"><i class="fa-solid fa-satellite"></i> Live network: <strong>${Strikes.list.length}</strong> strikes near Sri Lanka in the last hour${strikeNear.length ? `, <strong class="text-rose">${strikeNear.length} within 30 km of ${escapeHtml(loc.name)}</strong>` : ''}.</p>`
      : Strikes.status === 'blocked' ? '<p class="strike-note muted-note"><i class="fa-solid fa-circle-info"></i> Live strike feed not reachable from this browser – showing forecast storm cells (⚡) instead.</p>' : '';
    box.innerHTML = `
      <div class="tracker-stats">
        <div><span>Storm cells ${t === now ? 'now' : 'at this time'}</span><strong>${cellsNow}</strong></div>
        <div><span>Storm energy here</span><strong>${isNum(capeHere) ? Math.round(capeHere) : '--'}</strong><small>J/kg CAPE</small></div>
        <div><span>${escapeHtml(loc.name)}</span><strong class="${nextHere ? 'text-amber' : 'text-emerald'}">${nextHere ? fmtDayHour(nextHere) : 'Low risk'}</strong><small>${nextHere ? 'storms possible from' : 'next 24 h'}</small></div>
      </div>
      ${next12.size ? `<p class="storm-list"><i class="fa-solid fa-bolt text-amber"></i> Thunderstorms likely in the next 12 h: ${[...next12.keys()].slice(0, 10).map(n => `<button class="link-chip" data-district="${n}">${n}</button>`).join(' ')}</p>` : '<p class="storm-list"><i class="fa-solid fa-circle-check text-emerald"></i> No thunderstorm cells forecast in the next 12 hours.</p>'}
      ${live}
      <p class="safety-tip"><strong>30/30 rule:</strong> if thunder follows lightning within 30 seconds, go indoors and wait 30 minutes after the last thunder.</p>`;
    box.querySelectorAll('[data-district]').forEach(b => b.addEventListener('click', () => selectDistrictAndZoom(findDistrict(b.dataset.district))));
  }

  // ------------------------------------------------------------------------
  // Flood risk monitoring (Feature 24)
  // ------------------------------------------------------------------------
  const FLOOD_LEVELS = [
    { name: 'Low', max: 25, color: '#22c55e', cls: 'low' },
    { name: 'Moderate', max: 45, color: '#eab308', cls: 'moderate' },
    { name: 'High', max: 65, color: '#f97316', cls: 'high' },
    { name: 'Severe', max: 101, color: '#dc2626', cls: 'severe' }
  ];
  const FLOOD_PRONE = {
    Colombo: 'Kelani Ganga', Gampaha: 'Kelani Ganga & Attanagalu Oya', Kalutara: 'Kalu Ganga', Ratnapura: 'Kalu Ganga',
    Galle: 'Gin Ganga', Matara: 'Nilwala Ganga', Kegalle: 'Kelani Ganga & Maha Oya', Batticaloa: 'Mundeni Aru & lagoon',
    Ampara: 'Gal Oya', Trincomalee: 'lower Mahaweli Ganga', Polonnaruwa: 'Mahaweli Ganga', Puttalam: 'Deduru Oya & Kala Oya',
    Kurunegala: 'Deduru Oya', Mullaitivu: 'Nanthi Kadal', Hambantota: 'Walawe Ganga', Mannar: 'Malwathu Oya'
  };
  const Flood = { island: null, fetchedAt: 0, place: {}, loading: null };
  function floodLevel(score) { return FLOOD_LEVELS.find(l => score < l.max) || FLOOD_LEVELS[3]; }

  function scoreFlood({ daily, discharge, mean, dmax, district }) {
    const past = sum((daily || []).slice(0, 3));
    const next = sum((daily || []).slice(3, 6));
    const factors = [];
    let s = clamp(past / 150 * 40, 0, 40) + clamp(next / 150 * 35, 0, 35);
    factors.push({ label: 'Rain, last 3 days', value: formatRain(past), pts: clamp(past / 150 * 40, 0, 40) });
    factors.push({ label: 'Rain, next 3 days', value: formatRain(next), pts: clamp(next / 150 * 35, 0, 35) });
    let ratio = null;
    if (discharge && discharge.length && mean && mean.length) {
      const today = 7; // past_days=7 → index 7 is today
      const fcMax = maxOf(discharge.slice(today), null);
      const avgMean = sum(mean.slice(today)) / Math.max(1, mean.slice(today).filter(isNum).length);
      if (isNum(fcMax) && avgMean >= 2) {
        ratio = fcMax / avgMean;
        const pts = ratio > 3 ? 25 : ratio > 2 ? 18 : ratio > 1.5 ? 10 : ratio > 1.2 ? 4 : 0;
        s += pts;
        factors.push({ label: 'River flow vs normal', value: `${ratio.toFixed(1)}×`, pts });
      }
    }
    const prone = FLOOD_PRONE[district];
    if (prone) { s *= 1.15; factors.push({ label: 'Flood-prone basin', value: prone, pts: null }); }
    const score = Math.round(clamp(s, 0, 100));
    const lvl = floodLevel(score);
    return { score, level: lvl.name, color: lvl.color, cls: lvl.cls, past, next, ratio, factors, prone, daily, discharge, mean, dmax };
  }

  async function loadFloodIsland(force = false) {
    if (!force && Flood.island && Date.now() - Flood.fetchedAt < 3 * 3600000) return Flood.island;
    if (Flood.loading) return Flood.loading;
    if (!Flood.island) {
      const saved = store.get(K.flood);
      if (saved && saved.island && Date.now() - saved.fetchedAt < 24 * 3600000) { Flood.island = saved.island; Flood.fetchedAt = saved.fetchedAt; }
    }
    if (navigator.onLine === false) return Flood.island;
    const ds = SRI_LANKA_DISTRICTS;
    const q = coordsQuery(ds);
    Flood.loading = (async () => {
      try {
        const [rainRes, riverRes] = await Promise.allSettled([
          fetchJSON(`${API.forecast}?${q}&daily=precipitation_sum&past_days=3&forecast_days=4&timezone=Asia%2FColombo`, { timeout: 20000 }),
          fetchJSON(`https://flood-api.open-meteo.com/v1/flood?${q}&daily=river_discharge,river_discharge_mean,river_discharge_max&past_days=7&forecast_days=7`, { timeout: 20000 })
        ]);
        if (rainRes.status !== 'fulfilled') throw rainRes.reason;
        const rain = [].concat(rainRes.value);
        const river = riverRes.status === 'fulfilled' ? [].concat(riverRes.value) : [];
        const out = {};
        ds.forEach((d, i) => {
          const r = river[i] && river[i].daily;
          out[d.name] = scoreFlood({
            daily: rain[i].daily.precipitation_sum, discharge: r ? r.river_discharge : null, mean: r ? r.river_discharge_mean : null, dmax: r ? r.river_discharge_max : null, district: d.name
          });
          out[d.name].time = rain[i].daily.time;
          out[d.name].rtime = r ? r.time : null;
        });
        Flood.island = out; Flood.fetchedAt = Date.now();
        store.set(K.flood, { island: out, fetchedAt: Flood.fetchedAt });
      } catch (err) { console.warn('Flood data failed', err); }
      Flood.loading = null;
      return Flood.island;
    })();
    return Flood.loading;
  }

  async function loadFloodPlace(loc) {
    if (!loc.isPlace) return Flood.island && Flood.island[loc.name];
    const cached = Flood.place[loc.key];
    if (cached && Date.now() - cached.at < 3 * 3600000) return cached.data;
    if (navigator.onLine === false) return null;
    const q = `latitude=${loc.lat}&longitude=${loc.lon}`;
    const [rainRes, riverRes] = await Promise.allSettled([
      fetchJSON(`${API.forecast}?${q}&daily=precipitation_sum&past_days=3&forecast_days=4&timezone=Asia%2FColombo`, { timeout: 15000 }),
      fetchJSON(`https://flood-api.open-meteo.com/v1/flood?${q}&daily=river_discharge,river_discharge_mean,river_discharge_max&past_days=7&forecast_days=7`, { timeout: 15000 })
    ]);
    if (rainRes.status !== 'fulfilled') return null;
    const r = riverRes.status === 'fulfilled' ? riverRes.value.daily : null;
    const data = scoreFlood({ daily: rainRes.value.daily.precipitation_sum, discharge: r && r.river_discharge, mean: r && r.river_discharge_mean, dmax: r && r.river_discharge_max, district: loc.district.name });
    data.time = rainRes.value.daily.time;
    data.rtime = r ? r.time : null;
    Flood.place[loc.key] = { at: Date.now(), data };
    return data;
  }

  function renderFloodLayer(g) {
    if (!Flood.island) return;
    SRI_LANKA_DISTRICTS.forEach(d => {
      const f = Flood.island[d.name];
      if (!f) return;
      el('path', { d: d.path, fill: f.color, 'fill-opacity': 0.25 + f.score / 160, stroke: 'none', 'fill-rule': 'evenodd' }, g);
    });
  }

  let floodToken = 0;
  async function renderFloodCard() {
    const loc = activeLoc();
    const token = ++floodToken;
    if (!Flood.island) await loadFloodIsland();
    let f = loc.isPlace ? null : Flood.island && Flood.island[loc.name];
    if (loc.isPlace) f = await loadFloodPlace(loc).catch(() => null) || (Flood.island && Flood.island[loc.district.name]);
    if (token !== floodToken) return;
    const badge = $('flood-level-badge');
    if (!f) {
      badge.textContent = 'Unavailable'; badge.className = 'badge risk-badge';
      $('flood-advice').innerHTML = '<p class="muted-note">Flood data needs an internet connection.</p>';
      renderFloodList();
      return;
    }
    badge.textContent = `${f.level} risk`;
    badge.className = `badge risk-badge risk-${f.cls}`;
    $('flood-meter-fill').style.height = `${Math.max(4, f.score)}%`;
    $('flood-meter-fill').style.background = f.color;
    $('flood-score').textContent = `${f.score}/100`;
    $('flood-factors').innerHTML = '<ul class="factor-list">' + f.factors.map(x => `<li><span>${x.label}</span><strong>${escapeHtml(String(x.value))}</strong>${x.pts !== null ? `<em>+${Math.round(x.pts)}</em>` : '<em>×1.15</em>'}</li>`).join('') + '</ul>';
    const slide = LANDSLIDE_DISTRICTS.includes(loc.district.name);
    const adv = {
      Low: ['No flooding expected. Keep drains around your home clear.'],
      Moderate: ['Water may pool on low roads and paddy fields after heavy showers.', 'Avoid parking in low-lying areas overnight.'],
      High: ['Flooding of low-lying areas and roads is possible.', 'Move valuables and documents to a higher place.', 'Keep phones charged and follow DMC / Irrigation Department updates.'],
      Severe: ['Serious flooding is likely in low-lying areas.', 'Be ready to evacuate if authorities advise – call DMC 117.', 'Never walk or drive through flood water.']
    }[f.level];
    if (slide && f.next >= 75) adv.push('This is a landslide-prone district – watch for cracks, tilting trees and muddy springs (NBRO 011 2588946).');
    $('flood-advice').innerHTML = `<ul>${adv.map(a => `<li>${a}</li>`).join('')}</ul><p class="flood-src">GloFAS river model + Open-Meteo rainfall · Emergency: <a href="tel:117">DMC 117</a></p>`;
    renderFloodChart(f);
    renderFloodList();
  }

  function renderFloodList() {
    const box = $('flood-list');
    if (!Flood.island) { box.innerHTML = ''; return; }
    const top = Object.entries(Flood.island).sort((a, b) => b[1].score - a[1].score).slice(0, 5);
    box.innerHTML = `${top.map(([n, f]) => `<button class="flood-row" data-district="${n}"><span>${n}</span><span class="mini-meter"><i style="width:${f.score}%;background:${f.color}"></i></span><strong style="color:${f.color}">${f.level}</strong></button>`).join('')}`;
    box.querySelectorAll('[data-district]').forEach(b => b.addEventListener('click', () => selectDistrictAndZoom(findDistrict(b.dataset.district))));
  }

  function renderFloodChart(f) {
    if (!chartsAvailable('floodChart', 'Charts unavailable offline')) return;
    if (V4.charts.flood) V4.charts.flood.destroy();
    const th = chartTheme();
    const labels = (f.time || []).map((d, i) => (i === 3 ? 'Today' : new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Colombo' })));
    const datasets = [{
      type: 'bar', label: `Rain (${AppState.rainUnit})`, data: (f.daily || []).map(v => +rainValue(v || 0).toFixed(2)), yAxisID: 'y',
      backgroundColor: (f.daily || []).map((v, i) => (i < 3 ? 'rgba(56,189,248,0.55)' : 'rgba(37,99,235,0.85)')), borderRadius: 4
    }];
    if (f.discharge && f.rtime) {
      // align discharge days (past 7 + 7) with rain days (past 3 + 4)
      const idx = (f.time || []).map(d => f.rtime.indexOf(d));
      datasets.push({ type: 'line', label: 'River flow (m³/s)', data: idx.map(i => (i >= 0 ? f.discharge[i] : null)), yAxisID: 'y1', borderColor: '#f97316', backgroundColor: '#f97316', tension: 0.35, pointRadius: 3 });
      datasets.push({ type: 'line', label: 'Normal flow', data: idx.map(i => (i >= 0 && f.mean ? f.mean[i] : null)), yAxisID: 'y1', borderColor: th.text, borderDash: [5, 4], pointRadius: 0 });
    }
    V4.charts.flood = new Chart($('floodChart'), {
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: th.text, boxWidth: 12 } } },
        scales: {
          x: { ticks: { color: th.text }, grid: { color: th.grid } },
          y: { position: 'left', beginAtZero: true, ticks: { color: th.text }, grid: { color: th.grid }, title: { display: true, text: AppState.rainUnit, color: th.text } },
          y1: { position: 'right', display: datasets.length > 1, beginAtZero: true, ticks: { color: th.text }, grid: { display: false }, title: { display: true, text: 'm³/s', color: th.text } }
        }
      }
    });
  }

  V4.floodAlerts = function () {
    if (!Flood.island) return [];
    const high = Object.entries(Flood.island).filter(([, f]) => f.score >= 45);
    if (!high.length) return [];
    const severe = high.filter(([, f]) => f.score >= 65);
    const names = high.map(([n]) => n);
    return [{
      id: 'flood', level: severe.length ? 'red' : 'amber', icon: 'fa-house-flood-water', title: severe.length ? 'Severe Flood Risk' : 'Flood Risk Advisory', districts: names,
      message: `Rainfall and river-flow forecasts show ${severe.length ? 'severe' : 'high'} flood risk in ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}.`,
      advice: ['Move valuables to higher ground and keep an emergency bag ready.', 'Never cross flood water on foot or by vehicle.', 'Follow DMC (117) and Irrigation Department river-level warnings.']
    }];
  };

  // ------------------------------------------------------------------------
  // Forecast accuracy tracker (Feature 21)
  // ------------------------------------------------------------------------
  const Accuracy = {};
  async function loadAccuracy(loc) {
    const key = loc.key;
    const c = Accuracy[key] || store.get(`lanka_weather_acc_${key}`);
    if (c && Date.now() - c.at < 3 * 3600000) { Accuracy[key] = c; return c; }
    if (navigator.onLine === false) return c || null;
    const vars = ['temperature_2m', 'precipitation'].flatMap(v => [v, `${v}_previous_day1`, `${v}_previous_day2`, `${v}_previous_day3`]).join(',');
    const json = await fetchJSON(`https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=${vars}&past_days=7&forecast_days=1&timezone=Asia%2FColombo&timeformat=unixtime`, { timeout: 20000 });
    const h = json.hourly;
    const now = Date.now();
    const rows = h.time.map((t, i) => ({ t: t * 1000, T: h.temperature_2m[i], T1: h.temperature_2m_previous_day1[i], T2: h.temperature_2m_previous_day2[i], T3: h.temperature_2m_previous_day3[i], P: h.precipitation[i], P1: h.precipitation_previous_day1[i], P2: h.precipitation_previous_day2[i], P3: h.precipitation_previous_day3[i] }))
      .filter(r => r.t < now - 3600000 && isNum(r.T));
    const data = { at: Date.now(), rows: rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, isNum(v) ? Math.round(v * 10) / 10 : null]))) };
    Accuracy[key] = data;
    store.set(`lanka_weather_acc_${key}`, data);
    return data;
  }
  function accuracyStats(rows) {
    const lead = (n) => {
      const pairs = rows.filter(r => isNum(r[`T${n}`]));
      if (!pairs.length) return null;
      const err = pairs.map(r => r[`T${n}`] - r.T);
      return { mae: sum(err.map(Math.abs)) / err.length, bias: sum(err) / err.length, n: err.length };
    };
    const byDay = new Map();
    rows.forEach(r => {
      const d = new Date(r.t).toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(r);
    });
    const today = todayStr();
    const days = [...byDay.entries()].filter(([d, rs]) => d !== today && rs.length >= 20).map(([d, rs]) => {
      const f1 = rs.filter(r => isNum(r.T1));
      return {
        date: d, hi: maxOf(rs.map(r => r.T), null), hi1: f1.length ? maxOf(f1.map(r => r.T1), null) : null,
        rain: sum(rs.map(r => r.P)), rain1: f1.length ? sum(f1.map(r => r.P1)) : null, rain3: sum(rs.map(r => r.P3))
      };
    });
    days.forEach(d => {
      d.rainHit = isNum(d.rain1) ? (d.rain >= 1) === (d.rain1 >= 1) : null;
      d.tempHit = isNum(d.hi1) ? Math.abs(d.hi1 - d.hi) <= 1.5 : null;
    });
    const judged = days.filter(d => d.rainHit !== null);
    const rainHits = judged.filter(d => d.rainHit).length;
    const L1 = lead(1), L2 = lead(2), L3 = lead(3);
    const tempScore = L1 ? clamp(100 - L1.mae * 22, 0, 100) : 50;
    const rainScore = judged.length ? rainHits / judged.length * 100 : 50;
    return { L1, L2, L3, days, rainHits, judged: judged.length, score: Math.round(tempScore * 0.6 + rainScore * 0.4) };
  }

  let accToken = 0;
  async function renderAccuracyCard() {
    const loc = activeLoc();
    const token = ++accToken;
    const badge = $('accuracy-badge');
    let data = null;
    try { data = await loadAccuracy(loc); } catch (e) { console.warn('accuracy', e); }
    if (token !== accToken) return;
    if (!data || !data.rows.length) {
      badge.textContent = 'Unavailable'; badge.className = 'badge risk-badge';
      $('accuracy-scores').innerHTML = '<p class="muted-note">Accuracy tracking needs an internet connection.</p>';
      $('accuracy-table').innerHTML = '';
      return;
    }
    const s = accuracyStats(data.rows);
    badge.textContent = `${s.score}% reliable`;
    badge.className = `badge risk-badge ${s.score >= 80 ? 'risk-low' : s.score >= 65 ? 'risk-moderate' : 'risk-high'}`;
    const deg = (v) => `${(AppState.unit === 'f' ? v * 9 / 5 : v).toFixed(1)}°`;
    const biasTxt = s.L1 ? (Math.abs(s.L1.bias) < 0.3 ? 'No warm/cold bias' : `Forecasts ran ${deg(Math.abs(s.L1.bias))} too ${s.L1.bias > 0 ? 'warm' : 'cool'}`) : '';
    $('accuracy-scores').innerHTML = `
      <div class="acc-tile"><span>1-day temperature error</span><strong>±${s.L1 ? deg(s.L1.mae) : '--'}</strong><small>${biasTxt}</small></div>
      <div class="acc-tile"><span>3-day temperature error</span><strong>±${s.L3 ? deg(s.L3.mae) : '--'}</strong><small>${s.L2 ? `2-day: ±${deg(s.L2.mae)}` : ''}</small></div>
      <div class="acc-tile"><span>Rain / no-rain correct</span><strong>${s.judged ? `${s.rainHits}/${s.judged}` : '--'}</strong><small>days (≥1 mm = rain day)</small></div>`;
    $('accuracy-table').innerHTML = `<thead><tr><th>Day</th><th>High (actual)</th><th>Forecast 1 day ahead</th><th>Rain (actual)</th><th>Forecast</th><th></th></tr></thead><tbody>
      ${s.days.slice(-7).reverse().map(d => `<tr><td>${new Date(`${d.date}T12:00:00+05:30`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
      <td>${formatTemp(d.hi, 1)}</td><td>${isNum(d.hi1) ? formatTemp(d.hi1, 1) : '--'}</td><td>${formatRain(d.rain)}</td><td>${isNum(d.rain1) ? formatRain(d.rain1) : '--'}</td>
      <td>${d.rainHit && d.tempHit ? '<span class="hit">✓</span>' : d.rainHit === null ? '' : `<span class="${d.rainHit || d.tempHit ? 'half' : 'miss'}">${d.rainHit || d.tempHit ? '≈' : '✗'}</span>`}</td></tr>`).join('')}
      </tbody>`;
    if (!chartsAvailable('accuracyChart', 'Charts unavailable offline')) return;
    if (V4.charts.acc) V4.charts.acc.destroy();
    const th = chartTheme();
    const rows = data.rows;
    V4.charts.acc = new Chart($('accuracyChart'), {
      type: 'line',
      data: {
        labels: rows.map(r => r.t),
        datasets: [
          { label: 'Actual', data: rows.map(r => (isNum(r.T) ? +cToUnit(r.T).toFixed(1) : null)), borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.15)', fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2 },
          { label: 'Forecast 1 day ahead', data: rows.map(r => (isNum(r.T1) ? +cToUnit(r.T1).toFixed(1) : null)), borderColor: '#f59e0b', pointRadius: 0, tension: 0.3, borderWidth: 1.5 },
          { label: '3 days ahead', data: rows.map(r => (isNum(r.T3) ? +cToUnit(r.T3).toFixed(1) : null)), borderColor: '#a855f7', borderDash: [4, 3], pointRadius: 0, tension: 0.3, borderWidth: 1.5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: th.text, boxWidth: 12 } }, tooltip: { callbacks: { title: (it) => fmtDayHour(+it[0].label) } } },
        scales: {
          x: { ticks: { color: th.text, maxRotation: 0, autoSkip: false, callback: function (v, i) { const t = rows[i] && rows[i].t; return t && colomboHour(t) === 12 ? new Date(t).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Colombo' }) : null; } }, grid: { color: th.grid } },
          y: { ticks: { color: th.text, callback: v => `${v}°` }, grid: { color: th.grid } }
        }
      }
    });
  }

  // ------------------------------------------------------------------------
  // Wind speed & direction (Feature 22)
  // ------------------------------------------------------------------------
  const BEAUFORT = [
    [1, 'Calm', 'Smoke rises vertically; sea like a mirror.'], [6, 'Light air', 'Smoke drifts; tiny ripples on water.'],
    [12, 'Light breeze', 'Leaves rustle; you feel wind on your face.'], [20, 'Gentle breeze', 'Leaves and twigs in constant motion; flags extend.'],
    [29, 'Moderate breeze', 'Dust and loose paper lift; small branches move.'], [39, 'Fresh breeze', 'Small trees sway; crested wavelets on lakes.'],
    [50, 'Strong breeze', 'Large branches move; umbrellas hard to use.'], [62, 'Near gale', 'Whole trees move; walking against the wind is hard.'],
    [75, 'Gale', 'Twigs break off trees; cycling is dangerous.'], [89, 'Strong gale', 'Slight structural damage; roof sheets may lift.'],
    [103, 'Storm', 'Trees uprooted; considerable damage.'], [118, 'Violent storm', 'Widespread damage.'], [Infinity, 'Hurricane force', 'Devastation.']
  ];
  function beaufort(kmh) { const i = BEAUFORT.findIndex(b => kmh < b[0]); return { force: i, name: BEAUFORT[i][1], desc: BEAUFORT[i][2] }; }
  const COAST_FACING = { Colombo: 270, Gampaha: 270, Kalutara: 255, Puttalam: 270, Mannar: 270, Galle: 220, Matara: 180, Hambantota: 160, Ampara: 90, Batticaloa: 80, Trincomalee: 60, Mullaitivu: 50, Kilinochchi: 20, Jaffna: 0 };

  function renderWindCard() {
    const x = currentData();
    if (!x) return;
    const loc = activeLoc();
    const ws = x.windSpeed, deg = x.windDeg ?? 0;
    const bf = beaufort(ws);
    $('wind-beaufort-badge').textContent = `Force ${bf.force} · ${bf.name}`;
    $('wind-beaufort-badge').className = `badge risk-badge ${bf.force >= 7 ? 'risk-severe' : bf.force >= 6 ? 'risk-high' : bf.force >= 4 ? 'risk-moderate' : 'risk-low'}`;
    $('wind-speed-big').textContent = Math.round(windValue(ws));
    $('wind-unit-small').textContent = WIND_UNITS[AppState.windUnit].label;
    $('wind-from-text').textContent = `from the ${getWindDirectionCardinal(deg)} (${Math.round(deg)}°)`;
    $('wind-gust-val').textContent = formatWind(x.gusts);
    const next24 = (x.hourly || []).slice(0, 24);
    const gustMax = Math.max(x.gustMaxToday || 0, maxOf(next24.map(h => h.gust), 0));
    $('wind-max-val').textContent = formatWind(Math.max(maxOf(next24.map(h => h.wind), ws), 0));
    const facing = COAST_FACING[loc.district.name];
    let breeze = 'Inland – no sea breeze';
    if (isNum(facing)) {
      const diff = Math.abs(((deg - facing + 540) % 360) - 180);
      breeze = diff <= 60 ? 'Onshore – sea breeze' : diff >= 120 ? 'Offshore – land breeze' : 'Along the coast';
    }
    $('wind-breeze-val').textContent = breeze;
    const m = monsoonSeason(new Date().getMonth());
    $('wind-desc').innerHTML = `<strong>${bf.name}:</strong> ${bf.desc} Gusts up to <strong>${formatWind(gustMax)}</strong> today. <span class="muted-note">${m.name} – ${m.desc}</span>`;
    $('beaufort-bar').innerHTML = Array.from({ length: 13 }, (_, i) => `<span class="${i === bf.force ? 'on' : ''} ${i <= bf.force ? 'fill' : ''}" style="--bf:${i}" title="Force ${i}: ${BEAUFORT[i][1]}">${i}</span>`).join('');
    // Compass
    const ticks = Array.from({ length: 16 }, (_, i) => { const a = i * 22.5; const long = i % 4 === 0; return `<line x1="100" y1="${long ? 14 : 18}" x2="100" y2="26" transform="rotate(${a} 100 100)" class="${long ? 'major' : ''}"/>`; }).join('');
    const labels = [['N', 0], ['E', 90], ['S', 180], ['W', 270], ['NE', 45], ['SE', 135], ['SW', 225], ['NW', 315]].map(([t, a]) => {
      const r = t.length === 1 ? 38 : 40, rad = (a - 90) * Math.PI / 180;
      return `<text x="${(100 + r * Math.cos(rad)).toFixed(1)}" y="${(100 + r * Math.sin(rad) + 4).toFixed(1)}" class="${t.length === 1 ? 'cardinal' : 'inter'}">${t}</text>`;
    }).join('');
    const arrowLen = clamp(30 + ws, 34, 58);
    $('wind-compass').setAttribute('aria-label', `Wind from the ${getWindDirectionCardinal(deg)}`);
    $('wind-compass').innerHTML = `<g transform="translate(-100,-100)">
      <circle cx="100" cy="100" r="86" class="ring"/><circle cx="100" cy="100" r="60" class="ring inner"/>${ticks}${labels}
      <g transform="rotate(${(deg + 180) % 360} 100 100)" class="needle">
        <line x1="100" y1="${100 + arrowLen}" x2="100" y2="${100 - arrowLen + 10}"/><path d="M100,${100 - arrowLen} l-9,14 h18 z"/>
        <circle cx="100" cy="${100 + arrowLen}" r="4"/>
      </g>
      <circle cx="100" cy="100" r="5" class="hub"/></g>`;
    renderWindChart(x);
  }
  function renderWindChart(x) {
    if (!chartsAvailable('windChart', 'Charts unavailable offline')) return;
    if (V4.charts.wind) V4.charts.wind.destroy();
    const th = chartTheme();
    const hrs = (x.hourly || []).slice(0, 24);
    const rot = hrs.map(h => ((h.windDeg ?? x.windDeg ?? 0) + 180) % 360);
    V4.charts.wind = new Chart($('windChart'), {
      type: 'line',
      data: {
        labels: hrs.map(h => hourLabel(h.isoTime)),
        datasets: [
          { label: `Wind (${WIND_UNITS[AppState.windUnit].label})`, data: hrs.map(h => +windValue(h.wind).toFixed(1)), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)', fill: true, tension: 0.35, pointStyle: 'triangle', pointRadius: 6, pointRotation: rot, pointBackgroundColor: '#10b981' },
          { label: 'Gusts', data: hrs.map(h => (isNum(h.gust) ? +windValue(h.gust).toFixed(1) : null)), borderColor: '#f97316', borderDash: [5, 4], pointRadius: 0, tension: 0.35 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: th.text, boxWidth: 12 } }, tooltip: { callbacks: { afterLabel: (c) => (c.datasetIndex === 0 ? `From ${getWindDirectionCardinal((rot[c.dataIndex] + 180) % 360)}` : '') } } },
        scales: { x: { ticks: { color: th.text, maxTicksLimit: 8 }, grid: { color: th.grid } }, y: { beginAtZero: true, ticks: { color: th.text }, grid: { color: th.grid } } }
      }
    });
  }

  // ------------------------------------------------------------------------
  // UV index & sun protection (Feature 25)
  // ------------------------------------------------------------------------
  const SKIN_MED = { I: 200, II: 250, III: 350, IV: 450, V: 600, VI: 1000 };
  function uvLevel(uv) {
    if (uv < 3) return { name: 'Low', cls: 'risk-low', color: '#22c55e' };
    if (uv < 6) return { name: 'Moderate', cls: 'risk-moderate', color: '#eab308' };
    if (uv < 8) return { name: 'High', cls: 'risk-high', color: '#f97316' };
    if (uv < 11) return { name: 'Very high', cls: 'risk-severe', color: '#ef4444' };
    return { name: 'Extreme', cls: 'risk-extreme', color: '#a855f7' };
  }
  function burnMinutes(uv, skin) { return uv >= 0.5 ? SKIN_MED[skin] / (uv * 0.025 * 60) : Infinity; }
  function fmtMinutes(m) { if (!isFinite(m)) return 'No risk'; if (m > 180) return '3 h+'; return m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`; }

  function uvSeries(x) {
    const hrs = (x.hourly || []).slice(0, 24);
    return hrs.map((h, i) => ({ iso: h.isoTime, uv: isNum(h.uv) ? h.uv : (i === 0 ? x.uvIndex : null), isDay: h.isDay }));
  }
  function renderUvCard() {
    const x = currentData();
    if (!x) return;
    const loc = activeLoc();
    const skin = Prefs.skin;
    $('uv-skin-type').value = skin;
    const series = uvSeries(x);
    const uvNow = isNum(series[0] && series[0].uv) ? series[0].uv : x.uvIndex;
    const peakItem = series.filter(s => isNum(s.uv)).sort((a, b) => b.uv - a.uv)[0];
    const peak = Math.max(peakItem ? peakItem.uv : 0, x.uvMax || 0);
    const lvl = uvLevel(uvNow), peakLvl = uvLevel(peak);
    $('uv-level-badge').textContent = `${lvl.name} now`;
    $('uv-level-badge').className = `badge risk-badge ${lvl.cls}`;
    $('uv-peak-val').textContent = `${Math.round(peak)} (${peakLvl.name})${peakItem && peakItem.uv >= 1 ? ` at ${hourLabel(peakItem.iso)}` : ''}`;
    const burnBase = uvNow >= 1 ? uvNow : peak;
    $('uv-burn-val').textContent = uvNow >= 1 ? fmtMinutes(burnMinutes(uvNow, skin)) : peak >= 1 ? `${fmtMinutes(burnMinutes(peak, skin))} at peak` : 'No risk';
    const protect = series.filter(s => s.uv >= 3);
    $('uv-window-val').textContent = protect.length ? `${hourLabel(protect[0].iso)} – ${hourLabel(new Date(new Date(protect[protect.length - 1].iso).getTime() + 3600000).toISOString())}` : 'Not needed';
    // gauge (semi-circle, 0..12+)
    const frac = clamp(uvNow / 12, 0, 1);
    const ang = Math.PI * (1 - frac);
    const nx = 100 + 70 * Math.cos(ang), ny = 100 - 70 * Math.sin(ang);
    $('uv-gauge').innerHTML = `<svg viewBox="0 0 200 112" role="img" aria-label="UV index ${uvNow}">
      <defs><linearGradient id="uvgrad" x1="0" x2="1"><stop offset="0" stop-color="#22c55e"/><stop offset="0.25" stop-color="#eab308"/><stop offset="0.5" stop-color="#f97316"/><stop offset="0.72" stop-color="#ef4444"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
      <path d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke="url(#uvgrad)" stroke-width="16" stroke-linecap="round"/>
      <line x1="100" y1="100" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" class="uv-needle"/><circle cx="100" cy="100" r="6" class="hub"/>
      <text x="16" y="111" class="g-lbl">0</text><text x="176" y="111" class="g-lbl">12+</text></svg>
      <span id="uv-now-val" style="color:${lvl.color}">${uvNow.toFixed(uvNow < 10 ? 1 : 0)}</span><small>UV now</small>`;
    const advice = [];
    if (peak < 3) advice.push('Minimal protection needed today. Sunglasses on bright days.');
    else {
      advice.push(`Use broad-spectrum SPF ${peak >= 8 ? '50+' : '30+'} sunscreen – about a teaspoon each for face, arms and legs – 15 minutes before going out.`);
      advice.push('Reapply every 2 hours and after swimming or sweating.');
      advice.push('Wear a wide-brimmed hat, UV-blocking sunglasses and light long sleeves.');
      if (protect.length) advice.push(`Seek shade between ${hourLabel(protect[0].iso)} and ${hourLabel(protect[protect.length - 1].iso)}, when UV is 3 or higher.`);
    }
    if (COASTAL.includes(loc.district.name) && peak >= 6) advice.push('Sand and sea water reflect UV – you can burn faster at the beach, even under an umbrella.');
    if ((loc.elevation || 0) > 1000) advice.push('UV is stronger at altitude, and cool hill-country air hides how quickly you can burn.');
    if (x.cloudPct >= 70 && peak >= 6) advice.push('Clouds block heat, not UV – up to 80% of UV passes through thin cloud.');
    advice.push('Babies under 6 months should be kept out of direct sun.');
    if (peak >= 3) advice.push('For vitamin D, 10–15 minutes of sun before 9 AM or after 4 PM is enough for most people.');
    $('uv-advice').innerHTML = advice.map(a => `<li>${a}</li>`).join('');
    renderUvChart(series);
  }
  function renderUvChart(series) {
    if (!chartsAvailable('uvChart', 'Charts unavailable offline')) return;
    if (V4.charts.uv) V4.charts.uv.destroy();
    const th = chartTheme();
    V4.charts.uv = new Chart($('uvChart'), {
      type: 'bar',
      data: { labels: series.map(s => hourLabel(s.iso)), datasets: [{ label: 'UV index', data: series.map(s => s.uv ?? 0), backgroundColor: series.map(s => uvLevel(s.uv ?? 0).color), borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: c => `${uvLevel(c.raw).name} · burn in ${fmtMinutes(burnMinutes(c.raw, Prefs.skin))}` } } },
        scales: { x: { ticks: { color: th.text, maxTicksLimit: 8 }, grid: { display: false } }, y: { beginAtZero: true, suggestedMax: 12, ticks: { color: th.text }, grid: { color: th.grid } } }
      }
    });
  }

  // ------------------------------------------------------------------------
  // Weather impact on travel & outdoor activities (Feature 28)
  // ------------------------------------------------------------------------
  const HILL = ['Nuwara Eliya', 'Badulla', 'Kandy', 'Matale', 'Kegalle', 'Ratnapura'];
  const ACTIVITIES = [
    { id: 'beach', name: 'Beach & swimming', icon: 'fa-umbrella-beach', day: true },
    { id: 'surf', name: 'Surfing', icon: 'fa-water', day: true },
    { id: 'hiking', name: 'Hiking & trekking', icon: 'fa-person-hiking', day: true },
    { id: 'cycling', name: 'Cycling & running', icon: 'fa-person-biking', day: false },
    { id: 'cricket', name: 'Cricket & sports', icon: 'fa-baseball-bat-ball', day: true },
    { id: 'sightseeing', name: 'Temples & heritage sites', icon: 'fa-place-of-worship', day: true },
    { id: 'safari', name: 'Wildlife safari', icon: 'fa-paw', day: true },
    { id: 'train', name: 'Scenic train & tea country', icon: 'fa-train', day: true },
    { id: 'photo', name: 'Photography', icon: 'fa-camera', day: true },
    { id: 'boat', name: 'Fishing & boat trips', icon: 'fa-ship', day: true },
    { id: 'whale', name: 'Whale & dolphin watching', icon: 'fa-fish', day: true },
    { id: 'drive', name: 'Road trip & driving', icon: 'fa-car-side', day: false }
  ];

  function marineFor(districtName) { const k = DISTRICT_SEA_SECTOR[districtName]; return k ? AppState.marineCache[k] : null; }
  // Score one hour for one activity → { s: 0..10, why: [] }
  function scoreHour(act, h, ctx) {
    const why = [];
    let s = 10;
    const hr = colomboHour(new Date(h.isoTime).getTime());
    const thunder = h.code >= 95;
    const rain = h.rainAmount || 0, prob = h.rainProb || 0;
    const feels = h.temp + (h.humidity >= 70 ? (h.temp - 26) * 0.6 : 0);
    const wave = ctx.marine ? (ctx.marine.waveMax ?? ctx.marine.wave) : null;
    const pen = (n, reason) => { if (n > 0) { s -= n; if (reason && n >= 1.5) why.push(reason); } };
    if (act.day && !h.isDay) return { s: 0, why: ['After dark'] };
    pen(thunder ? 6 : 0, 'Thunderstorms');
    switch (act.id) {
      case 'beach':
        pen(rain * 1.5 + prob / 25, 'Showers'); pen(h.wind > 30 ? 2 : 0, 'Windy'); pen(isNum(wave) && wave >= 2 ? 3 : 0, 'Rough sea');
        pen(!ctx.coastal ? 3 : 0, 'Inland area'); pen(h.temp < 24 ? 2 : 0, 'Cool'); pen((h.uv || 0) >= 11 ? 1 : 0);
        break;
      case 'surf': {
        pen(!ctx.coastal ? 5 : 0, 'Inland area');
        if (isNum(wave)) { if (wave < 0.6) pen(4, 'Flat sea'); else if (wave > 3) pen(4, 'Waves too big'); else if (wave >= 1 && wave <= 2.5) why.push(`${wave.toFixed(1)} m waves`); }
        pen(h.wind > 25 ? 2 : 0, 'Choppy (onshore wind)'); pen(rain > 2 ? 1.5 : 0, 'Heavy rain');
        const m = new Date().getMonth(); const east = ['Ampara', 'Batticaloa', 'Trincomalee'].includes(ctx.district);
        if (ctx.coastal && east !== (m >= 4 && m <= 9)) pen(2, east ? 'East-coast off-season' : 'South/west off-season');
        break;
      }
      case 'hiking':
        pen(rain * 2 + prob / 20, 'Rain & slippery trails'); pen(feels > 34 ? 2.5 : feels > 31 ? 1 : 0, 'Hot & humid');
        pen(isNum(h.visKm) && h.visKm < 3 ? 2 : 0, 'Mist / poor views'); pen(h.wind > 35 ? 2 : 0, 'Windy ridges');
        pen(ctx.landslide ? 3 : 0, 'Landslide risk'); if (hr >= 5 && hr <= 9) s += 1;
        break;
      case 'cycling':
        pen(rain * 2 + prob / 22, 'Wet roads'); pen(h.wind > 25 ? 2 : 0, 'Headwinds'); pen(feels > 33 ? 2.5 : 0, 'Heat');
        if (!h.isDay) pen(1.5, 'Dark – use lights');
        if (hr >= 5 && hr <= 8) s += 1;
        break;
      case 'cricket':
        pen(rain * 3 + prob / 15, 'Rain stoppages'); pen(feels > 36 ? 2 : 0, 'Very hot'); pen(h.wind > 35 ? 1 : 0);
        break;
      case 'sightseeing':
        pen(rain * 1.5 + prob / 30, 'Showers'); pen(feels > 34 ? 2.5 : feels > 31 ? 1 : 0, 'Hot stone floors at midday');
        if (h.cloud >= 40 && h.cloud <= 80 && rain < 0.2) s += 0.5;
        break;
      case 'safari':
        pen(rain * 2 + prob / 25, 'Rain – animals hide'); pen(hr >= 10 && hr <= 14 ? 3 : 0, 'Midday heat – animals rest');
        if ((hr >= 6 && hr <= 9) || (hr >= 15 && hr <= 18)) { s += 1; why.push('Prime animal-spotting time'); }
        pen(!DRY_ZONE.includes(ctx.district) && !['Hambantota', 'Monaragala', 'Matale'].includes(ctx.district) ? 1 : 0);
        break;
      case 'train':
        pen(rain * 1.5 + prob / 30, 'Rain on the windows'); pen(h.cloud > 85 ? 2 : 0, 'Low cloud hides views'); pen(isNum(h.visKm) && h.visKm < 4 ? 2 : 0, 'Mist');
        pen(ctx.landslide ? 3 : 0, 'Landslide delays possible');
        break;
      case 'photo': {
        pen(rain * 2 + prob / 25, 'Rain'); const golden = ctx.sunrise && ctx.sunset && (Math.abs(hr - ctx.sunrise) <= 1 || Math.abs(hr - ctx.sunset) <= 1);
        if (golden) { s += 1.5; why.push('Golden hour'); } if (h.cloud >= 30 && h.cloud <= 70) { s += 0.5; why.push('Dramatic clouds'); }
        pen(hr >= 11 && hr <= 14 ? 1.5 : 0, 'Harsh midday light'); pen(isNum(h.visKm) && h.visKm < 4 ? 1.5 : 0, 'Haze');
        break;
      }
      case 'boat':
        pen(!ctx.coastal ? 1.5 : 0, 'Lakes/reservoirs only'); pen(h.wind > 30 ? 4 : h.wind > 22 ? 2 : 0, 'Strong wind');
        pen(isNum(wave) && wave >= 2.5 ? 5 : isNum(wave) && wave >= 1.5 ? 2 : 0, 'Rough sea'); pen(rain * 1.2 + prob / 30, 'Showers');
        break;
      case 'whale': {
        const m = new Date().getMonth(); const south = ['Matara', 'Galle', 'Hambantota'].includes(ctx.district); const tri = ctx.district === 'Trincomalee';
        if (!south && !tri) pen(4, 'Best from Mirissa or Trincomalee');
        else if ((south && !(m >= 10 || m <= 3)) || (tri && !(m >= 4 && m <= 9))) pen(3, 'Off-season here');
        else why.push('In season');
        pen(isNum(wave) && wave >= 2 ? 4 : 0, 'Rough sea'); pen(h.wind > 25 ? 2 : 0, 'Windy'); pen(hr > 11 ? 2 : 0, 'Tours leave 6–7 AM');
        pen(rain * 1.5, 'Showers');
        break;
      }
      case 'drive':
        pen(rain * 1.8 + prob / 35, 'Wet roads'); pen(isNum(h.visKm) && h.visKm < 2 ? 3 : 0, 'Fog');
        pen(ctx.landslide ? 3 : 0, 'Landslide-prone roads'); if (!h.isDay && ctx.hill) pen(1.5, 'Night driving on hill roads');
        break;
      default:
    }
    return { s: clamp(Math.round(s * 10) / 10, 0, 10), why };
  }
  function activityContext(x, districtName) {
    const rain24 = sum((x.hourly || []).slice(0, 24).map(h => h.rainAmount));
    const toHr = (iso) => (iso ? colomboHour(new Date(iso).getTime()) : null);
    return {
      district: districtName, coastal: COASTAL.includes(districtName), hill: HILL.includes(districtName), marine: marineFor(districtName),
      landslide: LANDSLIDE_DISTRICTS.includes(districtName) && rain24 >= 50, sunrise: toHr(x.sunriseISO), sunset: toHr(x.sunsetISO)
    };
  }
  function evaluateActivity(act, x, districtName) {
    const ctx = activityContext(x, districtName);
    const hrs = (x.hourly || []).slice(0, 48);
    const scores = hrs.map(h => scoreHour(act, h, ctx));
    // Outlook for the next 6 hours (only daylight hours count for daytime activities)
    const near = hrs.slice(0, 6).map((h, i) => ({ h, sc: scores[i] })).filter(o => !act.day || o.h.isDay);
    const nowS = near.length ? Math.round(sum(near.map(o => o.sc.s)) / near.length * 10) / 10 : 0;
    // best 2-hour window
    let best = null;
    for (let i = 0; i + 1 < scores.length; i++) {
      const avg = (scores[i].s + scores[i + 1].s) / 2;
      if (!best || avg > best.avg + 0.05) best = { i, avg };
    }
    const reasons = {};
    scores.slice(0, 6).forEach(sc => sc.why.forEach(w => { reasons[w] = (reasons[w] || 0) + 1; }));
    const why = Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 3);
    if (!near.length) { why.length = 0; why.push('Dark now – see the best time'); }
    const window = best && hrs[best.i] ? { start: hrs[best.i].isoTime, end: new Date(new Date(hrs[best.i + 1].isoTime).getTime() + 3600000).toISOString(), score: Math.round(best.avg * 10) / 10 } : null;
    return { act, now: nowS, why, window };
  }
  function verdict(s) {
    if (s >= 8) return ['Excellent', 'v-great'];
    if (s >= 6) return ['Good', 'v-good'];
    if (s >= 4) return ['Fair', 'v-fair'];
    if (s >= 2) return ['Poor', 'v-poor'];
    return ['Not advised', 'v-bad'];
  }
  function windowLabel(w) {
    if (!w) return '--';
    const st = new Date(w.start).getTime();
    const day = new Date(st).toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }) === todayStr() ? 'Today' : new Date(st).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Colombo' });
    return `${day} ${hourLabel(w.start)}–${hourLabel(w.end)}`;
  }

  function renderActivities() {
    const box = $('activity-cards');
    const x = currentData();
    if (!box || !x) return;
    const dn = activeLoc().district.name;
    const res = ACTIVITIES.map(a => evaluateActivity(a, x, dn));
    res.sort((a, b) => (Prefs.activities.includes(b.act.id) - Prefs.activities.includes(a.act.id)) || b.now - a.now);
    box.innerHTML = res.map(r => {
      const [v, cls] = verdict(r.now);
      const fav = Prefs.activities.includes(r.act.id);
      return `<article class="activity-card ${cls} ${fav ? 'is-fav' : ''}">
        <header><span class="act-icon"><i class="fa-solid ${r.act.icon}"></i></span><h4>${r.act.name}</h4>${fav ? '<span class="fav-tag" title="One of your activities">★</span>' : ''}</header>
        <div class="act-score"><strong>${r.now.toFixed(r.now % 1 && r.now < 10 ? 1 : 0)}</strong><span>/10 · next 6 h</span><em>${v}</em></div>
        <div class="act-bar"><i style="width:${r.now * 10}%"></i></div>
        <p class="act-window"><i class="fa-regular fa-clock"></i> Best: <strong>${windowLabel(r.window)}</strong>${r.window ? ` (${r.window.score.toFixed(0)}/10)` : ''}</p>
        <div class="act-why">${r.why.length ? r.why.map(w => `<span>${w}</span>`).join('') : '<span class="ok">No weather concerns</span>'}</div>
      </article>`;
    }).join('');
  }

  const ROUTES = [
    { name: 'Colombo → Kandy (A1)', icon: 'fa-road', stops: ['Colombo', 'Gampaha', 'Kegalle', 'Kandy'] },
    { name: 'Southern Expressway (E01)', icon: 'fa-road', stops: ['Colombo', 'Kalutara', 'Galle', 'Matara', 'Hambantota'] },
    { name: 'Kandy → Nuwara Eliya (A5)', icon: 'fa-mountain', stops: ['Kandy', 'Nuwara Eliya'] },
    { name: 'Nuwara Eliya → Ella / Badulla', icon: 'fa-mountain', stops: ['Nuwara Eliya', 'Badulla'] },
    { name: 'Colombo → Jaffna (A9)', icon: 'fa-road', stops: ['Colombo', 'Kurunegala', 'Anuradhapura', 'Vavuniya', 'Kilinochchi', 'Jaffna'] },
    { name: 'Dambulla → Trincomalee (A6)', icon: 'fa-road', stops: ['Matale', 'Anuradhapura', 'Trincomalee'] },
    { name: 'Colombo → Ratnapura (A4)', icon: 'fa-road', stops: ['Colombo', 'Ratnapura'] },
    { name: 'Ella → Arugam Bay', icon: 'fa-water', stops: ['Badulla', 'Monaragala', 'Ampara'] },
    { name: 'Main Line train (Colombo → Badulla)', icon: 'fa-train', stops: ['Colombo', 'Gampaha', 'Kegalle', 'Kandy', 'Nuwara Eliya', 'Badulla'], rail: true },
    { name: 'Coastal Line train (Colombo → Matara)', icon: 'fa-train', stops: ['Colombo', 'Kalutara', 'Galle', 'Matara'], rail: true }
  ];
  function evaluateRoute(route) {
    const pts = route.stops.map(n => ({ n, x: AppState.districtWeatherCache[n] })).filter(p => p.x);
    if (!pts.length) return null;
    const issues = [];
    let level = 0;
    const per = pts.map(({ n, x }) => {
      const h6 = (x.hourly || []).slice(0, 6);
      const rain6 = sum(h6.map(h => h.rainAmount)), prob = maxOf(h6.map(h => h.rainProb), 0);
      const thunder = h6.some(h => h.code >= 95);
      const visList = h6.map(h => h.visKm).filter(isNum);
      const fogHrs = visList.filter(v => v < 1).length, mistHrs = visList.filter(v => v < 4).length;
      const vis = fogHrs >= 2 ? 0.5 : mistHrs >= 3 ? 3 : 10;
      const gust = Math.max(x.gusts || 0, ...h6.map(h => h.gust).filter(isNum));
      const rain24 = sum((x.hourly || []).slice(0, 24).map(h => h.rainAmount));
      const slide = LANDSLIDE_DISTRICTS.includes(n) && (rain24 >= 75 || rain6 >= 30);
      let l = 0;
      if (slide || gust >= 60 || vis < 1 || (thunder && rain6 >= 20)) l = 2;
      else if (rain6 >= 5 || prob >= 70 || vis < 4 || gust >= 45 || thunder) l = 1;
      if (slide) issues.push(`Landslide risk near ${n}`);
      if (thunder) issues.push(`Thunderstorms near ${n}`);
      else if (rain6 >= 5) issues.push(`Heavy rain near ${n}`);
      if (vis < 4) issues.push(`${vis < 1 ? 'Dense fog' : 'Mist'} near ${n}`);
      if (gust >= 45) issues.push(`Gusts ${formatWind(gust)} near ${n}`);
      level = Math.max(level, l);
      return { n, x, l, prob };
    });
    // Best departure in the next 12 h = lowest summed rain across waypoints over a 4-hour window
    let best = 0, bestVal = Infinity;
    for (let k = 0; k < 12; k++) {
      const v = sum(pts.map(({ x }) => sum((x.hourly || []).slice(k, k + 4).map(h => h.rainAmount + (h.code >= 95 ? 5 : 0)))));
      if (v < bestVal - 0.2) { bestVal = v; best = k; }
    }
    return { route, level, issues: [...new Set(issues)].slice(0, 3), per, best, firstHour: pts[0].x.hourly && pts[0].x.hourly[best] };
  }
  function renderRoutes() {
    const box = $('route-cards');
    if (!box) return;
    const res = ROUTES.map(evaluateRoute).filter(Boolean);
    const LV = [['Good', 'r-good', 'fa-circle-check'], ['Caution', 'r-caution', 'fa-triangle-exclamation'], ['Hazardous', 'r-hazard', 'fa-circle-exclamation']];
    box.innerHTML = res.map(r => {
      const [lbl, cls, ic] = LV[r.level];
      const view = r.route.rail ? (r.per.some(p => (p.x.cloudPct || 0) > 85) ? 'Views may be hidden by low cloud in the hills.' : 'Good chance of clear views from the window.') : '';
      return `<article class="route-card ${cls}">
        <header><i class="fa-solid ${r.route.icon}"></i><h4>${r.route.name}</h4><span class="route-status"><i class="fa-solid ${ic}"></i> ${lbl}</span></header>
        <div class="route-stops">${r.per.map(p => `<span class="stop l${p.l}" title="${p.n}: ${getWeatherInfo(p.x.weatherCode, p.x.isDay).label}, rain chance ${Math.round(p.prob)}%"><i class="fa-solid ${getWeatherInfo(p.x.weatherCode, p.x.isDay).icon}"></i>${p.n}<small>${formatTemp(p.x.currentTemp)}</small></span>`).join('<i class="fa-solid fa-chevron-right sep"></i>')}</div>
        <p class="route-issues">${r.issues.length ? r.issues.join(' · ') : 'No significant weather hazards in the next 6 hours.'}</p>
        <p class="route-best"><i class="fa-regular fa-clock"></i> ${r.best === 0 ? (r.level === 0 ? 'Now is a good time to set off.' : 'No drier window in the next 12 hours – allow extra time.') : `Driest departure: around <strong>${r.firstHour ? hourLabel(r.firstHour.isoTime) : `+${r.best} h`}</strong>`}${view ? ` · ${view}` : ''}</p>
      </article>`;
    }).join('') + '<p class="flood-src routes-note">Based on forecasts for the districts along each route. Check RDA / Sri Lanka Railways notices for closures.</p>';
  }

  // ------------------------------------------------------------------------
  // Personalised dashboard (Feature 27)
  // ------------------------------------------------------------------------
  function homeLoc() {
    if (!Prefs.home) return null;
    if (typeof Prefs.home === 'string') { const d = findDistrict(Prefs.home); return d ? { name: d.name, district: d, data: AppState.districtWeatherCache[d.name], lat: d.lat, lon: d.lon } : null; }
    const p = Prefs.home; const d = findDistrict(p.district);
    return { name: p.name, district: d, data: AppState.placeWeatherCache[placeKey(p)], lat: p.lat, lon: p.lon, place: p };
  }
  function hourAt(x, hour) {
    const hrs = x.hourly || [];
    return hrs.find(h => colomboHour(new Date(h.isoTime).getTime()) === hour);
  }
  let homeLoading = false;
  function renderMyDay() {
    const grid = $('myday-grid');
    if (!grid) return;
    const home = homeLoc();
    const target = home || { name: activeLoc().name, district: activeLoc().district, data: currentData(), lat: activeLoc().lat, lon: activeLoc().lon };
    if (home && !home.data && home.place && !homeLoading && navigator.onLine !== false) {
      homeLoading = true;
      loadPlaceWeather([home.place]).catch(() => {}).finally(() => { homeLoading = false; if (AppState.placeWeatherCache[placeKey(home.place)]) renderMyDay(); });
    }
    const x = target.data || AppState.districtWeatherCache[target.district.name];
    const hr = colomboHour();
    const part = hr < 5 ? ['night', 'fa-moon'] : hr < 12 ? ['morning', 'fa-mug-hot'] : hr < 17 ? ['afternoon', 'fa-sun'] : hr < 21 ? ['evening', 'fa-cloud-sun'] : ['night', 'fa-moon'];
    $('myday-eyebrow').innerHTML = `<i class="fa-solid ${part[1]}"></i> Good ${part[0]}${Prefs.name ? `, ${escapeHtml(Prefs.name)}` : ''}`;
    const setBtn = $('myday-set-home');
    const isHome = home && (home.place ? AppState.selectedPlace && placeKey(AppState.selectedPlace) === placeKey(home.place) : !AppState.selectedPlace && AppState.selectedDistrict.name === home.name);
    setBtn.querySelector('span').textContent = isHome ? 'This is your home' : home ? `Make ${activeLoc().name} home` : 'Set current as home';
    setBtn.disabled = !!isHome;
    if (!x) { $('myday-title').textContent = 'Loading your weather…'; grid.innerHTML = ''; return; }
    const info = getWeatherInfo(x.weatherCode, x.isDay);
    $('myday-title').innerHTML = `${home ? '<i class="fa-solid fa-house"></i> ' : ''}${escapeHtml(target.name)} · ${formatTemp(x.currentTemp)} <span class="myday-cond">${info.label}</span>`;
    $('myday-sub').textContent = home ? `High ${formatTemp(x.todayMax)} · Low ${formatTemp(x.todayMin)} · feels like ${formatTemp(x.feelsLike)} now.` : 'Tip: set a home location so this briefing always shows your town, wherever you browse.';

    const hrs = (x.hourly || []).slice(0, 24);
    const restOfDay = hrs.filter(h => colomboHour(new Date(h.isoTime).getTime()) >= hr && new Date(h.isoTime).toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }) === todayStr());
    const wetHour = (restOfDay.length ? restOfDay : hrs.slice(0, 12)).find(h => h.rainProb >= 50 || h.rainAmount >= 0.5);
    const maxProb = maxOf((restOfDay.length ? restOfDay : hrs.slice(0, 12)).map(h => h.rainProb), 0);
    const umbrella = !!wetHour;
    const commute = [['Morning', Prefs.am], ['Evening', Prefs.pm]].map(([lbl, h]) => {
      const c = hourAt(x, h);
      if (!c) return `<li><span>${lbl} (${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'})</span><strong>--</strong></li>`;
      const wet = c.rainProb >= 50 || c.rainAmount >= 0.5;
      return `<li><span>${lbl} · ${hourLabel(c.isoTime)}</span><strong class="${wet ? 'text-amber' : 'text-emerald'}"><i class="fa-solid ${getWeatherInfo(c.code, c.isDay).icon}"></i> ${formatTemp(c.temp)} · ${Math.round(c.rainProb)}%</strong></li>`;
    }).join('');
    const uvPeak = Math.max(x.uvMax || 0, maxOf(hrs.map(h => h.uv), 0));
    const burn = burnMinutes(uvPeak, Prefs.skin);
    const acts = Prefs.activities.map(id => ACTIVITIES.find(a => a.id === id)).filter(Boolean).slice(0, 3).map(a => evaluateActivity(a, x, target.district.name));
    const flood = Flood.island && Flood.island[target.district.name];
    const thunder = hrs.slice(0, 12).find(h => h.code >= 95);
    const alerts = typeof computeAlerts === 'function' ? computeAlerts().filter(a => (a.districts || []).includes(target.district.name)) : [];
    grid.innerHTML = `
      <div class="myday-tile ${umbrella ? 'warn' : 'ok'}"><i class="fa-solid ${umbrella ? 'fa-umbrella' : 'fa-sun'}"></i><div><span>Umbrella?</span><strong>${umbrella ? `Yes – rain likely from ${hourLabel(wetHour.isoTime)}` : 'Probably not needed'}</strong><small>Max rain chance ${Math.round(maxProb)}% ${restOfDay.length ? 'for the rest of today' : 'in the next 12 h'}</small></div></div>
      <div class="myday-tile"><i class="fa-solid fa-bus"></i><div><span>Commute</span><ul class="commute">${commute}</ul></div></div>
      <div class="myday-tile ${uvPeak >= 8 ? 'warn' : ''}"><i class="fa-solid fa-sun-plant-wilt"></i><div><span>Sun (skin type ${Prefs.skin})</span><strong>UV peak ${Math.round(uvPeak)} · ${uvLevel(uvPeak).name}</strong><small>${isFinite(burn) && uvPeak >= 1 ? `Unprotected skin burns in about ${fmtMinutes(burn)} at midday` : 'Low burn risk today'}</small></div></div>
      <div class="myday-tile"><i class="fa-solid fa-person-running"></i><div><span>Your activities</span>${acts.length ? `<ul class="commute">${acts.map(r => `<li><span><i class="fa-solid ${r.act.icon}"></i> ${r.act.name}</span><strong class="${r.now >= 6 ? 'text-emerald' : r.now >= 4 ? 'text-amber' : 'text-rose'}">${r.now.toFixed(0)}/10</strong></li><li class="sub"><span>Best ${windowLabel(r.window)}</span></li>`).join('')}</ul>` : '<small>Pick activities in Customise.</small>'}</div></div>
      <div class="myday-tile ${(flood && flood.score >= 45) || thunder || alerts.length ? 'warn' : 'ok'}"><i class="fa-solid fa-shield-halved"></i><div><span>Safety</span>
        <ul class="commute">
          <li><span>Flood risk</span><strong style="color:${flood ? flood.color : 'inherit'}">${flood ? flood.level : '--'}</strong></li>
          <li><span>Lightning (12 h)</span><strong class="${thunder ? 'text-amber' : 'text-emerald'}">${thunder ? `From ${hourLabel(thunder.isoTime)}` : 'Unlikely'}</strong></li>
          <li><span>Active alerts</span><strong class="${alerts.length ? 'text-rose' : 'text-emerald'}">${alerts.length ? alerts.map(a => a.title.split(' ')[0]).join(', ') : 'None'}</strong></li>
        </ul></div></div>`;
  }

  function widgetNodes() { return [...$('main-content').querySelectorAll(':scope > [data-widget]')]; }
  let DEFAULT_ORDER = [];
  function applyLayout() {
    const main = $('main-content');
    const nodes = widgetNodes();
    const byId = Object.fromEntries(nodes.map(n => [n.dataset.widget, n]));
    // Saved order first; sections added in later versions slot in after their default neighbour
    const order = Prefs.order.filter(id => byId[id]);
    DEFAULT_ORDER.forEach((id, i) => {
      if (order.includes(id) || !byId[id]) return;
      const prev = DEFAULT_ORDER.slice(0, i).reverse().find(p => order.includes(p));
      order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, id);
    });
    const anchor = nodes.length ? nodes[nodes.length - 1].nextSibling : null;
    order.forEach(id => main.insertBefore(byId[id], anchor));
    nodes.forEach(n => n.classList.toggle('widget-hidden', Prefs.hidden.includes(n.dataset.widget)));
    document.body.classList.toggle('compact-mode', !!Prefs.compact);
    setTimeout(() => { Object.values(V4.charts).forEach(c => c && c.resize && c.resize()); }, 60);
  }

  const Draft = {};
  function openCustomize() {
    Object.assign(Draft, JSON.parse(JSON.stringify(Prefs)));
    Draft.order = widgetNodes().map(n => n.dataset.widget);
    $('pref-name').value = Draft.name || '';
    const hourOpts = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}</option>`).join('');
    $('pref-am').innerHTML = hourOpts(Draft.am);
    $('pref-pm').innerHTML = hourOpts(Draft.pm);
    $('pref-compact').checked = !!Draft.compact;
    renderDraft();
    openModal('customize-modal-backdrop');
  }
  function renderDraft() {
    $('pref-home-label').textContent = Draft.home ? (typeof Draft.home === 'string' ? `${Draft.home} District` : `${Draft.home.name} (${Draft.home.district})`) : 'Not set – uses the selected location';
    $('pref-home-set').innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> Use ${escapeHtml(activeLoc().name)}`;
    $('pref-activities').innerHTML = ACTIVITIES.map(a => `<button type="button" class="pick-chip ${Draft.activities.includes(a.id) ? 'on' : ''}" data-id="${a.id}" aria-pressed="${Draft.activities.includes(a.id)}"><i class="fa-solid ${a.icon}"></i> ${a.name}</button>`).join('');
    const titles = Object.fromEntries(widgetNodes().map(n => [n.dataset.widget, n.dataset.widgetTitle || n.dataset.widget]));
    $('pref-widgets').innerHTML = Draft.order.filter(id => titles[id]).map((id, i, arr) => `<li data-id="${id}">
      <label><input type="checkbox" ${Draft.hidden.includes(id) ? '' : 'checked'}> ${escapeHtml(titles[id])}</label>
      <span class="w-moves"><button type="button" class="w-up" ${i === 0 ? 'disabled' : ''} aria-label="Move up"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="w-down" ${i === arr.length - 1 ? 'disabled' : ''} aria-label="Move down"><i class="fa-solid fa-arrow-down"></i></button></span></li>`).join('');
  }
  function initCustomize() {
    $('customize-btn').addEventListener('click', openCustomize);
    $('myday-customize').addEventListener('click', openCustomize);
    $('customize-modal-close').addEventListener('click', () => closeModal('customize-modal-backdrop'));
    $('customize-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'customize-modal-backdrop') closeModal('customize-modal-backdrop'); });
    $('pref-home-set').addEventListener('click', () => { const it = currentFavItem(); Draft.home = typeof it === 'string' ? it : sanitizePlace(it); renderDraft(); });
    $('pref-activities').addEventListener('click', (e) => {
      const b = e.target.closest('.pick-chip'); if (!b) return;
      const id = b.dataset.id;
      Draft.activities = Draft.activities.includes(id) ? Draft.activities.filter(a => a !== id) : Draft.activities.concat(id);
      renderDraft();
    });
    $('pref-widgets').addEventListener('click', (e) => {
      const li = e.target.closest('li'); if (!li) return;
      const id = li.dataset.id, i = Draft.order.indexOf(id);
      if (e.target.closest('.w-up') && i > 0) { Draft.order.splice(i, 1); Draft.order.splice(i - 1, 0, id); renderDraft(); }
      else if (e.target.closest('.w-down') && i < Draft.order.length - 1) { Draft.order.splice(i, 1); Draft.order.splice(i + 1, 0, id); renderDraft(); }
    });
    $('pref-widgets').addEventListener('change', (e) => {
      const li = e.target.closest('li'); if (!li) return;
      const id = li.dataset.id;
      Draft.hidden = e.target.checked ? Draft.hidden.filter(h => h !== id) : Draft.hidden.concat(id);
    });
    $('pref-reset').addEventListener('click', () => {
      Object.assign(Draft, JSON.parse(JSON.stringify(DEFAULT_PREFS)), { skin: Prefs.skin, order: DEFAULT_ORDER.slice() });
      $('pref-name').value = ''; $('pref-am').value = Draft.am; $('pref-pm').value = Draft.pm; $('pref-compact').checked = false;
      renderDraft();
    });
    $('pref-save').addEventListener('click', () => {
      Draft.name = $('pref-name').value.trim().slice(0, 30);
      Draft.am = +$('pref-am').value; Draft.pm = +$('pref-pm').value; Draft.compact = $('pref-compact').checked;
      Object.assign(Prefs, JSON.parse(JSON.stringify(Draft)));
      savePrefs();
      applyLayout();
      renderMyDay(); renderActivities();
      closeModal('customize-modal-backdrop');
      showToast('✅ Dashboard preferences saved', 'success', 2200);
    });
    $('myday-set-home').addEventListener('click', () => {
      const it = currentFavItem();
      Prefs.home = typeof it === 'string' ? it : sanitizePlace(it);
      savePrefs(); renderMyDay();
      showToast(`🏠 ${favLabel(it)} is now your home location`, 'success', 2200);
    });
    $('uv-skin-type').addEventListener('change', (e) => { Prefs.skin = e.target.value; savePrefs(); renderUvCard(); renderMyDay(); });
    document.querySelectorAll('#travel-tabs button').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#travel-tabs button').forEach(x => x.classList.toggle('active', x === b));
      $('activity-cards').classList.toggle('hidden', b.dataset.tab !== 'activities');
      $('route-cards').classList.toggle('hidden', b.dataset.tab !== 'routes');
    }));
  }

  // ------------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------------
  function renderLocationViews() {
    const loc = activeLoc();
    document.querySelectorAll('.loc-label').forEach(s => { s.textContent = loc.name; });
    V4.safe('wind', renderWindCard);
    V4.safe('uv', renderUvCard);
    V4.safe('activities', renderActivities);
    V4.safe('myday', renderMyDay);
    V4.safe('radar', renderRadar);
    renderFloodCard().catch(e => console.warn(e));
    renderAccuracyCard().catch(e => console.warn(e));
  }
  let locTimer = null;
  V4.onLocationChange = () => { clearTimeout(locTimer); locTimer = setTimeout(renderLocationViews, 40); };
  V4.onDataRefresh = ({ manual = false, isAuto = false } = {}) => {
    renderLocationViews();
    V4.safe('routes', renderRoutes);
    loadGrid(manual || isAuto).then(() => { setupTimeline(); renderRadar(); });
    if (MapState.layer === 'radar') loadRadarFrames(manual || isAuto).then(() => { MapState.radarFrame = Math.max(0, Radar.frames.length - 1); setupTimeline(); renderRadar(); });
    loadFloodIsland(manual || isAuto).then(() => { renderFloodCard(); renderMyDay(); if (MapState.layer === 'flood') renderRadar(); if (typeof updateAlerts === 'function') updateAlerts(); });
    if (MapState.overlays.lightning) loadStrikes().then(() => renderRadar());
  };
  V4.onSecondaryFeeds = () => { V4.safe('activities', renderActivities); V4.safe('myday', renderMyDay); };
  V4.onUnitsChange = () => { renderLocationViews(); V4.safe('routes', renderRoutes); };
  V4.onThemeChange = () => {
    V4.safe('wind', renderWindCard); V4.safe('uv', renderUvCard);
    renderFloodCard().catch(() => {}); renderAccuracyCard().catch(() => {});
  };

  function init() {
    // The province strip belongs with the map so every top-level block can be reordered
    const strip = document.querySelector('#main-content > .province-filter-strip');
    const mapSec = document.querySelector('#main-content > [data-widget="map"]');
    if (strip && mapSec) mapSec.insertBefore(strip, mapSec.firstChild);
    DEFAULT_ORDER = widgetNodes().map(n => n.dataset.widget);
    V4.safe('customize', initCustomize);
    V4.safe('layout', applyLayout);
    V4.safe('radar-build', buildRadarMap);
    if (!Grid.v) restoreGrid();
    setupTimeline();
    // If app.js already rendered before this file loaded, catch up now
    if (Object.keys(AppState.districtWeatherCache || {}).length) V4.onDataRefresh();
    else renderLocationViews();
    // keep the "Now" marker honest
    setInterval(() => { if (MapState.followNow && !MapState.playing && MapState.layer !== 'radar') { setupTimeline(); renderRadar(); } }, 5 * 60000);
  }
  // expose a few internals for debugging / tests
  Object.assign(V4, { Grid, Radar, Flood, Prefs, MapState, setLayer, setFrame, beaufort, burnMinutes, scoreFlood, ACTIVITIES, ROUTES, evaluateRoute, loadGrid });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
