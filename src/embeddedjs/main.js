import Poco from "commodetto/Poco";
import Health from "pebble/health";
import Accelerometer from "embedded:sensor/Accelerometer";
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
    clock:   { x: 67,  y: 1,   w: 132, h: 150 },
    date:    { x: 1,   y: 1,   w: 64,  h: 74, bg: mk(0, 85, 170),  tint: mk(85, 170, 255) },
    weather: { x: 1,   y: 77,  w: 64,  h: 74, bg: mk(170, 85, 0),  tint: mk(255, 170, 85) },
    rain:    { x: 1,   y: 153, w: 64,  h: 74, bg: mk(0, 170, 170), tint: mk(85, 255, 255) },
    uv:      { x: 67,  y: 153, w: 65,  h: 74, bg: mk(85, 0, 170),  tint: mk(170, 85, 255) },
    fit:     { x: 134, y: 153, w: 65,  h: 74, bg: mk(0, 170, 85),  tint: mk(85, 255, 170) }
};

const fontLabel = new render.Font("Gothic-Regular", 14);
const fontValue = new render.Font("Gothic-Bold", 24);
const fontBig = new render.Font("Gothic-Bold", 28);

const CX = TILE.clock.x + TILE.clock.w / 2;
const CY = TILE.clock.y + TILE.clock.h / 2;
const R_NUM = 52;
const HAND_GAP = 9;

// Half a tile's height: how far the face slides up on a shake, and the
// height of the three tiles that slide into view below it.
const HALF = TILE.fit.h / 2;
const SLIDE_MS = 300;
const HOLD_MS = 4000;
const FRAME_MS = 33; // ~30fps; 17ms (~60fps) costs more battery for no visible gain here

const REVEAL = {
    fit:  { x: TILE.fit.x,  y: H, w: TILE.fit.w,  h: HALF, bg: TILE.fit.bg },
    rain: { x: TILE.rain.x, y: H, w: TILE.rain.w, h: HALF, bg: TILE.rain.bg },
    uv:   { x: TILE.uv.x,   y: H, w: TILE.uv.w,   h: HALF, bg: TILE.uv.bg }
};

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (deg) => COMPASS[Math.round(deg / 45) % 8];

let lastDate = new Date();
let wx = weather.cached();
let steps = null;
let bpm = null;
let calories = null;
let sleepSeconds = null;
let batteryPct = null;
let connected = watch.connected.app;
let slideY = 0;
let animTimer = null;
let holdTimer = null;

const isoWeek = (d) => {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
    const jan4 = new Date(t.getFullYear(), 0, 4);
    jan4.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + 3);
    return 1 + Math.round((t - jan4) / (7 * 86400000));
};

const centered = (str, font, color, cx, y) => {
    render.drawText(str, font, color, Math.round(cx - render.getTextWidth(str, font) / 2), y);
};

const tileBase = (t, label) => {
    render.fillRectangle(t.bg, t.x, t.y, t.w, t.h);
    if (label) render.drawText(label, fontLabel, WHITE, t.x + 4, t.y + 3);
};

const hand = (angle, inner, outer, thickness) => {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    render.drawLine(
        Math.round(CX + s * inner), Math.round(CY - c * inner),
        Math.round(CX + s * outer), Math.round(CY - c * outer), WHITE, thickness);
};

const drawClock = (now) => {
    const { x, y, w, h } = TILE.clock;
    render.fillRectangle(BLACK, x, y, w, h);
    for (let i = 1; i <= 12; i++) {
        const a = i * Math.PI / 6;
        const label = String(i);
        render.drawText(label, fontLabel, WHITE,
            Math.round(CX + Math.sin(a) * R_NUM - render.getTextWidth(label, fontLabel) / 2),
            Math.round(CY - Math.cos(a) * R_NUM - fontLabel.height / 2));
    }
    const minutes = now.getMinutes();
    hand((now.getHours() % 12 + minutes / 60) * Math.PI / 6, HAND_GAP, 30, 7);
    hand(minutes * Math.PI / 30, HAND_GAP, 43, 3);
};

// Stacked top to bottom as week, year, month/day: on a shake-reveal slide
// (see HALF) that order clips the week number off first, halves the year,
// and leaves month/day untouched, in that priority.
const drawDate = (now) => {
    const t = TILE.date;
    tileBase(t, null);
    const { x, y, w } = t;
    const cx = x + w / 2;
    const md = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    centered(`W${String(isoWeek(now)).padStart(2, "0")}`, fontLabel, WHITE, cx, y + 1);
    centered(String(now.getFullYear()), fontValue, WHITE, cx, y + 25);
    centered(md, fontValue, WHITE, cx, y + 48);
};

