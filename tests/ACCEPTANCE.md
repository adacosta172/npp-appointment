# Required pre-launch acceptance checklist (not executed)

Use a separate Firebase emulator or staging project with synthetic data only. To use emulators, set project to `demo-nppappointment`, `VITE_EMULATOR=true`, a dummy Web API key/app ID and storage bucket; start `npx firebase emulators:start --project demo-nppappointment`. For setup script use `GCLOUD_PROJECT=demo-nppappointment`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`. Some MFA and scheduled-function behaviours require an actual authorised staging setup. Do not use production data for tests.

- Verify `npm install`, Vite build, Functions deployment, all rule/index deployment, and staging configuration. Firebase emulator and SDK versions must be installed before running this checklist.
- Registration, email verification, password reset, persistent sign-in and sign-out. Test staff TOTP enrolment and subsequent login; confirm no staff access without MFA. Revoke staff tokens/disable account and test API denial.
- Verify no unauthenticated or authenticated client direct reads/writes to Firestore or Storage. Attempt other-applicant record ID and document download, panel unassigned access, applicant privilege escalation. Confirm all denied. Confirm no personal records in static assets or public API.
- Seed/publish 10 positions; draft details, file upload, required field/declaration validation, duplicate simultaneous submit, reference uniqueness, deadline boundary, correction deadline, replacement/history and owner notification.
- Scan benign files and test EICAR using an isolated scanner test environment. Verify pending, infected and unavailable scanner never allow reviewer download or approval; clean attachment available only after auth. Verify worker IAM and object permissions. Validate snapshot retention and version metadata.
- Open submitted record as applicant (no transition), then as administrator (Under Review), reopen (no regression), inspect audit and notification. Attempt direct status manipulation and final decision without authority.
- Schedule approved applicant, capacity and panel overlap checks, reschedule, record attendance and panel assessment; verify appointment visible only to entitled account. Check final decision permission and status history.
- Verify dashboard alerts, daily scheduled aggregate snapshot, CSV summary, pagination/search, desktop/mobile routes and no Application guide navigation button. Ensure no external messages are sent and no private data appears in error logs.
- Configure backups, recovery exercise, retention and deletion procedures, worker monitoring, costs and IAM review. Publish approved privacy notice, vacancy requirements and contact details. Verify authorised operator controls all data and has a secure admin recovery process.

### Account-first checks added in 6.3
- From a signed-out browser open an application deep link; confirm sign-in is required and the target resumes only after sign-in, verification and profile completion. Try all private endpoints with unauthenticated, anonymous-provider and unverified tokens; confirm denials.
- Confirm name and matching passwords are required; registration never permits choosing a privileged role. If verification email sending fails after successful account creation, verify the resend screen works without duplicate registration.
- Check default session-only persistence, opt-in remembered login, sign-out and cross-tab user changes; ensure no previous user's private UI remains. Verify two distinct applicants cannot access each other's files or records.
- Confirm no direct guest application path, and only the approved public catalogue is accessible without an account.
