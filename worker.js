// ============================================================
// Surf Watch Worker
// Cloudflare Worker — plain HTML for Apple Watch / Darock Browser
// ============================================================
// SETUP: Set SURFLINE_TOKEN as an encrypted environment variable.
// Cloudflare Dashboard → Workers → surf-watch → Settings → Variables
// Add variable: SURFLINE_TOKEN = <your token> — check "Encrypt"
// ============================================================
// DATA SOURCES:
//   Surfline  → surf height (ft) + human size label (e.g. "head high")
//   Open-Meteo Marine API → swell height, period, direction (free, no token)
//   Open-Meteo Forecast API → wind speed, direction, gusts (free, no token)
//   NOAA CO-OPS → water temperature + tide predictions (free, no token)
//
// Each source fails independently. Page always renders; failed fields → N/A.
// ============================================================

const SURFLINE_BASE = "https://services.surfline.com";
const NOAA_BASE     = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const MARINE_BASE   = "https://marine-api.open-meteo.com/v1/marine";
const WEATHER_BASE  = "https://api.open-meteo.com/v1/forecast";

// Mirrors exact browser request headers from a confirmed Surfline 200 OK capture.
// Reduces likelihood of Cloudflare bot-protection 403 on Surfline API.
// Do NOT include accept-encoding — Cloudflare Workers handles that automatically.
const SURFLINE_HEADERS = {
  "accept":             "*/*",
  "accept-language":    "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,ja;q=0.6,id;q=0.5,es;q=0.4,de;q=0.3",
  "cache-control":      "no-cache",
  "dnt":                "1",
  "origin":             "https://www.surfline.com",
  "pragma":             "no-cache",
  "priority":           "u=1, i",
  "referer":            "https://www.surfline.com/",
  "sec-ch-ua":          '"Opera";v="131", "Not.A/Brand";v="8", "Chromium";v="147"',
  "sec-ch-ua-mobile":   "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest":     "empty",
  "sec-fetch-mode":     "cors",
  "sec-fetch-site":     "same-site",
  "user-agent":         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 OPR/131.0.0.0",
};

// ============================================================
// Pre-production test spots — 10 OC / SD spots
//
// spotId:        Surfline spot identifier (from surfline.com/surf-report URLs)
// lat / lon:     Coordinates for Open-Meteo Marine + Wind API calls
// noaaStationId: Nearest NOAA CO-OPS station for water temp + tides
//
// Note on HB Dog Beach: Surfline does not have a dedicated "Dog Beach" spot.
// "North HB Streets" (5842041f4e65fad6a77088ea) is the closest available spot.
//
// Note on Tourmaline: Surfline lists this break as "Old Man's at Tourmaline".
// ============================================================
const CA_SPOTS = [
  {
    name: "Blackies",
    spotId: "584204204e65fad6a7709115",
    lat: 33.6050, lon: -117.9270,
    noaaStationId: "9410660",
  },
  {
    name: "HB Pier Northside",
    spotId: "5842041f4e65fad6a7708827",
    lat: 33.6560, lon: -118.0060,
    noaaStationId: "9410660",
  },
  {
    name: "HB Cliffs",
    spotId: "640a3f7c606c45fdf1b09880",
    lat: 33.6370, lon: -118.0080,
    noaaStationId: "9410660",
  },
  {
    name: "HB Dog Beach",
    spotId: "5842041f4e65fad6a77088ea",
    lat: 33.6868, lon: -118.0393,
    noaaStationId: "9410660",
  },
  {
    name: "Bolsa Chica",
    spotId: "5842041f4e65fad6a77088e8",
    lat: 33.6956, lon: -118.0489,
    noaaStationId: "9410660",
  },
  {
    name: "Doheny",
    spotId: "5842041f4e65fad6a77088d7",
    lat: 33.4608, lon: -117.6781,
    noaaStationId: "9410660",
  },
  {
    name: "Trestles - Lowers",
    spotId: "5842041f4e65fad6a770888a",
    lat: 33.3897, lon: -117.5928,
    noaaStationId: "9410660",
  },
  {
    name: "San Onofre",
    spotId: "584204204e65fad6a77099d4",
    lat: 33.3750, lon: -117.5650,
    noaaStationId: "9410660",
  },
  {
    name: "Cardiff Reef",
    spotId: "5842041f4e65fad6a77088b1",
    lat: 33.0120, lon: -117.2790,
    noaaStationId: "9410230",
  },
  {
    name: "Tourmaline",
    spotId: "5842041f4e65fad6a77088c4",
    lat: 32.8042, lon: -117.2572,
    noaaStationId: "9410230",
  },
];

