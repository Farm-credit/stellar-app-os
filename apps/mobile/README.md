# Stellar Sponsor Mobile

Expo/React Native client for iOS and Android sponsors. The first screen mirrors the web portfolio summary and is intentionally data-source compatible with `/api/portfolio`.

- **Feature parity:** portfolio totals, protected area, CO₂, and tree count are loaded from the same API contract as the web dashboard.
- **Push:** requests notification permission and registers an Expo push token with `/api/mobile/push-token`; health alerts and milestones can be dispatched by the existing notification worker.
- **Offline:** the latest portfolio snapshot is stored in AsyncStorage and rendered before the network request completes.

Run from `apps/mobile` with `npm install`, then `npm run ios` or `npm run android`. Set `EXPO_PUBLIC_API_URL` for a non-production API.
