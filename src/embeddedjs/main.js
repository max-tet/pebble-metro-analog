import Poco from "commodetto/Poco";
import Health from "pebble/health";
import { drawIcon } from "icons";
import * as weather from "weather";

const render = new Poco(screen);
const W = render.width;
const H = render.height;

const mk = (r, g, b) => render.makeColor(r, g, b);
const BLACK = mk(0, 0, 0);
const WHITE = mk(255, 255, 255);

const TILE = {
    clock:   { rect: [67, 1, 132, 150] },
    date:    { rect: [1, 1, 64, 74],     bg: mk(0, 85, 170),  tint: mk(85, 170, 255) },
    weather: { rect: [1, 77, 64, 74],    bg: mk(170, 85, 0),  tint: mk(255, 170, 85) },
    rain:    { rect: [1, 153, 64, 74],   bg: mk(0, 170, 170), tint: mk(85, 255, 255) },
    uv:      { rect: [67, 153, 65, 74],  bg: mk(85, 0, 170),  tint: mk(170, 85, 255) },
    fit:     { rect: [134, 153, 65, 74], bg: mk(0, 170, 85),  tint: mk(85, 255, 170) }
};

const fontLabel = new render.Font("Gothic-Regular", 14);
const fontValue = new render.Font("Gothic-Bold", 24);
const fontBig = new render.Font("Gothic-Bold", 28);

const CX = TILE.clock.rect[0] + TILE.clock.rect[2] / 2;
const CY = TILE.clock.rect[1] + TILE.clock.rect[3] / 2;
const R_NUM = 52;
const HAND_GAP = 9;

const NUMERALS = [];
for (let i = 1; i <= 12; i++) {
    const a = i * Math.PI / 6;
    const label = String(i);
    NUMERALS.push({
        label,
        x: Math.round(CX + Math.sin(a) * R_NUM - render.getTextWidth(label, fontLabel) / 2),
        y: Math.round(CY - Math.cos(a) * R_NUM - fontLabel.height / 2)
    });
}

let lastDate = new Date();
let wx = weather.cached();
let steps = null;
let bpm = null;

function isoWeek(d) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
    const jan4 = new Date(t.getFullYear(), 0, 4);
    jan4.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + 3);
    return 1 + Math.round((t - jan4) / (7 * 86400000));
}

function centered(str, font, color, cx, y) {
    render.drawText(str, font, color, Math.round(cx - render.getTextWidth(str, font) / 2), y);
}

function tileBase(t, label) {
    const [x, y, w, h] = t.rect;
    render.fillRectangle(t.bg, x, y, w, h);
    if (label) render.drawText(label, fontLabel, WHITE, x + 4, y + 3);
    return [x, y, w, h];
}

function hand(angle, inner, outer, thickness) {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    render.drawLine(
        Math.round(CX + s * inner), Math.round(CY - c * inner),
        Math.round(CX + s * outer), Math.round(CY - c * outer), WHITE, thickness);
}

function drawClock(now) {
    const [x, y, w, h] = TILE.clock.rect;
    render.fillRectangle(BLACK, x, y, w, h);
    for (let i = 0; i < NUMERALS.length; i++)
        render.drawText(NUMERALS[i].label, fontLabel, WHITE, NUMERALS[i].x, NUMERALS[i].y);
    const minutes = now.getMinutes();
    hand((now.getHours() % 12 + minutes / 60) * Math.PI / 6, HAND_GAP, 30, 7);
    hand(minutes * Math.PI / 30, HAND_GAP, 43, 3);
}

function drawDate(now) {
    const t = TILE.date;
    const [x, y, w] = tileBase(t, null);
    const cx = x + w / 2;
    const md = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    centered(String(now.getFullYear()), fontValue, WHITE, cx, y + 4);
    centered(md, fontValue, WHITE, cx, y + 28);
    centered(`W${String(isoWeek(now)).padStart(2, "0")}`, fontLabel, WHITE, cx, y + 56);
}

function arrow(x, y, up) {
    const stemY = up ? y + 3 : y;
    render.fillRectangle(WHITE, x + 2, stemY, 1, 6);
    for (let i = 0; i < 3; i++)
        render.fillRectangle(WHITE, x + 2 - i, up ? y + i : y + 8 - i, 1 + 2 * i, 1);
}

