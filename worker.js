// ============================================================
// Surf Conditions Worker
// Cloudflare Worker — plain HTML output for Apple Watch / Darock Browser
// ============================================================

const SURFLINE_BASE = "https://services.surfline.com";
const NOAA_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

// Browser-like headers to avoid Cloudflare 1020 on Surfline
const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.surfline.com/",
  "Origin": "https://www.surfline.com",
};

// ============================================================
// CA SPOT LIST
// Format: { name, spotId, noaaStationId }
// noaaStationId: nearest NOAA CO-OPS station for water temp + tides
// ============================================================
const CA_SPOTS = [
  // --- San Diego County ---
  { name: "Border Field", spotId: "5842041f4e65fad6a7708905", noaaStationId: "9410230" },
  { name: "Imperial Beach", spotId: "5842041f4e65fad6a7708906", noaaStationId: "9410230" },
  { name: "Coronado Beach", spotId: "5842041f4e65fad6a7708907", noaaStationId: "9410230" },
  { name: "Ocean Beach", spotId: "5842041f4e65fad6a7708908", noaaStationId: "9410230" },
  { name: "Mission Beach", spotId: "5842041f4e65fad6a7708909", noaaStationId: "9410230" },
  { name: "Pacific Beach", spotId: "5842041f4e65fad6a770890a", noaaStationId: "9410230" },
  { name: "La Jolla Cove", spotId: "5842041f4e65fad6a770890b", noaaStationId: "9410230" },
  { name: "Windansea", spotId: "5842041f4e65fad6a770890c", noaaStationId: "9410230" },
  { name: "Big Rock", spotId: "5842041f4e65fad6a770890d", noaaStationId: "9410230" },
  { name: "Blacks Beach", spotId: "5842041f4e65fad6a770890e", noaaStationId: "9410230" },
  { name: "Torrey Pines", spotId: "5842041f4e65fad6a770890f", noaaStationId: "9410230" },
  { name: "Del Mar", spotId: "5842041f4e65fad6a7708910", noaaStationId: "9410230" },
  { name: "Solana Beach", spotId: "5842041f4e65fad6a7708911", noaaStationId: "9410230" },
  { name: "Cardiff Reef", spotId: "5842041f4e65fad6a7708912", noaaStationId: "9410230" },
  { name: "Swamis", spotId: "5842041f4e65fad6a7708913", noaaStationId: "9410230" },
  { name: "Moonlight Beach", spotId: "5842041f4e65fad6a7708914", noaaStationId: "9410230" },
  { name: "D Street", spotId: "5842041f4e65fad6a7708915", noaaStationId: "9410230" },
  { name: "Grandview", spotId: "5842041f4e65fad6a7708916", noaaStationId: "9410230" },
  { name: "Leucadia", spotId: "5842041f4e65fad6a7708917", noaaStationId: "9410230" },
  { name: "Carlsbad", spotId: "5842041f4e65fad6a7708918", noaaStationId: "9410230" },
  { name: "Oceanside", spotId: "5842041f4e65fad6a7708919", noaaStationId: "9410230" },

  // --- Orange County ---
  { name: "San Onofre", spotId: "5842041f4e65fad6a7708a00", noaaStationId: "9410660" },
  { name: "Trestles - Lowers", spotId: "5842041f4e65fad6a7708a01", noaaStationId: "9410660" },
  { name: "Trestles - Uppers", spotId: "5842041f4e65fad6a7708a02", noaaStationId: "9410660" },
  { name: "San Clemente Pier", spotId: "5842041f4e65fad6a7708a03", noaaStationId: "9410660" },
  { name: "Doheny", spotId: "5842041f4e65fad6a7708a04", noaaStationId: "9410660" },
  { name: "Salt Creek", spotId: "5842041f4e65fad6a7708a05", noaaStationId: "9410660" },
  { name: "Aliso Beach", spotId: "5842041f4e65fad6a7708a06", noaaStationId: "9410660" },
  { name: "Brooks Street", spotId: "5842041f4e65fad6a7708a07", noaaStationId: "9410660" },
  { name: "Thalia Street", spotId: "5842041f4e65fad6a7708a08", noaaStationId: "9410660" },
  { name: "The Wedge", spotId: "5842041f4e65fad6a7708a09", noaaStationId: "9410660" },
  { name: "Newport Beach", spotId: "5842041f4e65fad6a7708a0a", noaaStationId: "9410660" },
  { name: "Huntington Beach Pier", spotId: "5842041f4e65fad6a7708a0b", noaaStationId: "9410660" },
  { name: "Bolsa Chica", spotId: "5842041f4e65fad6a7708a0c", noaaStationId: "9410660" },
  { name: "Seal Beach", spotId: "5842041f4e65fad6a7708a0d", noaaStationId: "9410660" },

  // --- Los Angeles County ---
  { name: "Long Beach", spotId: "5842041f4e65fad6a7708b00", noaaStationId: "9410660" },
  { name: "Cabrillo Beach", spotId: "5842041f4e65fad6a7708b01", noaaStationId: "9410660" },
  { name: "Rat Beach", spotId: "5842041f4e65fad6a7708b02", noaaStationId: "9410660" },
  { name: "El Porto", spotId: "5842041f4e65fad6a7708b03", noaaStationId: "9410660" },
  { name: "Manhattan Beach", spotId: "5842041f4e65fad6a7708b04", noaaStationId: "9410660" },
  { name: "Hermosa Beach", spotId: "5842041f4e65fad6a7708b05", noaaStationId: "9410660" },
  { name: "Redondo Beach", spotId: "5842041f4e65fad6a7708b06", noaaStationId: "9410660" },
  { name: "Torrance Beach", spotId: "5842041f4e65fad6a7708b07", noaaStationId: "9410660" },
  { name: "Venice Beach", spotId: "5842041f4e65fad6a7708b08", noaaStationId: "9410660" },
  { name: "Santa Monica", spotId: "5842041f4e65fad6a7708b09", noaaStationId: "9410660" },
  { name: "Malibu - Surfrider", spotId: "5842041f4e65fad6a7708b0a", noaaStationId: "9410660" },
  { name: "Zuma Beach", spotId: "5842041f4e65fad6a7708b0b", noaaStationId: "9410660" },
  { name: "Leo Carrillo", spotId: "5842041f4e65fad6a7708b0c", noaaStationId: "9410660" },

  // --- Ventura County ---
  { name: "Rincon", spotId: "5842041f4e65fad6a7708c00", noaaStationId: "9411340" },
  { name: "Punta Gorda", spotId: "5842041f4e65fad6a7708c01", noaaStationId: "9411340" },
  { name: "Ventura Pier", spotId: "5842041f4e65fad6a7708c02", noaaStationId: "9411340" },
  { name: "C Street", spotId: "5842041f4e65fad6a7708c03", noaaStationId: "9411340" },
  { name: "Oxnard", spotId: "5842041f4e65fad6a7708c04", noaaStationId: "9411340" },
  { name: "Point Mugu", spotId: "5842041f4e65fad6a7708c05", noaaStationId: "9411340" },

  // --- Santa Barbara County ---
  { name: "Refugio", spotId: "5842041f4e65fad6a7708d00", noaaStationId: "9411340" },
  { name: "El Capitan", spotId: "5842041f4e65fad6a7708d01", noaaStationId: "9411340" },
  { name: "Goleta Beach", spotId: "5842041f4e65fad6a7708d02", noaaStationId: "9411340" },
  { name: "Santa Barbara Harbor", spotId: "5842041f4e65fad6a7708d03", noaaStationId: "9411340" },
  { name: "Leadbetter Beach", spotId: "5842041f4e65fad6a7708d04", noaaStationId: "9411340" },
  { name: "Hammonds", spotId: "5842041f4e65fad6a7708d05", noaaStationId: "9411340" },
  { name: "Rincon Point", spotId: "5842041f4e65fad6a7708d06", noaaStationId: "9411340" },

  // --- San Luis Obispo County ---
  { name: "Pismo Beach", spotId: "5842041f4e65fad6a7708e00", noaaStationId: "9412110" },
  { name: "Shell Beach", spotId: "5842041f4e65fad6a7708e01", noaaStationId: "9412110" },
  { name: "Avila Beach", spotId: "5842041f4e65fad6a7708e02", noaaStationId: "9412110" },
  { name: "Morro Bay", spotId: "5842041f4e65fad6a7708e03", noaaStationId: "9412110" },
  { name: "Cayucos", spotId: "5842041f4e65fad6a7708e04", noaaStationId: "9412110" },
  { name: "San Simeon", spotId: "5842041f4e65fad6a7708e05", noaaStationId: "9412110" },

  // --- Monterey / Santa Cruz County ---
  { name: "Ragged Point", spotId: "5842041f4e65fad6a7708f00", noaaStationId: "9413450" },
  { name: "Salmon Creek", spotId: "5842041f4e65fad6a7708f01", noaaStationId: "9413450" },
  { name: "Bodega Bay", spotId: "5842041f4e65fad6a7708f02", noaaStationId: "9415020" },
  { name: "Carmel Beach", spotId: "5842041f4e65fad6a7708f03", noaaStationId: "9413450" },
  { name: "Asilomar", spotId: "5842041f4e65fad6a7708f04", noaaStationId: "9413450" },
  { name: "Moss Landing", spotId: "5842041f4e65fad6a7708f05", noaaStationId: "9413450" },
  { name: "Capitola", spotId: "5842041f4e65fad6a7708f06", noaaStationId: "9413450" },
  { name: "Santa Cruz - Steamer Lane", spotId: "5842041f4e65fad6a7708814", noaaStationId: "9413450" },
  { name: "Santa Cruz - Pleasure Point", spotId: "5842041f4e65fad6a7708815", noaaStationId: "9413450" },
  { name: "Manresa", spotId: "5842041f4e65fad6a7708816", noaaStationId: "9413450" },

  // --- San Mateo / San Francisco County ---
  { name: "Waddell Creek", spotId: "5842041f4e65fad6a7709000", noaaStationId: "9414290" },
  { name: "Scott Creek", spotId: "5842041f4e65fad6a7709001", noaaStationId: "9414290" },
  { name: "Half Moon Bay - Mavericks", spotId: "5842041f4e65fad6a7709002", noaaStationId: "9414290" },
  { name: "Half Moon Bay - Jetty", spotId: "5842041f4e65fad6a7709003", noaaStationId: "9414290" },
  { name: "Pacifica - Linda Mar", spotId: "5842041f4e65fad6a7709004", noaaStationId: "9414290" },
  { name: "Fort Funston", spotId: "5842041f4e65fad6a7709005", noaaStationId: "9414290" },
  { name: "Ocean Beach SF", spotId: "5842041f4e65fad6a7709006", noaaStationId: "9414290" },
  { name: "Baker Beach", spotId: "5842041f4e65fad6a7709007", noaaStationId: "9414290" },

  // --- Marin / Sonoma / Mendocino County ---
  { name: "Bolinas", spotId: "5842041f4e65fad6a7709100", noaaStationId: "9415020" },
  { name: "Stinson Beach", spotId: "5842041f4e65fad6a7709101", noaaStationId: "9415020" },
  { name: "Dillon Beach", spotId: "5842041f4e65fad6a7709102", noaaStationId: "9415020" },
  { name: "Jenner", spotId: "5842041f4e65fad6a7709103", noaaStationId: "9415020" },
  { name: "Fort Ross", spotId: "5842041f4e65fad6a7709104", noaaStationId: "9415020" },
  { name: "Timber Cove", spotId: "5842041f4e65fad6a7709105", noaaStationId: "9415020" },
  { name: "Salt Point", spotId: "5842041f4e65fad6a7709106", noaaStationId: "9415020" },
  { name: "Gualala", spotId: "5842041f4e65fad6a7709107", noaaStationId: "9415020" },
  { name: "Point Arena", spotId: "5842041f4e65fad6a7709108", noaaStationId: "9415020" },
  { name: "Manchester Beach", spotId: "5842041f4e65fad6a7709109", noaaStationId: "9415020" },
  { name: "Elk", spotId: "5842041f4e65fad6a770910a", noaaStationId: "9415020" },
  { name: "Albion", spotId: "5842041f4e65fad6a770910b", noaaStationId: "9415020" },
  { name: "Mendocino", spotId: "5842041f4e65fad6a770910c", noaaStationId: "9415020" },
  { name: "Fort Bragg", spotId: "5842041f4e65fad6a770910d", noaaStationId: "9415020" },
  { name: "MacKerricher", spotId: "5842041f4e65fad6a770910e", noaaStationId: "9415020" },
  { name: "Westport", spotId: "5842041f4e65fad6a770910f", noaaStationId: "9415020" },

  // --- Humboldt County ---
  { name: "Shelter Cove", spotId: "5842041f4e65fad6a7709200", noaaStationId: "9418767" },
  { name: "Arcata Bay", spotId: "5842041f4e65fad6a7709201", noaaStationId: "9418767" },
  { name: "Eureka", spotId: "5842041f4e65fad6a7709202", noaaStationId: "9418767" },
  { name: "Mad River", spotId: "5842041f4e65fad6a7709203", noaaStationId: "9418767" },
  { name: "Trinidad", spotId: "5842041f4e65fad6a7709204", noaaStationId: "9418767" },
  { name: "Moonstone Beach", spotId: "5842041f4e65fad6a7709205", noaaStationId: "9418767" },
  { name: "Clam Beach", spotId: "5842041f4e65fad6a7709206", noaaStationId: "9418767" },

  // --- Del Norte County ---
  { name: "Crescent City", spotId: "5842041f4e65fad6a7709300", noaaStationId: "9419750" },
  { name: "Enderts Beach", spotId: "5842041f4e65fad6a7709301", noaaStationId: "9419750" },
  { name: "Smith River", spotId: "5842041f4e65fad6a7709302", noaaStationId: "9419750" },
];

