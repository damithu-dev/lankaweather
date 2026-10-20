# ලංකාweather – Sri Lanka National Weather & Meteorology Portal

An interactive, responsive Sri Lanka weather portal built with **HTML5, CSS3 and vanilla JavaScript**.
Live data comes from **Open-Meteo** (forecast, air quality, marine and historical archive APIs). No API key is needed.

---

## 🇱🇰 Branding
- The **official national flag of Sri Lanka** (full lion artwork, Wikimedia Commons, public domain) is embedded inline in `index.html`, so it shows even offline. `sl-flag.svg` is the same flag and is used as the favicon.
- **ලංකා** is filled with the flag's green `#00534E`, saffron `#EB7400` and maroon `#8D153A` bands and outlined in gold `#FFBE29`.

## ✨ The 20 features

| # | Feature | What it does |
|---|---------|--------------|
| 1 | **Smart location search – every city, suburb & village** | Search **35,500+ places**: all 25 districts, 45 cities, 2,100+ postal towns, suburbs, 16,700 villages, 9,900 Grama Niladhari divisions, estates and landmarks. Works in English, Sinhala or Tamil, by **postcode** (e.g. `10280`), and handles spelling variants (Dehiwela → Dehiwala, Kithagama/Kitagama, Wavuniya → Vavuniya). Each result shows its DS division, district and province. Not listed? **“Search online maps”** looks it up on OpenStreetMap. The 📍 GPS button shows the forecast for your exact position (“Near Pita Kotte”). |
| 2 | **Current weather** | Temperature, feels-like, condition (with day/night icons), humidity, wind, rain, UV, pressure, visibility, cloud cover and dew point, each with a plain-language status. |
| 3 | **Hourly forecast** | 24-hour slider with temperature, rain chance and wind. |
| 4 | **7-day forecast** | Daily high/low, condition, rain chance and expected rainfall. |
| 5 | **Dark / light mode** | Remembered between visits, follows your system setting the first time, and re-colours the charts. |
| 6 | **Interactive charts** | Temperature, rainfall (with rain-chance line), wind and humidity tabs. |
| 7 | **Favourites** | Star any district, town or village (map panel, hero card or “Save” button). Saved on your device, up to 12, shown with live temperatures. |
| 8 | **Interactive map** | Real district borders, click to zoom, drag to pan, **Heatmap / Rain / Wind layers** with legend and wind-direction arrows. The province filter dims the other districts. |
| 9 | **Alerts & notifications** | Alerts generated automatically for thunderstorms, heavy rain, landslide risk (NBRO 75 mm threshold), strong wind, heat, extreme UV and poor air. The Alerts Center lists affected districts, safety advice and hotlines. Optional browser notifications for your selected and favourite districts. |
| 10 | **Unit conversion** | °C/°F, plus a units menu for wind (km/h, mph, m/s, knots), rain (mm/in) and pressure (hPa/inHg). |
| 11 | **Weather assistant** | Chat that answers from the live data: rain timing, what to wear, hiking safety, sea conditions, AQI, sunrise/moon, rankings ("hottest district"), comparisons ("Colombo vs Jaffna") and tomorrow's or the week's outlook. It recognises districts and tourist spots in your question. It runs entirely in your browser. |
| 12 | **Clothing & activities** | Outfit suggestions and scores out of 10 for beach, hiking, cricket/sports and laundry drying, plus the district's climate zone. |
| 13 | **Sunrise, sunset & daylight** | Moving sun on a daylight bar, day length, sunset/sunrise countdown, moon phase and the next **Poya** (full moon, approximate). |
| 14 | **Air quality** | Live US AQI with PM2.5, PM10, NO₂ and O₃. The dial colour changes with the AQI category, with health advice. |
| 15 | **Animated backgrounds** | Canvas scenes for clear days (sun rays), clear nights (stars), clouds, drizzle, rain, storms (lightning flashes) and fog. They pause when the tab is hidden and respect "reduce motion". |
| 16 | **Historical data** | 10-year (ERA5) monthly normals for the selected district: today vs normal, monthly rainfall normal vs the 7-day forecast, monthly records, the same day in each of the last 3 years, and a climate chart. |
| 17 | **Responsive design** | Tuned for phones, tablets and desktops, with no sideways scrolling at 390 px wide. |
| 18 | **Offline mode** | The last good data is saved on your device and shown when you're offline, with an offline banner. Refreshes automatically when you reconnect. `sw.js` caches the app so it opens offline (when served over http/https). |
| 19 | **Error handling & loading** | Loading bar in flag colours, skeleton placeholders, request timeouts and retries, a status chip (Live / Saved / Sample), dismissible toasts and friendly messages. |
| 20 | **City comparison** | Any two districts side by side, with the higher values highlighted, a one-line summary, the distance apart and a 24-hour temperature chart. Includes a swap button. |

