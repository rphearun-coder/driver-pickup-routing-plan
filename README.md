# Jalat Driver App (Jalat-Location-App)

Vue 3 + Vite web app for Jalat Logistics drivers: pickups, deliveries, returns, COD settlement, and live GPS tracking over MQTT. It is built mobile-first and fits phones from 390px wide (iPhone 12) up.

**Contents:** [Features](#features) · [Pages](#pages) · [Main flows](#main-flows) · [Setup](#setup) · [Run](#run) · [Test data (UAT)](#test-data-uat) · [Build](#build) · [Code guide](#code-guide) · [Todo](#todo) · [Notes](#notes)

## Features
- **Pickups:** today's stops with On route, Directions, Call and SMS. On Pickup Details the driver counts and photographs each parcel, scans its sticker (or uses "No sticker"), then sends the photos and confirms the pickup.
- **Deliveries:** filter, sort (Newest or Nearest) and search the parcels out for delivery. Deliver or Failed with swipe-to-confirm, scan a parcel to take it on, and retake the parcel photo.
- **Returns:** parcels going back to the shop or the warehouse, with the overdue ones flagged. The driver can return a single parcel or several to one shop with a single handover photo.
- **History:** Pickup, Delivery and Settlement History by date range (Today / This Week / This Month).
- **COD settlement:** Home → Settlement to request a settlement and send the transfer screenshot. Settlement History shows each settlement's details: amounts, parcels, screenshots and activity.
- **Notifications:** messages from Operation grouped by day, with All / Unread tabs. Tap one, its ✓, or **Mark all read** to mark it read. Drivers can't delete notifications.
- **GPS tracking:** online/offline toggle. While online the app publishes the location every 4 s or after 15 m of movement, and stops when offline or logged out. A simulated route is available in development.
- **Device & GPS** (Profile): the device/browser (iPhone, Android, desktop), live location-permission status, an on-demand GPS check, the Test/Live location mode switch, and per-platform steps to re-enable location.

## Pages
| Route | Page | What the driver can do |
|---|---|---|
| `/` | Home (`HomePage.vue`) | Online toggle, Pickups / Deliveries / Returns / Live Map shortcuts, **Settlement** card (Request Settlement, History), **Delivery summary** for the selected range. |
| `/pickups` | Pickups tab (`PickupPage.vue`) | Stops still to pick up, On route switch, Directions / Call / SMS, **Pick up**. |
| `/deliveries` | Deliveries tab (`DeliveriesPage.vue`) | Parcels on delivery: filter, sort, search, En route switch, **Deliver** / **Failed**, scan parcel. |
| `/returns` | Returns tab (`ReturnedPage.vue`) | **To shop** / **To warehouse**, grouped by shop, overdue flag, scan return parcel. |
| `/orders/:id` | Pickup Details (`OrderDetailPage.vue`) | Sender card (Call / Map), parcel count sheet (with sticker / no sticker), per-parcel photo + sticker scan, header scan, delete rows, progress bar, "Send parcel photos". Read-only once picked up. Loads by id on reload. |
| `/orders/:id/returns` | Return Parcels (`OrderReturnsPage.vue`) | **To return** tab: select / select all / scan to select, "Add parcel" (scan or type ID, checked against the shop and status), handover photo, "Confirm return (N)" with per-parcel error retry. **Returned** tab: returned parcels with handover photo and time. |
| `/parcels/:id` | Delivery / Return Details (`ParcelDetailPage.vue`) | For parcels out for delivery: info rows, photo cards with camera retake, "Parcel has a problem", Deliver, Failed. Delivered / failed / return parcels show their own read-only or confirm views. |
| `/pickup-history` | Pickup History (`PickupHistoryPage.vue`) | Summary (pickups / picked up / failed / parcels), All / Picked up / Failed filter, date range, date-grouped cards. |
| `/pickup-history/:id` | Pickup Details, history (`PickupHistoryDetailPage.vue`) | Sender card, stats, parcel photo grid with full-screen viewer, parcel list. |
| `/delivery-history` | Delivery History (`DeliveryHistoryPage.vue`) | Delivered and failed parcels for the date range. |
| `/settlement-history` | Settlement History (`SettlementHistoryPage.vue`) | Approved total for the range, All / Pending / Submitted / Approved / Rejected filter, settlement cards (Total, PayWay, To transfer, Created → Receipt sent → Approved/Rejected). Tap a card for **Settlement details**. **Send receipt** (on the card or in details) opens the receipt sheet for that exact settlement, whatever its date. |
| `/notifications` | Notifications (`NotificationsPage.vue`) | Unread count, **Mark all read**, All / Unread tabs, cards grouped Today / Yesterday / date, with a kind icon, relative time and expandable text. Tap a card or its ✓ to mark it read. No delete. |
| `/profile`, `/device-gps` | Profile, Device & GPS | Account, location permission and GPS check. |
| `/pickup-map` | Live Map | Driver markers and the pickup route. |
| `/login` | Login | Phone + password login (User Service). |

`/orders/:id`, `/orders/:id/returns` and `/parcels/:id` hide the bottom nav (`meta.hideBottomNav`) because they have their own bottom action bar.

## Main flows

### Pickup
- **Route order (Pickups and Deliveries):** both lists open **Nearest** first. The **Order Service sorts** (`routeSort` NEAREST / NEWEST on `getOrderListByUser` / `getDeliveryList`; optional, NEAREST when omitted); the app only sends the choice, plus the phone's recent GPS fix as `originLat` / `originLon` when it has one (otherwise the server uses the driver's last location), and shows the list in the order it gets back. The **Newest / Nearest** toggle reloads the list. Each stop is numbered 1, 2, 3… with a dashed line to the next: orange for not started, blue for on route / en route. Stops with no location go last and show **No location**.
- **Pickups tab:** only stops still *to pick up* are listed; picked-up and failed ones are in Pickup History. Toggle **On route** per stop (saved server-side, notifies the shop), use Directions / Call / SMS, or tap **Pick up**.
- **Pickup Details:** enter the total parcels (and price) → take a photo of each parcel → scan each sticker (skipped in "No sticker" mode) → **Send parcel photos**. This uploads the photos, registers the parcels, then confirms the pickup. If only the confirm step fails, tapping again retries just that step, so parcels aren't registered twice.

