# FarmCredit Sponsor App (iOS)

Native iOS foundation for **sponsoring trees and tracking growth on iPhone**
(issue #1119), built with Expo (React Native) so the same codebase also runs
on Android and web.

## Features mapped to #1119

| Requirement | Implementation |
| --- | --- |
| Biometric auth | `expo-local-authentication` (Face ID / Touch ID) gates the app on launch and re-auths from Profile (`src/lib/biometrics.ts`). |
| Push notifications | `expo-notifications` — permission prompt, Expo push token, and growth-milestone local notifications (`src/lib/notifications.ts`). |
| AR tree viewing | AR-ready viewer screen (`src/screens/ARTreeViewerScreen.tsx`); engine integration point documented below. |
| Offline sponsorship caching | AsyncStorage-backed sponsorship cache + pending-action queue that syncs later (`src/lib/offlineCache.ts`). |
| Track growth | My Trees tab lists cached sponsorships with status; `fetchTreeProgress` is the API seam. |

## Run it

```bash
cd sponsor-app
npm install
npx expo install --fix   # align native module versions with SDK 57
npx expo run:ios        # requires Xcode + CocoaPods
```

> The repo pins Expo SDK 57 (see `planter-app/AGENTS.md`); run
> `npx expo install` so native modules resolve to the SDK-matched versions.

## Biometrics

- `app.json` declares `NSFaceIDUsageDescription` and the
  `expo-local-authentication` config plugin.
- Devices without enrolled biometrics fall back to opening the app with a
  notice; the Profile tab drives re-authentication.

## Push notifications

- `registerForPushNotifications()` returns an Expo push token when granted.
- The token is currently held in memory; production wiring should POST it to
  the backend (e.g. `app/api/notifications/register`) so server-side growth
  events can push.

## AR tree viewing

`ARTreeViewerScreen` owns the UX (select tree → enter viewer). To add a real
scene, mount an `expo-gl`/3D engine component at the marked integration point
in that screen and provide tree models. A physical device is required; the iOS
simulator does not support camera/AR sessions.

## Offline sync

Sponsorships are written to AsyncStorage immediately and queued as pending
actions. `getPendingActions()` / `clearPendingActions()` are the sync seam —
call them from a network-aware hook or a background task to replay the queue
against the API.