const arrow = (x, y, up) => {
    const stemY = up ? y + 3 : y;
    render.fillRectangle(WHITE, x + 2, stemY, 1, 6);
    for (let i = 0; i < 3; i++)
        render.fillRectangle(WHITE, x + 2 - i, up ? y + i : y + 8 - i, 1 + 2 * i, 1);
};

const drawHighLow = (cx, y) => {
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
};

const drawWeather = () => {
    const t = TILE.weather;
    tileBase(t, null);
    const { x, y, w } = t;
    const cx = x + w / 2;
    if (!wx) {
        centered("--°", fontValue, WHITE, cx, y + 26);
        centered(weather.status() ?? "...", fontLabel, t.tint, cx, y + 52);
        return;
    }
    drawIcon(render, Math.round(cx), y + 20, WHITE, t.bg, wx.code, wx.isDay);
    centered(`${wx.temp}°`, fontValue, WHITE, cx, y + 34);
    drawHighLow(cx, y + 58);
};

const drawRain = () => {
    const t = TILE.rain;
    tileBase(t, "RAIN");
    const { x, y, w } = t;
    const cx = x + w / 2;
    centered(wx ? `${wx.rain}%` : "--", fontBig, WHITE, cx, y + 20);
    centered("6h", fontLabel, WHITE, cx, y + 52);
};

const drawUv = () => {
    const t = TILE.uv;
    tileBase(t, null);
    const { x, y, w } = t;
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
    // drawCircle's pie-slice fill throws "cannot coerce to integer" under a
    // translated origin (see HALF/draw); pop out to screen space for it and
    // push the same translation back right after.
    render.origin();
    render.drawCircle(WHITE, cx, cy + Math.round(slideY), 14, 0, 360);
    render.origin(0, Math.round(slideY));
    centered(wx ? String(wx.uv) : "--", fontValue, t.bg, cx, cy - 14);
    if (wx) centered(`max ${wx.uvMax}`, fontLabel, WHITE, cx, y + 57);
};

// Small glyphs as one bitmask per pixel row, the leftmost pixel in the
// highest of the glyph's width in bits, 1 lit and 0 not. They are not built
// from drawCircle, because Poco fills a circle as a pie slice and two
// overlapping slices leave a seam down the middle at this size.
//
// A flat array of numbers costs a few hundred bytes of heap; the nested
// arrays these replaced cost about 1.9 KB. Pixel-art strings would cost
// nothing to hold, but XS allocates a String wrapper object for every
// property access on a string primitive, so decoding one character at a
// time on every draw buried the heap in garbage and ran the collector three
// times per frame.
const WALK = [
    0b000110000,
    0b000110000,
    0b000000000,
    0b001111000,
    0b011111000,
    0b001111000,
    0b001110000,
    0b001111000,
    0b001101100,
    0b011000110,
    0b011000011,
    0b110000011
];
const HEART = [
    0b011101110,
    0b111111111,
    0b111111111,
    0b111111111,
    0b011111110,
    0b001111100,
    0b000111000,
    0b000010000
];

// Fills each horizontal run of lit pixels with one rectangle.
const glyph = (rows, width, x, y) => {
    for (let row = 0; row < rows.length; row++) {
        let runStart = -1;
        for (let col = 0; col <= width; col++) {
            const lit = col < width && ((rows[row] >> (width - 1 - col)) & 1) === 1;
            if (lit) {
                if (runStart < 0) runStart = col;
            } else if (runStart >= 0) {
                render.fillRectangle(WHITE, x + runStart, y + row, col - runStart, 1);
                runStart = -1;
            }
        }
    }
};

const fitRow = (cx, y, rows, gw, gy, text) => {
    const left = Math.round(cx - (gw + 4 + render.getTextWidth(text, fontValue)) / 2);
    glyph(rows, gw, left, y + gy);
    render.drawText(text, fontValue, WHITE, left + gw + 4, y);
};

const drawFit = () => {
    const t = TILE.fit;
    tileBase(t, null);
    const { x, y, w } = t;
    const cx = x + w / 2;
    const count = steps === null ? "--" : (steps >= 10000 ? `${Math.round(steps / 1000)}k` : String(steps));
    fitRow(cx, y + 10, WALK, 9, 6, count);
    fitRow(cx, y + 40, HEART, 9, 8, bpm ? String(bpm) : "--");
};