function drawHighLow(cx, y) {
    const low = String(wx.tmin);
    const high = String(wx.tmax);
    const lw = render.getTextWidth(low, fontLabel);
    const hw = render.getTextWidth(high, fontLabel);
    let px = Math.round(cx - (lw + hw + 18) / 2);
    render.drawText(low, fontLabel, WHITE, px, y);
    px += lw + 3;
    arrow(px, y + 5, false);
    px += 7;
    arrow(px, y + 5, true);
    px += 8;
    render.drawText(high, fontLabel, WHITE, px, y);
}

function drawWeather() {
    const t = TILE.weather;
    const [x, y, w] = tileBase(t, null);
    const cx = x + w / 2;
    if (!wx) {
        centered("--°", fontValue, WHITE, cx, y + 26);
        centered(weather.status() ?? "...", fontLabel, t.tint, cx, y + 52);
        return;
    }
    drawIcon(render, Math.round(cx), y + 20, WHITE, t.bg, wx.code, wx.isDay);
    centered(`${wx.temp}°`, fontValue, WHITE, cx, y + 34);
    drawHighLow(cx, y + 58);
}

function drawRain() {
    const t = TILE.rain;
    const [x, y, w] = tileBase(t, "RAIN");
    const cx = x + w / 2;
    centered(wx ? `${wx.rain}%` : "--", fontBig, WHITE, cx, y + 20);
    centered("6h", fontLabel, WHITE, cx, y + 52);
}

function drawUv() {
    const t = TILE.uv;
    const [x, y, w] = tileBase(t, null);
    const cx = Math.round(x + w / 2);
    const cy = y + 29;
    const rays = wx ? wx.uvMax : 0;
    for (let i = 0; i < rays; i++) {
        const a = i * 2 * Math.PI / rays;
        const s = Math.sin(a);
        const c = Math.cos(a);
        const thick = i < wx.uv;
        const outer = thick ? 26 : 20;
        render.drawLine(
            Math.round(cx + s * 17), Math.round(cy - c * 17),
            Math.round(cx + s * outer), Math.round(cy - c * outer), WHITE, thick ? 3 : 2);
    }
    render.drawCircle(WHITE, cx, cy, 14, 0, 360);
    centered(wx ? String(wx.uv) : "--", fontValue, t.bg, cx, cy - 14);
    if (wx) centered(`max ${wx.uvMax}`, fontLabel, WHITE, cx, y + 57);
}

function heart(x, y) {
    render.drawCircle(WHITE, x + 3, y + 3, 3, 0, 360);
    render.drawCircle(WHITE, x + 8, y + 3, 3, 0, 360);
    for (let i = 0; i < 6; i++)
        render.fillRectangle(WHITE, x + i, y + 5 + i, 11 - 2 * i, 1);
}

function drawFit() {
    const t = TILE.fit;
    const [x, y, w] = tileBase(t, "STEPS");
    const cx = x + w / 2;
    centered(steps === null ? "--" : (steps >= 10000 ? `${Math.round(steps / 1000)}k` : String(steps)),
        fontValue, WHITE, cx, y + 18);
    const pulse = bpm ? String(bpm) : "--";
    const px = Math.round(cx - (render.getTextWidth(pulse, fontValue) + 15) / 2);
    heart(px, y + 52);
    render.drawText(pulse, fontValue, WHITE, px + 15, y + 46);
}

function draw(event) {
    const now = event?.date ?? lastDate;
    lastDate = now;
    render.begin();
    render.fillRectangle(BLACK, 0, 0, W, H);
    drawClock(now);
    drawDate(now);
    drawWeather();
    drawRain();
    drawUv();
    drawFit();
    render.end();
}

// The two accessors are not interchangeable, whatever the guide says: a
// cumulative metric reads 0 from get() and its daily total from query(),
// while heart rate is the other way round. Availability is deliberately not
// consulted, because the emulated board reports the heart rate monitor as
// unsupported while still delivering readings.
function reading(read) {
    try {
        const value = read();
        return Number.isFinite(value) ? value : null;
    } catch (e) {
        return null;
    }
}

function readHealth() {
    steps = reading(() => Health.metric.query({ metric: "step count" }));
    bpm = reading(() => Health.metric.get("heart rate")) || null;
}

readHealth();

watch.addEventListener("health", () => {
    readHealth();
    draw();
});

weather.onUpdate(data => {
    wx = data;
    draw();
});

weather.onStatus(() => {
    if (!wx) draw();
});

watch.addEventListener("minutechange", draw);
watch.addEventListener("hourchange", () => weather.request());
