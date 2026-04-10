# Admin Role System

The schedule simulator supports a minimal admin role system for gating user management actions (currently just "Add User"). This document explains how to set it up, how it works, and its known limitations.

## How it works

Admin status is determined by a simple allowlist stored in Firestore:

**Document path:** `config/admins`

**Document shape:**
```json
{
  "emails": [
    "peter.okelly@msc.com",
    "other.admin@msc.com"
  ]
}
```

On sign-in, the app loads this document and compares the current user's email (case-insensitively) against the list. If the email is present, `isAdmin = true` and admin-only UI elements become visible.

## Bootstrap (first-time setup)

Because the admin list is stored in Firestore and writes should be restricted to existing admins, there is a chicken-and-egg problem for the first admin. The bootstrap must be done manually:

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select your project (default: `msc-schedule-sim`).
3. Navigate to **Firestore Database**.
4. Create a new document at `config/admins` with this structure:
   - Document ID: `admins`
   - Parent collection: `config`
   - Field `data` of type `string` with the value:
     ```
     {"emails":["your.email@msc.com"]}
     ```
   - Field `updatedAt` of type `string` with the current ISO timestamp.

The app stores all `config/*` documents as JSON stringified inside a `data` field — this matches the existing patterns for `config/routeTable`, `config/airports`, etc.

5. Sign in to the app with the email you just added. The "Add User" button will appear in the user menu with an `ADMIN` badge.

## Managing the admin list

### In-app management (preferred)

Once you've bootstrapped the first admin, you can manage the list without touching the Firebase Console:

1. Sign in as an admin.
2. Click your email in the top-right corner → **Manage Admins**.
3. The modal shows the current admin list. From here you can:
   - **Add an admin** — type an email and click Add. The email is normalised to lowercase and validated before saving.
   - **Remove an admin** — click Remove next to their email and confirm. You cannot remove the last admin (the Remove button is disabled when only one admin remains).
   - **Remove yourself** — allowed as long as you are not the last admin. A confirmation prompt appears before saving. After saving, your admin privileges are revoked on the next reload.

Changes persist to `config/admins` in Firestore immediately. Other users see the change the next time they reload the app.

### Direct Firestore editing (fallback)

If the in-app UI is unavailable (e.g., you're locked out because the admin list is empty or corrupted), you can always edit `config/admins` directly in the Firebase Console. Use the bootstrap procedure above.

## Firestore Security Rules

The client-side admin check gates the UI but does **not** protect Firestore data on its own. Deploy rules like the following to restrict writes to `config/admins` to existing admins:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: is the current user an admin?
    function isAdmin() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower() in
           get(/databases/$(database)/documents/config/admins).data.emails;
    }

    // The admin list: readable by any authenticated user
    // (so each user can determine their own status), writable only by admins
    match /config/admins {
      allow read:  if request.auth != null;
      allow write: if isAdmin();
    }

    // Scenarios and other config docs: readable/writable by any authenticated user
    // (replace with tighter rules if needed)
    match /scenarios/{scenarioId} {
      allow read, write: if request.auth != null;
    }
    match /config/{document=**} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

**Deploy via Firebase CLI:**
```bash
firebase deploy --only firestore:rules
```

Or paste into the Firestore Rules editor in the Firebase Console.

**Note:** The `.lower()` call in the rule assumes emails are lowercased in the admin list. The client normalises with `.trim().toLowerCase()` before comparing, and you should store emails in the list in lowercase too.

## Known limitation: Firebase Auth signup endpoint is public

This is the most important thing to understand about the current design.

**Client-side enforcement only.** The `Add User` button is hidden for non-admins, and the modal rejects submission if the `isAdmin` prop is false. This stops casual misuse by authenticated non-admin users.

**The `accounts:signUp` REST endpoint is publicly accessible.** It lives at `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=YOUR_API_KEY`. Anyone who knows your Firebase web API key (which is not a secret and can be extracted from the compiled JavaScript bundle) can call this endpoint directly and create accounts. Firestore security rules cannot block this — Firebase Auth and Firestore are separate services.

### Mitigations

In rough order of strength:

1. **Accept client-side gating.** For a low-risk internal tool, the UI gate is enough to prevent accidental misuse by well-intentioned users. The current implementation.

2. **Restrict the API key** in [Google Cloud Console → API Credentials → API key restrictions](https://console.cloud.google.com/apis/credentials). Set HTTP referrer restrictions so the key only works from your Netlify domain. This forces an attacker to use a browser at your domain rather than curl. Not bulletproof (referrer headers can be spoofed) but raises the bar significantly.

3. **Disable email/password sign-up entirely in Firebase Console** (Authentication → Sign-in method → Email/Password → Disable sign-up). After this, no one — including admins — can use the in-app `Add User` flow. User creation has to happen via the Firebase Console.

4. **Full enforcement via Cloud Function.** The proper solution:
   - Disable public signup as in (3)
   - Deploy a Cloud Function (Firebase Functions or Netlify Functions) that:
     - Accepts an ID token from the calling user
     - Verifies the caller is an admin using the same `config/admins` lookup
     - Calls the Firebase Admin SDK to create the user (Admin SDK bypasses the public signup restriction)
   - Change `authCreateUser` in `src/App.jsx` to call your Cloud Function endpoint instead of `identitytoolkit.googleapis.com/v1/accounts:signUp`

This last option is the only way to have true server-side enforcement. It requires deploying and maintaining a backend function.

## Where the code lives

| Concern | Location |
|---|---|
| Admin list loader | `loadAdminList()` and `isEmailAdmin()` in `src/App.jsx` |
| `isAdmin` state + load effect | Inside `AppShell` in `src/App.jsx` |
| Button gating | User menu dropdown in `AppShell` |
| Add User modal | `AddUserModal` component in `src/App.jsx` |
| Manage Admins modal | `ManageAdminsModal` component in `src/App.jsx` |
| Admin list persistence | `fsSet("config", "admins", { emails: [...] })` in `ManageAdminsModal` |
| Firebase auth signup call | `authCreateUser()` in `src/App.jsx` |
| Error message mapping | `AUTH_ERROR_MAP` and `friendlyAuthError()` in `src/App.jsx` |
