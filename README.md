# Legacy of the Spy Phone

An offline-capable escape-room web app for Android. Players tilt the phone to specific orientations to reveal hidden digits overlaid on car photos, then view the combined code on a summary screen.

## Quick start (development)

```bash
npm install
npm run dev
```

Open the dev URL on your phone over the local network. Motion sensors require a secure context, so use HTTPS tunneling (for example `vite --host` plus an HTTPS proxy) or test via the built PWA/APK paths below.

## Adding your car photos

Each puzzle uses **two PNGs** in [`public/assets/cars/`](public/assets/cars/):

| File | Purpose |
|------|---------|
| `car1.png` | Full car photo (reveals with a **wide** tilt tolerance) |
| `car4-number.png` | Same dimensions as its car, **transparent** PNG with the digit baked in (reveals with a **narrow** tolerance) |

Match the number file to the car (`car3.png` + `car3-number.png`). The album shows photos in **filename order** (`car1.png`, `car2.png`, …). The final code uses **digit order** (3, 6, 8…).

**Decoy photos** (car only, no hidden number): add just `car6.png` and omit the `number` block in config — they still appear in the swipe carousel with tilt arrows and a wide reveal zone.

Edit [`src/config/puzzles.ts`](src/config/puzzles.ts):

- `car.image` — path to the car photo (required)
- `number.image` — path to the transparent digit PNG (optional)
- `digit` — code character (required when `number` is set)
- `target` — `{ beta, gamma }` tilt angles (shared by both layers)
- `car.tolerance` — degrees for the car (default `32`, wider = easier). The car reaches full opacity as you enter the number zone.
- `number.tolerance` — degrees for the digit overlay (default `8`, only when `number` is set)

The number layer only becomes clear when you're inside the smaller tolerance zone at the same target orientation.

## Calibrating tilt angles (staff mode)

Tap the **top-left corner 5 times** within 2 seconds to open calibration mode. Hold the phone at the angle where the number should appear, then tap **Set as target** to copy the `target` (and tolerances) into `puzzles.ts`.

Tilt arrows point the way to **lean** the phone (up arrow = tip the top toward the ceiling). After changing targets, recalibrate on a real device — browsers report `beta` / `gamma` slightly differently.

## Path A — PWA install (brief internet once)

Best when you can connect the phone briefly before the game.

1. Build the app:

   ```bash
   npm run build
   ```

2. Serve `dist/` over **HTTPS** (required for gyroscope APIs). Options:
   - Deploy to GitHub Pages, Netlify, or similar
   - Local hotspot: run an HTTPS static server on a laptop and open it on the phone

3. Open the URL in **Chrome** on Android → **Add to Home screen**.

4. Launch from the home screen icon and complete one online session so the service worker caches all assets.

5. Enable airplane mode and verify the app still opens, images load, and tilting reveals digits.

## Path B — Fully offline APK (Capacitor sideload)

Best when the phone must never use the internet. Capacitor serves the app from a secure origin so gyroscope APIs work without HTTPS hosting.

1. Build the web app:

   ```bash
   npm run build
   ```

2. Add Android (first time only):

   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap add android
   npx cap sync android
   ```

3. Open the Android project in Android Studio and build an APK, or from the project root:

   ```bash
   npx cap open android
   ```

4. Install the APK via USB:

   ```bash
   adb install path/to/app-debug.apk
   ```

5. Test tilting and offline behavior before game day.

## Player flow

1. **Intro** — tap **Enable motion sensors**
2. **Puzzle screens** — tilt until each digit appears, then tap **Next photo**
3. **Summary** — full recovered code displayed (for example `4-7-2-9`)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Tilting does nothing | App was opened from a local file or non-HTTPS URL. Reinstall via Path A (HTTPS PWA) or Path B (APK). |
| Digit never appears | Widen `tolerance` in `puzzles.ts`, or recalibrate with staff mode. |
| Digit in wrong spot | Adjust `overlay.top` / `overlay.left` per puzzle in `puzzles.ts`. |
| Screen sleeps during play | Wake lock is requested on puzzle screens; some browsers still dim—disable screen timeout in Android settings for the prop phone. |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local development server |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run preview` | Preview production build locally |