// ============================================================
// Helpers
// ============================================================

function degToCompass(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function htmlEscape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function padNum(n) {
  return String(n).padStart(2, "0");
}

function fmtDateStr(d) {
  return `${d.getFullYear()}${padNum(d.getMonth() + 1)}${padNum(d.getDate())}`;
}

// Returns current Pacific time as "YYYY-MM-DD HH:MM" string for tide filtering.
// Handles PDT (UTC-7) and PST (UTC-8) automatically via Intl.
function getCurrentPacificTimeStr() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  // Normalize "24" → "00" (midnight edge case in some locales)
  const h = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${h}:${parts.minute}`;
}

// NOAA returns tide times as "YYYY-MM-DD HH:MM" in local time.
// Converts to 12-hour format for display.
function fmtNoaaTime(t) {
  const parts = t.split(" ");
  if (parts.length < 2) return t;
  const [h, m] = parts[1].split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${padNum(m)} ${ampm}`;
}

// ============================================================
// Surfline fetchers
// ============================================================

// Live surf endpoint — returns current spot-specific surf height and size label.
// This is what Surfline uniquely does well: spot-specific surf height modeling.
// Units: FT (as confirmed in DevTools capture).
async function getSurflineLiveSurf(spotId, token) {
  const url = `${SURFLINE_BASE}/kbyg/spots/live/surf?spotId=${spotId}&units%5BwaveHeight%5D=FT&accesstoken=${token}`;
  const res = await fetch(url, { headers: SURFLINE_HEADERS });
  if (!res.ok) throw new Error(`Surfline ${res.status}`);
  const json = await res.json();
  // data.surf may be a single object or an array depending on endpoint version
  let surf = json?.data?.surf;
  if (Array.isArray(surf)) surf = surf[0];
  if (!surf) throw new Error("No surf data in response");
  return {
    minFt:         surf.min         ?? "?",
    maxFt:         surf.max         ?? "?",
    plus:          surf.plus        === true,
    humanRelation: typeof surf.humanRelation === "string" ? surf.humanRelation : "",
  };
}

// Search endpoint — used when user types a spot name instead of selecting from list.
async function surflineSearch(query, token) {
  const url = `${SURFLINE_BASE}/search/site?q=${encodeURIComponent(query)}&querySize=5&suggestionSize=0&accesstoken=${token}`;
  const res = await fetch(url, { headers: SURFLINE_HEADERS });
  if (!res.ok) throw new Error(`Surfline search ${res.status}`);
  const json = await res.json();
  const hits = json?.hits?.hits;
  if (!hits || hits.length === 0) throw new Error("No results found for that spot name.");
  const hit = hits.find(h => h._source?.type === "spot") || hits[0];
  return {
    spotId: hit._source?._id || hit._id,
    name:   hit._source?.name || query,
  };
}

// ============================================================
// Open-Meteo fetchers
// ============================================================

