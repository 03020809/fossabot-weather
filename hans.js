const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.get("/wetter", async (req, res) => {
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

  // --- build output (placeholder, edit later) ---
  const current = weatherData.current;
  let reply = `${name} now: ${current.temperature_2m}°C feels ${current.apparent_temperature}°C | wind ${current.wind_speed_10m}km/h | humidity ${current.relative_humidity_2m}%`;

  if (unit === "h") {
    const times  = weatherData.hourly.time.slice(-m);
    const temps  = weatherData.hourly.temperature_2m.slice(-m);
    const rain   = weatherData.hourly.rain.slice(-m);
    const wind   = weatherData.hourly.wind_speed_10m.slice(-m);
    const rows   = times.map((t, i) => `${t.slice(11, 16)} ${temps[i]}°C rain:${rain[i]}mm wind:${wind[i]}km/h`);
    reply       += " | " + rows.join(" | ");
  } else {
    const dates  = weatherData.daily.time.slice(0, n);
    const maxT   = weatherData.daily.temperature_2m_max.slice(0, n);
    const minT   = weatherData.daily.temperature_2m_min.slice(0, n);
    const precip = weatherData.daily.precipitation_probability_max.slice(0, n);
    const rows   = dates.map((d, i) => `${d} max:${maxT[i]}°C min:${minT[i]}°C precip:${precip[i]}%`);
    reply       += " | " + rows.join(" | ");
  }

  res.send(reply);
});

app.listen(process.env.PORT || 3000);