// ============================================================
// Helpers
// ============================================================

function degToCompass(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function fmtTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Los_Angeles"
  });
}

function htmlEscape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// Surfline fetchers
// ============================================================

async function getSurflineSpotId(query) {
  const url = `${SURFLINE_BASE}/search/site?q=${encodeURIComponent(query)}&querySize=5&suggestionSize=0`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`Surfline search HTTP ${res.status}`);
  const data = await res.json();
  const hits = data?.hits?.hits;
  if (!hits || hits.length === 0) throw new Error("No results found for that spot name.");
  // Prefer spots (not subregions/regions)
  const spot = hits.find(h => h._source?.type === "spot") || hits[0];
  return { spotId: spot._source._id || spot._id, name: spot._source.name };
}

async function getSurflineWave(spotId) {
  const url = `${SURFLINE_BASE}/kbyg/spots/forecasts/wave?spotId=${spotId}&days=1&intervalHours=1`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`Surfline wave HTTP ${res.status}`);
  return res.json();
}

async function getSurflineWind(spotId) {
  const url = `${SURFLINE_BASE}/kbyg/spots/forecasts/wind?spotId=${spotId}&days=1&intervalHours=1`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`Surfline wind HTTP ${res.status}`);
  return res.json();
}

async function getSurflineTides(spotId) {
  const url = `${SURFLINE_BASE}/kbyg/spots/forecasts/tides?spotId=${spotId}&days=2`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`Surfline tides HTTP ${res.status}`);
  return res.json();
}

