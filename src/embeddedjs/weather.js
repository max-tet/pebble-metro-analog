import Location from "embedded:sensor/Location";

const FALLBACK_LAT = 48.14;
const FALLBACK_LON = 11.58;
const RETRY_MS = 20000;
const FIX_TIMEOUT_MS = 10000;
const CACHE_MAX_AGE_MS = 6 * 3600 * 1000;

let client = null;
let inFlight = false;
let notify = null;

export function cached() {
    try {
        const stored = JSON.parse(localStorage.getItem("weather"));
        if (stored && Date.now() - stored.at < CACHE_MAX_AGE_MS) return stored;
    } catch (e) {
    }
    return null;
}

function store(data) {
    try {
        localStorage.setItem("weather", JSON.stringify(data));
    } catch (e) {
    }
}

function parse(json) {
    const cur = json?.current;
    const day = json?.daily;
    const hourly = json?.hourly?.precipitation_probability;
    if (!cur || !day) return null;
    return {
        temp: Math.round(cur.temperature_2m),
        code: cur.weather_code,
        isDay: cur.is_day,
        uv: Math.round(cur.uv_index),
        uvMax: Math.round(day.uv_index_max[0]),
        tmax: Math.round(day.temperature_2m_max[0]),
        tmin: Math.round(day.temperature_2m_min[0]),
        rain: hourly?.length ? Math.max(...hourly) : 0,
        at: Date.now()
    };
}

function httpGetJSON(host, path, onSuccess, onFail) {
    let watchdog = setTimeout(() => fail("timeout"), 20000);
    const chunks = [];
    let httpStatus = 0;

    function finish(cb, arg) {
        if (!watchdog) return;
        clearTimeout(watchdog);
        watchdog = null;
        cb(arg);
    }

    function fail(e) {
        try { client?.close(); } catch (_) {}
        client = null;
        finish(onFail, e);
    }

    try {
        client ??= new device.network.https.io({
            ...device.network.https, host, port: 443,
            onError(e) { fail(e); }
        });
        client.request({
            path,
            headersMask: ["content-length"],
            onHeaders(status) { httpStatus = status; },
            onReadable(count) { if (count) chunks.push(String.fromArrayBuffer(this.read())); },
            onDone() {
                if (httpStatus < 200 || httpStatus > 299) return finish(onFail, "http " + httpStatus);
                try { finish(onSuccess, JSON.parse(chunks.join(""))); } catch (e) { finish(onFail, e); }
            },
            onError(e) { fail(e); }
        });
    } catch (e) {
        fail(e);
    }
}

function scheduleRetry() {
    inFlight = false;
    setTimeout(request, RETRY_MS);
}

function fetchFor(lat, lon) {
    const path = `/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
        "&current=temperature_2m,weather_code,uv_index,is_day" +
        "&daily=temperature_2m_max,temperature_2m_min,uv_index_max" +
        "&hourly=precipitation_probability&forecast_hours=6&forecast_days=1&timezone=auto";
    httpGetJSON("api.open-meteo.com", path, json => {
        const data = parse(json);
        if (!data) return scheduleRetry();
        inFlight = false;
        store(data);
        notify?.(data);
    }, () => scheduleRetry());
}

export function request() {
    if (inFlight) return;
    if (!watch.connected.pebblekit) return scheduleRetry();
    inFlight = true;

    let settled = false;
    const useFallback = setTimeout(() => {
        if (settled) return;
        settled = true;
        fetchFor(FALLBACK_LAT, FALLBACK_LON);
    }, FIX_TIMEOUT_MS);

    try {
        new Location({
            onSample() {
                const fix = this.sample();
                this.close();
                if (settled) return;
                settled = true;
                clearTimeout(useFallback);
                fetchFor(fix.latitude, fix.longitude);
            }
        });
    } catch (e) {
        if (settled) return;
        settled = true;
        clearTimeout(useFallback);
        fetchFor(FALLBACK_LAT, FALLBACK_LON);
    }
}

export function onUpdate(cb) {
    notify = cb;
}