## 🆕 Features 21–29 + rainfall radar (v4)

| # | Feature | What it does |
|---|---------|--------------|
| ★ | **Rainfall radar & precipitation tracking** | **Observed radar** (RainViewer, last ~2 h in 10-minute frames) plus a **model rainfall layer** from a 150-point grid over the island (yesterday, today and tomorrow, hour by hour). The **Rain tracker** shows how much of the island is raining, where the heaviest cell is, which way the rain is moving and how fast, the 24 h total at your location, and an 8-hour rain bar chart for the selected place. |
| 21 | **Forecast accuracy tracker** | Compares the forecasts issued 1, 2 and 3 days ahead with what happened over the past 7 days (Open-Meteo previous-runs archive): temperature error, warm/cool bias, rain/no-rain hit rate, an overall reliability %, a chart and a day-by-day ✓ / ≈ / ✗ table. |
| 22 | **Wind speed & direction** | Animated compass, Beaufort force (0–12) badge and bar with real-world descriptions, gusts, today's maximum, sea breeze vs land breeze for coastal districts, monsoon context, and a 24 h chart whose arrow markers point the way the wind blows. Wind arrows also appear on the radar map. |
| 23 | **Lightning map** | Flashing ⚡ storm cells on the map (thunderstorm forecast, plus "possible" cells from high storm energy), a **Storm energy (CAPE)** layer, the districts likely to get thunderstorms in the next 12 h, when storms could reach your location, and the 30/30 safety rule. Live Blitzortung strikes are plotted when that community feed can be reached. Most browsers block it, so the forecast cells are used instead. |
| 24 | **Flood risk monitoring** | A 0–100 score for every district and for the exact place you choose. It is built from the last 3 days of rain, the next 3 days of forecast rain and GloFAS river discharge compared with normal, and weighted for flood-prone basins (Kelani, Kalu, Gin, Nilwala, Mahaweli and others). The card has advice, a rain + river-flow chart and the island's top-5 districts. There is a **Flood risk** map layer, and High/Severe districts are added to the Alerts Center. |
| 25 | **UV index & sun protection** | UV gauge, today's peak and its time, the "protect" window (UV ≥ 3), **minutes-to-sunburn for your skin type (I–VI)**, tailored advice (SPF, shade hours, beach reflection, altitude, clouds, babies, vitamin D) and a colour-coded 24 h UV chart. There is also a UV map layer. |
| 26 | **Weather timeline playback** | Play / pause (space bar), step, **Now** and speed controls. The slider runs through 72 hourly frames (past 24 h → next 48 h) for every model layer, or through the observed radar frames, and has day / noon / now markers. |
| 27 | **Personalised dashboard** | The **My Day** card greets you by name and covers your home location: an umbrella call, morning and evening commute weather, sunburn time, your favourite activities' scores and best times, and flood / lightning / alert status. The **My Dashboard** button opens settings for name, home, commute times, activities, show/hide and reorder every section, and compact layout. Settings are saved on your device. |
| 28 | **Travel & outdoor activities** | 12 activities (beach, surfing, hiking, cycling, cricket, temples, safari, scenic train, photography, boat trips, whale watching, road trips), each scored 0–10 for the next 6 hours, with reasons and the **best 2-hour window in the next 48 h**. Season-aware for surfing and whale watching, and uses sea state for sea activities. **Roads & rail**: 10 main routes (A1, E01, A5, A9, A6, A4, Ella–Arugam Bay, Main Line and Coastal Line trains) rated Good / Caution / Hazardous from conditions at every waypoint (rain, thunder, fog, gusts, landslide risk), with the driest departure time. |
| 29 | **Weather data layers & map overlays** | Base layers: observed radar, rainfall, 24 h rainfall total, temperature, wind, clouds, storm energy, UV and flood risk. Overlays: wind arrows, lightning, town labels and district borders, plus an opacity slider and legend. Hover anywhere to read values, or click to open that exact spot's forecast. |


