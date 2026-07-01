const express = require("express");                // railway
const fetch = require("node-fetch");
const app = express();

app.get("/wetter", async (req, res) => {    
  const querystring = req.query.querystring;       // querystring=$(querystring)

  // --- parse querystring ---
  const parts   = querystring.split("+");         //split querystring on "+"
  const timeArg = parts[parts.length - 1];        // "3d", "-3h", etc. (1 = take second part)
  const city    = parts.slice(0, -1).join(" ");   // restore city name (take first part)

  // --- validate unit ---                        
  const unit = timeArg[timeArg.length - 1]; // "d" or "h" days/hours
  if (unit !== "d" && unit !== "h") {
    return res.send("Error: please specify unit — d for days, h for hours. Example: !w London 3h");
  }

  // --- parse sign and number ---
  const signed       = timeArg.slice(0, -1); // "3" or "-3"
  const past         = signed.startsWith("-");
  const parsedNumber = parseInt(signed.replace("-", ""));

  // --- validate ranges ---      
  let n, m;                            //m=hours / n=days, plausibility check
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

  // --- build API days value ---
  let apiDays;
  if (unit === "h") {
    apiDays = 2; // always fetch 2 days for hourly, slice later
  } else {
    apiDays = n;
  }

  const timeParam  = past ? `past_days=${apiDays}` : `forecast_days=${apiDays}`;
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m&${timeParam}`;
  // https://api.open-meteo.com/v1/forecast?latitude=$(latitude)&longitude=$(longitude)&daily=weather_code,uv_index_max,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_probability_max&hourly=relative_humidity_2m,apparent_temperature,precipitation_probability,rain,weather_code,visibility,cloud_cover,wind_speed_10m,soil_temperature_0cm,uv_index,is_day,sunshine_duration,precipitation,temperature_2m&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,wind_speed_10m,wind_direction_10m,precipitation,rain,weather_code,cloud_cover&${timeParam}

  // --- fetch weather ---
  const weatherRes  = await fetch(weatherUrl);
  const weatherData = await weatherRes.json();

  res.send(JSON.stringify(weatherData)); // raw for now
});

app.listen(process.env.PORT || 3000);