// Marine API — swell height, period, direction.
// Returns wave heights in meters; converted to feet here.
// No token required. Global coverage via model grid (no buoy gaps).
async function getOpenMeteoMarine(lat, lon) {
  const vars = "swell_wave_height,swell_wave_period,swell_wave_direction";
  const url  = `${MARINE_BASE}?latitude=${lat}&longitude=${lon}&current=${vars}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo Marine ${res.status}`);
  const json = await res.json();
  const c    = json?.current;
  if (!c) throw new Error("No marine data in response");
  // Convert meters → feet for swell height
  const heightFt = c.swell_wave_height != null
    ? (c.swell_wave_height * 3.28084).toFixed(1)
    : "?";
  return {
    swellHeight: heightFt,
    swellPeriod: c.swell_wave_period    != null ? Math.round(c.swell_wave_period)    : "?",
    swellDir:    c.swell_wave_direction != null ? degToCompass(c.swell_wave_direction) : "?",
  };
}

// Forecast API — surface wind speed, direction, gusts.
// wind_speed_unit=mph requests mph units natively.
async function getOpenMeteoWind(lat, lon) {
  const vars = "wind_speed_10m,wind_direction_10m,wind_gusts_10m";
  const url  = `${WEATHER_BASE}?latitude=${lat}&longitude=${lon}&current=${vars}&wind_speed_unit=mph`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo Wind ${res.status}`);
  const json = await res.json();
  const c    = json?.current;
  if (!c) throw new Error("No wind data in response");
  return {
    speed: c.wind_speed_10m     != null ? Math.round(c.wind_speed_10m)       : "?",
    dir:   c.wind_direction_10m != null ? degToCompass(c.wind_direction_10m)  : "?",
    gust:  c.wind_gusts_10m     != null ? Math.round(c.wind_gusts_10m)        : null,
  };
}

// ============================================================
// NOAA CO-OPS fetchers
// ============================================================

// Most recent hourly water temperature reading at nearest NOAA station.
async function getNoaaWaterTemp(stationId) {
  const now     = new Date();
  const dateStr = fmtDateStr(now);
  const url = `${NOAA_BASE}?begin_date=${dateStr}&end_date=${dateStr}` +
    `&station=${stationId}&product=water_temperature&datum=MLLW` +
    `&time_zone=lst_ldt&interval=h&units=english&application=surf_watch&format=json`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`NOAA temp ${res.status}`);
  const json = await res.json();
  const readings = json?.data;
  if (!readings || readings.length === 0) return null;
  // Walk back from latest to find most recent non-null reading
  for (let i = readings.length - 1; i >= 0; i--) {
    if (readings[i].v && readings[i].v !== "") return parseFloat(readings[i].v);
  }
  return null;
}

// Next 4 hi/lo tide predictions for today + tomorrow.
// Times returned by NOAA are already in local Pacific time (time_zone=lst_ldt).
async function getNoaaTides(stationId) {
  const now      = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const url = `${NOAA_BASE}?begin_date=${fmtDateStr(now)}&end_date=${fmtDateStr(tomorrow)}` +
    `&station=${stationId}&product=predictions&datum=MLLW` +
    `&time_zone=lst_ldt&interval=hilo&units=english&application=surf_watch&format=json`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`NOAA tides ${res.status}`);
  const json = await res.json();
  const preds = json?.predictions;
  if (!preds || preds.length === 0) return [];
  // Filter to future tides using Pacific time string comparison
  // NOAA "YYYY-MM-DD HH:MM" format is lexicographically sortable
  const nowPacific = getCurrentPacificTimeStr();
  return preds
    .filter(p => p.t >= nowPacific)
    .slice(0, 4)
    .map(p => ({
      type:   p.type === "H" ? "HIGH" : "LOW",
      height: parseFloat(p.v).toFixed(1),
      time:   fmtNoaaTime(p.t),
    }));
}

// ============================================================
// Shared CSS style strings (inlined for Watch compatibility)
// ============================================================

const S = {
  wrap:  `font-family:sans-serif;font-size:13px;color:#e0e0e0;background:#111;padding:8px;max-width:340px;`,
  head:  `font-size:15px;font-weight:bold;color:#fff;margin:0 0 6px 0;`,
  label: `color:#aaa;`,
  value: `color:#fff;font-weight:bold;`,
  hr:    `border:none;border-top:1px solid #333;margin:6px 0;`,
  row:   `margin-bottom:6px;`,
  input: `width:100%;box-sizing:border-box;background:#222;color:#fff;border:1px solid #444;padding:5px;font-size:13px;border-radius:3px;margin-bottom:6px;`,
  btn:   `margin-top:4px;background:#1a6ef5;color:#fff;border:none;padding:7px 14px;font-size:13px;border-radius:3px;width:100%;`,
  link:  `color:#7af;`,
  err:   `color:#f66;`,
};