## 🆕 Features 31–35 (v5)
| # | Feature | What you get |
|---|---|---|
| 31 | **Weather-based health & allergy alerts** | 10 risk cards for the next 3 days, each with a Low → Very high level, the reason and practical advice: dengue mosquito breeding, leptospirosis (rat fever), dust & mould allergies, asthma & breathing, heat stress, sunburn & eye damage, colds & flu, joint pain, migraine triggers (pressure swings) and food & water safety. **"Tailor to me"** chips (asthma, allergies, migraine, arthritis, heart, over 65, babies, pregnant, outdoor worker) raise the matching risks by one level and highlight them. Island-wide **dengue** and **leptospirosis** alerts are added to the Alerts Center. Pollen is not measured in Sri Lanka, so allergy risk is estimated from dust, PM10/PM2.5, damp hours and wind. |
| 32 | **Snowfall & ice monitoring** | Snow has never been recorded in Sri Lanka, so this covers what does happen. **Frost watch**: a 7-night ground-frost table for 7 hill-country stations (Pidurutalagala, Horton Plains, Ambewela, Kandapola, Nuwara Eliya, Haputale, Bandarawela), using the minimum temperature, cloud and wind. **Hail risk**: districts with hail-producing thunderstorms in the next 48 h (click to open). **Freezing level** above Pidurutalagala. **Global snow & ice watch**: snow on the ground, a 7-day snowfall bar chart and black-ice risk for 15 places Sri Lankans travel to, study or work in (Everest Base Camp, Gulmarg, Manali, Seoul, Sapporo, Tokyo, Beijing, Zermatt, Queenstown and more). |
| 33 | **Sharing on social media** | A **Share** button on the hero card and My Day opens a share studio. It draws a **1200×630 forecast image** in Sri Lankan flag colours and writes a ready-made message in **English, සිංහල or தமிழ்**. Choose Today, 3 days, Alerts or a planned Event. Share to WhatsApp, Facebook, X, Telegram, Viber or email, use your phone's share menu (with the image), copy the text or link, or save the PNG. Links (`?d=District` or `?p=place`) open the app at the same place. |
| 34 | **Smart weather-based event planner** | Pick an event type (12 types, including outdoor wedding/homecoming, cricket match, beach party, pinkama/dansala/perahera, hike, photo shoot and indoor hall), a location, date, time, duration and flexibility. You get a **0–100 weather score** with a verdict (Great / Good / Fair / Risky / Poor) and a confidence level, hour-by-hour conditions, a **better start time** and **better nearby dates**, issues (rain, thunder, heat, UV, wind, dark), a checklist, a **Plan B** and a 🌕 **Poya-day note**. Up to 16 days ahead it uses the hourly forecast. Further ahead it uses **10 years of climate history** for that date. Events can be **saved** (re-checked automatically, with a warning if the forecast gets worse), **added to your calendar (.ics)** or shared. |
| 35 | **Global weather news & updates** | Live disaster alerts from **GDACS** (tropical cyclones, floods, drought, wildfires, volcanoes, with Green/Orange/Red levels), **NASA EONET** Earth events, and a **World weather now** board for Colombo and 19 cities where Sri Lankans live and work (Gulf, Maldives, India, East Asia, Australia, Europe, Canada, USA). Auto-generated headlines, a **"Near Sri Lanka"** banner (events within 2,000 km), distance from Sri Lanka on every item, and filters. A tropical cyclone within 1,200 km adds a **Cyclone Watch** to the Alerts Center. Refreshes every 30 minutes and is cached for offline use. |

**Typography:** the whole site now uses serif fonts: **Noto Serif** for text, **Fraunces** for headings and numbers, and **Noto Serif Sinhala / Tamil** for local scripts, including inside the charts.

