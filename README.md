# pebble-iso-analog

Analog watchface for the Pebble Time 2 (Emery, 200x228, 64 colours) showing the ISO date and current weather.

## Toolchain

```
sudo apt install nodejs npm libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g libsndio7.0
uv tool install pebble-tool
pebble build
pebble install --emulator emery
```

## Vendored skill

`.claude/skills/pebble-watchface/` is a copy of the official Core Devices watchface skill,
https://github.com/coredevices/pebble-watchface-agent-skill at commit 363bac9c8e672d62400fbf1b6e3bd4c8e0faca45
(upstream HEAD, 2026-08-04). To update, re-copy `.claude/skills/pebble-watchface` from a fresh clone.
