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
- `assistantChat` (callable): OpenAI-backed assistant for the active trip context.

### Secrets / config
- OpenAI key for `assistantChat`:
  - `firebase functions:secrets:set OPENAI_API_KEY`

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
