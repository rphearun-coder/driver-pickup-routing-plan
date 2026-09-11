# Driver Realtime Map (Vue 3 + Vite + MQTT + Google Maps)

A runnable sample showing live-updating driver markers on Google Maps,
fed by MQTT messages matching the payload published by
`LocationTrackingService.kt` — no login/auth required.

```json
{ "driverId": "uuid", "lat": 37.42, "lon": -122.08, "driverShift": 1, "shiftType": 2 }
```

## Features

- **Live map** — once you log in and go online, your driver gets a pulsing
  "online" marker fed by MQTT location updates. Clicking it opens a small
  profile card (name, id, coordinates, shift, last update).
- **Driver panel** (bottom-left, collapsible) — the actual app UI a driver
  would use:
  - **Go online / offline** — a single status toggle.
  - **Nearby pickups** — 4 generated around the driver's position, each
    with a distance/duration estimate and status badge.
  - **Drive to pickup** — plans a real driving route (Google Directions)
    to the selected pickup and previews it as a dashed line before
    committing.
  - **Pause / Resume / Stop** a drive in progress.
  - **Refresh** — one button that re-centers the camera and re-rolls the
    nearby pickups.
- **Dev vs. production driving behavior**, controlled by `VITE_MODE`:
  - `development` (default) — "Drive to pickup" **simulates** the drive,
    publishing points along the route on a timer so the marker visibly
    moves without needing a real phone.
  - `production` — the app only plans and draws the route; it publishes
    nothing itself and waits for the real driver's own mobile device
    (`LocationTrackingService.kt`) to report its actual position over MQTT.
- **Dev-only tools panel** (🛠, top-right, `npm run dev` only) — manually
  publish a location as any driver ID, and change the simulated drive
  speed. Loaded via a dynamic import gated on `import.meta.env.DEV`, so
  it's completely absent from a production build, not just hidden.
- **Standalone multi-driver simulator** (`simulate-driver.cjs`) — a Node
  script, independent of the app, that fakes one or more *other* drivers
  wandering around, for exercising multi-driver rendering. Fully
  configurable via flags (`--count`, `--interval`, `--step`, `--driver-id`,
  `--lat`/`--lon`, `--url`/`--username`/`--password`) — see
  `node simulate-driver.cjs --help`.
- **App metadata from `.env`** — `VITE_APP_NAME`/`_DESCRIPTION`/`_AUTHOR`
  drive both the page `<title>`/meta tags (via Vite's `%VITE_*%` HTML
  interpolation) and anything in the Vue app that imports them from
  `src/config.ts`, so there's one place to change them.

## 1. Install

```bash
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
- `VITE_APP_NAME` / `VITE_APP_DESCRIPTION` / `VITE_APP_AUTHOR` /
  `VITE_APP_VERSION` — app metadata, shown in the page `<title>`/meta tags
  and available in code via `src/config.ts`. Cosmetic only.
- `VITE_MODE` — `development` (default) or `production`. Controls whether
  **Drive to pickup** fakes the drive itself or waits for a real device —
  see Features above. Independent of whether you ran `npm run dev` or
  `npm run build`; set it explicitly for whichever behavior you want.
- `VITE_GOOGLE_MAPS_API_KEY` — your Google Maps JavaScript API key.
- `VITE_MQTT_WS_URL` — your broker's **WebSocket** listener (NOT the raw TCP
  1883 port — browsers can't open raw TCP sockets). Ask your broker admin
  for the WS port, commonly `8083` (ws) or `8084` (wss).
- `VITE_MQTT_USERNAME` / `VITE_MQTT_PASSWORD` — your broker credentials.

## 3. Run the dev server

```bash
npm run dev
```

Open the printed local URL (default `http://localhost:5173`). Tap **Go
online** in the bottom panel to appear on the map and see nearby pickups —
tap a pickup then **Drive to pickup** to simulate a drive there.

## 4. Simulate another driver moving (optional, for testing)

In a separate terminal, from the same folder:

```bash
npm install mqtt
node simulate-driver.cjs --url=mqtt://your-broker:1883 --username=your-user --password=your-password
```

`--url`/`--username`/`--password` are required (your broker's raw TCP
connection info — match `VITE_MQTT_WS_URL`'s host but with the TCP port, not
the WebSocket one). This publishes a slightly-shifted lat/lon every 2 seconds
using the raw TCP MQTT port (fine for a Node script, unlike the browser).
Watch the marker move on the map in your browser tab.

Everything else about it is optional/configurable via flags — `--count=3` to
simulate several drivers at once, `--interval=`/`--step=` to change
speed/jitter, `--driver-id=`/`--lat=`/`--lon=` to change identity/start
point. Run `node simulate-driver.cjs --help` for the full list.

**Testing tool only, by construction** — the script publishes as a driver ID
that is deliberately different from your own logged-in driver's id, so it
can never collide with your own marker. To move your own ("you") marker, use
the app itself — log in, go online, and drive to a pickup.

## 5. Build for production

```bash
npm run build
npm run preview   # serve the dist/ build locally to sanity-check it
```

The 🛠 dev-tools panel (manual publish, drive speed) is dev-only — it's
loaded via a dynamic `import()` gated on `import.meta.env.DEV` in
[App.vue](src/App.vue), so it's completely absent from the `dist/` output
(not just hidden), verified by `grep -o "dev-publish" dist/assets/*.js`
finding nothing.

## Notes

- If `VITE_MQTT_WS_URL` doesn't connect, confirm with your broker admin
  that a WebSocket listener is actually enabled — MQTT brokers don't expose
  WebSocket by default, only the plain TCP port.
- **`VITE_*` values, including `VITE_MQTT_PASSWORD`, are baked into the
  production JS bundle in plaintext** — anyone who opens dev tools on the
  deployed site can read them. This is unavoidable for a pure client-side
  app talking directly to a broker; there is no code fix for it. Only ever
  point a production build of this app at a broker account you're fine
  exposing publicly (a scoped/throwaway credential), or put a backend proxy
  in front of MQTT instead. The credentials in `.env.example` are
  placeholders mirroring what was shared in chat — rotate any real broker
  password that has been pasted into a chat or committed to version controXXl.
- Every driver publishing to the topic shows up as a marker. Since there's
  no auth here, anything subscribed to the topic sees all drivers' raw
  locations — fine for an internal dev/test tool, but add access control
  before exposing this to real users.
