# Working on this repository

A watchface for the Pebble Time 2, written in JavaScript. Read this before changing anything:
most of what follows was learned by breaking the watch, and none of it is discoverable from
the code alone.

## The shape of the thing

| Path | Runs on | Purpose |
| --- | --- | --- |
| `src/embeddedjs/main.js` | watch | Layout, drawing, event wiring. The whole face. |
| `src/embeddedjs/weather.js` | watch | Receives weather over AppMessage, caches it, exposes it to `main.js`. |
| `src/embeddedjs/icons.js` | watch | Nine weather icons drawn from primitives. |
| `src/embeddedjs/manifest.json` | build | Module list for the Moddable build. |
| `src/pkjs/index.js` | phone | Geolocation and the Open-Meteo HTTP call. |
| `package.json` | both | UUID, target platform, `messageKeys`, version. |
| `.github/workflows/publish.yml` | CI | Publishes the appstore release on a GitHub release. |

The watch side is [Alloy](https://developer.repebble.com/guides/alloy/), Moddable's XS engine
with the Poco graphics library. The phone side is PebbleKit JS, an old JavaScript environment
in the Pebble mobile app: write ES5 there, `var` and callbacks, no arrow functions.

## Platform

`emery` only, which is the Pebble Time 2: 200x228, rectangular, 64 colours, 202 PPI. Alloy
supports only `emery` and `gabbro` (Round 2, 260x260 and round); everything older needs the C
SDK. Adding `gabbro` to `targetPlatforms` is not a flag flip, because every rectangle in
`TILE` assumes a rectangular screen.

Two bits per channel means each of red, green and blue is 0, 85, 170 or 255. Anything else is
quantised. The display is reflective and desaturates further: a fill specified as RGB 0, 85,
170 measures 22, 99, 141 in a screenshot. Pick colours from the palette and check them on the
emulator rather than reasoning about them.

## Rules that will cost you a day if you break them

**Never make an HTTP request from the watch.** This is the big one. `httpclient-pebble.js`
keeps the AppMessage channel in a module-global `state`; closing the last client destroys
`state.messages` while leaving `state.writable` set, and the next request writes into the
rebuilt channel and throws `not writable` from inside a library callback, where nothing can
catch it. The watch dies with a fatal error. Not closing the client instead leaks abandoned
requests until the VM reports `memory full`. Weather is fetched on the phone in
`src/pkjs/index.js` and sent over AppMessage for this reason, which is also what the Pebble
SDK's own templates and tutorials do.

**No callback on the phone side is guaranteed to fire.** A verified `XMLHttpRequest` against
an unreachable host fired neither `onerror` nor `ontimeout`, and `getCurrentPosition` returned
through neither of its callbacks despite its own `timeout` option. Both paths therefore carry
a hand-rolled `setTimeout` deadline. If you add another call to the outside world, give it a
deadline too, or its failure mode is silence.

**Font name and size combinations are validated at runtime, not at build.** An invalid pair
builds cleanly and then kills the VM at launch: white screen, no error, nothing in the logs.
The valid set is Gothic-Regular and Gothic-Bold at 14, 18, 24 and 28, Bitham-Bold at 42,
Bitham-Black at 30, and Leco-Regular from 20 to 42.

**Every module has to be listed in `manifest.json`.** A missing entry is not a build error; it
is a runtime failure on the first import.

**Time listeners fire immediately when you register them.** `watch.addEventListener("minutechange", draw)`
draws straight away, and the `hourchange` listener requests weather straight away. Do not add
an explicit call at startup as well: the second request overlaps the first, and the one-shot
location sensor throws on the second caller, which silently falls back to the default
coordinates and looks like working weather for the wrong place.

**Poco has no stroked-circle primitive.** `drawCircle(color, cx, cy, r, startAngle, endAngle)`
fills a pie slice. Rings and arcs are built from `fillRectangle` and `drawLine`.

**`messageKeys` in `package.json` is the contract.** Both `weather.js` and `index.js` refer to
those names; changing one without the other fails silently, because a missing key reads as
`undefined`.

## Layout

The grid is three by three with a one pixel gutter. The clock occupies the top-left four
cells; the other five tiles are date, weather, rain, UV and battery. Geometry lives in `TILE`
at the top of `main.js`, and the clock's centre, numeral radius and hand gap derive from it:

```
CX, CY     centre of the clock tile
R_NUM 52   radius the twelve numerals sit on
HAND_GAP 9 hands start here, so the centre stays empty and both hands float
```

Hands are deliberately short and of different thicknesses: the hour hand is 7 pixels thick and
reaches 30, the minute hand 3 and reaches 43. Labels and values are white, because the tint
colours lose too much contrast on the real display.

Weather values render as `--` with a status word when there is no data. The word names the
failing hop, which is the only diagnostic channel once the face is on a wrist: `...` while the
first answer is outstanding, `no link` when the watch cannot reach the phone, `no net`,
`timeout`, `bad data`, or `error`.

## Building and running

```
uv tool install pebble-tool --python 3.13     # once
pebble sdk install latest                     # once
pebble build
pebble install --emulator emery
pebble logs
pebble screenshot shot.png
pebble kill
```

No npm step: the dependency list is empty and the build works with no `node_modules` at all.

`pebble emu-set-time` takes `HH:MM:SS` and nothing else, and the face only redraws on the next
minute tick, so a change looks ineffective for up to a minute.

Installing on real hardware goes through the cloud relay: enable Dev Connect in the phone app
under Devices, then `pebble login` and `pebble install --cloudpebble`.

`pebble login` on a headless machine hangs, because it opens a callback server on
`localhost:60000` and calls `webbrowser.open`, which does nothing. Run
`pebble login --no-open-browser`, forward the port (`ssh -N -L 60000:localhost:60000 <host>`)
and open the printed URL. The broker rejects any callback host other than localhost.

## Verifying a change

State the pass and fail criteria before running the check, and make sure a broken version
would fail it.

For weather, `pebble wipe` first. Otherwise `localStorage` serves a cached reading and the
face looks correct while the code under test never ran. Compare the values on the face against
a live Open-Meteo call made at the same moment, not against what they were last time.

For the failure paths, point the phone side at an unreachable host and confirm the face shows
the right word rather than going blank.

## Releasing

Bump `version` in `package.json` directly on `main` while preparing the release, never in a
PR. Then publish a GitHub release whose tag matches (`v1.0.1` or `1.0.1`). The workflow fails the job when they disagree, builds, and uploads with
`--is-published`, so the store updates itself.

The store screenshot is `docs/screenshot.png`, the same file the README shows. The job
uploads it as `emery_screenshot.png`, because the tool reads the platform from the start of the
file name, and replaces whatever the listing had. No emulator runs in CI. After a visual
change, retake that file on the emulator with weather data and commit it before the release.
If the store rejects the image, the tool retries without it and the job still goes green; the
log then says `Screenshot validation failed`.

The job authenticates from the `PEBBLE_CREDENTIALS` secret, whose value is the whole of
`~/.local/share/pebble-sdk/oauth_firebase/firebase_oauth_storage.json` as `pebble login` writes
it. Note the `oauth_firebase` subdirectory: the file one level up is silently ignored and the
job then runs logged out.

## Conventions

Commit messages follow [Scoped Commits](https://scopedcommits.com/): `<scope>: <description>`,
where the scope is the area touched, never a change type. The history so far uses `watchface`,
`weather`, `build`, `ci` and `meta`; add a new one here when you need it.

Reasoning belongs in the commit body, not in a comment. The two comments in `src/pkjs/index.js`
survive because the code looks redundant without them.

`screenshots/`, `build/`, `node_modules/`, `*.pbw` and `.lock-waf_*` are generated and ignored.
The waf lock file in particular contains a dump of the build environment, so keep it out.

`.claude/skills/pebble-watchface/` is the Core Devices agent skill. It is ignored rather than
vendored because upstream publishes no licence at all. Restore it with:

```
git clone https://github.com/coredevices/pebble-watchface-agent-skill /tmp/pws
mkdir -p .claude/skills && cp -r /tmp/pws/.claude/skills/pebble-watchface .claude/skills/
```
