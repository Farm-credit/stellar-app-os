# FarmCredit Sponsor App (iOS + Android)

Native mobile foundation for **sponsoring trees and tracking growth**, built
with Expo (React Native) as a single codebase for iOS (issue #1119) and
Android (issue #1120).

## Features mapped to #1119 / #1120

| Requirement                 | Implementation                                                                                                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Biometric auth              | `expo-local-authentication` (Face ID / Touch ID on iOS, fingerprint / face unlock on Android) gates the app on launch and re-auths from Profile (`src/lib/biometrics.ts`). Labels are platform-correct — Android never shows Apple's trademarked "Face ID"/"Touch ID" names. |
| Push notifications          | `expo-notifications` — permission prompt, Expo push token, and growth-milestone local notifications (`src/lib/notifications.ts`). Android requires a notification channel (already handled) and a Google Play Services / FCM project — see below.                            |
| Material touch feedback     | Android buttons and tabs use `android_ripple` for native Material ripple feedback instead of the iOS-style opacity change (`App.tsx`).                                                                                                                                       |
| AR tree viewing             | AR-ready viewer screen (`src/screens/ARTreeViewerScreen.tsx`); engine integration point documented below.                                                                                                                                                                    |
| Offline sponsorship caching | AsyncStorage-backed sponsorship cache + pending-action queue that syncs later (`src/lib/offlineCache.ts`).                                                                                                                                                                   |
| Track growth                | My Trees tab lists cached sponsorships with status; `fetchTreeProgress` is the API seam.                                                                                                                                                                                     |

## Run it

```bash
cd sponsor-app
npm install
npx expo install --fix     # align native module versions with SDK 57
npx expo run:ios           # requires Xcode + CocoaPods
npx expo run:android       # requires Android Studio + an emulator or device
```

> The repo pins Expo SDK 57 (see `planter-app/AGENTS.md`); run
> `npx expo install` so native modules resolve to the SDK-matched versions.

## Biometrics

- `app.json` declares `NSFaceIDUsageDescription` (iOS) and the
  `expo-local-authentication` config plugin, which configures the Android
  manifest automatically.
- Devices without enrolled biometrics fall back to opening the app with a
  notice; the Profile tab drives re-authentication.

## Push notifications & Google Play Services

- `registerForPushNotifications()` returns an Expo push token when granted.
- The token is currently held in memory; production wiring should POST it to
  the backend (e.g. `app/api/notifications/register`) so server-side growth
  events can push.
- **Android setup**: push notifications on Android route through Firebase
  Cloud Messaging, which requires Google Play Services. To enable it:
  1. Create a Firebase project and register the app under package name
     `app.farmcredit.sponsor`.
  2. Download `google-services.json` and place it at `sponsor-app/google-services.json`
     (already gitignored — never commit this file).
  3. `app.json` already references it via `android.googleServicesFile`.

## AR tree viewing

`ARTreeViewerScreen` owns the UX (select tree → enter viewer). To add a real
scene, mount an `expo-gl`/3D engine component at the marked integration point
in that screen and provide tree models. A physical device is required on
both platforms; simulators/emulators do not support camera/AR sessions.

## Offline sync

Sponsorships are written to AsyncStorage immediately and queued as pending
actions. `getPendingActions()` / `clearPendingActions()` are the sync seam —
call them from a network-aware hook or a background task to replay the queue
against the API.
