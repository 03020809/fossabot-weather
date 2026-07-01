const express = require("express");
const app = express();

const toF = c => Math.round(c * 9 / 5 + 32);

app.get("/wetter", async (req, res) => {
  const fetch = (await import("node-fetch")).default;
  const querystring = req.query.querystring;

  // --- parse querystring ---
  const parts   = querystring.split("+");
  const timeArg = parts[parts.length - 1];
  const city    = parts.slice(0, -1).join(" ");

  // --- validate unit ---
  const unit = timeArg[timeArg.length - 1];
  if (unit !== "d" && unit !== "h") {
    return res.send("Error: please specify unit — d for days, h for hours. Example: !w London 3h");
  }

  // --- parse sign and number ---
  const signed       = timeArg.slice(0, -1);
  const past         = signed.startsWith("-");
  const parsedNumber = parseInt(signed.replace("-", ""));

  // --- validate ranges ---
  let n, m;
  if (unit === "h") {
    m = parsedNumber;
    if (isNaN(m) || m < 1 || m > 24) {
      return res.send("Error: hours must be between 1 and 24.");
    }
  } else {
    n = parsedNumber;
    if (past && (isNaN(n) || n < 1 || n > 90)) {
      return res.send("Error: past days must be between 1 and 90.");
    }
    if (!past && (isNaN(n) || n < 1 || n > 16)) {
      return res.send("Error: forecast days must be between 1 and 16.");
    }
  }

  // --- geocoding ---
  const geoRes  = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
  const geoData = await geoRes.json();

  if (!geoData.results || geoData.results.length === 0) {
    return res.send(`City "${city}" not found.`);
  }

  const { latitude, longitude, name } = geoData.results[0];

  // --- build API params ---
  const currentParams = "current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,wind_speed_10m,wind_direction_10m,precipitation,rain,weather_code,cloud_cover";
  const dailyParams   = "daily=weather_code,uv_index_max,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_probability_max";
  const hourlyParams  = "hourly=relative_humidity_2m,apparent_temperature,precipitation_probability,rain,weather_code,visibility,cloud_cover,wind_speed_10m,soil_temperature_0cm,uv_index,is_day,sunshine_duration,precipitation,temperature_2m";

  const dataParams = unit === "d" ? dailyParams : hourlyParams;
  const apiDays    = unit === "h" ? 2 : n;
  const timeParam  = past ? `past_days=${apiDays}` : `forecast_days=${apiDays}`;

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&${currentParams}&${dataParams}&${timeParam}`;

  // --- fetch weather ---
  const weatherRes  = await fetch(weatherUrl);
  const weatherData = await weatherRes.json();

  // --- current output (always) ---
  const c = weatherData.current;
  const currentLine = [
    `${name} now:`,
    `${c.temperature_2m}°C / ${toF(c.temperature_2m)}°F`,
    `feels ${c.apparent_temperature}°C / ${toF(c.apparent_temperature)}°F`,
    `humidity ${c.relative_humidity_2m}%`,
    `wind ${c.wind_speed_10m}km/h dir ${c.wind_direction_10m}°`,
    `precip ${c.precipitation}mm`,
    `rain ${c.rain}mm`,
    `cloud ${c.cloud_cover}%`,
    `weather code ${c.weather_code}`,
    c.is_day ? "day" : "night"
  ].join(" | ");

  // --- hourly output ---
  let dataLine = "";

  if (unit === "h") {
    const h    = weatherData.hourly;
    const rows = Array.from({ length: m }, (_, i) => {
      const idx = h.time.length - m + i;
      return [
        h.time[idx].slice(11, 16),
        `${h.temperature_2m[idx]}°C / ${toF(h.temperature_2m[idx])}°F`,
        `feels ${h.apparent_temperature[idx]}°C / ${toF(h.apparent_temperature[idx])}°F`,
        `humidity ${h.relative_humidity_2m[idx]}%`,
        `precip prob ${h.precipitation_probability[idx]}%`,
        `precip ${h.precipitation[idx]}mm`,
        `rain ${h.rain[idx]}mm`,
        `weather code ${h.weather_code[idx]}`,
        `visibility ${h.visibility[idx]}m`,
        `cloud ${h.cloud_cover[idx]}%`,
        `wind ${h.wind_speed_10m[idx]}km/h`,
        `soil temp ${h.soil_temperature_0cm[idx]}°C / ${toF(h.soil_temperature_0cm[idx])}°F`,
        `uv ${h.uv_index[idx]}`,
        `sunshine ${h.sunshine_duration[idx]}s`,
        h.is_day[idx] ? "day" : "night"
      ].join(" | ");
    });
    dataLine = rows.join(" || ");

  // --- daily output ---
  } else {
    const d    = weatherData.daily;
    const rows = Array.from({ length: n }, (_, i) => {
      const idx = past ? d.time.length - n + i : i;
      return [
        d.time[idx],
        `weather code ${d.weather_code[idx]}`,
        `uv max ${d.uv_index_max[idx]}`,
        `max ${d.temperature_2m_max[idx]}°C / ${toF(d.temperature_2m_max[idx])}°F`,
        `min ${d.temperature_2m_min[idx]}°C / ${toF(d.temperature_2m_min[idx])}°F`,
        `feels max ${d.apparent_temperature_max[idx]}°C / ${toF(d.apparent_temperature_max[idx])}°F`,
        `feels min ${d.apparent_temperature_min[idx]}°C / ${toF(d.apparent_temperature_min[idx])}°F`,
        `sunrise ${d.sunrise[idx]}`,
        `sunset ${d.sunset[idx]}`,
        `daylight ${d.daylight_duration[idx]}s`,
        `sunshine ${d.sunshine_duration[idx]}s`,
        `wind max ${d.wind_speed_10m_max[idx]}km/h dir ${d.wind_direction_10m_dominant[idx]}°`,
        `precip prob ${d.precipitation_probability_max[idx]}%`
      ].join(" | ");
    });
    dataLine = rows.join(" || ");
  }

  res.send(`${currentLine} ||| ${dataLine}`);
});

app.listen(3000, () => console.log('Weather bot running on 3000'));
