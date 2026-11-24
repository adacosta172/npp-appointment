# Frontend module-load repair (7.3)

The latest screenshot shows the startup fallback, not a confirmed Firebase database error. Version 7.2 served the SDK from gstatic browser modules; 7.3 removes that dependency by building the SDK from npm. The exact previous failure is not established without the browser Network/Console error.

Use Vercel's Vite framework, `npm install`, `npm run build`, output `dist-static`, Node 22.x. Clear the previous deployment cache. Confirm Vercel's build log ends with the build verifier PASS. Check that the deployed page title includes v7.3. If it still fails, click Test backend and record its result; in DevTools (F12) check the first failed script's request path/status and first console error. Do not share auth tokens or applicant records.

# Diagnose catalogue · functions/internal

The screenshot proves the frontend executed but the callable did not return a successful catalogue response. It does not establish whether the underlying failure is a missing function, Cloud Run IAM/CORS, missing default Firestore database, incorrect service account access or an unhandled server error.

1. Run `npx firebase-tools@14 functions:list --project nppappointment` to confirm portal and dailySummary exist in us-central1.
2. Run `npm run check:live` (or provide the actual Vercel origin). It checks CORS, version, catalogue, Storage metadata and rejection of private unauthenticated calls. An empty catalogue is expected until an administrator publishes positions.
3. Run `npx firebase-tools@14 functions:log --only portal --project nppappointment`. Look for a failed request and safe error category/reference. The Google Cloud console may contain more detailed startup or IAM logs. Share the error code/category, not account tokens, applicant data or private credentials.
4. Confirm Firestore `(default)` exists in the correct project and indexes are ready. RTDB is not a substitute. Confirm the named Storage bucket exists and check backend service account access to that bucket (including bucket metadata for readiness). Check runtime service account access to Firebase Authentication and Firestore. Cloud Run invocation must permit the public callable transport (private actions remain independently authenticated). Do not make Firestore or Storage public. If organisation policy restricts the callable transport, the project administrator must resolve that policy or choose a supported authenticated gateway.
5. The new online deployment command builds and deploys the matching backend and Firebase Hosting site, then verifies the public integration. Vercel build uses the same public integration gate. Run private acceptance tests separately.

Official references: https://firebase.google.com/docs/functions/callable and https://cloud.google.com/functions/docs/troubleshooting .