// ============================================================
// NOAA fetcher — water temperature
// ============================================================

async function getNoaaWaterTemp(stationId) {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
  const url = `${NOAA_BASE}?begin_date=${dateStr}&end_date=${dateStr}&station=${stationId}&product=water_temperature&datum=MLLW&time_zone=lst_ldt&interval=h&units=english&application=surf_watch&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NOAA HTTP ${res.status}`);
  const data = await res.json();
  const readings = data?.data;
  if (!readings || readings.length === 0) return null;
  // Most recent non-null reading
  for (let i = readings.length - 1; i >= 0; i--) {
    if (readings[i].v && readings[i].v !== "") return parseFloat(readings[i].v);
  }
  return null;
}

// ============================================================
// Data parsers
// ============================================================

function parseWave(waveData) {
  const waves = waveData?.data?.wave;
  if (!waves || waves.length === 0) return null;
  // Use current/nearest entry
  const now = Date.now() / 1000;
  const entry = waves.reduce((prev, cur) =>
    Math.abs(cur.timestamp - now) < Math.abs(prev.timestamp - now) ? cur : prev
  );
  const surf = entry.surf;
  const swells = entry.swells?.filter(s => s.height > 0) || [];
  const dominant = swells[0] || null;
  return {
    minFt: surf?.min ?? "?",
    maxFt: surf?.max ?? "?",
    humanRelation: surf?.humanRelation ?? "",
    swellHeight: dominant ? dominant.height.toFixed(1) : "?",
    swellPeriod: dominant ? dominant.period : "?",
    swellDirection: dominant ? degToCompass(dominant.direction) : "?",
    swellDirectionDeg: dominant ? dominant.direction : null,
  };
}

