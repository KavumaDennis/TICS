# TICS (v1) — Smart Travel Assistant (MVP)

This repo is a Firebase + Expo MVP for trip tracking, alerts/recommendations generation, push notifications, and an AI assistant.

## Backend (Firebase)

### Data (Firestore)
- `users/{uid}`
- `trips/{tripId}`
- `alerts/{alertId}` (server-created)
- `recommendations/{recId}` (server-created)
- `transport_options/{optId}` (server-created)

Security rules live in `firebase/firestore.rules`.

### Cloud Functions
Source: `firebase/functions/src/index.ts`

What runs:
- `monitorTrips` (scheduled every 15 minutes): regenerates alerts/recommendations/transport options for upcoming trips.
- `seedTripArtifactsOnCreate`, `syncTripOnUpdate`, `cleanupOnTripDelete`: lifecycle triggers for `trips`.
- `notifyOnNewAlert`: sends FCM push to `users.devicePushTokens`.
- `assistantChat` (callable): Gemini 2.0 Flash-backed AI assistant with live trip context.

### Secrets / config
Set secrets via Firebase CLI (production) or `firebase/functions/.env` (emulator):
- `GEMINI_API_KEY` — Gemini 2.0 Flash for `assistantChat`
  - `firebase functions:secrets:set GEMINI_API_KEY`
- `OPENWEATHER_API_KEY` — weather data for `monitorTrips` / `seedTripArtifactsOnCreate`
  - `firebase functions:secrets:set OPENWEATHER_API_KEY`
- `AVIATIONSTACK_API_KEY` — flight gate/terminal/delay data
  - `firebase functions:secrets:set AVIATIONSTACK_API_KEY`

## Frontend (Expo)

### Setup
1. Configure Firebase in `frontend/.env` (copy from `frontend/.env.example`).
2. Install deps:
   - `cd frontend`
   - `npm install`

### Google / Apple sign-in
This app uses Firebase Auth.

1. In Firebase Console → Authentication:
   - Enable Google provider
   - Enable Apple provider (iOS only)
2. Set Google OAuth client IDs in `frontend/.env`:
   - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
   - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

Note: Apple Sign-In requires Apple developer configuration + correct bundle identifiers when building an iOS app.

### Run
- `cd frontend`
- `npm start`

## Firebase emulators (optional)
- `firebase emulators:start`
