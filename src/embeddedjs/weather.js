import Message from "pebble/message";

const CACHE_MAX_AGE_MS = 6 * 3600 * 1000;
const ERRORS = { 1: "no net", 2: "timeout", 3: "bad data" };

let notify = null;
let notifyStatus = null;
let lastError = null;

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

const message = new Message({
    keys: ["TEMP", "TMAX", "TMIN", "UV", "UVMAX", "RAIN", "CODE", "ISDAY", "ERR", "REQ"],
    onReadable() {
        const msg = this.read();
        const err = msg.get("ERR");
        if (err) {
            lastError = ERRORS[err] ?? "error";
            notifyStatus?.(lastError);
            return;
        }
        const data = {
            temp: msg.get("TEMP"),
            tmax: msg.get("TMAX"),
            tmin: msg.get("TMIN"),
            uv: msg.get("UV"),
            uvMax: msg.get("UVMAX"),
            rain: msg.get("RAIN"),
            code: msg.get("CODE"),
            isDay: msg.get("ISDAY"),
            at: Date.now()
        };
        if (data.temp === undefined) return;
        lastError = null;
        store(data);
        notify?.(data);
    }
});

export function request() {
    try {
        message.write(new Map([["REQ", 1]]));
    } catch (e) {
        lastError = "no link";
        notifyStatus?.(lastError);
    }
}

export function status() {
    return lastError;
}

export function onUpdate(cb) {
    notify = cb;
}

export function onStatus(cb) {
    notifyStatus = cb;
}