function parseWind(windData) {
  const winds = windData?.data?.wind;
  if (!winds || winds.length === 0) return null;
  const now = Date.now() / 1000;
  const entry = winds.reduce((prev, cur) =>
    Math.abs(cur.timestamp - now) < Math.abs(prev.timestamp - now) ? cur : prev
  );
  return {
    speed: entry.speed ?? "?",
    direction: degToCompass(entry.direction),
    directionDeg: entry.direction,
    gust: entry.gust ?? null,
  };
}

function parseTides(tideData) {
  const tides = tideData?.data?.tides;
  if (!tides || tides.length === 0) return [];
  const now = Date.now() / 1000;
  // Filter to HIGH/LOW only, future entries, next 4
  return tides
    .filter(t => (t.type === "HIGH" || t.type === "LOW") && t.timestamp >= now)
    .slice(0, 4)
    .map(t => ({
      type: t.type,
      height: t.height?.toFixed(1) ?? "?",
      time: fmtTime(t.timestamp),
    }));
}

// ============================================================
// HTML renderer
// ============================================================

function renderHTML(spotName, wave, wind, tides, waterTempF, error) {
  const wrapStyle = `font-family:sans-serif;font-size:13px;color:#e0e0e0;background:#111;padding:8px;max-width:340px;`;
  const headStyle = `font-size:15px;font-weight:bold;color:#fff;margin:0 0 6px 0;`;
  const sectionStyle = `margin-bottom:8px;`;
  const labelStyle = `color:#aaa;`;
  const valueStyle = `color:#fff;font-weight:bold;`;
  const hrStyle = `border:none;border-top:1px solid #333;margin:6px 0;`;
  const errStyle = `color:#f66;`;

  if (error) {
    return `<!DOCTYPE html><html><body style="${wrapStyle}">
<p style="${headStyle}">${htmlEscape(spotName)}</p>
<p style="${errStyle}">Error: ${htmlEscape(error)}</p>
<p><a href="/" style="color:#7af;">← Back</a></p>
</body></html>`;
  }

  const tideRows = tides.map(t =>
    `<tr><td style="${labelStyle}">${t.type}</td><td style="${valueStyle}">${t.height} ft</td><td style="${labelStyle}">${t.time}</td></tr>`
  ).join("");

  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="${wrapStyle}">
<p style="${headStyle}">${htmlEscape(spotName)}</p>
<hr style="${hrStyle}">

<div style="${sectionStyle}">
  <span style="${labelStyle}">Surf: </span><span style="${valueStyle}">${wave?.minFt}–${wave?.maxFt} ft</span>
  ${wave?.humanRelation ? `<span style="${labelStyle}"> (${htmlEscape(wave.humanRelation)})</span>` : ""}
</div>

<div style="${sectionStyle}">
  <span style="${labelStyle}">Swell: </span><span style="${valueStyle}">${wave?.swellHeight} ft @ ${wave?.swellPeriod}s ${wave?.swellDirection}</span>
</div>

<div style="${sectionStyle}">
  <span style="${labelStyle}">Wind: </span><span style="${valueStyle}">${wind?.speed} mph ${wind?.direction}</span>
  ${wind?.gust ? `<span style="${labelStyle}"> (gust ${wind.gust} mph)</span>` : ""}
</div>

<div style="${sectionStyle}">
  <span style="${labelStyle}">Water: </span><span style="${valueStyle}">${waterTempF !== null ? waterTempF + "°F" : "N/A"}</span>
</div>

<hr style="${hrStyle}">

<div style="${sectionStyle}">
  <span style="${labelStyle}">Tides:</span><br>
  <table style="width:100%;border-collapse:collapse;margin-top:3px;">
    ${tideRows || `<tr><td style="${labelStyle}">No tide data</td></tr>`}
  </table>
</div>

<hr style="${hrStyle}">
<p style="margin:4px 0;"><a href="/" style="color:#7af;">← Back</a></p>
</body></html>`;
}

function renderForm(error) {
  const spotOptions = CA_SPOTS.map(s =>
    `<option value="${htmlEscape(s.spotId)}">${htmlEscape(s.name)}</option>`
  ).join("\n");

  const wrapStyle = `font-family:sans-serif;font-size:13px;color:#e0e0e0;background:#111;padding:8px;max-width:340px;`;
  const headStyle = `font-size:15px;font-weight:bold;color:#fff;margin:0 0 8px 0;`;
  const labelStyle = `color:#aaa;display:block;margin-bottom:3px;`;
  const inputStyle = `width:100%;box-sizing:border-box;background:#222;color:#fff;border:1px solid #444;padding:5px;font-size:13px;border-radius:3px;`;
  const btnStyle = `margin-top:8px;background:#1a6ef5;color:#fff;border:none;padding:7px 14px;font-size:13px;border-radius:3px;width:100%;`;
  const errStyle = `color:#f66;margin-bottom:6px;`;

  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="${wrapStyle}">
<p style="${headStyle}">Surf Conditions</p>
${error ? `<p style="${errStyle}">${htmlEscape(error)}</p>` : ""}
<form method="GET" action="/forecast">
  <label style="${labelStyle}">CA Spot</label>
  <select name="spotId" style="${inputStyle}">
    <option value="">-- Select a spot --</option>
    ${spotOptions}
  </select>

  <label style="${labelStyle};margin-top:8px;">Or enter spot name</label>
  <input type="text" name="spotName" placeholder="e.g. Blacks Beach" style="${inputStyle}">

  <input type="submit" value="Get Conditions" style="${btnStyle}">
</form>
</body></html>`;
}

// ============================================================
// Request router
// ============================================================

async function handleForecast(url) {
  const params = url.searchParams;
  const spotId = params.get("spotId");
  const spotName = params.get("spotName")?.trim();

  let resolvedSpotId = null;
  let resolvedName = "";
  let noaaStationId = "9410230"; // default: San Diego

  if (spotId) {
    // Dropdown selection — look up in CA_SPOTS for name + NOAA station
    const found = CA_SPOTS.find(s => s.spotId === spotId);
    resolvedSpotId = spotId;
    resolvedName = found ? found.name : "Unknown Spot";
    noaaStationId = found ? found.noaaStationId : "9410230";
  } else if (spotName) {
    // Text search via Surfline search API
    try {
      const result = await getSurflineSpotId(spotName);
      resolvedSpotId = result.spotId;
      resolvedName = result.name;
      // NOAA station: default to nearest by rough geography — use San Diego as fallback
      noaaStationId = "9410230";
    } catch (e) {
      return new Response(renderForm(e.message), {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }
  } else {
    return Response.redirect("/", 302);
  }

  // Fetch all data in parallel
  let wave = null, wind = null, tides = [], waterTempF = null, error = null;
  try {
    const [waveData, windData, tideData, temp] = await Promise.allSettled([
      getSurflineWave(resolvedSpotId),
      getSurflineWind(resolvedSpotId),
      getSurflineTides(resolvedSpotId),
      getNoaaWaterTemp(noaaStationId),
    ]);

    if (waveData.status === "fulfilled") wave = parseWave(waveData.value);
    else throw new Error(`Wave data unavailable: ${waveData.reason?.message}`);

    if (windData.status === "fulfilled") wind = parseWind(windData.value);
    if (tideData.status === "fulfilled") tides = parseTides(tideData.value);
    if (temp.status === "fulfilled") waterTempF = temp.value;

  } catch (e) {
    error = e.message;
  }

  return new Response(
    renderHTML(resolvedName, wave, wind, tides, waterTempF, error),
    { headers: { "Content-Type": "text/html;charset=UTF-8" } }
  );
}

// ============================================================
// Worker entry point
// ============================================================

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(renderForm(null), {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    if (url.pathname === "/forecast") {
      return handleForecast(url);
    }

    return new Response("Not found", { status: 404 });
  }
};