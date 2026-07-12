# Building a standard signed APK via GitHub Actions

This repo now has `.github/workflows/build-apk.yml`, which builds a **real,
standalone Android APK** (your React app compiled and bundled inside the app —
not a wrapper that loads a website). Every push to `main`, or a manual run,
produces a signed `app-release.apk` you can download from the Actions run.

## One-time setup

### 1. Push this repo to GitHub
If it isn't already, push it there (the workflow only runs on GitHub, not locally).

### 2. Create a signing keystore (skip if you already have one)
On any machine with a JDK installed:

```bash
keytool -genkeypair -v -keystore release.keystore \
  -alias vii-mbuni -keyalg RSA -keysize 2048 -validity 10000
```

You'll be prompted for a keystore password and a key password — remember these.
**Keep `release.keystore` somewhere safe and back it up.** If you lose it, you
can never publish an update to the same app listing again (Play Store requires
the same signing key for every update).

### 3. Base64-encode the keystore
```bash
base64 -i release.keystore -o release.keystore.b64
cat release.keystore.b64   # copy this whole output
```

### 4. Add GitHub repo secrets
In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**.
Add each of these:

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `release.keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | your keystore password |
| `ANDROID_KEY_ALIAS` | `vii-mbuni` (or whatever alias you used) |
| `ANDROID_KEY_PASSWORD` | your key password |
| `VITE_SUPABASE_URL` | from your `.env` |
| `VITE_SUPABASE_ANON_KEY` | from your `.env` |
| `VITE_VAPID_PUBLIC_KEY` | from your `.env` |

(If you skip the 4 `ANDROID_*` signing secrets, the workflow still builds an
**unsigned** APK — fine for testing on your own device with `adb install`, but
not installable on most devices without signing, and not acceptable for the
Play Store.)

### 5. Run the build
Push to `main`, or go to **Actions → Build Android APK → Run workflow** to
trigger it manually.

When it finishes, open the workflow run and download the
`vii-mbuni-release-apk` artifact — that's your APK.

## Notes

- **Package ID**: currently `app.netlify.vii_mbuni.twa`, left over from the
  original TWA setup. Cosmetic only, but if you want to rename it before your
  first Play Store upload, change `applicationId`/`namespace` in
  `android/app/build.gradle` and the matching Java package path — do this
  *before* your first release, since the package ID can't be changed later.
- **Push notifications**: if you want FCM push to work in the native app, see
  `PUSH_NOTIFICATIONS_SETUP.md` — you'll need to add a `google-services.json`
  file to `android/app/`.
- **Installing on your phone**: enable "Install unknown apps" for your file
  manager/browser, then open the downloaded APK. Or via USB: `adb install app-release.apk`.
- **Play Store**: for a Play Store submission, use an `.aab` instead — change
  the final Gradle task in the workflow from `assembleRelease` to
  `bundleRelease`, and the output path to `android/app/build/outputs/bundle/release/app-release.aab`.
