/* ==========================================================================
   ලංකාweather · v5 add-on module
   31 Health & allergy alerts · 32 Snowfall, frost & ice monitoring ·
   33 Sharing to social media · 34 Smart event planner · 35 Global weather news
   Loaded after app.js and app-v4.js; hooks into V4's lifecycle events.
   ========================================================================== */
(function () {
  'use strict';
  if (!window.V4) { console.error('app-v5.js needs app-v4.js'); return; }

  const V5 = window.V5 = { charts: {} };
  const safe = (name, fn) => { try { return fn(); } catch (e) { console.error(`[v5:${name}]`, e); return undefined; } };
  const SL_CENTRE = { lat: 7.87, lon: 80.77 };
  const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
  const addDays = (ds, n) => { const d = new Date(`${ds}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
  const dayName = (ds, opts = { weekday: 'short' }) => new Date(`${ds}T12:00:00+05:30`).toLocaleDateString('en-US', Object.assign({ timeZone: 'Asia/Colombo' }, opts));
  const relDay = (ds) => { const n = daysBetween(todayStr(), ds); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : dayName(ds); };
  const hr12 = (h) => `${((h + 11) % 12) + 1} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
  const sum = (a) => a.reduce((s, v) => s + (isNum(v) ? v : 0), 0);
  const maxOf = (a, fb = null) => { const v = a.filter(isNum); return v.length ? Math.max(...v) : fb; };
  const minOf = (a, fb = null) => { const v = a.filter(isNum); return v.length ? Math.min(...v) : fb; };
  const mean = (a, fb = null) => { const v = a.filter(isNum); return v.length ? sum(v) / v.length : fb; };
  const LEVELS = [
    { name: 'Low', cls: 'risk-low', color: '#22c55e' },
    { name: 'Moderate', cls: 'risk-moderate', color: '#eab308' },
    { name: 'High', cls: 'risk-high', color: '#f97316' },
    { name: 'Very high', cls: 'risk-severe', color: '#dc2626' }
  ];
  function codeCat(code) {
    if (code >= 95) return 'thunder';
    if (code >= 80) return 'showers';
    if (code >= 61) return 'rain';
    if (code >= 51) return 'drizzle';
    if (code === 45 || code === 48) return 'fog';
    if (code === 3) return 'cloudy';
    if (code === 2) return 'partly';
    return 'clear';
  }
  const CAT_EMOJI = { thunder: '⛈️', showers: '🌦️', rain: '🌧️', drizzle: '🌦️', fog: '🌫️', cloudy: '☁️', partly: '⛅', clear: '☀️' };
  function currentData() { return weatherFor(activeLoc()) || AppState.districtWeatherCache[AppState.selectedDistrict.name]; }

  // ------------------------------------------------------------------------
  // Feature 31 · Health & allergy alerts
  // ------------------------------------------------------------------------
  const HEALTH_KEY = 'lanka_weather_health_v1';
  const CONDITIONS = [
    { id: 'asthma', name: 'Asthma / COPD', icon: 'fa-lungs', affects: ['asthma', 'allergy', 'flu'] },
    { id: 'allergy', name: 'Allergies / hay fever', icon: 'fa-head-side-cough', affects: ['allergy', 'asthma'] },
    { id: 'migraine', name: 'Migraines', icon: 'fa-head-side-virus', affects: ['migraine'] },
    { id: 'joint', name: 'Arthritis / joint pain', icon: 'fa-bone', affects: ['joint'] },
    { id: 'heart', name: 'Heart / blood pressure', icon: 'fa-heart', affects: ['heat', 'flu'] },
    { id: 'elderly', name: 'Over 65', icon: 'fa-person-cane', affects: ['heat', 'flu', 'joint', 'food'] },
    { id: 'children', name: 'Babies / young children', icon: 'fa-baby', affects: ['heat', 'dengue', 'food', 'sun'] },
    { id: 'pregnant', name: 'Pregnant', icon: 'fa-person-pregnant', affects: ['heat', 'dengue', 'food'] },
    { id: 'outdoor', name: 'Outdoor worker / farmer', icon: 'fa-person-digging', affects: ['heat', 'sun', 'lepto', 'dengue'] }
  ];
  const DENGUE_HOTSPOTS = ['Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Kurunegala', 'Jaffna', 'Batticaloa', 'Trincomalee', 'Ratnapura', 'Kegalle', 'Puttalam', 'Galle', 'Matara'];
  const PADDY_DISTRICTS = ['Ratnapura', 'Kegalle', 'Kalutara', 'Galle', 'Matara', 'Kurunegala', 'Gampaha', 'Polonnaruwa', 'Anuradhapura', 'Ampara', 'Hambantota', 'Monaragala', 'Batticaloa', 'Trincomalee'];
  let healthConds = (store.get(HEALTH_KEY, []) || []).filter(id => CONDITIONS.some(c => c.id === id));
  const Health = {};

  async function loadHealth(loc) {
    const c = Health[loc.key];
    if (c && Date.now() - c.at < 3600000) return c;
    if (navigator.onLine === false) return c || null;
    const q = `latitude=${(+loc.lat).toFixed(4)}&longitude=${(+loc.lon).toFixed(4)}`;
    const [wx, aq] = await Promise.allSettled([
      fetchJSON(`${API.forecast}?${q}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,precipitation,weather_code,wind_speed_10m,uv_index&past_days=7&forecast_days=3&timezone=Asia%2FColombo`, { timeout: 20000 }),
      fetchJSON(`${API.air}?${q}&hourly=us_aqi,pm2_5,pm10,dust,ozone&past_days=1&forecast_days=3&timezone=Asia%2FColombo`, { timeout: 20000 })
    ]);
    if (wx.status !== 'fulfilled') throw wx.reason;
    const h = wx.value.hourly;
    const days = {};
    h.time.forEach((t, i) => {
      const d = t.slice(0, 10);
      const o = days[d] || (days[d] = { date: d, t: [], rh: [], at: [], p: [], rain: [], code: [], wind: [], uv: [], pchg: [], aqi: [], pm25: [], pm10: [], dust: [], o3: [] });
      o.t.push(h.temperature_2m[i]); o.rh.push(h.relative_humidity_2m[i]); o.at.push(h.apparent_temperature[i]); o.p.push(h.surface_pressure[i]);
      o.rain.push(h.precipitation[i]); o.code.push(h.weather_code[i]); o.wind.push(h.wind_speed_10m[i]); o.uv.push(h.uv_index[i]);
      if (i >= 24 && isNum(h.surface_pressure[i]) && isNum(h.surface_pressure[i - 24])) o.pchg.push(h.surface_pressure[i] - h.surface_pressure[i - 24]);
    });
    if (aq.status === 'fulfilled' && aq.value.hourly) {
      const a = aq.value.hourly;
      a.time.forEach((t, i) => {
        const o = days[t.slice(0, 10)];
        if (!o) return;
        o.aqi.push(a.us_aqi[i]); o.pm25.push(a.pm2_5[i]); o.pm10.push(a.pm10[i]); o.dust.push(a.dust[i]); o.o3.push(a.ozone[i]);
      });
    }
    const list = Object.values(days).sort((a, b) => (a.date < b.date ? -1 : 1)).map(o => ({
      date: o.date, tmax: maxOf(o.t), tmin: minOf(o.t), atmax: maxOf(o.at), rhMean: mean(o.rh), rh85: o.rh.filter(v => v >= 85).length,
      rain: sum(o.rain), thunder: o.code.some(c => c >= 95), windMax: maxOf(o.wind), uvMax: maxOf(o.uv, 0),
      pDrop: minOf(o.pchg, 0), pRise: maxOf(o.pchg, 0), aqi: maxOf(o.aqi), pm25: maxOf(o.pm25), pm10: maxOf(o.pm10), dust: maxOf(o.dust), o3: maxOf(o.o3), tmean: mean(o.t)
    }));
    const data = { at: Date.now(), days: list };
    Health[loc.key] = data;
    return data;
  }

  // Each risk: (day, ctx) → { lvl 0..3, value, why }
  const HEALTH_RISKS = [
    {
      id: 'heat', name: 'Heat stress & heatstroke', icon: 'fa-temperature-arrow-up',
      calc(d) {
        const at = d.atmax ?? d.tmax;
        const lvl = at >= 45 ? 3 : at >= 39 ? 2 : at >= 33 ? 1 : 0;
        return { lvl, value: `Feels like ${formatTemp(at)}`, why: `Max ${formatTemp(d.tmax)}, humidity ${Math.round(d.rhMean || 0)}%` };
      },
      advice: [['Normal heat for Sri Lanka – keep drinking water.'], ['Drink water every 20–30 minutes when outdoors; add a pinch of salt or king coconut water if sweating heavily.', 'Rest in shade between 11 AM and 3 PM.'], ['Avoid hard outdoor work from 11 AM to 3 PM; wear loose, light-coloured cotton.', 'Watch for dizziness, cramps, headache or nausea – move to shade and cool the skin.', 'Never leave children or pets in parked vehicles.'], ['Danger: heatstroke is possible. Stay indoors or in shade, use fans and wet cloths.', 'Confusion, hot dry skin or fainting is an emergency – call 1990.']]
    },
    {
      id: 'dengue', name: 'Dengue mosquito breeding', icon: 'fa-mosquito',
      calc(d, ctx) {
        const r7 = ctx.rain7(d.date);
        let s = r7 >= 10 ? Math.min(40, r7 / 2) : r7 * 2;
        if (r7 > 200) s *= 0.85; // heavy floods flush larvae
        const T = d.tmean ?? 27;
        s += T >= 25 && T <= 31 ? 30 : T >= 22 && T <= 33 ? 18 : 5;
        s += (d.rhMean || 0) >= 75 ? 20 : (d.rhMean || 0) >= 65 ? 12 : 5;
        const m = Number(d.date.slice(5, 7));
        if ([5, 6, 7, 10, 11, 12, 1].includes(m)) s += 6;
        if (DENGUE_HOTSPOTS.includes(ctx.district)) s += 6;
        if (T < 18) s = Math.min(s, 40); else if (T < 21) s *= 0.75; // Aedes barely breed in the cool hill country
        const lvl = s >= 82 ? 3 : s >= 66 ? 2 : s >= 48 ? 1 : 0;
        return { lvl, value: `${formatRain(r7)} rain in 7 days`, why: `${formatTemp(T)} average, ${Math.round(d.rhMean || 0)}% humidity${DENGUE_HOTSPOTS.includes(ctx.district) ? ' · high-case district' : ''}` };
      },
      advice: [['Low breeding conditions. Keep containers empty anyway.'], ['Empty water from flower pots, tyres, coconut shells and gutters every week.', 'Use repellent at dawn and dusk – Aedes mosquitoes bite in daytime.'], ['Do a 10-minute “dengue clean-up” around your home this week.', 'Use nets for babies and repellent for everyone; wear long sleeves.', 'Fever for 2+ days? Avoid ibuprofen/aspirin, take paracetamol and get a blood test (FBC).'], ['Very favourable for mosquitoes. Check roofs, gutters and water tanks today.', 'Fever with vomiting, belly pain or bleeding is an emergency – go to hospital.']]
    },
    {
      id: 'asthma', name: 'Asthma & breathing', icon: 'fa-lungs',
      calc(d) {
        const a = d.aqi;
        let lvl = !isNum(a) ? 0 : a > 150 ? 3 : a > 100 ? 2 : a > 50 ? 1 : 0;
        const why = [];
        if (isNum(a)) why.push(`AQI up to ${Math.round(a)}`);
        if (d.thunder) { lvl = Math.max(lvl, 1); why.push('thunderstorms (can trigger attacks)'); }
        if ((d.rhMean || 0) >= 88) { lvl = Math.max(lvl, 1); why.push('very humid air'); }
        if (isNum(d.tmin) && d.tmin < 15) { lvl = Math.max(lvl, 1); why.push('cold night air'); }
        return { lvl, value: isNum(d.pm25) ? `PM2.5 ${Math.round(d.pm25)} µg/m³` : 'No air data', why: why.join(', ') || 'Clean air' };
      },
      advice: [['Air is fine for most people.'], ['Keep your reliever inhaler with you.', 'Sensitive people should limit long exercise near busy roads.'], ['Avoid outdoor exercise near traffic; keep windows closed at rush hour.', 'Wear a well-fitting mask (N95/KN95) in heavy traffic or smoke.'], ['Stay indoors where possible and follow your asthma action plan.', 'Seek urgent care if your inhaler is not helping.']]
    },
    {
      id: 'allergy', name: 'Dust & mould allergies', icon: 'fa-head-side-cough',
      calc(d) {
        const mould = d.rh85 >= 18 ? 2 : d.rh85 >= 10 ? 1 : 0;
        const dust = (d.pm10 ?? 0) > 100 || (d.dust ?? 0) > 50 ? 2 : (d.pm10 ?? 0) > 50 ? 1 : 0;
        const wind = (d.windMax ?? 0) > 30 && d.rain < 1 ? 1 : 0;
        const lvl = Math.min(3, Math.max(mould, dust, wind) + (mould && dust ? 1 : 0));
        return { lvl, value: `${d.rh85} damp hours`, why: `PM10 ${isNum(d.pm10) ? Math.round(d.pm10) : '--'} µg/m³${wind ? ', dry and windy' : ''}` };
      },
      advice: [['Low dust and mould levels.'], ['Air out rooms when it is dry; wipe damp walls and wardrobes.', 'Shower and change clothes after dusty outings.'], ['Mould spores thrive in this damp air – run a fan, avoid drying clothes indoors.', 'Take your usual antihistamine; keep windows shut on windy, dusty days.'], ['Very high exposure. Limit time outdoors and use a mask in dust.']]
    },
    {
      id: 'migraine', name: 'Migraine & headache triggers', icon: 'fa-head-side-virus',
      calc(d) {
        const swing = Math.max(Math.abs(d.pDrop || 0), d.pRise || 0);
        let lvl = swing >= 8 ? 2 : swing >= 5 ? 1 : 0;
        if ((d.atmax ?? 0) >= 38) lvl = Math.max(lvl, 1);
        if ((d.uvMax ?? 0) >= 10) lvl = Math.max(lvl, 1);
        if (d.thunder && swing >= 4) lvl = Math.min(3, lvl + 1);
        return { lvl, value: `Pressure ${swing >= 0.5 ? `${(d.pDrop || 0) < -Math.abs(d.pRise || 0) ? '−' : '±'}${swing.toFixed(1)} hPa` : 'steady'}`, why: [(d.atmax ?? 0) >= 38 ? 'heat' : '', (d.uvMax ?? 0) >= 10 ? 'strong glare' : '', d.thunder ? 'storms' : ''].filter(Boolean).join(', ') || 'No strong triggers' };
      },
      advice: [['Weather triggers are low.'], ['Stay hydrated, wear sunglasses and avoid skipping meals.'], ['Big pressure change or storms ahead – keep your medicine handy and rest in a cool, dark room if symptoms start.'], ['Strong combined triggers – plan a lighter day if you are prone to migraines.']]
    },
    {
      id: 'joint', name: 'Joint & muscle pain', icon: 'fa-bone',
      calc(d) {
        let lvl = 0;
        const cool = isNum(d.tmin) && d.tmin < 20, cold = isNum(d.tmin) && d.tmin < 14;
        if (cool && (d.rhMean || 0) > 85) lvl = 1;
        if ((d.pDrop || 0) <= -4) lvl = Math.max(lvl, 1);
        if (cold && d.rain >= 5) lvl = 2;
        if (cold && d.rain >= 5 && (d.pDrop || 0) <= -4) lvl = 3;
        return { lvl, value: `Low ${formatTemp(d.tmin)}`, why: `${Math.round(d.rhMean || 0)}% humidity${(d.pDrop || 0) <= -4 ? ', falling pressure' : ''}${d.rain >= 1 ? `, ${formatRain(d.rain)} rain` : ''}` };
      },
      advice: [['Warm, stable weather – easy on the joints.'], ['Keep joints warm in the cool, damp evening; gentle stretching helps.'], ['Cold, wet weather can increase stiffness – dress in layers, keep moving gently, use warm compresses.'], ['Expect more aches; plan rest and keep warm.']]
    },
    {
      id: 'lepto', name: 'Leptospirosis (rat fever)', icon: 'fa-water',
      calc(d, ctx) {
        const r7 = ctx.rain7(d.date);
        let lvl = r7 >= 150 ? 2 : r7 >= 60 ? 1 : 0;
        if (ctx.flood >= 45) lvl = Math.max(lvl, 2);
        if (ctx.flood >= 65 || r7 >= 250) lvl = 3;
        if (lvl && PADDY_DISTRICTS.includes(ctx.district)) lvl = Math.min(3, lvl + (r7 >= 100 ? 1 : 0));
        return { lvl, value: `${formatRain(r7)} in 7 days`, why: `${PADDY_DISTRICTS.includes(ctx.district) ? 'Paddy-farming district' : 'Wet ground and runoff'}${ctx.flood ? `, flood risk ${ctx.flood}/100` : ''}` };
      },
      advice: [['Low risk.'], ['Avoid walking barefoot in mud or puddles; cover cuts.'], ['Farmers: wear boots and gloves in paddy fields; ask your MOH office about preventive doxycycline.', 'Do not wade or swim in flood water.'], ['High risk after flooding. Fever, muscle pain (calves) and red eyes after contact with water – see a doctor immediately.']]
    },
    {
      id: 'sun', name: 'Sunburn & eye damage', icon: 'fa-sun',
      calc(d) {
        const u = d.uvMax ?? 0;
        const lvl = u >= 11 ? 3 : u >= 8 ? 2 : u >= 3 ? 1 : 0;
        const skin = (V4.Prefs && V4.Prefs.skin) || 'III';
        const med = { I: 200, II: 250, III: 350, IV: 450, V: 600, VI: 1000 }[skin];
        const mins = u >= 1 ? Math.round(med / (u * 1.5)) : null;
        return { lvl, value: `UV peak ${Math.round(u)}`, why: mins ? `Skin type ${skin} burns in ~${mins} min at midday` : 'Low UV' };
      },
      advice: [['Minimal sun protection needed.'], ['SPF 30+ and sunglasses for time outdoors.'], ['SPF 50, hat and UV-blocking sunglasses; seek shade 10 AM–3 PM.'], ['Extreme UV – unprotected skin burns in minutes. Cover up and stay in shade at midday.']]
    },
    {
      id: 'food', name: 'Food & water safety', icon: 'fa-bowl-food',
      calc(d, ctx) {
        let lvl = (d.tmax ?? 0) >= 33 ? 1 : 0;
        const r7 = ctx.rain7(d.date);
        if (r7 >= 100 || ctx.flood >= 45) lvl = Math.max(lvl, 2);
        if (ctx.flood >= 65) lvl = 3;
        return { lvl, value: `Max ${formatTemp(d.tmax)}`, why: ctx.flood >= 45 ? 'Flooding can contaminate wells' : (d.tmax ?? 0) >= 33 ? 'Heat spoils food quickly' : 'Normal conditions' };
      },
      advice: [['Normal precautions.'], ['Refrigerate leftovers within 2 hours; avoid street food that has been standing in the heat.'], ['Boil drinking water, especially from wells; wash hands with soap before eating.'], ['Assume wells are contaminated after floods – boil or chlorinate all water. Diarrhoea with dehydration needs medical care.']]
    },
    {
      id: 'flu', name: 'Colds, chills & flu', icon: 'fa-virus',
      calc(d) {
        const range = (d.tmax ?? 0) - (d.tmin ?? 0);
        let lvl = 0;
        if (isNum(d.tmin) && d.tmin < 15) lvl = 1;
        if (isNum(d.tmin) && d.tmin < 10) lvl = 2;
        if (range >= 12) lvl = Math.max(lvl, 1);
        if (d.rain >= 20 && isNum(d.tmin) && d.tmin < 18) lvl = Math.min(3, lvl + 1);
        return { lvl, value: `${formatTemp(d.tmin)} – ${formatTemp(d.tmax)}`, why: range >= 12 ? `Big day–night change (${Math.round(range)}°)` : 'Steady temperatures' };
      },
      advice: [['Low weather-related risk.'], ['Carry a light jacket for the cool evening; dry off quickly if you get caught in rain.'], ['Cold nights – wear warm layers, especially for children and older people.'], ['Very cold and wet – keep warm and dry; watch older people closely.']]
    }
  ];

  function healthContext(loc, data) {
    const days = data.days;
    const dn = loc.district.name;
    const fl = V4.Flood && V4.Flood.island && V4.Flood.island[dn];
    return {
      district: dn, flood: fl ? fl.score : 0,
      rain7(ds) { const end = days.findIndex(d => d.date === ds); return end < 0 ? 0 : sum(days.slice(Math.max(0, end - 6), end + 1).map(d => d.rain)); }
    };
  }
  function evaluateHealth(loc, data) {
    const t = todayStr();
    const ctx = healthContext(loc, data);
    const upcoming = data.days.filter(d => d.date >= t).slice(0, 3);
    return HEALTH_RISKS.map(r => {
      const mine = CONDITIONS.filter(c => healthConds.includes(c.id) && c.affects.includes(r.id));
      const per = upcoming.map(d => {
        const res = r.calc(d, ctx);
        if (mine.length && res.lvl >= 1) res.lvl = Math.min(3, res.lvl + 1);
        return Object.assign(res, { date: d.date });
      });
      return { risk: r, per, today: per[0], mine };
    });
  }

  let healthToken = 0;
  async function renderHealth() {
    const grid = $('health-grid');
    if (!grid) return;
    const loc = activeLoc();
    const token = ++healthToken;
    let data = null;
    try { data = await loadHealth(loc); } catch (e) { console.warn('health', e); }
    if (token !== healthToken) return;
    const badge = $('health-overall-badge');
    if (!data) {
      badge.textContent = 'Unavailable'; badge.className = 'badge risk-badge';
      grid.innerHTML = '<p class="muted-note">Health alerts need an internet connection.</p>';
      return;
    }
    const res = evaluateHealth(loc, data);
    V5.lastHealth = res;
    res.sort((a, b) => (b.mine.length > 0) - (a.mine.length > 0) || b.today.lvl - a.today.lvl);
    const highs = res.filter(r => r.today.lvl >= 2);
    const top = Math.max(...res.map(r => r.today.lvl));
    badge.textContent = highs.length ? `${highs.length} high risk${highs.length > 1 ? 's' : ''} today` : top === 1 ? 'Some moderate risks' : 'Low health risk';
    badge.className = `badge risk-badge ${LEVELS[top].cls}`;
    grid.innerHTML = res.map(({ risk, per, today, mine }) => {
      const L = LEVELS[today.lvl];
      const adv = risk.advice[today.lvl].concat(today.lvl >= 1 && mine.length ? [] : []);
      return `<article class="health-card lvl-${today.lvl} ${mine.length ? 'is-mine' : ''}" style="--hc:${L.color}">
        <header><span class="hc-icon"><i class="fa-solid ${risk.icon}"></i></span><h4>${risk.name}</h4><span class="badge risk-badge ${L.cls}">${L.name}</span></header>
        <p class="hc-value"><strong>${today.value}</strong><span>${escapeHtml(today.why)}</span></p>
        ${mine.length ? `<p class="hc-mine"><i class="fa-solid fa-user-check"></i> Raised one level for you: ${mine.map(m => m.name).join(', ')}</p>` : ''}
        <ul class="hc-advice">${adv.map(a => `<li>${a}</li>`).join('')}</ul>
        <div class="hc-days">${per.map(p => `<span title="${relDay(p.date)}: ${LEVELS[p.lvl].name}"><i style="background:${LEVELS[p.lvl].color}"></i>${relDay(p.date)}</span>`).join('')}</div>
      </article>`;
    }).join('');
  }
  function renderHealthConditions() {
    const box = $('health-conditions');
    if (!box) return;
    box.innerHTML = CONDITIONS.map(c => `<button type="button" class="pick-chip ${healthConds.includes(c.id) ? 'on' : ''}" data-id="${c.id}" aria-pressed="${healthConds.includes(c.id)}"><i class="fa-solid ${c.icon}"></i> ${c.name}</button>`).join('');
  }

  // Island-wide health alerts for the Alerts Center (uses data already loaded)
  function healthAlerts() {
    const out = [];
    const fl = V4.Flood && V4.Flood.island;
    if (!fl) return out;
    const dengue = SRI_LANKA_DISTRICTS.filter(d => {
      const f = fl[d.name], x = AppState.districtWeatherCache[d.name];
      return f && x && DENGUE_HOTSPOTS.includes(d.name) && f.past >= 40 && x.currentTemp >= 25;
    }).map(d => d.name);
    if (dengue.length) out.push({
      id: 'dengue', level: 'yellow', icon: 'fa-mosquito', title: 'Dengue Mosquito Breeding Alert', districts: dengue,
      message: `Recent rain and warm, humid weather favour Aedes mosquito breeding in ${dengue.slice(0, 6).join(', ')}${dengue.length > 6 ? ` and ${dengue.length - 6} more` : ''}.`,
      advice: ['Remove standing water around your home this week (pots, tyres, gutters, coconut shells).', 'Use repellent and nets; fever for 2+ days needs a blood test.', 'Avoid ibuprofen and aspirin if you have a fever – take paracetamol.']
    });
    const lepto = SRI_LANKA_DISTRICTS.filter(d => fl[d.name] && (fl[d.name].past >= 100 || fl[d.name].score >= 55)).map(d => d.name);
    if (lepto.length) out.push({
      id: 'lepto', level: 'yellow', icon: 'fa-water', title: 'Leptospirosis (Rat Fever) Risk', districts: lepto,
      message: `Heavy recent rain or flooding raises leptospirosis risk in ${lepto.slice(0, 6).join(', ')}.`,
      advice: ['Wear boots and gloves in paddy fields and flood water.', 'Farmers can get preventive doxycycline from the MOH office.', 'Fever with muscle pain after water contact – see a doctor quickly.']
    });
    return out;
  }

  // ------------------------------------------------------------------------
  // Feature 32 · Snowfall, frost & ice monitoring
  // ------------------------------------------------------------------------
  const FROST_POINTS = [
    ['Pidurutalagala', 7.0008, 80.7733, 2524], ['Horton Plains', 6.8020, 80.8040, 2130], ['Ambewela', 6.8840, 80.7980, 1900],
    ['Kandapola', 6.9900, 80.8200, 1900], ['Nuwara Eliya', 6.9497, 80.7891, 1868], ['Haputale', 6.7680, 80.9580, 1430], ['Bandarawela', 6.8320, 80.9870, 1230]
  ];
  const SNOW_PLACES = [
    ['Gulmarg, Kashmir', 34.05, 74.38, '🇮🇳'], ['Manali, India', 32.24, 77.19, '🇮🇳'], ['Everest Base Camp', 28.0, 86.85, '🇳🇵'],
    ['Seoul, South Korea', 37.57, 126.98, '🇰🇷'], ['Sapporo, Japan', 43.06, 141.35, '🇯🇵'], ['Tokyo, Japan', 35.68, 139.69, '🇯🇵'],
    ['Beijing, China', 39.9, 116.4, '🇨🇳'], ['Zermatt, Switzerland', 46.02, 7.75, '🇨🇭'], ['Oslo, Norway', 59.91, 10.75, '🇳🇴'],
    ['Moscow, Russia', 55.76, 37.62, '🇷🇺'], ['London, UK', 51.51, -0.13, '🇬🇧'], ['Toronto, Canada', 43.65, -79.38, '🇨🇦'],
    ['New York, USA', 40.71, -74.01, '🇺🇸'], ['Mt Buller, Australia', -37.15, 146.44, '🇦🇺'], ['Queenstown, NZ', -45.03, 168.66, '🇳🇿']
  ];
  const Ice = { frost: null, snow: null, at: 0, snowAt: 0 };
  const snowVal = (cm) => (AppState.rainUnit === 'in' ? `${(cm / 2.54).toFixed(1)} in` : `${cm >= 10 ? Math.round(cm) : cm.toFixed(1)} cm`);

  async function loadFrost(force) {
    if (!force && Ice.frost && Date.now() - Ice.at < 3 * 3600000) return;
    if (!Ice.frost) { const s = store.get('lanka_weather_frost_v1'); if (s && Date.now() - s.at < 24 * 3600000) { Ice.frost = s.frost; Ice.at = s.at; } }
    if (navigator.onLine === false) return;
    try {
      const url = `${API.forecast}?latitude=${FROST_POINTS.map(p => p[1]).join(',')}&longitude=${FROST_POINTS.map(p => p[2]).join(',')}&elevation=${FROST_POINTS.map(p => p[3]).join(',')}&hourly=temperature_2m,cloud_cover,wind_speed_10m,freezing_level_height&forecast_days=8&timezone=Asia%2FColombo`;
      const list = [].concat(await fetchJSON(url, { timeout: 20000 }));
      Ice.frost = list.map((p, i) => ({ name: FROST_POINTS[i][0], elev: FROST_POINTS[i][3], time: p.hourly.time, t: p.hourly.temperature_2m, cloud: p.hourly.cloud_cover, wind: p.hourly.wind_speed_10m, fl: p.hourly.freezing_level_height }));
      Ice.at = Date.now();
      store.set('lanka_weather_frost_v1', { frost: Ice.frost, at: Ice.at });
    } catch (e) { console.warn('frost', e); }
  }
  async function loadSnow(force) {
    if (!force && Ice.snow && Date.now() - Ice.snowAt < 3 * 3600000) return;
    if (!Ice.snow) { const s = store.get('lanka_weather_snow_v1'); if (s && Date.now() - s.at < 24 * 3600000) { Ice.snow = s.snow; Ice.snowAt = s.at; } }
    if (navigator.onLine === false) return;
    try {
      const url = `${API.forecast}?latitude=${SNOW_PLACES.map(p => p[1]).join(',')}&longitude=${SNOW_PLACES.map(p => p[2]).join(',')}&daily=snowfall_sum,temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&current=temperature_2m,snow_depth,weather_code&forecast_days=7&timezone=auto`;
      const list = [].concat(await fetchJSON(url, { timeout: 20000 }));
      Ice.snow = list.map((p, i) => ({ name: SNOW_PLACES[i][0], flag: SNOW_PLACES[i][3], cur: p.current, daily: p.daily }));
      Ice.snowAt = Date.now();
      store.set('lanka_weather_snow_v1', { snow: Ice.snow, at: Ice.snowAt });
    } catch (e) { console.warn('snow', e); }
  }

  const FROST_RISK = [
    { name: 'None', cls: 'f0', color: 'transparent' }, { name: 'Chilly', cls: 'f1', color: '#bae6fd' },
    { name: 'Possible', cls: 'f2', color: '#60a5fa' }, { name: 'Likely', cls: 'f3', color: '#6366f1' }
  ];
  function frostNights(p) {
    const out = [];
    const start = todayStr();
    for (let n = 0; n < 7; n++) {
      const d = addDays(start, n), d2 = addDays(start, n + 1);
      const idx = p.time.map((t, i) => ((t.slice(0, 10) === d && +t.slice(11, 13) >= 18) || (t.slice(0, 10) === d2 && +t.slice(11, 13) <= 8) ? i : -1)).filter(i => i >= 0);
      if (!idx.length) continue;
      const tmin = minOf(idx.map(i => p.t[i]));
      const cloud = mean(idx.map(i => p.cloud[i]), 50), wind = mean(idx.map(i => p.wind[i]), 10);
      let r = 0;
      if (tmin <= 2) r = cloud < 40 && wind < 10 ? 3 : 2;
      else if (tmin <= 4) r = cloud < 30 && wind < 8 ? 2 : 1;
      else if (tmin <= 7) r = 1;
      out.push({ date: d, tmin, cloud, wind, r });
    }
    return out;
  }
  function hailInfo() {
    const G = V4.Grid;
    if (!G || !G.v || !G.times.length) return null;
    const now = Date.now();
    let t0 = 0; G.times.forEach((t, i) => { if (t <= now) t0 = i; });
    const hail = new Map(), large = new Map();
    for (let t = t0; t < Math.min(G.times.length, t0 + 48); t++) {
      G.pts.forEach((p, i) => {
        const code = G.v.code[i][t], cape = G.v.cape[i][t];
        if (code < 95) return;
        const nd = nearestDistrict(p.lat, p.lon);
        if (nd.km > 45) return;
        if (code >= 96 && !hail.has(nd.district.name)) hail.set(nd.district.name, G.times[t]);
        if (cape >= 2500 && !large.has(nd.district.name)) large.set(nd.district.name, G.times[t]);
      });
    }
    return { hail, large };
  }
  function renderIce() {
    const facts = $('ice-facts');
    if (!facts) return;
    if (Ice.frost) {
      const rows = Ice.frost.map(p => ({ p, nights: frostNights(p) }));
      const worst = Math.max(0, ...rows.flatMap(r => r.nights.map(n => n.r)));
      let coldest = null;
      rows.forEach(r => r.nights.forEach(n => { if (!coldest || n.tmin < coldest.n.tmin) coldest = { name: r.p.name, n }; }));
      const top = Ice.frost[0];
      const nowIdx = Math.max(0, top.time.findIndex(t => t.slice(0, 13) >= new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Colombo' }).slice(0, 13).replace(' ', 'T')));
      const fl = top.fl[nowIdx];
      const badge = $('frost-badge');
      badge.textContent = worst >= 3 ? 'Ground frost likely' : worst === 2 ? 'Frost possible' : worst === 1 ? 'Chilly nights' : 'No frost expected';
      badge.className = `badge risk-badge ${['risk-low', 'risk-moderate', 'risk-high', 'risk-severe'][worst]}`;
      const hi = hailInfo();
      const hailN = hi ? new Set([...hi.hail.keys(), ...hi.large.keys()]).size : 0;
      facts.innerHTML = `
        <div class="acc-tile"><span>Snow chance</span><strong>0%</strong><small>Never recorded in Sri Lanka</small></div>
        <div class="acc-tile"><span>Freezing level now</span><strong>${isNum(fl) ? `${Math.round(fl).toLocaleString()} m` : '--'}</strong><small>${isNum(fl) ? `${Math.max(0, Math.round(fl - 2524)).toLocaleString()} m above Pidurutalagala (2,524 m)` : ''}</small></div>
        <div class="acc-tile"><span>Coldest night ahead</span><strong>${coldest ? formatTemp(coldest.n.tmin, 1) : '--'}</strong><small>${coldest ? `${coldest.name}, ${relDay(coldest.n.date)} night` : ''}</small></div>
        <div class="acc-tile"><span>Hail risk (48 h)</span><strong class="${hailN ? 'text-amber' : 'text-emerald'}">${hi ? (hailN ? `${hailN} district${hailN > 1 ? 's' : ''}` : 'Low') : '--'}</strong><small>${hi ? 'From thunderstorm forecasts' : 'Needs radar layer data'}</small></div>`;
      const dates = rows[0].nights.map(n => n.date);
      $('frost-table').innerHTML = `<thead><tr><th>Night of</th>${dates.map(d => `<th>${relDay(d)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><td><strong>${r.p.name}</strong><small>${r.p.elev.toLocaleString()} m</small></td>${r.nights.map(n => `<td class="${FROST_RISK[n.r].cls}" title="${FROST_RISK[n.r].name} · cloud ${Math.round(n.cloud)}% · wind ${formatWind(n.wind)}">${formatTemp(n.tmin)}${n.r >= 2 ? ' ❄' : ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
      const hp = $('hail-panel');
      if (hi && (hi.hail.size || hi.large.size)) {
        const names = [...new Set([...hi.hail.keys(), ...hi.large.keys()])];
        hp.innerHTML = `<p><i class="fa-solid fa-cloud-meatball text-amber"></i> <strong>Hail possible</strong> in strong thunderstorms over: ${names.map(n => `<button class="link-chip" data-district="${n}">${n}</button>`).join(' ')}</p><p class="muted-note">Hail usually lasts only minutes. Park vehicles under cover, bring animals in, and farmers in the hill country should cover nursery beds.</p>`;
        hp.querySelectorAll('[data-district]').forEach(b => b.addEventListener('click', () => selectDistrictAndZoom(findDistrict(b.dataset.district))));
      } else hp.innerHTML = '<p class="muted-note"><i class="fa-solid fa-circle-check text-emerald"></i> No hail-producing storms in the forecast for the next 48 hours.</p>';
    } else {
      facts.innerHTML = '<p class="muted-note">Frost data needs an internet connection.</p>';
    }
    // Global snow watch
    const sg = $('snow-grid');
    if (!Ice.snow) { sg.innerHTML = '<p class="muted-note">Snow data needs an internet connection.</p>'; return; }
    const cards = Ice.snow.map(s => {
      const total = sum(s.daily.snowfall_sum);
      const depth = (s.cur && isNum(s.cur.snow_depth) ? s.cur.snow_depth : 0) * 100;
      const firstIdx = s.daily.snowfall_sum.findIndex(v => v >= 0.5);
      const ice = s.daily.temperature_2m_min.some((t, i) => t <= 0 && (s.daily.precipitation_sum[i] || 0) >= 0.2);
      const frost = s.daily.temperature_2m_min.some(t => t <= 0);
      return { s, total, depth, firstIdx, ice, frost };
    }).sort((a, b) => (b.total + b.depth / 5) - (a.total + a.depth / 5));
    const snowy = cards.filter(c => c.total >= 0.5 || c.depth >= 1).length;
    $('snow-badge').textContent = snowy ? `Snow at ${snowy} of ${cards.length} places` : 'No snow this week';
    $('snow-badge').className = `badge risk-badge ${snowy ? 'risk-moderate' : 'risk-low'}`;
    const maxSnow = Math.max(1, ...cards.flatMap(c => c.s.daily.snowfall_sum));
    sg.innerHTML = cards.map(c => `<article class="snow-card ${c.total >= 0.5 || c.depth >= 1 ? 'has-snow' : ''}">
      <header><span class="flag">${c.s.flag}</span><h4>${c.s.name}</h4><span class="snow-now">${c.s.cur ? formatTemp(c.s.cur.temperature_2m) : '--'}</span></header>
      <div class="snow-stats"><div><span>On the ground</span><strong>${c.depth >= 0.5 ? snowVal(c.depth) : 'None'}</strong></div><div><span>Next 7 days</span><strong>${c.total >= 0.1 ? snowVal(c.total) : 'None'}</strong></div></div>
      <div class="snow-bars">${c.s.daily.snowfall_sum.map((v, i) => `<i title="${dayName(c.s.daily.time[i])}: ${snowVal(v || 0)}" style="height:${Math.max(4, (v || 0) / maxSnow * 100)}%" class="${v >= 0.1 ? 'on' : ''}"></i>`).join('')}</div>
      <p class="snow-note">${c.firstIdx >= 0 ? `❄ Snow from ${new Date(`${c.s.daily.time[c.firstIdx]}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short' })}` : c.frost ? '🧊 Frosty nights' : 'No snow or frost'}${c.ice ? ' · <strong class="text-rose">Black-ice risk</strong>' : ''}</p>
    </article>`).join('');
  }

  // ------------------------------------------------------------------------
  // Feature 33 · Sharing via social media
  // ------------------------------------------------------------------------
  const TXT = {
    en: { today: 'Today', feels: 'feels like', high: 'High', low: 'Low', rain: 'Rain chance', wind: 'Wind', uv: 'UV', aqi: 'AQI', alerts: 'Weather alerts', noAlerts: 'No active weather alerts', days3: '3-day forecast', rainFrom: 'Rain likely from', event: 'Event forecast', score: 'Weather score', more: 'Full forecast',
      cat: { thunder: 'Thunderstorms', showers: 'Showers', rain: 'Rain', drizzle: 'Drizzle', fog: 'Fog / mist', cloudy: 'Cloudy', partly: 'Partly cloudy', clear: 'Clear' } },
    si: { today: 'අද', feels: 'දැනෙන්නේ', high: 'ඉහළම', low: 'පහළම', rain: 'වැසි සම්භාවිතාව', wind: 'සුළඟ', uv: 'පාරජම්බුල', aqi: 'වායු ගුණත්වය', alerts: 'කාලගුණ අනතුරු ඇඟවීම්', noAlerts: 'දැනට කාලගුණ අනතුරු ඇඟවීම් නැත', days3: 'දින 3 අනාවැකිය', rainFrom: 'වැසි ඇතිවීමට ඉඩ ඇත්තේ', event: 'උත්සවයේ කාලගුණය', score: 'කාලගුණ ලකුණු', more: 'සම්පූර්ණ අනාවැකිය',
      cat: { thunder: 'ගිගුරුම් සහිත වැසි', showers: 'ඉඳහිට වැසි', rain: 'වැසි', drizzle: 'පොද වැසි', fog: 'මීදුම', cloudy: 'වලාකුළු සහිතයි', partly: 'අර්ධ වශයෙන් වලාකුළු', clear: 'පැහැදිලියි' } },
    ta: { today: 'இன்று', feels: 'உணர்வு', high: 'அதிகபட்சம்', low: 'குறைந்தபட்சம்', rain: 'மழை வாய்ப்பு', wind: 'காற்று', uv: 'புற ஊதா', aqi: 'காற்றின் தரம்', alerts: 'வானிலை எச்சரிக்கைகள்', noAlerts: 'தற்போது வானிலை எச்சரிக்கைகள் இல்லை', days3: '3 நாள் முன்னறிவிப்பு', rainFrom: 'மழை பெய்யக்கூடிய நேரம்', event: 'நிகழ்வு வானிலை', score: 'வானிலை மதிப்பெண்', more: 'முழு முன்னறிவிப்பு',
      cat: { thunder: 'இடியுடன் கூடிய மழை', showers: 'இடையிடையே மழை', rain: 'மழை', drizzle: 'தூறல்', fog: 'மூடுபனி', cloudy: 'மேகமூட்டம்', partly: 'ஓரளவு மேகமூட்டம்', clear: 'தெளிவான வானம்' } }
  };
  const Share = { kind: 'now', lang: 'en', event: null };

  function shareLink() {
    if (!/^https?:/.test(location.protocol)) return '';
    const base = `${location.origin}${location.pathname}`;
    const p = AppState.selectedPlace;
    return p ? `${base}?p=${encodeURIComponent(`${p.name}~${(+p.lat).toFixed(4)}~${(+p.lon).toFixed(4)}~${p.district}`)}` : `${base}?d=${encodeURIComponent(AppState.selectedDistrict.name)}`;
  }
  function shareData() {
    const loc = activeLoc();
    const x = currentData();
    if (!x) return null;
    const hrs = (x.hourly || []).slice(0, 12);
    const wet = hrs.find(h => h.rainProb >= 50 || h.rainAmount >= 0.5);
    const aq = typeof aqiFor === 'function' ? aqiFor(loc) : null;
    const alerts = (typeof computeAlerts === 'function' ? computeAlerts() : []);
    const mine = alerts.filter(a => (a.districts || []).includes(loc.district.name));
    return { loc, x, wet, aqi: aq && isNum(aq.aqi) ? aq.aqi : null, alerts, mine };
  }
  function shareText(kind, lang) {
    const d = shareData();
    if (!d) return '';
    const T = TXT[lang];
    const { loc, x } = d;
    const cat = codeCat(x.weatherCode);
    const em = !x.isDay && cat === 'clear' ? '🌙' : CAT_EMOJI[cat];
    const name = lang === 'si' && loc.sinhala ? `${loc.name} (${loc.sinhala})` : lang === 'ta' && loc.tamil ? `${loc.name} (${loc.tamil})` : loc.name;
    const lines = [`🇱🇰 ලංකාweather · ${name}`];
    if (kind === 'now') {
      lines.push(`${em} ${T.cat[cat]} · ${formatTemp(x.currentTemp)} (${T.feels} ${formatTemp(x.feelsLike)})`);
      lines.push(`🌡️ ${T.high} ${formatTemp(x.todayMax)} / ${T.low} ${formatTemp(x.todayMin)} · 🌧️ ${T.rain} ${Math.round(x.rainProb)}%`);
      lines.push(`💨 ${T.wind} ${formatWind(x.windSpeed)} ${x.windDirection || ''} · ☀️ ${T.uv} ${Math.round(x.uvMax || x.uvIndex || 0)}${isNum(d.aqi) ? ` · 🍃 ${T.aqi} ${Math.round(d.aqi)}` : ''}`);
      if (d.wet) lines.push(`☔ ${T.rainFrom} ${hourLabel(d.wet.isoTime)}`);
      if (d.mine.length) lines.push(`⚠️ ${d.mine.map(a => a.title).join(' · ')}`);
    } else if (kind === '3day') {
      lines.push(`📅 ${T.days3}`);
      (x.sevenDay || []).slice(0, 3).forEach((day, i) => {
        const c = codeCat(day.code);
        const label = i === 0 ? T.today : new Date(`${day.isoDate}T12:00:00+05:30`).toLocaleDateString(lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-LK' : 'en-US', { weekday: 'short', timeZone: 'Asia/Colombo' });
        lines.push(`${label}: ${CAT_EMOJI[c]} ${T.cat[c]} · ${formatTemp(day.maxTemp)}/${formatTemp(day.minTemp)} · 🌧️ ${Math.round(day.rainProb)}%`);
      });
    } else if (kind === 'alerts') {
      lines.push(`⚠️ ${T.alerts}`);
      if (!d.alerts.length) lines.push(`✅ ${T.noAlerts}`);
      d.alerts.slice(0, 5).forEach(a => lines.push(`${a.level === 'red' ? '🔴' : a.level === 'amber' ? '🟠' : '🟡'} ${a.title}: ${(a.districts || []).slice(0, 5).join(', ')}${(a.districts || []).length > 5 ? '…' : ''}`));
      lines.push('☎️ DMC 117 · 🚑 1990');
    } else if (kind === 'event' && Share.event) {
      const e = Share.event;
      lines[0] = `🇱🇰 ලංකාweather · ${T.event}`;
      lines.push(`🎉 ${e.name} · ${e.typeName}`);
      lines.push(`📍 ${e.locName} · 📅 ${dayName(e.date, { weekday: 'short', day: 'numeric', month: 'short' })} ${e.timeLabel}`);
      lines.push(`⭐ ${T.score}: ${e.score}/100 (${e.verdict})`);
      if (e.summary) lines.push(e.summary);
      if (e.better) lines.push(`💡 ${e.better}`);
    }
    const link = shareLink();
    if (link) lines.push(`👉 ${T.more}: ${link}`);
    return lines.join('\n');
  }

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fit(ctx, text, maxW) { let t = String(text); while (ctx.measureText(t).width > maxW && t.length > 3) t = `${t.slice(0, -2)}…`; return t; }
  async function drawShareCard() {
    const cv = $('share-canvas');
    const d = shareData();
    if (!cv || !d) return;
    try { await Promise.all(['800 64px "Fraunces"', '600 28px "Noto Serif"', '700 28px "Noto Serif Sinhala"', '700 28px "Noto Serif Tamil"'].map(f => document.fonts.load(f))); } catch (e) { /* fonts optional */ }
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const T = TXT[Share.lang];
    const { loc, x } = d;
    const cat = codeCat(x.weatherCode);
    const bg = cat === 'thunder' ? ['#1e1b4b', '#4c1d95'] : ['rain', 'showers', 'drizzle'].includes(cat) ? ['#0f2a44', '#1e5a7a'] : !x.isDay ? ['#0b1026', '#1e3a8a'] : cat === 'clear' ? ['#0369a1', '#38bdf8'] : ['#1e3a5f', '#4b7bab'];
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // flag-colour band
    [['#ffbe29', 0, 0.06], ['#00534e', 0.06, 0.2], ['#eb7400', 0.2, 0.34], ['#8d153a', 0.34, 1]].forEach(([c, a, b]) => { ctx.fillStyle = c; ctx.fillRect(a * W, H - 14, (b - a) * W, 14); });
    const serif = '"Noto Serif", "Noto Serif Sinhala", "Noto Serif Tamil", Georgia, serif';
    const disp = '"Fraunces", "Noto Serif", Georgia, serif';
    // brand
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 34px "Noto Serif Sinhala", ${serif}`;
    const lg = ctx.createLinearGradient(56, 0, 56 + ctx.measureText('ලංකා').width, 0);
    lg.addColorStop(0, '#00a19a'); lg.addColorStop(0.22, '#00a19a'); lg.addColorStop(0.22, '#ff9a1f'); lg.addColorStop(0.44, '#ff9a1f'); lg.addColorStop(0.44, '#e0386a'); lg.addColorStop(1, '#e0386a');
    ctx.fillStyle = lg; ctx.fillText('ලංකා', 56, 70);
    const bw = ctx.measureText('ලංකා').width;
    ctx.font = `800 34px ${disp}`; ctx.fillStyle = '#fff'; ctx.fillText('weather', 60 + bw, 70);
    ctx.font = `500 22px ${serif}`; ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'right';
    ctx.fillText(new Date().toLocaleString('en-US', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Colombo' }), W - 56, 70);
    ctx.textAlign = 'left';
    if (Share.kind === 'event' && Share.event) return drawEventCard(ctx, W, H, serif, disp, T);
    // location
    ctx.fillStyle = '#fff'; ctx.font = `800 52px ${disp}`;
    ctx.fillText(fit(ctx, loc.name, 700), 56, 150);
    ctx.font = `500 24px ${serif}`; ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const sub = [Share.lang === 'si' ? loc.sinhala : Share.lang === 'ta' ? loc.tamil : '', `${loc.isPlace ? `${loc.district.name} District · ` : ''}${loc.province || ''}`].filter(Boolean).join(' · ');
    ctx.fillText(fit(ctx, sub, 700), 56, 190);
    if (Share.kind === 'alerts') {
      ctx.font = `700 34px ${serif}`; ctx.fillStyle = '#fde047'; ctx.fillText(`⚠ ${T.alerts}`, 56, 260);
      const list = d.alerts.slice(0, 5);
      if (!list.length) { ctx.font = `600 30px ${serif}`; ctx.fillStyle = '#fff'; ctx.fillText(`✓ ${T.noAlerts}`, 56, 320); }
      list.forEach((a, i) => {
        const y = 300 + i * 56;
        ctx.fillStyle = a.level === 'red' ? '#ef4444' : a.level === 'amber' ? '#f97316' : '#eab308';
        rr(ctx, 56, y, 14, 40, 4); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `700 26px ${serif}`; ctx.fillText(fit(ctx, a.title, 520), 84, y + 22);
        ctx.font = `400 19px ${serif}`; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(fit(ctx, (a.districts || []).join(', '), 1040), 84, y + 44);
      });
      ctx.font = `600 22px ${serif}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText('DMC 117 · Ambulance 1990 · meteo.gov.lk', 56, H - 40);
      return;
    }
    // big temperature + condition
    ctx.font = `800 150px ${disp}`; ctx.fillStyle = '#fff';
    const tt = formatTemp(x.currentTemp);
    ctx.fillText(tt, 50, 360);
    const tw = ctx.measureText(tt).width;
    ctx.font = '84px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.fillText(!x.isDay && cat === 'clear' ? '🌙' : CAT_EMOJI[cat], 70 + tw, 340);
    ctx.font = `700 32px ${serif}`; ctx.fillText(fit(ctx, T.cat[cat], 560), 56, 412);
    ctx.font = `500 24px ${serif}`; ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`${T.feels} ${formatTemp(x.feelsLike)} · ${T.high} ${formatTemp(x.todayMax)} · ${T.low} ${formatTemp(x.todayMin)}`, 56, 450);
    // stat tiles (right)
    const tiles = [[`🌧 ${T.rain}`, `${Math.round(x.rainProb)}%`], [`💨 ${T.wind}`, formatWind(x.windSpeed)], [`☀ ${T.uv}`, `${Math.round(x.uvMax || x.uvIndex || 0)}`], [`🍃 ${T.aqi}`, isNum(d.aqi) ? `${Math.round(d.aqi)}` : '--']];
    tiles.forEach(([k, v], i) => {
      const tx = 720 + (i % 2) * 215, ty = 120 + Math.floor(i / 2) * 130;
      ctx.fillStyle = 'rgba(255,255,255,0.13)'; rr(ctx, tx, ty, 200, 112, 18); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = `500 19px ${serif}`; ctx.fillText(fit(ctx, k, 180), tx + 16, ty + 36);
      ctx.fillStyle = '#fff'; ctx.font = `800 38px ${disp}`; ctx.fillText(v, tx + 16, ty + 86);
    });
    // bottom strip: next hours or 3 days
    const strip = Share.kind === '3day'
      ? (x.sevenDay || []).slice(0, 3).map((day, i) => [i === 0 ? T.today : new Date(`${day.isoDate}T12:00:00+05:30`).toLocaleDateString(Share.lang === 'si' ? 'si-LK' : Share.lang === 'ta' ? 'ta-LK' : 'en-US', { weekday: 'short', timeZone: 'Asia/Colombo' }), CAT_EMOJI[codeCat(day.code)], `${formatTemp(day.maxTemp)} / ${formatTemp(day.minTemp)}`, `${Math.round(day.rainProb)}%`])
      : (x.hourly || []).filter((h, i) => i % 2 === 0).slice(0, 6).map(h => [hourLabel(h.isoTime), !h.isDay && codeCat(h.code) === 'clear' ? '🌙' : CAT_EMOJI[codeCat(h.code)], formatTemp(h.temp), `${Math.round(h.rainProb)}%`]);
    const sw = (W - 112 - (strip.length - 1) * 12) / strip.length;
    strip.forEach(([lbl, ic, t, p], i) => {
      const sx = 56 + i * (sw + 12), sy = 480;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; rr(ctx, sx, sy, sw, 112, 16); ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `600 18px ${serif}`; ctx.fillText(fit(ctx, lbl, sw - 10), sx + sw / 2, sy + 28);
      ctx.font = '30px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.fillText(ic, sx + sw / 2 - (Share.kind === '3day' ? 70 : 0), sy + (Share.kind === '3day' ? 80 : 66));
      ctx.fillStyle = '#fff'; ctx.font = `800 ${Share.kind === '3day' ? 30 : 24}px ${disp}`;
      if (Share.kind === '3day') { ctx.fillText(t, sx + sw / 2 + 30, sy + 74); ctx.font = `500 17px ${serif}`; ctx.fillStyle = '#7dd3fc'; ctx.fillText(`🌧 ${p}`, sx + sw / 2 + 30, sy + 98); }
      else { ctx.fillText(t, sx + sw / 2 - 22, sy + 98); ctx.font = `500 16px ${serif}`; ctx.fillStyle = '#7dd3fc'; ctx.fillText(p, sx + sw / 2 + 30, sy + 98); }
      ctx.textAlign = 'left';
    });
  }
  function drawEventCard(ctx, W, H, serif, disp, T) {
    const e = Share.event;
    ctx.fillStyle = '#fde047'; ctx.font = `700 26px ${serif}`; ctx.fillText(`🎉 ${T.event}`, 56, 140);
    ctx.fillStyle = '#fff'; ctx.font = `800 54px ${disp}`; ctx.fillText(fit(ctx, e.name, 760), 56, 210);
    ctx.font = `500 26px ${serif}`; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(fit(ctx, `${e.typeName} · ${e.locName}`, 760), 56, 256);
    ctx.fillText(`${dayName(e.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${e.timeLabel}`, 56, 296);
    ctx.font = `500 24px ${serif}`; ctx.fillStyle = '#fff';
    const words = (e.summary || '').split(' '); let line = '', y = 360;
    words.forEach(w => { if (ctx.measureText(`${line}${w} `).width > 700) { ctx.fillText(line, 56, y); line = ''; y += 34; } line += `${w} `; });
    if (line && y < 480) ctx.fillText(line, 56, y);
    if (e.better) { ctx.fillStyle = '#86efac'; ctx.font = `600 22px ${serif}`; ctx.fillText(fit(ctx, `💡 ${e.better}`, 760), 56, 540); }
    // score ring
    const cx = 990, cy = 330, r = 130;
    ctx.lineWidth = 26; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = e.color; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e.score / 100); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `800 92px ${disp}`; ctx.fillText(e.score, cx, cy + 22);
    ctx.font = `600 24px ${serif}`; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(`/100 · ${String(e.verdict).split(' –')[0]}`, cx, cy + 62);
    ctx.textAlign = 'left';
  }

  function openShare(kind = 'now', event = null) {
    if (event) Share.event = event;
    Share.kind = kind;
    $('share-kind').querySelector('[data-kind="event"]').hidden = !Share.event;
    syncShareUI();
    openModal('share-modal-backdrop');
  }
  function syncShareUI() {
    document.querySelectorAll('#share-kind button').forEach(b => b.classList.toggle('active', b.dataset.kind === Share.kind));
    document.querySelectorAll('#share-lang button').forEach(b => b.classList.toggle('active', b.dataset.lang === Share.lang));
    $('share-sub').textContent = `${activeLoc().name} · image + message for WhatsApp, Facebook, X and more`;
    $('share-text').value = shareText(Share.kind, Share.lang);
    drawShareCard().catch(e => console.warn('share card', e));
  }
  function canvasBlob() { return new Promise((res) => { try { $('share-canvas').toBlob(b => res(b), 'image/png'); } catch (e) { res(null); } }); }
  function copy(text, msg) {
    const done = () => showToast(msg, 'success', 2000);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { showToast('Copy failed – select the text and copy it manually.', 'error'); } ta.remove(); }
  async function doShare(net) {
    const text = $('share-text').value;
    const link = shareLink();
    const enc = encodeURIComponent;
    const open = (url) => window.open(url, '_blank', 'noopener,noreferrer,width=640,height=600');
    switch (net) {
      case 'native': {
        if (!navigator.share) { showToast('Your browser has no share menu – use the buttons below.', 'info'); return; }
        const blob = await canvasBlob();
        const file = blob ? new File([blob], 'lankaweather-forecast.png', { type: 'image/png' }) : null;
        try {
          if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text, title: 'ලංකාweather forecast' });
          else await navigator.share({ text, title: 'ලංකාweather forecast', url: link || undefined });
        } catch (e) { if (e.name !== 'AbortError') showToast('Sharing was cancelled or blocked.', 'warning'); }
        return;
      }
      case 'whatsapp': open(`https://api.whatsapp.com/send?text=${enc(text)}`); return;
      case 'facebook': open(`https://www.facebook.com/sharer/sharer.php?u=${enc(link || 'https://open-meteo.com')}&quote=${enc(text)}`); if (!link) showToast('Facebook shares links only – the text was copied so you can paste it.', 'info', 4000); copy(text, 'Message copied – paste it into your post'); return;
      case 'x': open(`https://twitter.com/intent/tweet?text=${enc(text.length > 270 ? `${text.slice(0, 267)}…` : text)}`); return;
      case 'telegram': open(`https://t.me/share/url?url=${enc(link || ' ')}&text=${enc(text)}`); return;
      case 'viber': location.href = `viber://forward?text=${enc(text)}`; return;
      case 'email': location.href = `mailto:?subject=${enc(`Weather – ${activeLoc().name}`)}&body=${enc(text)}`; return;
      case 'copy': copy(text, 'Message copied to clipboard'); return;
      case 'link': if (link) copy(link, 'Link copied'); else showToast('Links work when the app is served from a website (not opened as a file).', 'info', 4000); return;
      case 'image': {
        const blob = await canvasBlob();
        if (!blob) { showToast('Could not create the image in this browser.', 'error'); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `lankaweather-${activeLoc().name.replace(/\W+/g, '-').toLowerCase()}-${todayStr()}.png`;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        showToast('📷 Image saved – attach it to your post or status', 'success', 2500);
        return;
      }
      default:
    }
  }
  function initShare() {
    $('hero-share-btn').addEventListener('click', () => openShare('now'));
    $('myday-share').addEventListener('click', () => openShare('now'));
    $('share-modal-close').addEventListener('click', () => closeModal('share-modal-backdrop'));
    $('share-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'share-modal-backdrop') closeModal('share-modal-backdrop'); });
    $('share-kind').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { Share.kind = b.dataset.kind; syncShareUI(); } });
    $('share-lang').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { Share.lang = b.dataset.lang; syncShareUI(); } });
    $('share-buttons').addEventListener('click', (e) => { const b = e.target.closest('[data-net]'); if (b) doShare(b.dataset.net); });
    if (!navigator.share) $('share-buttons').querySelector('[data-net="native"]').hidden = true;
  }
  // Deep links: ?d=District or ?p=Name~lat~lon~District
  function applyDeepLink() {
    const q = new URLSearchParams(location.search);
    let used = false;
    if (q.get('p')) {
      const [name, lat, lon, district] = q.get('p').split('~');
      if (name && isFinite(lat) && isFinite(lon) && findDistrict(district)) { selectPlace({ name, lat: +lat, lon: +lon, district, type: 'o', typeLabel: 'Shared place' }, { toast: false }); used = true; }
    } else if (q.get('d') && findDistrict(q.get('d'))) { selectDistrictAndZoom(findDistrict(q.get('d')), { toast: false }); used = true; }
    if (used) history.replaceState(null, '', location.pathname + location.hash);
  }

  // ------------------------------------------------------------------------
  // Feature 34 · Smart weather-based event planner
  // ------------------------------------------------------------------------
  const EVENT_TYPES = [
    { id: 'wedding', name: 'Wedding / homecoming (outdoor)', icon: 'fa-ring', rain: 1.3, thunder: 1.3, heat: 1.1, wind: 1, dark: 0, tips: ['Book a marquee or tent with side walls as a rain backup.', 'Plan photos for the golden hour before sunset.'] },
    { id: 'hall', name: 'Wedding / party (indoor hall)', icon: 'fa-champagne-glasses', rain: 0.35, thunder: 0.5, heat: 0.25, wind: 0.2, dark: 0, indoor: true, tips: ['Arrange covered drop-off and umbrellas at the entrance.', 'Tell guests travelling from far about road conditions.'] },
    { id: 'cricket', name: 'Cricket match / sports day', icon: 'fa-baseball-bat-ball', rain: 1.6, thunder: 1.5, heat: 1, wind: 0.5, dark: 0.8, tips: ['Keep pitch and square covers ready.', 'Plan drinks breaks every 45 minutes in heat.'] },
    { id: 'beach', name: 'Beach party / bonfire', icon: 'fa-umbrella-beach', rain: 1.2, thunder: 1.4, heat: 0.6, wind: 1.4, dark: 0, tips: ['Check the sea-state bulletin – avoid swimming in rough seas or after dark.'] },
    { id: 'religious', name: 'Pinkama / dansala / perahera', icon: 'fa-dharmachakra', rain: 1.1, thunder: 1.2, heat: 1.2, wind: 0.8, dark: 0, tips: ['Shade and drinking water for devotees and elders.', 'Plan for crowds and parking on Poya days.'] },
    { id: 'picnic', name: 'Picnic / family trip', icon: 'fa-basket-shopping', rain: 1.2, thunder: 1.3, heat: 1, wind: 0.8, dark: 1, tips: ['Choose a spot with shelter nearby.'] },
    { id: 'concert', name: 'Outdoor concert / musical show', icon: 'fa-music', rain: 1.3, thunder: 1.6, heat: 0.8, wind: 1.3, dark: 0, tips: ['Cover sound and lighting gear; secure stage banners against wind.', 'Have a lightning shutdown plan (stop when thunder is within 30 seconds of lightning).'] },
    { id: 'bbq', name: 'BBQ / garden party', icon: 'fa-fire-burner', rain: 1.2, thunder: 1.2, heat: 0.9, wind: 1.1, dark: 0, tips: ['Set up the grill under a canopy away from the wind.'] },
    { id: 'hike', name: 'Hike / camping trip', icon: 'fa-campground', rain: 1.3, thunder: 1.7, heat: 1, wind: 1, dark: 1, tips: ['Start early – afternoon storms are common in the hills.', 'Check landslide warnings before hill-country trails.'] },
    { id: 'photo', name: 'Photo shoot / pre-shoot', icon: 'fa-camera', rain: 1.3, thunder: 1.2, heat: 0.8, wind: 0.9, dark: 1.2, golden: true, tips: ['Best light: the hour after sunrise and before sunset.'] },
    { id: 'outing', name: 'School / office outing', icon: 'fa-bus', rain: 1.1, thunder: 1.4, heat: 1.2, wind: 0.7, dark: 1, tips: ['Carry a first-aid kit and plenty of water.'] },
    { id: 'indoor', name: 'Indoor event (travel only)', icon: 'fa-building', rain: 0.3, thunder: 0.4, heat: 0.2, wind: 0.2, dark: 0, indoor: true, tips: ['Weather mainly affects guests’ travel.'] }
  ];
  const EVENTS_KEY = 'lanka_weather_events_v1';
  let savedEvents = (store.get(EVENTS_KEY, []) || []).filter(e => e && e.id && e.date);
  const Plan = { forecast: {}, climate: {}, loc: null, last: null };

  function planLoc() {
    if (Plan.loc) return Plan.loc;
    const l = activeLoc();
    return { name: l.name, lat: +l.lat, lon: +l.lon, district: l.district.name, key: l.key };
  }
  async function planForecast(loc) {
    const c = Plan.forecast[loc.key];
    if (c && Date.now() - c.at < 3600000) return c.h;
    const json = await fetchJSON(`${API.forecast}?latitude=${loc.lat.toFixed(4)}&longitude=${loc.lon.toFixed(4)}&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_gusts_10m,uv_index,is_day,cloud_cover&forecast_days=16&timezone=Asia%2FColombo`, { timeout: 20000 });
    const h = json.hourly;
    const byTime = {};
    h.time.forEach((t, i) => { byTime[t] = { t, temp: h.temperature_2m[i], at: h.apparent_temperature[i], prob: h.precipitation_probability[i], rain: h.precipitation[i], code: h.weather_code[i], gust: h.wind_gusts_10m[i], uv: h.uv_index[i], isDay: h.is_day[i] === 1, cloud: h.cloud_cover[i] }; });
    Plan.forecast[loc.key] = { at: Date.now(), h: byTime, last: h.time[h.time.length - 1].slice(0, 10) };
    return byTime;
  }
  async function planClimate(loc) {
    const c = Plan.climate[loc.key];
    if (c) return c;
    const y = new Date().getFullYear();
    const json = await fetchJSON(`${API.archive}?latitude=${loc.lat.toFixed(4)}&longitude=${loc.lon.toFixed(4)}&start_date=${y - 10}-01-01&end_date=${y - 1}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=Asia%2FColombo`, { timeout: 30000, retries: 1 });
    const d = json.daily;
    const byDate = {};
    d.time.forEach((t, i) => { byDate[t] = [d.temperature_2m_max[i], d.temperature_2m_min[i], d.precipitation_sum[i], d.weather_code[i]]; });
    Plan.climate[loc.key] = { byDate, y0: y - 10, y1: y - 1 };
    return Plan.climate[loc.key];
  }
  function scoreEvHour(h, type) {
    let s = 100;
    const issues = [];
    const prob = h.prob ?? 0, rain = h.rain ?? 0;
    const rp = (prob * 0.35 + Math.min(rain, 10) * 6) * type.rain;
    s -= rp; if (rp >= 15) issues.push('rain');
    if (h.code >= 95) { s -= 45 * type.thunder; issues.push('thunder'); }
    const at = h.at ?? h.temp;
    if (at > 32) { s -= (at - 32) * 4 * type.heat; if (at >= 36) issues.push('heat'); }
    if (!type.indoor && h.isDay && (h.uv ?? 0) >= 8) { s -= ((h.uv ?? 0) - 7) * 2 * type.heat; issues.push('uv'); }
    if ((h.gust ?? 0) > 35) { s -= ((h.gust ?? 0) - 35) * 1.2 * type.wind; if ((h.gust ?? 0) >= 45) issues.push('wind'); }
    if ((h.temp ?? 25) < 18) { s -= (18 - h.temp) * 2 * Math.max(0.3, type.heat * 0.5); issues.push('cold'); }
    if (!h.isDay && type.dark) { s -= 25 * type.dark; issues.push('dark'); }
    if (type.golden && h.isDay && (h.cloud ?? 50) >= 20 && (h.cloud ?? 50) <= 70) s += 4;
    return { s: clamp(s, 0, 100), issues };
  }
  function windowHours(fc, date, startMin, dur) {
    const out = [];
    const h0 = Math.floor(startMin / 60);
    for (let k = 0; k < Math.max(1, Math.ceil(dur)); k++) {
      const hh = h0 + k;
      const ds = addDays(date, Math.floor(hh / 24));
      const key = `${ds}T${String(hh % 24).padStart(2, '0')}:00`;
      if (!fc[key]) return null;
      out.push(fc[key]);
    }
    return out;
  }
  function scoreWindow(hours, type) {
    const sc = hours.map(h => scoreEvHour(h, type));
    const avg = sum(sc.map(s => s.s)) / sc.length, min = Math.min(...sc.map(s => s.s));
    const issues = new Set(sc.flatMap(s => s.issues));
    return { score: Math.round(0.6 * avg + 0.4 * min), issues, perHour: sc };
  }
  function climateFor(clim, ds, type) {
    const md = ds.slice(5);
    const vals = [];
    for (let y = clim.y0; y <= clim.y1; y++) {
      for (let o = -3; o <= 3; o++) {
        const v = clim.byDate[addDays(`${y}-${md === '02-29' ? '02-28' : md}`, o)];
        if (v) vals.push(v);
      }
    }
    if (!vals.length) return null;
    const rainDay = vals.filter(v => v[2] >= 1).length / vals.length * 100;
    const heavy = vals.filter(v => v[2] >= 10).length / vals.length * 100;
    const thunder = vals.filter(v => v[3] >= 95).length / vals.length * 100;
    const avgMax = mean(vals.map(v => v[0])), avgMin = mean(vals.map(v => v[1])), avgRain = mean(vals.map(v => v[2]));
    const score = Math.round(clamp(100 - rainDay * 0.45 * type.rain - heavy * 0.35 * type.rain - thunder * 0.2 * type.thunder - Math.max(0, avgMax - 31) * 4 * type.heat, 5, 100));
    return { rainDay, heavy, thunder, avgMax, avgMin, avgRain, score, n: vals.length };
  }
  function verdictFor(s) {
    if (s >= 80) return ['Great', '#16a34a'];
    if (s >= 65) return ['Good', '#22c55e'];
    if (s >= 50) return ['Fair – have a backup', '#eab308'];
    if (s >= 35) return ['Risky', '#f97316'];
    return ['Poor – consider moving it', '#dc2626'];
  }
  function isPoya(ds) {
    if (typeof getMoonInfo !== 'function') return false;
    const m = getMoonInfo(new Date(`${ds}T18:00:00+05:30`));
    return m.daysToFull < 0.75 || m.daysToFull > 29.53 - 0.75 || m.name === 'Full Moon' && m.illumination >= 98;
  }
  const fmtTime = (min) => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const ISSUE_TEXT = { rain: ['fa-cloud-rain', 'Rain likely during the event'], thunder: ['fa-cloud-bolt', 'Thunderstorms possible – lightning danger outdoors'], heat: ['fa-temperature-high', 'Very hot and humid'], uv: ['fa-sun', 'Strong UV at midday'], wind: ['fa-wind', 'Gusty wind – secure decorations and tents'], cold: ['fa-snowflake', 'Cool temperatures'], dark: ['fa-moon', 'Part of the event is after dark'] };

  async function runPlanner(evt) {
    if (evt) evt.preventDefault();
    const box = $('planner-result');
    const type = EVENT_TYPES.find(t => t.id === $('ev-type').value) || EVENT_TYPES[0];
    const name = $('ev-name').value.trim() || type.name.split(' (')[0];
    const date = $('ev-date').value;
    const [hh, mm] = ($('ev-time').value || '16:00').split(':').map(Number);
    const startMin = hh * 60 + (mm || 0);
    const dur = +$('ev-dur').value || 3;
    const flex = +$('ev-flex').value || 0;
    const loc = planLoc();
    const today = todayStr();
    if (!date || date < today) { showToast('Please choose today or a future date.', 'warning'); return; }
    box.innerHTML = '<div class="planner-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Checking forecasts and climate history…</p></div>';
    try {
      const ahead = daysBetween(today, date);
      const candidates = [];
      for (let o = -flex; o <= flex; o++) { const d = addDays(date, o); if (d >= today) candidates.push(d); }
      const needFc = candidates.some(d => daysBetween(today, d) <= 15);
      const needClim = candidates.some(d => daysBetween(today, d) > 14) || ahead > 14;
      const [fc, clim] = await Promise.all([needFc ? planForecast(loc).catch(() => null) : null, needClim ? planClimate(loc).catch(() => null) : null]);
      const evalDate = (d) => {
        const hrs = fc ? windowHours(fc, d, startMin, dur) : null;
        if (hrs && daysBetween(today, d) <= 15) { const w = scoreWindow(hrs, type); return Object.assign(w, { date: d, mode: 'forecast', hours: hrs }); }
        const c = clim ? climateFor(clim, d, type) : null;
        return c ? { date: d, mode: 'climate', score: c.score, clim: c, issues: new Set([c.rainDay >= 40 ? 'rain' : '', c.thunder >= 15 ? 'thunder' : '', c.avgMax >= 33 ? 'heat' : ''].filter(Boolean)) } : null;
      };
      const results = candidates.map(evalDate).filter(Boolean);
      const main = results.find(r => r.date === date) || evalDate(date);
      if (!main) throw new Error('No data for that date');
      // best start time on the chosen day (forecast only)
      let bestTime = null;
      if (main.mode === 'forecast') {
        for (let s = Math.max(6 * 60, startMin - 240); s + dur * 60 <= 23 * 60 && s <= startMin + 240; s += 60) {
          const hrs = windowHours(fc, date, s, dur);
          if (!hrs) continue;
          const w = scoreWindow(hrs, type);
          if (!bestTime || w.score > bestTime.score) bestTime = { start: s, score: w.score };
        }
      }
      const bestDate = results.slice().sort((a, b) => b.score - a.score)[0];
      const [verdict, color] = verdictFor(main.score);
      const conf = main.mode === 'climate' ? 'Climate odds (10-year history)' : ahead <= 3 ? 'High confidence' : ahead <= 7 ? 'Medium confidence' : 'Low confidence – check again closer to the day';
      const poya = isPoya(date);
      let better = '';
      if (bestTime && bestTime.score >= main.score + 8) better = `A ${fmtTime(bestTime.start)} start scores ${bestTime.score}/100 on the same day.`;
      if (bestDate && bestDate.date !== date && bestDate.score >= main.score + 8) better = `${better ? `${better} ` : ''}${dayName(bestDate.date, { weekday: 'long', day: 'numeric', month: 'short' })} looks better (${bestDate.score}/100).`;
      const endMin = startMin + dur * 60;
      const timeLabel = `${fmtTime(startMin)}–${fmtTime(endMin % (24 * 60))}`;
      let summary;
      if (main.mode === 'forecast') {
        const maxP = maxOf(main.hours.map(h => h.prob), 0), tot = sum(main.hours.map(h => h.rain));
        const at = maxOf(main.hours.map(h => h.at), 0);
        summary = `${maxP >= 60 ? `High chance of rain (${Math.round(maxP)}%, about ${formatRain(tot)})` : maxP >= 30 ? `Some chance of showers (${Math.round(maxP)}%)` : `Mostly dry (${Math.round(maxP)}% rain chance)`}${main.issues.has('thunder') ? ' with thunderstorms possible' : ''}. Feels like up to ${formatTemp(at)}${main.issues.has('wind') ? ', gusty' : ''}.`;
      } else {
        const c = main.clim;
        summary = `Historically, ${Math.round(c.rainDay)}% of days around this date had rain (${Math.round(c.heavy)}% heavy, ${Math.round(c.thunder)}% with thunder). Typical high ${formatTemp(c.avgMax)}, low ${formatTemp(c.avgMin)}.`;
      }
      // checklist / plan B
      const check = [];
      const iss = main.issues;
      if (iss.has('rain') || (main.mode === 'forecast' && maxOf(main.hours.map(h => h.prob), 0) >= 30)) check.push('Tent, canopy or covered area, plus umbrellas and towels for guests');
      if (iss.has('thunder')) check.push('Lightning plan: move everyone indoors or into vehicles if thunder is heard; pause for 30 minutes after the last thunder');
      if (iss.has('heat')) check.push('Fans, shade, plenty of drinking water and king coconuts; schedule speeches in the shade');
      if (iss.has('uv')) check.push('Sunscreen, hats and shaded seating for the midday hours');
      if (iss.has('wind')) check.push('Weigh down tents and decorations; avoid loose balloons and tall banners');
      if (iss.has('cold')) check.push('Shawls or jackets for the cool evening (especially in the hills)');
      if (iss.has('dark')) check.push('Lighting for paths, parking and the venue after sunset');
      if (endMin >= 17 * 60 && !type.indoor) check.push('Mosquito repellent for the evening – dengue mosquitoes bite at dusk');
      (type.tips || []).forEach(t => check.push(t));
      if (poya) check.push('Poya holiday: alcohol and meat sales are not allowed, and temples, roads and venues are busier');
      const planB = [];
      if (main.score < 65 && bestDate && bestDate.date !== date) planB.push(`Move to ${dayName(bestDate.date, { weekday: 'long', day: 'numeric', month: 'short' })} (${bestDate.score}/100).`);
      if (bestTime && bestTime.start !== startMin && bestTime.score > main.score) planB.push(`Shift the start to ${fmtTime(bestTime.start)} (${bestTime.score}/100).`);
      if (!type.indoor) planB.push('Book an indoor or covered fallback venue nearby and agree on a decision time (e.g. 3 hours before).');
      planB.push('Share the plan with guests and re-check this forecast the day before.');
      Plan.last = { id: `ev${Date.now()}`, name, type: type.id, typeName: type.name, loc, locName: loc.name, date, time: $('ev-time').value || '16:00', startMin, dur, flex, score: main.score, verdict, color, summary, better, timeLabel, mode: main.mode, checkedAt: Date.now() };
      // render
      const altHtml = results.length > 1 ? `<h4><i class="fa-solid fa-arrows-left-right"></i> Nearby dates</h4><div class="ev-alts">${results.map(r => { const [v, c] = verdictFor(r.score); return `<button type="button" class="ev-alt ${r.date === date ? 'current' : ''} ${bestDate && r.date === bestDate.date ? 'best' : ''}" data-date="${r.date}" style="--c:${c}"><span>${dayName(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span><strong>${r.score}</strong><small>${r.mode === 'climate' ? 'climate' : v.split(' –')[0]}</small>${isPoya(r.date) ? '<em>Poya</em>' : ''}</button>`; }).join('')}</div>` : '';
      const hoursHtml = main.mode === 'forecast'
        ? `<div class="ev-hours">${main.hours.map((h, i) => `<div class="ev-hour" style="--c:${verdictFor(main.perHour[i].s)[1]}"><span>${hr12(+h.t.slice(11, 13))}</span><i class="fa-solid ${getWeatherInfo(h.code, h.isDay).icon}"></i><strong>${formatTemp(h.temp)}</strong><small>${Math.round(h.prob ?? 0)}%</small></div>`).join('')}</div>`
        : `<div class="ev-clim">${[['Rain day', main.clim.rainDay], ['Heavy rain', main.clim.heavy], ['Thunder', main.clim.thunder]].map(([k, v]) => `<div><span>${k}</span><div class="mini-meter"><i style="width:${Math.round(v)}%;background:${v >= 50 ? '#f97316' : v >= 25 ? '#eab308' : '#22c55e'}"></i></div><strong>${Math.round(v)}%</strong></div>`).join('')}<p class="muted-note">Based on ${main.clim.n} days around this date over the last 10 years. A detailed forecast becomes available 16 days before.</p></div>`;
      box.innerHTML = `
        <div class="ev-head">
          <div class="ev-ring" style="--p:${main.score};--c:${color}"><span>${main.score}</span><small>/100</small></div>
          <div class="ev-meta"><h3><i class="fa-solid ${type.icon}"></i> ${escapeHtml(name)}</h3>
            <p>${escapeHtml(loc.name)} · ${dayName(date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${timeLabel}</p>
            <div class="ev-chips"><span class="ev-chip" style="background:${color}">${verdict}</span><span class="ev-chip soft">${conf}</span>${poya ? '<span class="ev-chip soft">🌕 Poya day</span>' : ''}</div></div>
        </div>
        <p class="ev-summary">${summary}</p>
        ${better ? `<p class="ev-better"><i class="fa-solid fa-lightbulb"></i> ${better}</p>` : ''}
        ${hoursHtml}
        ${iss.size ? `<div class="ev-issues">${[...iss].map(i => `<span><i class="fa-solid ${ISSUE_TEXT[i][0]}"></i> ${ISSUE_TEXT[i][1]}</span>`).join('')}</div>` : ''}
        ${altHtml}
        <div class="ev-two"><div><h4><i class="fa-solid fa-list-check"></i> Checklist</h4><ul>${check.slice(0, 7).map(c => `<li>${c}</li>`).join('')}</ul></div>
          <div><h4><i class="fa-solid fa-life-ring"></i> Plan B</h4><ul>${planB.map(c => `<li>${c}</li>`).join('')}</ul></div></div>
        <div class="ev-actions"><button type="button" class="btn-primary-soft" id="ev-save"><i class="fa-solid fa-bookmark"></i> Save event</button><button type="button" class="btn-soft" id="ev-share"><i class="fa-solid fa-share-nodes"></i> Share</button><button type="button" class="btn-soft" id="ev-ics"><i class="fa-regular fa-calendar-plus"></i> Add to calendar</button></div>`;
      box.querySelectorAll('.ev-alt').forEach(b => b.addEventListener('click', () => { $('ev-date').value = b.dataset.date; runPlanner(); }));
      $('ev-save').addEventListener('click', () => saveEvent(Plan.last));
      $('ev-share').addEventListener('click', () => openShare('event', Plan.last));
      $('ev-ics').addEventListener('click', () => downloadIcs(Plan.last));
    } catch (err) {
      console.warn('planner', err);
      box.innerHTML = `<div class="planner-empty"><i class="fa-solid fa-triangle-exclamation text-amber"></i><p>Couldn't check the weather for that date. ${navigator.onLine === false ? 'You are offline.' : 'Please try again.'}</p></div>`;
    }
  }
  function saveEvent(ev) {
    if (!ev) return;
    const i = savedEvents.findIndex(e => e.name === ev.name && e.date === ev.date && e.loc.name === ev.loc.name);
    const rec = Object.assign({}, ev, { prevScore: i >= 0 ? savedEvents[i].score : null });
    if (i >= 0) savedEvents[i] = rec; else savedEvents.push(rec);
    savedEvents = savedEvents.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-20);
    store.set(EVENTS_KEY, savedEvents);
    renderSavedEvents();
    showToast(`🔖 “${ev.name}” saved – the forecast will be re-checked automatically`, 'success', 2600);
  }
  function downloadIcs(ev) {
    const start = new Date(`${ev.date}T${ev.time}:00+05:30`);
    const end = new Date(start.getTime() + ev.dur * 3600000);
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (s) => String(s).replace(/[\\;,]/g, m => `\\${m}`).replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//lankaweather//Event Planner//EN', 'BEGIN:VEVENT', `UID:${ev.id}@lankaweather`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${esc(ev.name)}`, `LOCATION:${esc(`${ev.loc.name}, Sri Lanka`)}`, `DESCRIPTION:${esc(`${ev.typeName}. Weather score ${ev.score}/100 (${ev.verdict}). ${ev.summary || ''}`)}`, 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Check the weather for ${ev.name}`)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `${ev.name.replace(/\W+/g, '-').toLowerCase() || 'event'}.ics`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function renderSavedEvents() {
    const box = $('saved-events');
    if (!box) return;
    const today = todayStr();
    const list = savedEvents.filter(e => e.date >= addDays(today, -1));
    if (!list.length) { box.innerHTML = '<p class="muted-note">No saved events yet. Check an event above and press “Save event” to track its forecast.</p>'; return; }
    box.innerHTML = list.map(e => {
      const [v, c] = verdictFor(e.score);
      const n = daysBetween(today, e.date);
      const trend = isNum(e.prevScore) && e.prevScore !== e.score ? (e.score > e.prevScore ? `<span class="trend up"><i class="fa-solid fa-arrow-trend-up"></i> +${e.score - e.prevScore}</span>` : `<span class="trend down"><i class="fa-solid fa-arrow-trend-down"></i> ${e.score - e.prevScore}</span>`) : '';
      const t = EVENT_TYPES.find(x => x.id === e.type) || EVENT_TYPES[0];
      return `<article class="saved-event" style="--c:${c}" data-id="${e.id}">
        <div class="se-score"><strong>${e.score}</strong><small>/100</small></div>
        <div class="se-main"><h4><i class="fa-solid ${t.icon}"></i> ${escapeHtml(e.name)}</h4><p>${escapeHtml(e.loc.name)} · ${dayName(e.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${escapeHtml(e.timeLabel)}</p>
          <p class="se-status">${n === 0 ? '<strong>Today!</strong>' : n === 1 ? 'Tomorrow' : n > 0 ? `In ${n} days` : 'Finished'} · ${v} ${trend} <small>${e.mode === 'climate' ? '(climate odds)' : `checked ${timeAgo(e.checkedAt)}`}</small></p></div>
        <div class="se-actions"><button type="button" data-act="open" title="Open"><i class="fa-solid fa-magnifying-glass-chart"></i></button><button type="button" data-act="share" title="Share"><i class="fa-solid fa-share-nodes"></i></button><button type="button" data-act="ics" title="Add to calendar"><i class="fa-regular fa-calendar-plus"></i></button><button type="button" data-act="del" title="Delete"><i class="fa-solid fa-trash"></i></button></div>
      </article>`;
    }).join('');
  }
  async function recheckEvents() {
    const today = todayStr();
    const due = savedEvents.filter(e => e.date >= today && daysBetween(today, e.date) <= 15 && Date.now() - (e.checkedAt || 0) > 2 * 3600000).slice(0, 6);
    if (!due.length || navigator.onLine === false) return;
    let changed = false;
    for (const e of due) {
      try {
        const fc = await planForecast(e.loc);
        const hrs = windowHours(fc, e.date, e.startMin, e.dur);
        if (!hrs) continue;
        const type = EVENT_TYPES.find(t => t.id === e.type) || EVENT_TYPES[0];
        const w = scoreWindow(hrs, type);
        const [v, c] = verdictFor(w.score);
        if (w.score !== e.score) { e.prevScore = e.score; changed = true; }
        Object.assign(e, { score: w.score, verdict: v, color: c, mode: 'forecast', checkedAt: Date.now() });
        if (isNum(e.prevScore) && e.prevScore - w.score >= 15) showToast(`⚠️ Forecast worsened for “${e.name}” (${e.prevScore} → ${w.score})`, 'warning', 6000);
      } catch (err) { /* keep old score */ }
    }
    store.set(EVENTS_KEY, savedEvents);
    if (changed || due.length) renderSavedEvents();
  }
  function initPlanner() {
    $('ev-type').innerHTML = EVENT_TYPES.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    $('ev-dur').innerHTML = [1, 2, 3, 4, 5, 6, 8, 10, 12].map(h => `<option value="${h}" ${h === 4 ? 'selected' : ''}>${h} hour${h > 1 ? 's' : ''}</option>`).join('');
    const t = todayStr();
    $('ev-date').min = t; $('ev-date').max = addDays(t, 365);
    $('ev-date').value = addDays(t, 7);
    $('planner-form').addEventListener('submit', runPlanner);
    $('ev-loc-btn').addEventListener('click', () => { Plan.loc = null; Plan.loc = planLoc(); updatePlanLoc(); });
    $('saved-events').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const ev = savedEvents.find(x => x.id === b.closest('.saved-event').dataset.id); if (!ev) return;
      if (b.dataset.act === 'del') { savedEvents = savedEvents.filter(x => x !== ev); store.set(EVENTS_KEY, savedEvents); renderSavedEvents(); }
      else if (b.dataset.act === 'share') openShare('event', ev);
      else if (b.dataset.act === 'ics') downloadIcs(ev);
      else if (b.dataset.act === 'open') {
        Plan.loc = ev.loc; updatePlanLoc();
        $('ev-name').value = ev.name; $('ev-type').value = ev.type; $('ev-date').value = ev.date; $('ev-time').value = ev.time; $('ev-dur').value = ev.dur; $('ev-flex').value = ev.flex;
        runPlanner();
        $('planner-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    updatePlanLoc();
    renderSavedEvents();
  }
  function updatePlanLoc() {
    const l = planLoc();
    $('ev-loc-label').textContent = `${l.name}${l.name !== l.district ? ` (${l.district})` : ''}`;
    const cur = activeLoc();
    const same = Plan.loc ? Plan.loc.key === cur.key : true;
    $('ev-loc-btn').querySelector('span').textContent = same ? 'Use selected' : `Use ${cur.name}`;
  }

  // ------------------------------------------------------------------------
  // Feature 35 · Global weather news & updates
  // ------------------------------------------------------------------------
  const NEWS_KEY = 'lanka_weather_news_v1';
  const WORLD_CITIES = [
    ['Colombo', 6.93, 79.85, '🇱🇰'], ['Dubai', 25.2, 55.27, '🇦🇪'], ['Doha', 25.29, 51.53, '🇶🇦'], ['Riyadh', 24.71, 46.68, '🇸🇦'], ['Kuwait City', 29.38, 47.99, '🇰🇼'],
    ['Muscat', 23.59, 58.41, '🇴🇲'], ['Malé', 4.18, 73.51, '🇲🇻'], ['Chennai', 13.08, 80.27, '🇮🇳'], ['New Delhi', 28.61, 77.21, '🇮🇳'], ['Singapore', 1.35, 103.82, '🇸🇬'],
    ['Kuala Lumpur', 3.14, 101.69, '🇲🇾'], ['Seoul', 37.57, 126.98, '🇰🇷'], ['Tokyo', 35.68, 139.69, '🇯🇵'], ['Sydney', -33.87, 151.21, '🇦🇺'], ['Melbourne', -37.81, 144.96, '🇦🇺'],
    ['London', 51.51, -0.13, '🇬🇧'], ['Rome', 41.9, 12.5, '🇮🇹'], ['Paris', 48.86, 2.35, '🇫🇷'], ['Toronto', 43.65, -79.38, '🇨🇦'], ['New York', 40.71, -74.01, '🇺🇸']
  ];
  const GDACS_TYPES = { TC: ['Cyclones', 'fa-hurricane'], FL: ['Floods', 'fa-house-flood-water'], DR: ['Drought', 'fa-sun-plant-wilt'], WF: ['Wildfires', 'fa-fire'], VO: ['Volcanoes', 'fa-volcano'] };
  const EONET_ICON = { severeStorms: 'fa-hurricane', floods: 'fa-house-flood-water', wildfires: 'fa-fire', volcanoes: 'fa-volcano', dustHaze: 'fa-smog', snow: 'fa-snowflake', seaLakeIce: 'fa-icicles', drought: 'fa-sun-plant-wilt', tempExtremes: 'fa-temperature-high', landslides: 'fa-hill-rockslide', earthquakes: 'fa-house-crack', waterColor: 'fa-water', manmade: 'fa-industry' };
  const News = Object.assign({ gdacs: null, eonet: null, world: null, at: 0, tab: 'disasters', filter: 'all', status: 'idle' }, store.get(NEWS_KEY, {}) || {});
  News.tab = 'disasters'; News.filter = 'all';
  const kmFromSL = (lat, lon) => haversineKm(SL_CENTRE.lat, SL_CENTRE.lon, lat, lon);

  async function loadNews(force) {
    if (!force && News.at && Date.now() - News.at < 30 * 60000 && News.gdacs) return;
    if (navigator.onLine === false) { News.status = News.gdacs ? 'cache' : 'error'; return; }
    News.status = 'loading';
    const from = addDays(todayStr(), -21);
    const [g, e, w] = await Promise.allSettled([
      fetchJSON(`https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;DR;WF;VO&alertlevel=Green;Orange;Red&fromdate=${from}`, { timeout: 20000 }),
      fetchJSON('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=80', { timeout: 20000 }),
      fetchJSON(`${API.forecast}?latitude=${WORLD_CITIES.map(c => c[1]).join(',')}&longitude=${WORLD_CITIES.map(c => c[2]).join(',')}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day,precipitation&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`, { timeout: 20000 })
    ]);
    if (g.status === 'fulfilled') {
      News.gdacs = (g.value.features || []).map(f => {
        const p = f.properties, c = f.geometry && f.geometry.coordinates;
        return { type: p.eventtype, name: p.name, level: p.alertlevel, score: p.alertscore, country: p.country || (p.affectedcountries || []).map(a => a.countryname).join(', '), from: `${p.fromdate}Z`, to: `${p.todate}Z`, current: String(p.iscurrent) === 'true', sev: p.severitydata && p.severitydata.severitytext, url: p.url && p.url.report, lat: c ? c[1] : null, lon: c ? c[0] : null, desc: p.description };
      }).filter(x => x.name);
    }
    if (e.status === 'fulfilled') {
      News.eonet = (e.value.events || []).map(ev => {
        const geo = ev.geometry && ev.geometry[ev.geometry.length - 1];
        let lat = null, lon = null;
        if (geo) { const c = geo.type === 'Point' ? geo.coordinates : geo.coordinates && geo.coordinates[0] && geo.coordinates[0][0]; if (c) { lon = c[0]; lat = c[1]; } }
        return { title: ev.title, cat: ev.categories[0].id, catTitle: ev.categories[0].title, date: geo ? geo.date : null, mag: geo && geo.magnitudeValue ? `${geo.magnitudeValue} ${geo.magnitudeUnit || ''}` : '', url: ev.sources && ev.sources[0] && ev.sources[0].url, lat, lon };
      });
    }
    if (w.status === 'fulfilled') {
      News.world = [].concat(w.value).map((p, i) => ({ name: WORLD_CITIES[i][0], flag: WORLD_CITIES[i][3], cur: p.current, max: p.daily.temperature_2m_max[0], min: p.daily.temperature_2m_min[0], tz: p.timezone, offset: p.utc_offset_seconds }));
    }
    const ok = [g, e, w].some(r => r.status === 'fulfilled');
    if (ok) { News.at = Date.now(); store.set(NEWS_KEY, { gdacs: News.gdacs, eonet: News.eonet, world: News.world, at: News.at }); }
    News.status = ok ? 'live' : (News.gdacs ? 'cache' : 'error');
  }

  function nearEvents() {
    const out = [];
    (News.gdacs || []).forEach(x => { if (isNum(x.lat) && x.current && ['TC', 'FL'].includes(x.type)) { const km = kmFromSL(x.lat, x.lon); if (km < 2000) out.push({ km, title: x.name, level: x.level, type: x.type, sev: x.sev, url: x.url }); } });
    (News.eonet || []).forEach(x => { if (isNum(x.lat) && ['severeStorms', 'floods'].includes(x.cat)) { const km = kmFromSL(x.lat, x.lon); if (km < 2000 && !out.some(o => o.title.toUpperCase().includes(x.title.split(' ').pop().toUpperCase()))) out.push({ km, title: x.title, level: 'Green', type: x.cat === 'floods' ? 'FL' : 'TC', sev: x.mag, url: x.url }); } });
    return out.sort((a, b) => a.km - b.km);
  }
  function cycloneAlerts() {
    const near = nearEvents().filter(n => n.type === 'TC' && n.km < 1200);
    if (!near.length) return [];
    const n = near[0];
    return [{
      id: 'cyclone', level: n.km < 600 || n.level === 'Red' ? 'red' : 'amber', icon: 'fa-hurricane', title: 'Cyclone Watch – Bay of Bengal / Arabian Sea',
      districts: SRI_LANKA_DISTRICTS.map(d => d.name),
      message: `${n.title} is about ${Math.round(n.km).toLocaleString()} km from Sri Lanka${n.sev ? ` (${n.sev})` : ''}. Expect rough seas, strong winds and heavy rain if it moves closer.`,
      advice: ['Fishers and naval communities should not go to sea until the Met Department gives the all-clear.', 'Follow Department of Meteorology and DMC (117) bulletins.', 'Prepare an emergency kit: torch, radio, water, medicines and documents.']
    }];
  }
  function newsCard({ icon, title, level, meta, desc, url, km, time }) {
    const lc = level === 'Red' ? 'lv-red' : level === 'Orange' ? 'lv-orange' : 'lv-green';
    return `<article class="news-item ${lc}">
      <span class="ni-icon"><i class="fa-solid ${icon}"></i></span>
      <div class="ni-main"><h4>${escapeHtml(title)}</h4><p class="ni-meta">${meta}</p>${desc ? `<p class="ni-desc">${escapeHtml(desc)}</p>` : ''}</div>
      <div class="ni-side">${level ? `<span class="ni-level">${level}</span>` : ''}${isNum(km) ? `<small>${Math.round(km).toLocaleString()} km from SL</small>` : ''}${time ? `<small>${time}</small>` : ''}${url ? `<a href="${url}" target="_blank" rel="noopener">Details <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}</div>
    </article>`;
  }
  function renderNews() {
    const st = $('news-status');
    if (!st) return;
    st.innerHTML = News.status === 'live' ? `<i class="fa-solid fa-circle-check"></i> Updated ${timeAgo(News.at)}` : News.status === 'cache' ? `<i class="fa-solid fa-box-archive"></i> Saved from ${timeAgo(News.at)}` : News.status === 'loading' ? '<i class="fa-solid fa-spinner fa-spin"></i> Loading news…' : '<i class="fa-solid fa-triangle-exclamation"></i> News needs an internet connection';
    // near Sri Lanka
    const near = nearEvents();
    $('news-near').innerHTML = near.length
      ? `<div class="near-banner ${near[0].km < 1000 ? 'urgent' : ''}"><i class="fa-solid fa-location-crosshairs"></i><div><strong>Near Sri Lanka:</strong> ${near.slice(0, 3).map(n => `${escapeHtml(n.title)} – ${Math.round(n.km).toLocaleString()} km away${n.sev ? ` (${escapeHtml(n.sev)})` : ''}`).join(' · ')}</div></div>`
      : (News.gdacs ? '<div class="near-banner calm"><i class="fa-solid fa-shield-halved"></i><div><strong>Near Sri Lanka:</strong> no active cyclones or major floods within 2,000 km.</div></div>' : '');
    // headlines
    const heads = [];
    const tcs = (News.gdacs || []).filter(x => x.type === 'TC' && x.current);
    if (tcs.length) {
      const strongest = tcs.slice().sort((a, b) => (b.score || 0) - (a.score || 0) || ((parseFloat((b.sev || '').match(/(\d+) km\/h/) ? (b.sev.match(/(\d+) km\/h/)[1]) : 0)) - parseFloat((a.sev || '').match(/(\d+) km\/h/) ? a.sev.match(/(\d+) km\/h/)[1] : 0)))[0];
      heads.push(['fa-hurricane', `${tcs.length} active tropical cyclone${tcs.length > 1 ? 's' : ''} worldwide – most serious: ${strongest.name.replace('Tropical Cyclone ', '')}${strongest.country ? ` (${strongest.country})` : ''}${strongest.sev ? `, ${(strongest.sev.match(/maximum wind speed of [^)]+/) || [''])[0]}` : ''}`]);
    }
    const floods = (News.gdacs || []).filter(x => x.type === 'FL').map(x => x.country).filter(Boolean);
    if (floods.length) heads.push(['fa-house-flood-water', `Flooding reported in ${[...new Set(floods)].slice(0, 5).join(', ')}`]);
    const red = (News.gdacs || []).filter(x => x.level === 'Red');
    if (red.length) heads.push(['fa-circle-exclamation', `Red alert: ${red.slice(0, 2).map(x => x.name).join(' · ')}`]);
    if (News.world && News.world.length) {
      const w = News.world.filter(c => c.cur && isNum(c.cur.temperature_2m));
      const hot = w.slice().sort((a, b) => b.cur.temperature_2m - a.cur.temperature_2m)[0], cold = w.slice().sort((a, b) => a.cur.temperature_2m - b.cur.temperature_2m)[0];
      if (hot) heads.push(['fa-temperature-high', `Hottest city on our list right now: ${hot.flag} ${hot.name} ${formatTemp(hot.cur.temperature_2m)} · coolest: ${cold.flag} ${cold.name} ${formatTemp(cold.cur.temperature_2m)}`]);
      const storms = w.filter(c => c.cur.weather_code >= 95).map(c => c.name);
      if (storms.length) heads.push(['fa-cloud-bolt', `Thunderstorms now in ${storms.join(', ')}`]);
    }
    const fires = (News.eonet || []).filter(x => x.cat === 'wildfires').length;
    if (fires) heads.push(['fa-fire', `${fires} active wildfires tracked by NASA satellites`]);
    $('news-headlines').innerHTML = heads.length ? `<div class="headline-ticker">${heads.map(([i, t]) => `<p><i class="fa-solid ${i}"></i> ${escapeHtml(t)}</p>`).join('')}</div>` : '';
    // filters
    const fbox = $('news-filter');
    const filters = News.tab === 'disasters' ? [['all', 'All']].concat(Object.entries(GDACS_TYPES).map(([k, v]) => [k, v[0]])) : News.tab === 'eonet' ? [['all', 'All']].concat([...new Set((News.eonet || []).map(x => x.cat))].map(c => [c, (News.eonet.find(x => x.cat === c) || {}).catTitle || c])) : [];
    fbox.innerHTML = filters.map(([k, v]) => `<button type="button" class="pick-chip ${News.filter === k ? 'on' : ''}" data-f="${k}">${v}</button>`).join('');
    // disasters
    const levelRank = { Red: 3, Orange: 2, Green: 1 };
    const dis = (News.gdacs || []).filter(x => News.filter === 'all' || News.tab !== 'disasters' || x.type === News.filter)
      .sort((a, b) => (levelRank[b.level] || 0) - (levelRank[a.level] || 0) || (b.to > a.to ? 1 : -1)).slice(0, 30);
    $('news-disasters').innerHTML = News.gdacs ? (dis.length ? dis.map(x => newsCard({
      icon: (GDACS_TYPES[x.type] || ['', 'fa-triangle-exclamation'])[1], title: x.name, level: x.level,
      meta: `${x.country ? `${escapeHtml(x.country)} · ` : ''}${new Date(x.from).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} – ${x.current ? 'ongoing' : new Date(x.to).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`,
      desc: x.sev, url: x.url, km: isNum(x.lat) ? kmFromSL(x.lat, x.lon) : null, time: timeAgo(new Date(x.to).getTime())
    })).join('') : '<p class="muted-note">No events in this category.</p>') : '<p class="muted-note">Disaster alerts unavailable.</p>';
    const eo = (News.eonet || []).filter(x => News.filter === 'all' || News.tab !== 'eonet' || x.cat === News.filter)
      .sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1).slice(0, 30);
    $('news-eonet').innerHTML = News.eonet ? (eo.length ? eo.map(x => newsCard({
      icon: EONET_ICON[x.cat] || 'fa-earth-asia', title: x.title, level: '', meta: `${escapeHtml(x.catTitle)}${x.mag ? ` · ${escapeHtml(x.mag)}` : ''}`,
      url: x.url, km: isNum(x.lat) ? kmFromSL(x.lat, x.lon) : null, time: x.date ? timeAgo(new Date(x.date).getTime()) : ''
    })).join('') : '<p class="muted-note">No events in this category.</p>') : '<p class="muted-note">NASA events unavailable.</p>';
    // world
    $('news-world').innerHTML = News.world ? News.world.map(c => {
      const info = getWeatherInfo(c.cur.weather_code, c.cur.is_day === 1);
      const local = new Date(Date.now() + (c.offset || 0) * 1000).toISOString().slice(11, 16);
      return `<article class="world-card ${c.name === 'Colombo' ? 'home' : ''}"><header><span class="flag">${c.flag}</span><h4>${c.name}</h4><small>${local}</small></header>
        <div class="wc-now"><i class="fa-solid ${info.icon}" style="color:${info.color}"></i><strong>${formatTemp(c.cur.temperature_2m)}</strong></div>
        <p>${info.label}</p><p class="wc-sub">${formatTemp(c.max)} / ${formatTemp(c.min)} · 💧${Math.round(c.cur.relative_humidity_2m)}% · 💨${formatWind(c.cur.wind_speed_10m)}</p></article>`;
    }).join('') : '<p class="muted-note">World weather unavailable.</p>';
    ['disasters', 'eonet', 'world'].forEach(t => $(`news-${t}`).classList.toggle('hidden', News.tab !== t));
    document.querySelectorAll('#news-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === News.tab));
  }
  function initNews() {
    $('news-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; News.tab = b.dataset.tab; News.filter = 'all'; renderNews(); });
    $('news-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; News.filter = b.dataset.f; renderNews(); });
  }

  // ------------------------------------------------------------------------
  // Wiring into V4's lifecycle
  // ------------------------------------------------------------------------
  function wrap(name, fn) {
    const orig = V4[name];
    V4[name] = function (...args) { const r = orig ? orig.apply(this, args) : undefined; safe(name, () => fn(...args)); return r; };
  }
  const origAlerts = V4.floodAlerts;
  V4.floodAlerts = function () {
    const base = origAlerts ? origAlerts() : [];
    return base.concat(safe('health-alerts', healthAlerts) || [], safe('cyclone-alerts', cycloneAlerts) || []);
  };
  let locTimer = null;
  function onLocation() {
    clearTimeout(locTimer);
    locTimer = setTimeout(() => {
      renderHealth().catch(e => console.warn(e));
      safe('planner-loc', updatePlanLoc);
      if (!$('share-modal-backdrop').classList.contains('hidden')) safe('share', syncShareUI);
    }, 60);
  }
  let ready = false;
  wrap('onLocationChange', () => { if (ready) onLocation(); });
  wrap('onDataRefresh', (opts = {}) => { if (ready) v5Refresh(opts); });
  function v5Refresh(opts = {}) {
    const force = !!(opts.manual || opts.isAuto);
    onLocation();
    Promise.all([loadFrost(force), loadSnow(force)]).then(() => safe('ice', renderIce));
    loadNews(force).then(() => { safe('news', renderNews); if (typeof updateAlerts === 'function') updateAlerts(); });
    recheckEvents();
    // hail info depends on the radar grid, which loads separately
    setTimeout(() => safe('ice', renderIce), 8000);
  }
  wrap('onUnitsChange', () => { if (!ready) return; renderHealth(); safe('ice', renderIce); safe('news', renderNews); });

  function init() {
    safe('share-init', initShare);
    safe('planner-init', initPlanner);
    safe('news-init', initNews);
    renderHealthConditions();
    $('health-conditions').addEventListener('click', (e) => {
      const b = e.target.closest('.pick-chip'); if (!b) return;
      const id = b.dataset.id;
      healthConds = healthConds.includes(id) ? healthConds.filter(c => c !== id) : healthConds.concat(id);
      store.set(HEALTH_KEY, healthConds);
      renderHealthConditions(); renderHealth();
    });
    ready = true;
    safe('deeplink', applyDeepLink);
    if (News.gdacs) safe('news', renderNews);
    if (Ice.frost || Ice.snow) safe('ice', renderIce);
    v5Refresh();
  }
  Object.assign(V5, { Health, Ice, News, Share, Plan, EVENT_TYPES, HEALTH_RISKS, openShare, runPlanner, shareText, nearEvents, isPoya });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