**Also included:** a live marine bulletin (wave height and sea state for each of the 7 sea areas), an auto-sync countdown (interval adjustable – see v6), Sri Lanka time clock and emergency hotlines.

## ⚡ Dynamic features (v6)
All 20 "dynamic side" ideas are in `app-v6.js`. Code comments call them **Dynamic 1–20**. Settings are in the **⚙ gear** on the header *Live Sync* pill and are saved in your browser.

| # | Idea | How it works in ලංකාweather |
|---|---|---|
| 1 | Real-time updates without reloading | Data refreshes in the background, with no page reload. A **▲/▼ change chip** appears next to the temperature, districts whose weather changed **pulse on the map**, a "Live update" bubble summarises the changes, and "x min ago" labels keep counting. |
| 2 | Live map updates with animated transitions | The map is updated in place: district colours **fade** to new values, pin numbers **count** to new values, and a light **sweep** runs across the map when you change layer. |
| 3 | Map markers with weather pop-ups | Click a district or pin to open a **pop-up** with now, feels-like, high/low, rain chance, wind arrow, humidity, AQI and the next 6 hours, plus **Full forecast / Save / Compare** buttons. It stays attached to the pin while you zoom. On phones it docks at the bottom. Close it with Esc. |
| 4 | Backgrounds that follow the weather | A sky layer **cross-fades** with the weather (clear, cloudy, rain, storm, fog…) and the time of day (**dawn, day, dusk, night**), worked out from the real sunrise and sunset. |
| 5 | Animated rain, snow, lightning & clouds | The canvas shows raindrops with **splashes**, drifting clouds, fog banks, **snowflakes** and branching **lightning bolts**. The hero weather icon is animated too. A **Weather effects** picker lets you force Rain, Storm, Snow, Fog, Clouds or Sunny, or turn effects **Off**. |
| 6 | Animated temperature counters | Hero numbers **count** to their new values and flash red (rising) or blue (falling). |
| 7 | Draggable hourly timeline | A **48-hour slider** with a temperature-coloured track and rain ticks. Drag it, use the arrow keys, press ▶ **Play**, or jump to **Now / +3 h / This evening / Tomorrow 8 AM**. The hour cards and the chart follow along. Click a card or a chart point to select that hour. You can drag-scroll the cards with a mouse. |
| 8 | Charts that update when you pick a city | The hourly chart (and the comparison chart) **animate to the new data** instead of being rebuilt. |
| 9 | Search suggestions while typing | Suggestions appear as you type (35,500+ places). An empty search box now shows your **recent searches** (with Clear) and **popular places**. |
| 10 | Real-time alert pop-ups | New alerts for your selected place or favourites **slide in**. Red warnings stay until you dismiss them; others close after 15 s (the timer pauses while you hover). There is an optional **chime**, a **Test pop-up** button, and Details opens the Alerts Center. |
| 11 | Map layers with instant switching | Four new layers: **Feels like, Humidity, UV peak and Air quality**, in addition to Standard/Temperature/Rain/Wind. Switch instantly with the buttons or keys **1–8**. |
| 12 | Cards that update for the selected location | When you change place, the hero card and section cards **animate in** with the new data, and section titles show the place name. |
| 13 | Animated wind indicators | The compass needle **swings** smoothly to the new direction and **flutters** more in gusty wind. **Wind streaks** flow across the compass at the current speed, and a small arrow is shown in the hero card. |
| 14 | Live sunrise & sunset countdowns | A **per-second** countdown to sunset or sunrise, a moving sun-progress bar and **golden hour / blue hour** times. |
| 15 | City comparison with dynamic charts | In Compare, choose a measure (**Temperature, Rain chance, Rainfall, Wind, Humidity, UV**) and a range (**24 h, 48 h, 7 days**). The chart animates between choices and a "Biggest gap" line explains the difference. |
| 16 | Drag-and-drop dashboard | Use **⚙ → Rearrange sections**: sections collapse into bars you can **drag** (mouse or touch), move with ↑/↓, or hide. Done saves the layout and Reset restores the default. Rows in the Personalise list can be dragged too. |
| 17 | Dynamic clothing & activity advice | The timeline shows **Wear / Good for / Avoid** for whichever hour you select, e.g. umbrella, SPF, run, beach, laundry, stargazing, lightning or flood roads. |
| 18 | Auto refresh with a custom interval | Refresh every **5, 10, 15, 30 min, 1 h or 3 h**, or **Off**. A live countdown runs in the header, refreshing pauses while the tab is in the background (optional), and the app catches up when you come back. |
| 19 | Unit conversion without reloading | °C/°F, wind, rain and pressure units update instantly with counting animations, plus a new **12 h / 24 h clock** switch. |
| 20 | Loading indicators, errors & retry | A thin **progress bar** and an "Updating…" pill appear while data loads. If a feed fails, an **error tray** names it and gives a plain-language reason with a **Retry** button, and the affected section shows its own message and Retry. The main forecast **retries automatically** with back-off (30 s → 5 min, or 10 min if the API rate limit is hit). |

