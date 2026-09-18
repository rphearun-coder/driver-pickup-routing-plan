# Driver Realtime Map

Vue 3 + Vite app for live driver markers over MQTT.

## What it does
- Shows driver markers on Google Maps
- Lets a driver toggle online/offline
- Publishes GPS every 4s or after 15m movement while online
- Stops publishing when offline/logged out
- Supports a simulated route in development mode
- Profile → "Device & GPS" page: detects the driver's device/browser (iPhone, Android, desktop), shows live location-permission status, lets them run an on-demand GPS check, switch Test/Live location mode, and shows platform-specific steps to re-enable location when it's blocked

## Payload
```json
{ "driverId": "uuid", "lat": 37.42, "lon": -122.08, "driverShift": 2, "shiftType": 1 }
```

## Setup
```bash
npm install
cp .env.example .env
```

Required env values:
- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_MQTT_WS_URL`
- `VITE_MQTT_USERNAME`
- `VITE_MQTT_PASSWORD`
- `VITE_MODE` (`development` or `production`)

## Run
```bash
npm run dev
```

## Simulate another driver
```bash
npm install mqtt
node simulate-driver.cjs --url=mqtt://your-broker:1883 --username=your-user --password=your-password
```

## Build
```bash
npm run build
npm run preview
```

## Todo
- [x] Publish valid GPS while online
- [x] Throttle foreground location updates
- [x] Enforce the 30s minimum background interval
- [x] Stop publishing when offline or logged out
- [x] Toggle online status and publish the MQTT status update
- [x] Query today-only online status and create a default ONLINE record when missing
- [x] Allow the app to push its own latest location directly to MQTT in production mode
- [x] Allow the driver web app to push its latest location directly via MQTT using the browser navigator when the button is clicked
- [x] Add a persistent Test/Live location mode switch
- [x] Automatically publish browser GPS updates in Live mode to `/topic/driver/{driverId}/location`
- [ ] Add automated tests for coordinate validation and publish throttling
- [x] Confirm the Location Service consumes the latest driver location from `/topic/driver/{driverId}/location`
- [x] Add a Device & GPS page for checking/re-requesting location permission across iPhone/Android/desktop
- [ ] Nearby-driver matching: query drivers within radius of a pickup point (geospatial/Distance Matrix) for order assignment
- [ ] Realtime order-assignment push: notify a driver over MQTT the moment an order is assigned to them
- [ ] Reconnect/backoff handling for the MQTT client on dropped WebSocket connections
- [ ] Driver shift history log (online/offline timestamps, total distance/time per shift)
- [ ] Stale-location detection: flag/hide a driver marker if no location update received within N seconds

## Notes
- Use the WebSocket MQTT URL, not the raw TCP port, from the browser.
- Broker credentials are exposed in client-side code in a browser app; use a scoped/throwaway account for production.