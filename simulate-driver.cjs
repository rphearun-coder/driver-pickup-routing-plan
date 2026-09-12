// Simulates one or more fake drivers publishing location on an interval.
// Run: node simulate-driver.cjs [options] — see --help for all options.
// The app only ever renders VITE_CURRENT_DRIVER_ID's own marker, so this
// is for exercising the MQTT ingestion path, not for seeing extra markers.

const mqtt = require('mqtt');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const [key, ...rest] = raw.slice(2).split('=');
    args[key] = rest.length ? rest.join('=') : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: node simulate-driver.cjs [options]

  --driver-id=<id>    base driver id (default: demo-driver-b7e1f3a0)
  --count=<n>          how many simulated drivers to run at once (default: 1)
  --lat=<deg>          starting latitude (default: 11.525498645201512)
  --lon=<deg>          starting longitude (default: 104.90918454916454)
  --interval=<ms>      time between published points (default: 2000)
  --step=<deg>         max random-walk jitter per tick (default: 0.001)
  --url=<mqtt-url>     broker URL, raw TCP (required, e.g. mqtt://your-broker:1883)
  --username=<user>    broker username (required)
  --password=<pass>    broker password (required)

Example: node simulate-driver.cjs --url=mqtt://your-broker:1883 --username=me --password=secret --count=3`);
  process.exit(0);
}

const MQTT_URL = args.url;
const MQTT_USERNAME = args.username;
const MQTT_PASSWORD = args.password;

if (!MQTT_URL || !MQTT_USERNAME || !MQTT_PASSWORD) {
  console.error('Missing broker connection info — pass --url, --username, and --password (see --help).');
  process.exit(1);
}

const BASE_DRIVER_ID = args['driver-id'] || 'demo-driver-b7e1f3a0';
const COUNT = Math.max(1, Number(args.count) || 1);
const INTERVAL_MS = Number(args.interval) || 2000;
const STEP_DEG = Number(args.step) || 0.001;
const START_LAT = Number(args.lat) || 11.525498645201512; // Phnom Penh
const START_LON = Number(args.lon) || 104.90918454916454;

const client = mqtt.connect(MQTT_URL, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
});

client.on('connect', () => {
  console.log(`Connected. Publishing ${COUNT} simulated driver(s) every ${INTERVAL_MS}ms. Ctrl+C to stop.`);

  for (let driverIndex = 0; driverIndex < COUNT; driverIndex++) {
    const driverId = driverIndex === 0 ? BASE_DRIVER_ID : `${BASE_DRIVER_ID}-${driverIndex + 1}`;
    const topic = `/topic/driver/${driverId}/location`;
    let latitude = START_LAT + driverIndex * STEP_DEG * 5;
    let longitude = START_LON + driverIndex * STEP_DEG * 5;

    setInterval(() => {
      latitude += (Math.random() - 0.5) * STEP_DEG;
      longitude += (Math.random() - 0.5) * STEP_DEG;

      const payload = { driverId, lat: latitude, lon: longitude, driverShift: 2, shiftType: 1 };
      client.publish(topic, JSON.stringify(payload), { qos: 0, retain: true });
      console.log('Published:', payload);
    }, INTERVAL_MS);
  }
});

client.on('error', (err) => console.error('MQTT error:', err));
