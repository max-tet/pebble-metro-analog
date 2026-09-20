var UPDATE_MS = 30 * 60 * 1000;
var FALLBACK_LAT = 48.14;
var FALLBACK_LON = 11.58;

var ERR_NETWORK = 1;
var ERR_TIMEOUT = 2;
var ERR_DATA = 3;

function send(dict) {
  Pebble.sendAppMessage(dict, function () {}, function () {});
}

// Neither xhr.onerror nor xhr.ontimeout is guaranteed to fire here, so the
// request gets its own deadline; without it a failed fetch is simply silence.
function fetchWeather(lat, lon) {
  var url = "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + lat.toFixed(3) + "&longitude=" + lon.toFixed(3) +
    "&current=temperature_2m,weather_code,uv_index,is_day" +
    "&daily=temperature_2m_max,temperature_2m_min,uv_index_max" +
    "&hourly=precipitation_probability&forecast_hours=6&forecast_days=1&timezone=auto";

  var settled = false;
  var guard = setTimeout(function () { done({ ERR: ERR_TIMEOUT }); }, 20000);

  function done(dict) {
    if (settled) return;
    settled = true;
    clearTimeout(guard);
    send(dict);
  }

  var xhr = new XMLHttpRequest();
  xhr.timeout = 15000;
  xhr.onload = function () {
    var cur, day, hours, rain, i;
    try {
      var json = JSON.parse(xhr.responseText);
      cur = json.current;
      day = json.daily;
      hours = json.hourly.precipitation_probability;
    } catch (e) {
      done({ ERR: ERR_DATA });
      return;
    }
    if (!cur || !day) {
      done({ ERR: ERR_DATA });
      return;
    }
    rain = 0;
    for (i = 0; i < hours.length; i++)
      if (hours[i] > rain) rain = hours[i];
    done({
      TEMP: Math.round(cur.temperature_2m),
      TMAX: Math.round(day.temperature_2m_max[0]),
      TMIN: Math.round(day.temperature_2m_min[0]),
      UV: Math.round(cur.uv_index),
      UVMAX: Math.round(day.uv_index_max[0]),
      RAIN: rain,
      CODE: cur.weather_code,
      ISDAY: cur.is_day,
      ERR: 0
    });
  };
  xhr.onerror = function () { done({ ERR: ERR_NETWORK }); };
  xhr.ontimeout = function () { done({ ERR: ERR_TIMEOUT }); };
  xhr.open("GET", url);
  xhr.send();
}

function savePosition(lat, lon) {
  try {
    localStorage.setItem("pos", JSON.stringify({ lat: lat, lon: lon }));
  } catch (e) {}
}

function lastPosition() {
  try {
    var p = JSON.parse(localStorage.getItem("pos"));
    if (p && typeof p.lat === "number") return p;
  } catch (e) {}
  return { lat: FALLBACK_LAT, lon: FALLBACK_LON };
}

// getCurrentPosition can return neither callback, its own timeout included,
// which starves the whole chain. This guard is what keeps weather arriving.
function update() {
  var done = false;

  function proceed(lat, lon, why) {
    if (done) return;
    done = true;
    clearTimeout(guard);
    fetchWeather(lat, lon);
  }

  var guard = setTimeout(function () {
    var last = lastPosition();
    proceed(last.lat, last.lon, "guard");
  }, 12000);

  navigator.geolocation.getCurrentPosition(
    function (pos) {
      savePosition(pos.coords.latitude, pos.coords.longitude);
      proceed(pos.coords.latitude, pos.coords.longitude, "gps");
    },
    function () {
      var last = lastPosition();
      proceed(last.lat, last.lon, "denied");
    },
    { timeout: 10000, maximumAge: 10 * 60 * 1000 }
  );
}

Pebble.addEventListener("ready", function () {
  update();
  setInterval(update, UPDATE_MS);
});

Pebble.addEventListener("appmessage", function () {
  update();
});
