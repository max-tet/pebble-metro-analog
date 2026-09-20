import Poco from "commodetto/Poco";
import Battery from "embedded:sensor/Battery";
import { drawIcon } from "icons";
import * as weather from "weather";

const render = new Poco(screen);
const W = render.width;
const H = render.height;

const mk = (r, g, b) => render.makeColor(r, g, b);
const BLACK = mk(0, 0, 0);
const WHITE = mk(255, 255, 255);

const TILE = {
    clock:   { rect: [1, 1, 132, 150] },
    date:    { rect: [135, 1, 64, 74],   bg: mk(0, 85, 170),  tint: mk(85, 170, 255) },
    weather: { rect: [135, 77, 64, 74],  bg: mk(170, 85, 0),  tint: mk(255, 170, 85) },
    rain:    { rect: [1, 153, 65, 74],   bg: mk(0, 170, 170), tint: mk(85, 255, 255) },
    uv:      { rect: [68, 153, 65, 74],  bg: mk(85, 0, 170),  tint: mk(170, 85, 255) },
    batt:    { rect: [135, 153, 64, 74], bg: mk(0, 170, 85),  tint: mk(85, 255, 170) }
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
let battPct = 0;

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
    const [x, y, w] = tileBase(t, "DATE");
    const cx = x + w / 2;
    const md = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    centered(md, fontValue, WHITE, cx, y + 20);
    centered(String(now.getFullYear()), fontLabel, WHITE, cx, y + 46);
    centered(`W${String(isoWeek(now)).padStart(2, "0")}`, fontLabel, WHITE, cx, y + 58);
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
    centered(`${wx.tmax}/${wx.tmin}`, fontLabel, WHITE, cx, y + 58);
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
    const [x, y, w] = tileBase(t, "UV");
    const cx = x + w / 2;
    centered(wx ? String(wx.uv) : "--", fontBig, WHITE, cx, y + 20);
    centered(wx ? `max ${wx.uvMax}` : "", fontLabel, WHITE, cx, y + 52);
}

function drawBatt() {
    const t = TILE.batt;
    const [x, y, w] = tileBase(t, "BATT");
    const cx = x + w / 2;
    centered(`${battPct}%`, fontValue, WHITE, cx, y + 22);
    const bw = w - 16;
    render.fillRectangle(t.tint, x + 8, y + 54, bw, 8);
    render.fillRectangle(t.bg, x + 9, y + 55, bw - 2, 6);
    render.fillRectangle(WHITE, x + 9, y + 55, Math.round((bw - 2) * battPct / 100), 6);
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
    drawBatt();
    render.end();
}

let battery = null;
try {
    battery = new Battery({
        onSample() {
            battPct = Math.round(this.sample().percent);
            draw();
        }
    });
    battPct = Math.round(battery.sample().percent);
} catch (e) {
}

weather.onUpdate(data => {
    wx = data;
    draw();
});

weather.onStatus(() => {
    if (!wx) draw();
});

watch.addEventListener("minutechange", draw);
watch.addEventListener("hourchange", () => weather.request());
