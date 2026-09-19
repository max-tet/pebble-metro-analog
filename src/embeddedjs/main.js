import Poco from "commodetto/Poco";
import Location from "embedded:sensor/Location";

const render = new Poco(screen);
const W = render.width;
const H = render.height;

const BAR_H = 34;
const CX = W >> 1;
const CY = (H - BAR_H) >> 1;
const R = Math.min(CX, CY) - 2;

const black = render.makeColor(0, 0, 0);
const white = render.makeColor(255, 255, 255);
const grey = render.makeColor(85, 85, 85);
const lightGrey = render.makeColor(170, 170, 170);
const barColor = render.makeColor(28, 28, 28);
const amber = render.makeColor(255, 170, 0);

const dateFont = new render.Font("Gothic-Bold", 18);
const tempFont = new render.Font("Gothic-Bold", 18);

const TICKS = [];
for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const major = (i % 3) === 0;
    const outer = R - 2;
    const inner = major ? R - 17 : R - 9;
    TICKS.push({
        x1: Math.round(CX + s * inner), y1: Math.round(CY - c * inner),
        x2: Math.round(CX + s * outer), y2: Math.round(CY - c * outer),
        thickness: major ? 4 : 2,
        color: major ? white : grey
    });
}

let lastDate = new Date();
let weatherText = "--°";

function isoDate(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}

function hand(angle, length, tail, thickness, color) {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    render.drawLine(
        Math.round(CX - s * tail), Math.round(CY + c * tail),
        Math.round(CX + s * length), Math.round(CY - c * length),
        color, thickness);
}

function draw(event) {
    const now = event?.date ?? lastDate;
    lastDate = now;

    render.begin();
    render.fillRectangle(black, 0, 0, W, H);

    for (let i = 0; i < TICKS.length; i++) {
        const t = TICKS[i];
        render.drawLine(t.x1, t.y1, t.x2, t.y2, t.color, t.thickness);
    }

    const minutes = now.getMinutes();
    const hours = now.getHours() % 12;
    hand((hours + minutes / 60) * Math.PI / 6, R - 42, 14, 7, white);
    hand(minutes * Math.PI / 30, R - 14, 16, 5, white);
    render.drawCircle(white, CX, CY, 5, 0, 360);
    render.drawCircle(black, CX, CY, 2, 0, 360);

    render.fillRectangle(barColor, 0, H - BAR_H, W, BAR_H);
    const textY = H - BAR_H + ((BAR_H - dateFont.height) >> 1);
    render.drawText(isoDate(now), dateFont, lightGrey, 6, textY);
    const tw = render.getTextWidth(weatherText, tempFont);
    render.drawText(weatherText, tempFont, amber, W - 6 - tw, textY);

    render.end();
}

const FALLBACK_LAT = 48.14;
const FALLBACK_LON = 11.58;
const RETRY_MS = 20000;
const FIX_TIMEOUT_MS = 10000;

function conditionWord(code) {
    if (code === 0) return "Clear";
    if (code <= 2) return "Fair";
    if (code === 3) return "Cloud";
    if (code <= 48) return "Fog";
    if (code <= 57) return "Drizzle";
    if (code <= 67) return "Rain";
    if (code <= 77) return "Snow";
    if (code <= 82) return "Showers";
    if (code <= 86) return "Snow";
    return "Storm";
}

function restoreWeather() {
    try {
        const stored = JSON.parse(localStorage.getItem("weather"));
        if (stored && Date.now() - stored.at < 6 * 3600 * 1000)
            weatherText = `${stored.temp}° ${conditionWord(stored.code)}`;
    } catch (e) {
    }
}

function applyWeather(data) {
    inFlight = false;
    const current = data?.current;
    if (!current) return scheduleRetry();
    const temp = Math.round(current.temperature_2m);
    const code = current.weather_code;
    weatherText = `${temp}° ${conditionWord(code)}`;
    try {
        localStorage.setItem("weather", JSON.stringify({ temp, code, at: Date.now() }));
    } catch (e) {
    }
    draw();
}

function scheduleRetry() {
    inFlight = false;
    setTimeout(requestWeather, RETRY_MS);
}

let client = null;
let inFlight = false;

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

function fetchWeather(lat, lon) {
    const path = `/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
        `&current=temperature_2m,weather_code`;
    httpGetJSON("api.open-meteo.com", path, applyWeather, () => scheduleRetry());
}

function requestWeather() {
    if (inFlight) return;
    if (!watch.connected.pebblekit) return scheduleRetry();
    inFlight = true;

    let settled = false;
    const useFallback = setTimeout(() => {
        if (settled) return;
        settled = true;
        fetchWeather(FALLBACK_LAT, FALLBACK_LON);
    }, FIX_TIMEOUT_MS);

    try {
        new Location({
            onSample() {
                const fix = this.sample();
                this.close();
                if (settled) return;
                settled = true;
                clearTimeout(useFallback);
                fetchWeather(fix.latitude, fix.longitude);
            }
        });
    } catch (e) {
        if (settled) return;
        settled = true;
        clearTimeout(useFallback);
        fetchWeather(FALLBACK_LAT, FALLBACK_LON);
    }
}

restoreWeather();
watch.addEventListener("minutechange", draw);
watch.addEventListener("hourchange", () => requestWeather());