**Scroll-aware header:** when you scroll down, the header blurs and slides out of view so the weather gets the whole screen. Scroll up a little and it glides back as frosted glass. On phones it comes back in a compact two-row layout (logo + search, then buttons). It stays in place while a menu, the search box or a pop-up window is open. Moving the mouse to the top edge or pressing Tab also brings it back.

Animations respect your system's *reduce motion* setting. You can also turn them off with **⚙ → Animated numbers & transitions**.

## 📍 Exact-place weather
When you pick a town, suburb or village, the app gets the forecast, air quality and 10-year history **for that exact spot**, not the district average. Hill-country villages and coastal towns in the same district can differ by 10 °C. A red pin marks the place on the map and its district is highlighted. The hero card, bulletin, hourly/7-day forecast, charts, clothing tips, AQI, history, assistant and comparison all switch to that place. Click a district to go back to district view. Forecasts for places you have viewed are saved for offline use.

## 🚀 How to run
- **Easiest:** open `index.html` in Chrome, Edge, Firefox or Safari.
- **For full offline support** (the service worker), serve the folder over http, e.g. `python -m http.server` and open `http://localhost:8000`.

## 📁 Files
```text
index.html   – layout, inline flag, modals
style.css    – themes, flag colours, map, responsive styles
app.js       – data (25 district boundaries), API layer, features 1–20
app-v4.js    – radar, layers & timeline, lightning, flood, accuracy, wind, UV, travel, My Day (features 21–29)
app-v5.js    – health & allergy, frost/snow/ice, sharing, event planner, global news (features 31–35)
app-v6.js    – the dynamic layer: live updates, animations, pop-ups, timeline, drag-and-drop (Dynamic 1–20)
places-lk.js – gazetteer of 35,500+ Sri Lankan places (loaded in the background, ~470 KB gzipped)
sw.js        – offline cache (service worker)
sl-flag.svg  – official flag (favicon)
```

## 🧾 Data sources & notes
- Weather, air quality, marine and history: Open-Meteo (forecast models + ERA5 reanalysis).
- District boundaries: amCharts geodata.
- Places: [GeoNames](https://www.geonames.org/) (CC BY 4.0) for villages, GN/DS divisions and estates, merged with [SriLankaCitiesDatabase](https://github.com/SKIDDOW/SriLankaCitiesDatabase) (MIT) for postal towns, postcodes and Sinhala/Tamil names. Online fallback: OpenStreetMap Nominatim (© OpenStreetMap contributors), then Open-Meteo geocoding.
- Radar: [RainViewer](https://www.rainviewer.com) (regional radars; the far south and south-east sea can have gaps). Flood: GloFAS via Open-Meteo Flood API. Accuracy: Open-Meteo Previous Runs API. Live lightning (best effort): Blitzortung.org community network.
- Global news: [GDACS](https://www.gdacs.org) (UN / European Commission) and [NASA EONET](https://eonet.gsfc.nasa.gov). Event-planner climate odds: Open-Meteo historical archive (ERA5).
- Health cards are general guidance and **not medical advice**. Emergency ambulance: Suwa Seriya 1990.
- Alerts are **auto-generated from forecast data** and are not official warnings. Always follow the Department of Meteorology (meteo.gov.lk) and DMC (117).