// ============================================================
// HTML renderers
// ============================================================

function renderForm(error) {
  const opts = CA_SPOTS.map(s =>
    `<option value="${htmlEscape(s.spotId)}">${htmlEscape(s.name)}</option>`
  ).join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${S.wrap}">
<p style="${S.head}">Surf Watch</p>
${error ? `<p style="${S.err}">${htmlEscape(error)}</p>` : ""}
<form method="GET" action="/forecast">

  <label style="${S.label}">Select spot</label><br>
  <select name="spotId" style="${S.input}">
    <option value="">-- Choose --</option>
    ${opts}
  </select>

  <label style="${S.label}">Or search by name</label><br>
  <input type="text" name="spotName" placeholder="e.g. Swamis" style="${S.input}">

  <details style="margin-bottom:6px;">
    <summary style="${S.label};cursor:pointer;">Advanced</summary>
    <div style="margin-top:6px;">
      <label style="${S.label}">Surfline spot ID</label><br>
      <span style="${S.label};font-size:11px;">Surf data only — swell, wind, water temp, tides: N/A</span><br>
      <input type="text" name="rawSpotId" placeholder="e.g. 5842041f4e65fad6a770888a" style="${S.input}">
    </div>
  </details>

  <input type="submit" value="Submit" style="${S.btn}">
</form>
</body>
</html>`;
}

function renderConditions(name, surf, marine, wind, waterTempF, tides) {
  // Surf row
  const surfSizeStr = surf
    ? `${surf.minFt}–${surf.maxFt}${surf.plus ? "+" : ""} ft`
    : "N/A";
  const surfRelationStr = surf?.humanRelation
    ? ` <span style="${S.label}">(${htmlEscape(surf.humanRelation)})</span>`
    : "";

  // Swell row
  const marineStr = marine
    ? `${marine.swellHeight} ft @ ${marine.swellPeriod}s ${marine.swellDir}`
    : "N/A";

  // Wind row
  const windStr = wind
    ? `${wind.speed} mph ${wind.dir}${wind.gust != null ? ` <span style="${S.label}">(gust ${wind.gust} mph)</span>` : ""}`
    : "N/A";

  // Water temp row
  const tempStr = waterTempF !== null ? `${waterTempF}°F` : "N/A";

  // Tide rows
  const tideRows = tides.length
    ? tides.map(t =>
        `<tr>
          <td style="${S.label}">${t.type}</td>
          <td style="${S.value};padding:0 8px;">${t.height} ft</td>
          <td style="${S.label}">${htmlEscape(t.time)}</td>
        </tr>`
      ).join("")
    : `<tr><td style="${S.label}" colspan="3">N/A</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${S.wrap}">
<p style="${S.head}">${htmlEscape(name)}</p>
<hr style="${S.hr}">

<div style="${S.row}">
  <span style="${S.label}">Surf: </span>
  <span style="${S.value}">${surfSizeStr}</span>${surfRelationStr}
</div>

<div style="${S.row}">
  <span style="${S.label}">Swell: </span>
  <span style="${S.value}">${marineStr}</span>
</div>

<div style="${S.row}">
  <span style="${S.label}">Wind: </span>
  <span style="${S.value}">${windStr}</span>
</div>

<div style="${S.row}">
  <span style="${S.label}">Water: </span>
  <span style="${S.value}">${tempStr}</span>
</div>

<hr style="${S.hr}">

<div style="${S.row}">
  <span style="${S.label}">Tides:</span>
  <table style="width:100%;border-collapse:collapse;margin-top:3px;">
    ${tideRows}
  </table>
</div>

<hr style="${S.hr}">
<p style="margin:4px 0;"><a href="/" style="${S.link}">← Back</a></p>
</body>
</html>`;
}

// ============================================================
// Request routing
// ============================================================

async function handleForecast(url, env) {
  const p         = url.searchParams;
  const spotId    = p.get("spotId")?.trim()    || "";
  const spotName  = p.get("spotName")?.trim()  || "";
  const rawSpotId = p.get("rawSpotId")?.trim() || "";

  const token = env.SURFLINE_TOKEN;

  let resolvedSpotId = null;
  let resolvedName   = "Unknown Spot";
  let lat            = null;
  let lon            = null;
  let noaaStationId  = null;

  if (rawSpotId) {
    // Advanced: manual spot ID entry.
    // Hits Surfline live endpoint directly. No lat/lon → no Open-Meteo.
    // No noaaStationId → no NOAA temp or tides. All non-Surfline fields → N/A.
    resolvedSpotId = rawSpotId;
    resolvedName   = "Custom Spot";
  } else if (spotId) {
    const found = CA_SPOTS.find(s => s.spotId === spotId);
    if (!found) return Response.redirect("/", 302);
    resolvedSpotId = found.spotId;
    resolvedName   = found.name;
    lat            = found.lat;
    lon            = found.lon;
    noaaStationId  = found.noaaStationId;
  } else if (spotName) {
    // Free-text search via Surfline search API.
    // Returns surf height only — no lat/lon or NOAA station for search results.
    try {
      const result   = await surflineSearch(spotName, token);
      resolvedSpotId = result.spotId;
      resolvedName   = result.name;
    } catch (e) {
      return new Response(renderForm(e.message), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }
  } else {
    return Response.redirect("/", 302);
  }

  // Fire all 5 sources in parallel. Each resolves or rejects independently.
  // Promise.allSettled guarantees all settle before we render — no partial hangs.
  const [surfResult, marineResult, windResult, tempResult, tidesResult] = await Promise.allSettled([
    getSurflineLiveSurf(resolvedSpotId, token),
    lat !== null ? getOpenMeteoMarine(lat, lon) : Promise.reject(new Error("no coords")),
    lat !== null ? getOpenMeteoWind(lat, lon)   : Promise.reject(new Error("no coords")),
    noaaStationId ? getNoaaWaterTemp(noaaStationId) : Promise.reject(new Error("no station")),
    noaaStationId ? getNoaaTides(noaaStationId)     : Promise.reject(new Error("no station")),
  ]);

  const surf       = surfResult.status   === "fulfilled" ? surfResult.value   : null;
  const marine     = marineResult.status === "fulfilled" ? marineResult.value : null;
  const wind       = windResult.status   === "fulfilled" ? windResult.value   : null;
  const waterTempF = tempResult.status   === "fulfilled" ? tempResult.value   : null;
  const tides      = tidesResult.status  === "fulfilled" ? tidesResult.value  : [];

  return new Response(
    renderConditions(resolvedName, surf, marine, wind, waterTempF, tides),
    { headers: { "Content-Type": "text/html;charset=UTF-8" } }
  );
}

// ============================================================
// Worker entry point — ES module format (export default required)
// Cloudflare detects ESM automatically from this export.
// env.SURFLINE_TOKEN is injected at runtime from Dashboard Variables.
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(renderForm(null), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    if (url.pathname === "/forecast") {
      return handleForecast(url, env);
    }

    return new Response("Not found", { status: 404 });
  },
};