// Same two-column "<left> | <right>" text layout for all three reveal
// tiles; text only, no new glyph arrays, since the XS heap has barely any
// headroom left for pixel-art data (see agents.md).
const revealRow = (t, left, right) => {
    render.fillRectangle(t.bg, t.x, t.y, t.w, t.h);
    const lw = render.getTextWidth(left, fontLabel);
    const rw = render.getTextWidth(right, fontLabel);
    const gap = 3;
    const px = Math.round(t.x + (t.w - (lw + gap + rw)) / 2);
    const ty = t.y + Math.round(t.h / 2) - Math.round(fontLabel.height / 2);
    render.drawText(left, fontLabel, WHITE, px, ty);
    render.drawText(right, fontLabel, WHITE, px + lw + gap, ty);
};

const drawReveal = () => {
    revealRow(REVEAL.fit,
        calories === null ? "--kcal" : `${Math.round(calories)}kcal`,
        sleepSeconds === null ? "Z--h" : `Z${(sleepSeconds / 3600).toFixed(1)}h`);
    revealRow(REVEAL.rain,
        wx?.humidity != null ? `${wx.humidity}%` : "--%",
        wx?.windDir != null && wx?.windSpeed != null ? `${compass(wx.windDir)}${Math.round(wx.windSpeed)}` : "--");
    revealRow(REVEAL.uv,
        batteryPct === null ? "--%" : `${batteryPct}%`,
        connected ? "BT" : "no BT");
};

const draw = (event) => {
    const now = event?.date ?? lastDate;
    lastDate = now;
    render.begin();
    render.origin(0, Math.round(slideY));
    render.fillRectangle(BLACK, 0, 0, W, H);
    drawClock(now);
    drawDate(now);
    drawWeather();
    drawRain();
    drawUv();
    drawFit();
    if (slideY) drawReveal();
    render.origin();
    render.end();
};

// A shake is the accelerometer's own tap event: there is no separate
// "shake" gesture in the API. Interrupting mid-slide (another shake while
// still up, or while sliding back down) just redirects from wherever the
// face currently is; the animation always runs for SLIDE_MS regardless of
// remaining distance, which is simple but means an interrupted reversal
// moves slower than a full slide. Good enough for a UI transition.
const slideTo = (target, onDone) => {
    if (animTimer) clearInterval(animTimer);
    const start = slideY;
    const distance = target - start;
    const startTime = Date.now();
    animTimer = setInterval(() => {
        const t = Math.min(1, (Date.now() - startTime) / SLIDE_MS);
        slideY = start + distance * t;
        draw();
        if (t >= 1) {
            clearInterval(animTimer);
            animTimer = null;
            onDone?.();
        }
    }, FRAME_MS);
};

const returnDown = () => {
    holdTimer = null;
    slideTo(0);
};

const reveal = () => {
    if (holdTimer) clearTimeout(holdTimer);
    if (slideY === -HALF) {
        holdTimer = setTimeout(returnDown, HOLD_MS);
        return;
    }
    slideTo(-HALF, () => {
        holdTimer = setTimeout(returnDown, HOLD_MS);
    });
};

new Accelerometer({ onTap() { reveal(); } });

const batterySensor = new Battery({ onSample() { batteryPct = this.sample().percent; } });
batteryPct = batterySensor.sample().percent;

watch.addEventListener("connected", () => { connected = watch.connected.app; });

// The two accessors are not interchangeable, whatever the guide says: a
// cumulative metric reads 0 from get() and its daily total from query(),
// while heart rate is the other way round. Availability is deliberately not
// consulted, because the emulated board reports the heart rate monitor as
// unsupported while still delivering readings.
const reading = (read) => {
    try {
        const value = read();
        return Number.isFinite(value) ? value : null;
    } catch (e) {
        return null;
    }
};

const readHealth = () => {
    steps = reading(() => Health.metric.query({ metric: "step count" }));
    bpm = reading(() => Health.metric.get("heart rate")) || null;
    calories = reading(() => Health.metric.query({ metric: "active calories" }));
    sleepSeconds = reading(() => Health.metric.query({ metric: "sleep seconds" }));
};

readHealth();

// Health fires for every event type, sleep and heart rate variability
// included, and for every heart rate sample, most of which leave both
// readings unchanged. Redraw only when something on the face would change.
watch.addEventListener("health", () => {
    const shownSteps = steps;
    const shownBpm = bpm;
    const shownCalories = calories;
    const shownSleep = sleepSeconds;
    readHealth();
    if (steps !== shownSteps || bpm !== shownBpm || calories !== shownCalories || sleepSeconds !== shownSleep) draw();
});

weather.onUpdate(data => {
    wx = data;
    draw();
});

weather.onStatus(() => {
    if (!wx) draw();
});

watch.addEventListener("minutechange", draw);
watch.addEventListener("hourchange", weather.request);