### Delivery
- **Deliveries tab:** filter All / En route / Not started, sort **Newest** or **Nearest** (uses the app's GPS fix; asks the browser only if none is recent), search by name / phone / location / ID. Each card has an **En route** switch (saved server-side), Directions / Call / SMS, and **Deliver** / **Failed** buttons.
- **Scan parcel:** scan its QR → the parcel is assigned to you and added to the list.
- **Deliver:** **Deliver** (card or Delivery Details) → choose who received the money (**Driver** / **Transfer to seller**) → enter USD and/or KHR (a COD parcel collected by the driver needs an amount) → *Transfer to seller* needs a receipt photo → optionally switch on **Has a parcel to return** (+ optional photo) → **swipe to deliver**. Parcels of $500+ are blocked; Operation must finish them.
- **Failed delivery:** **Failed** → pick a reason card (or "Other" + 5–200 characters) → proof photo (required) → **swipe to submit**. The backend requires a help request earlier the same day plus a waiting period; the dialog shows its message and offers to send the help request.
- **Retake parcel photo:** Delivery Details → camera button on the photo card (only while *On delivery*).

### Returns
- **Returns tab:** **To shop** (carry back to the seller) and **To warehouse** (drop at the warehouse), grouped by shop. Parcels waiting 3+ days (since their last update) are flagged. **Scan return parcel** picks one up from the warehouse and adds it to *To shop*.
- **Return one parcel:** tap **Return** / **Drop off** → Return Details shows the shop's phone and Directions → take the handover / drop-off photo → **swipe to confirm**.
- **Return several to one shop:** Pickup Details → return icon (the red badge shows how many are waiting) → tick parcels or scan them → take one handover photo → **Confirm return (N)**. Failed ones stay ticked with their error for a retry.
- **Take on a return parcel at a pickup:** Return Parcels → **Add parcel** → scan or type the parcel ID → the app checks it belongs to this shop and is waiting for return → **Add to return list**.

### History and settlement
- **Date range:** the range button in the header opens the **Select range** sheet: Today / This Week / This Month, each with its actual dates (e.g. "Sep 21 – 24 · Monday to today"). The header subtitle shows the selected dates.
- **Pickup History / Delivery History:** date-grouped lists with summary counts and filters; tap a card for the read-only detail with photos.
- **Settlement History:** Home → Settlement → **History**. Tap a settlement to open **Settlement details**:
  - Status, amount to transfer / settled, and the ref no. (tap to copy)
  - **Amounts:** COD delivered (from this settlement's own parcels), PayWay, transfer, and the settlement total (PayWay + transfer)
  - **Parcels:** every parcel the driver finished in the settlement's period (delivered / failed / to return / returned) with COD and time. The first 5 are shown, with "Show all" for the rest; tap one to open its Delivery Details.
  - Info (period, requested / reviewed by, driver note), transfer screenshots (tap to enlarge), and the **Activity** timeline from the server's history
  - **Digital receipt** (after the receipt is sent: *Waiting for approval* or *Approved*):
    - **Download:** saves `Jalat-COD-receipt-<refNo>.png`, drawn on the phone. It shows the ref no., status, driver, period, amounts, the COD account paid to, the timeline, up to 20 parcels and the driver note.
    - **Share with Operation:** sends an in-app push to Operation (`COD_SETTLEMENT_RECEIPT`, with the settlement id as `refId`), then opens the phone's share sheet with the image so the driver can send it to their operator (Telegram, etc.). Where there's no share sheet (most desktop browsers) the image is downloaded instead.
    - The driver's assigned operators (`getOperationByDriver`) are listed under the buttons.
- **Request Settlement / Send receipt — paying digitally:** step 1 of the sheet shows the Jalat COD account from `getABAQRCodeSetting` (set by Operation):
  - **Pay with ABA PayWay:** opens the PayWay payment link; the driver enters the amount shown. If the note is empty it becomes "Paid via ABA PayWay".
  - **KHQR:** the QR code for any bank app; tap to enlarge. It's hidden if the image can't load.
  - **Account name + number**, with Copy.

  Then the driver adds the payment screenshot and swipes to send. If the account can't be loaded, the step falls back to "transfer from your banking app".
- **Send receipt** (pending settlements): from a card or Settlement details → the receipt sheet shows the amount to transfer and that settlement's COD → pay digitally → add the transfer screenshot (+ optional note) → **swipe to send**. The list reloads and the settlement moves to *Waiting for approval*. This works for pending settlements from any day; Home's Settlement card only covers today's.

### Notifications
- **Open:** the bell on Home (its badge shows the unread count, up to "9+") → Notifications. The header shows how many are unread, or "All caught up".
- **Filter:** **All** or **Unread** tabs, with counts. Notifications are grouped by **Today**, **Yesterday**, then the date (e.g. "Mon, Sep 21"). Recent ones show a relative time ("5 min ago").
- **Kinds:** each card has an icon and colour guessed from its title, because the API has no category field: settlement (green), pickup (blue), return (orange), delivery (purple), or a general bell.
- **Text:** Operation writes notifications in a rich-text editor, so bodies arrive as HTML. The app shows them as plain text with paragraph breaks kept. It never renders the HTML, which keeps it safe against injected content. Long bodies clamp to 2 lines with **Show more / Show less**.
- **Mark read** (unread cards have a green tint and dot):
  - **Tap the card:** marks it read and expands it if long.
  - **Tap its ✓:** on phones a ✓ circle; on desktop the dot turns into ✓ on hover.
  - **Mark all read** in the header.

  Marking read saves to the server, and the card goes back to unread if saving fails.
- **Paging:** 30 at a time, with **Load older (N)**.
- **No delete:** drivers can't delete notifications (see [Notes](#notes)).

### Input rules
Shared in `src/utils/inputRules.ts`:
- Money fields accept digits and one decimal point (USD: max 2 decimals, up to $10,000; KHR: whole numbers only). Parcel count: 1–100.
- Scanned or pasted parcel IDs are read from any text containing the UUID (bare id or link).
- Phone search matches `+855 12 345 678`, `012345678` and `12345678` as the same number.

## Setup
```bash
npm install
cp .env.example .env
```
Then fill in the two blank secrets in `.env`: `VITE_GOOGLE_MAPS_API_KEY` and `VITE_MQTT_PASSWORD` (ask the team).

Required env values:
- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_MQTT_WS_URL`, `VITE_MQTT_USERNAME`, `VITE_MQTT_PASSWORD`, `VITE_MQTT_TOPIC`
- `VITE_MODE` (`development` or `production`)

Optional env values (defaults in brackets):
| Variable | Purpose | Default |
|---|---|---|
| `VITE_USER_SERVICE_URL` | User Service GraphQL (login, profile) | `http://localhost:8081/v1` |
| `VITE_ORDER_SERVICE_URL` | Order Service GraphQL (pickups, parcels, COD) | `http://localhost:8082/v1` |
| `VITE_PAYMENT_SERVICE_URL` | Payment Service GraphQL (PayWay) | `http://localhost:8083/v1` |
| `VITE_LOCATION_SERVICE_URL` | Location Service GraphQL (online status) | `http://localhost:8084/v1` |
| `VITE_DRIVER_API_BASE_URL` | Driver Pickup Service | `http://localhost:8084/v1` |
| `VITE_PICKUP_POLL_INTERVAL_MS` | How often the pickup list refreshes | `15000` |
| `VITE_OBS_BASE_URL` | Base URL for photo keys | `https://jalat.obs.ap-southeast-3.myhuaweicloud.com` |
| `VITE_DEV_BYPASS_AUTH` | `true` skips real login and uses the bundled sample profile | `false` |

### `.env`, `.env.local` and `.env.pro`
| File | Loaded by | Use |
|---|---|---|
| `.env` | `npm run dev` | Local development (services on localhost) |
| `.env.local` | `npm run dev`, **on top of `.env`** | Personal overrides; Vite loads it whenever it exists |
| `.env.pro` | `npm run build` (`--mode pro`) | Build against the dev API hosts |
| `.env.example` | nobody (template) | The only env file in git; secrets left blank |

For example, to use the dev API for login only, put this in `.env.local`:
```bash
VITE_USER_SERVICE_URL=https://api-dev.jalatlogistics.com/service-user/v1
```
To run with `.env` only, rename or delete `.env.local` and restart `npm run dev`.

## Run
```bash
npm run dev          # http://localhost:5173 (also on your LAN IP, for testing on a phone)
```

With the default `.env`, these services must be running locally (`npm run dev` in each repo):

| Service | Port | Needed for |
|---|---|---|
| Jalat-User-Service | 8081 | Login, profile, notifications |
| Jalat-Order-Service | 8082 | Pickups, deliveries, returns, COD settlement |
| Jalat-Payment-Service | 8083 | PayWay |
| Jalat-Location-Service | 8084 | Online status, GPS |

**Troubleshooting**
- **Login says "Can't reach the server right now":** the User Service (8081) isn't running. Start it, or point `VITE_USER_SERVICE_URL` at the dev API in `.env.local`.
- **Changed an env file but nothing changed:** restart `npm run dev`; Vite reads env files only at startup.

### Simulate another driver
```bash
npm install mqtt
node simulate-driver.cjs --url=mqtt://your-broker:1883 --username=your-user --password=your-password
```

MQTT payload the app publishes to `/topic/driver/{driverId}/location`:
```json
{ "driverId": "uuid", "lat": 37.42, "lon": -122.08, "driverShift": 2, "shiftType": 1 }
```

## Test data (UAT)
Test records for driver **John Doe** (`+85515831198`) in the shared UAT database (`jalat_db_uat`), which the local Order Service uses. Log in as John Doe to see them. Every script tags its rows, and cleanup removes only those rows. Delivered test parcels count toward John Doe's UAT COD totals.

| What | How | Tag / cleanup |
|---|---|---|
| Parcels + activity for John Doe's past `TEST-*` settlements (Sep 12–23, 2026) | `node scripts/seed-settlement-test-data.cjs` | `node scripts/seed-settlement-test-data.cjs --clean` |
| Today's settlement | Run [`scripts/sql/settlement-test-today.sql`](scripts/sql/settlement-test-today.sql) in a SQL client on UAT | `TEST-SEED-TODAY`; cleanup SQL at the bottom of the file |
| Today's pickups, deliveries, returns | Run [`scripts/sql/driver-test-today.sql`](scripts/sql/driver-test-today.sql) in a SQL client on UAT | `TEST-SEED-TODAY`; cleanup SQL at the bottom of the file |
| John Doe's notifications (3 unread, 4 read, incl. HTML + Khmer) | Run [`scripts/sql/notifications-test-today.sql`](scripts/sql/notifications-test-today.sql) in a SQL client on UAT | Parent `Notifications.createdBy = 'TEST-SEED-TODAY'`; cleanup SQL at the bottom of the file |

- The Node script uses the DB credentials in `../Jalat-Order-Service/.env`.
- The SQL files use **today in Asia/Phnom_Penh**, so they work on any day.
- Re-running any of them replaces the previous run instead of adding duplicates.
- To seed another driver, change the driver id (and name / phone) at the top of the SQL.

**Today's settlement** creates settlement `TEST-TODAY` (Pending, PayWay $5.00 + transfer $18.50) and 6 parcels: 4 delivered ($23.50 + 4,000៛), 1 failed, 1 to return. It also adds 1 activity row.

**Today's pickups, deliveries and returns** (parcel codes `TD<MMDD>-…`). Shop, address, zone and photo are copied from John Doe's real orders and parcels, so cards show real partner info.

| Screen | Records |
|---|---|
| Pickups tab | 3 stops: 2 In progress, 1 On route |
| Pickup History | 2 picked up, 1 aborted ("Shop closed today") |
| Deliveries tab | 5 On delivery, route order 1–5, COD in $, ៛ and none (`D1`–`D5`) |
| Delivery History | 2 delivered, 1 failed (`H1`–`H3`) |
| Returns → To shop | 3, one waiting 4 days so the overdue warning shows (`R1`–`R3`) |
| Returns → To warehouse | Returning from driver + processing return (`W1`, `W2`) |
| Returned tab | 1 returned today (`T1`) |

Known limits:
- **Settlement test parcels can't be opened:** they exist only in the daily-history table, so tapping one in Settlement details can't load its Delivery Details.
- **Pickups/deliveries/returns test data is real:** these are real `Orders` / `Parcels` rows, so Deliver / Failed / Return work on them. The records those actions create (daily history, parcel history) aren't tagged, so the cleanup doesn't remove them.

## Build
```bash
npm run build        # type-check (vue-tsc) + vite build --mode pro → dist/
npm run preview      # serve dist/ locally
npm run type-check   # type-check only
```

## Code guide
- **API clients** (`src/api/*.ts`): one file per service area. GraphQL calls go through `src/lib/graphql-request.ts` (axios) or `src/api/graphql.ts` (fetch, used for login). Both turn "server unreachable" into a readable message.
- **Colours** live only in `src/css/style.css` (`:root`):
  - brand/status hues: `--green`, `--orange`, `--red`, `--blue`, each with `-strong` / `-soft` / `-tint`
  - text: `--ink`, `--muted`, `--faint`…
  - surfaces: `--page`, `--fill`, `--input`…
  - lines: `--border`, `--divider`…

  Use these tokens in components instead of hex values. The one exception is colours passed to Google Maps in JS, which must stay real hex.
- **Location helpers** (`src/utils/geo.ts`): `toLatLng` (treats the 0,0 column default as "no location", used for Directions), `RouteSortParams` (the sort filter the API takes) and `formatDistanceParts` (the server's km / min text). Distances and sorting are **server-side** (Order Service `src/common/utils/geo.ts`: `withDistanceEstimates`, `sortRoute`, `routeTotals`). `useRouteSort` keeps the Newest / Nearest choice and builds the params.
- **Popups** (sheets, dialogs, lightboxes, toasts) must render with `<Teleport to="#overlay-root">`, not inside the page. `#app` is the scroll container and has `contain: layout`, so a `position: fixed` popup inside it sticks to the top of the scrolled content and slides off-screen once the page is scrolled. `#overlay-root` (in `index.html`, styled in `style.css`) mirrors the phone frame but never scrolls, so `position: fixed; inset: 0` always covers the visible screen: full screen on phones, the 440px frame on desktop. Size sheets with `%` (e.g. `max-height: 92%`), not `vh`: on iOS Safari `vh` is taller than the visible area.
- **Page headers** (history and detail pages): back button, a left-aligned title (with an optional date subtitle) and a right-side control. The title truncates with "…" instead of overlapping, so headers fit 390px phones. Safe areas (notch / home bar) are handled in `style.css` and the bottom sheets.
- **Shared components** (`src/components/`):

  | Component | Use |
  |---|---|
  | `BrandHeader` + `HeaderIconButton` | Green "Jalat Logistic" header of the main tabs, with round icon actions |
  | `RangePicker` | Range button + **Select range** bottom sheet (Home, tabs and History pages). Dates come from `rangeDatesText()` in `src/api/dashboard.ts` |
  | `SearchDialog` + `SearchChip` | Header search dialog and the "Contains … · N found" chip |
  | `StateBlock` | Error / empty / no-match placeholder (`tone="error" \| "success" \| "neutral"`) |
  | `AppToast` + `useToast()` | Short pop-up messages (`toast.show(text, 'success' \| 'error')`) |
  | `ImageLightbox` | Full-screen photo viewer |
  | `SwipeToConfirm` | Swipe-to-submit button for irreversible actions |
  | `DeliverParcelDialog` / `DeliveryFailedDialog` | The Deliver and Failed sheets (used from the list and the detail page) |
  | `SettlementDetailSheet` | Settlement details bottom sheet (amounts, parcels, screenshots, activity) |

### API calls
Order Service unless marked **(User Service)**.

| Call | Used for |
|---|---|
| `getOrderListByUser` | Pickups tab (In progress / On route) and Pickup History |
| `order(id)` | Load an order on reload / direct link |
| `confirmUploadParcel` | Save the driver-counted total parcels and price |
| `registerParcelImages` | Create the order's parcels from photos (+ sticker ids) |
| `confirmPickup` | Mark the pickup as picked up |
| `getDeliveryList` | Deliveries tab (On delivery) and Delivery History (Success / Failed by date). For a driver's On-delivery list it also returns each parcel's `estimatedDistanceMeters` / `estimatedDurationSeconds` (+ text) from the driver's last GPS point, and route totals in `extraData`, like `getOrderListByUser` for pickups |
| `driverListReturnParcel` | Returns tab (To shop: `BE_RETURN`; To warehouse: `RETURNING_FROM_DRIVER`, `PROCESSING_RETURN`) and Returned tab (`RETURN`) |
| `getBeReturnParcels(userId)` | Parcels waiting to go back to one shop (also the badge count) |
| `getParcel(id)` | Check a scanned return parcel's shop and status |
| `driverConfirmReturnParcelFromWarehouse` | Take on a returning parcel |
| `confirmReturnParcel` | Confirm a parcel was handed back, with the proof photo |
| `updateParcelImage` | Retake the parcel photo while out for delivery |
| `sendAssistantMessage` / `deliveryFailed` | Help request and marking a delivery failed |
| `myDailyCodSettlement` / `driverSubmitCodSettlement` | Home's Settlement card and sending the transfer screenshot |
| `getABAQRCodeSetting` | Jalat COD account for digital payment: ABA PayWay link, KHQR image key, account name / number |
| `userNotifications` (User Service) | Notifications list, 30 per page |
| `userNotification(id)` (User Service) | Marks one notification read. Fetching it does that server-side; there's no separate "mark read" mutation |
| `getOperationByDriver` (User Service) | The driver's assigned operators, shown under the receipt buttons |
| `sendNotificationToOperation` (User Service) | In-app push to Operation when the driver shares a receipt |
| `myDriverCodSettlements` | Settlement History list, including `proofImages` and `history` for the details sheet |
| `getParcelDeliveredByDriver(driverId, startAt, endAt)` | The parcels of one settlement (its period, read as Asia/Phnom_Penh days) |
| `POST /upload/v2/image?folder=parcel` | Upload every photo (returns the OBS key) |

## Todo

### Done
- [x] GPS: publish valid positions while online, throttle foreground updates, enforce the 30 s minimum background interval, stop when offline or logged out
- [x] Online/offline toggle with the MQTT status update; today-only online status with a default ONLINE record
- [x] Publish the latest location straight to MQTT (production mode, and on button press from the browser)
- [x] Persistent Test/Live location mode; Live mode publishes browser GPS to `/topic/driver/{driverId}/location`
- [x] Location Service consumes `/topic/driver/{driverId}/location`
- [x] Device & GPS page for checking / re-requesting location permission on iPhone, Android and desktop
- [x] Pickup Details: parcel count sheet, per-parcel photo + sticker scan, send photos and confirm pickup
- [x] Load order / pickup detail pages by id on reload or direct link
- [x] Return Parcels page per pickup: select, scan, add from warehouse, handover photo, returned tab
- [x] Pickup History redesign + read-only history detail page with photo viewer
- [x] Delivery Details: Deliver / Failed bar, parcel photo retake, Delivery Failed dialog with swipe-to-submit
- [x] Settlement History: details sheet with amounts, parcels, screenshots and activity timeline
- [x] Select range sheet redesign (actual dates per option), shared by Home, tabs and History pages
- [x] Page headers fit 390px phones (iPhone 12): left-aligned title that truncates, date subtitle on History pages
- [x] Readable "Can't reach the server" error on login instead of "Failed to fetch"
- [x] UAT test data scripts for settlements, pickups, deliveries and returns
- [x] Request Settlement: pay digitally with ABA PayWay, KHQR or the COD account number
- [x] Send receipt from Settlement History for pending settlements from any day
- [x] Digital receipt: download a settlement receipt image and share it with Operation (in-app push + phone share sheet)
- [x] Popups work on every device: sheets, dialogs, lightboxes and toasts render in `#overlay-root`, so they stay on screen when the page is scrolled, with `%` heights instead of `vh`
- [x] Notifications redesign: All / Unread tabs, day groups, kind icons, relative times, expandable text, Mark as read / Mark all read
- [x] Notification bodies written as HTML by Operation are shown as clean text, not raw `<p>…</p>`
- [x] Removed notification delete for drivers: mark read only
- [x] Pickups and Deliveries open nearest first, with a numbered route (1, 2, 3… + dashed line) on both, using `src/utils/geo.ts`
- [x] Directions and distances ignore the 0,0 "no location" default instead of pointing into the Atlantic
- [x] Deliveries: **Today's route** card (km · min · parcels · GPS age) and 📍 km / 🕒 min pills per parcel, like Pickups (shared `RouteSummaryCard`). Order Service `getDeliveryList` now returns the estimates, using the shared `withDistanceEstimates` / `routeTotals` helpers in its `src/common/utils/geo.ts` (also used by `getOrderListByUser`)
- [x] Nearest / Newest sorting moved to the Order Service (`routeSort` + optional `originLat` / `originLon` on both list filters, `RouteSortFilter` / `sortRoute` shared); the app no longer sorts or asks the browser for location to sort
- [x] UAT test notifications for John Doe (`scripts/sql/notifications-test-today.sql`)

### Next
- [ ] Notifications: open the related screen from a notification (e.g. "Settlement ready" → Settlement History, "New pickup" → Pickups). Needs a link or `refId` on user notifications
- [ ] Digital receipt as PDF as well as PNG, and in Khmer
- [ ] Put the transfer screenshot on the digital receipt (needs CORS on the OBS bucket so the canvas can draw it)
- [ ] Clear COD only when the driver has **no On Delivery parcels**. Home → Settlement → **Request Settlement** should be blocked while any parcel is still On Delivery, with a message like "Finish your N parcels on delivery before clearing COD". Once none are left, the driver submits the settlement (transfer photo) as today.
- [ ] Operation app sync: once a driver marks a delivery **Success**, it should show on the Operation app. While the driver still has any parcel **On Delivery**, they must **not** be shown there; they appear only after every On Delivery parcel is finished (success or failed).
- [ ] Khmer / English language switch (UI text is English for now)
- [ ] Automated tests: pickup, return and failed-delivery flows (manual test cases exist); coordinate validation and publish throttling
- [ ] Reconnect/backoff for the MQTT client on dropped WebSocket connections
- [ ] Stale-location detection: flag/hide a driver marker with no update for N seconds
- [ ] Nearby-driver matching: drivers within a radius of a pickup point, for order assignment
- [ ] Realtime order-assignment push over MQTT
- [ ] Driver shift history log (online/offline times, distance/time per shift)

### Backend follow-ups
Order Service:
- [ ] `myDriverCodSettlements.totalCodUsd` / `totalCodKhr` are summed over the list's date filter, not each settlement's own period, so the app doesn't show them per settlement
- [ ] `getParcelDeliveredByDriver` has no `@Auth` guard; anyone with a driver id can read that driver's parcels
- [ ] `confirmPickup` accepts a shop photo but doesn't save it (commented out server-side)
- [ ] UAT has no saved COD QR setting: `getABAQRCodeSetting` falls back to a hard-coded QR key that isn't in the bucket (403), so the KHQR is hidden in UAT until Operation saves one with `updateCodABAQRCodeSetting`
- [ ] Digital payments aren't verified automatically: there's no PayWay callback linking a payment to a settlement, so the COD team still checks the screenshot

User Service:
- [ ] `sendNotificationToOperation` notifies **every** active Operation user. Receipts should go only to the driver's own operators (`getOperationByDriver`), e.g. with an optional `userIds` input
- [ ] Operation notifications can't carry a file: add a receipt upload + link, or a Telegram message to the operator, so the receipt reaches Operation without the driver sharing it by hand
- [ ] UAT: John Doe has no assigned operator (`getOperationByDriver` returns none), so the "Your operator" line doesn't show for him
- [ ] No bulk "mark all read" for notifications: the app calls `userNotification(id)` once per unread notification. A `markAllUserNotificationsRead` mutation would be cheaper
- [ ] User notifications have no category or type, so the app guesses the kind (icon / colour) from the title. A `type` field (SETTLEMENT, PICKUP, RETURN, DELIVERY…) would make it reliable
- [ ] `deleteUserNotification` still exists but the driver app no longer uses it. Keep it for other apps, or restrict it by role

## Notes
- **MQTT:** use the WebSocket URL from the browser, not the raw TCP port. Broker credentials end up in client-side code, so use a scoped/throwaway account for production.
- **Sticker QR codes:** read by pulling the first UUID out of the scanned text, so both a bare parcel id and a link containing it work.
- **Returned tab:** loads the driver's 100 most recent returned parcels and keeps the current shop's, so older returns won't show (the backend can't filter by shop).
- **Return list:** a driver can't remove a parcel from it (there's no driver-side mutation); an admin has to reassign it.
- **Pickup history detail:** read-only, because the backend has no way to save a new photo on a finished pickup.
- **Settlement periods:** a settlement's `startAt` / `endAt` are Postgres `date` values (e.g. `2026-09-24`) meaning Cambodia days. The app widens them to 00:00–23:59:59 Asia/Phnom_Penh before asking for the parcels, whatever the phone's timezone.
- **Settlement parcel list:** counts each parcel once per day (latest row), like the server's COD total. It returns only finished parcels (delivered / failed / to return / returned), so a parcel still in progress isn't listed.
- **"No delivered, failed or returned parcels for …":** the settlement's period has no parcel records. Check the period, or seed test data (see [Test data (UAT)](#test-data-uat)).
- **Notifications can't be deleted by drivers:** they're work messages (settlement rejected, returns overdue, new pickups), deleting was permanent (no restore), and Operation couldn't tell whether a deleted message was seen. Drivers mark them read instead.
- **Marking read is permanent:** the API has no "mark unread". Re-running the test SQL resets John Doe's test notifications to unread.
