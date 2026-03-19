# Vii-Mbuni APK Build Guide
# Using PWABuilder (easiest) or Bubblewrap (more control)

## Method 1: PWABuilder (Recommended — 5 minutes)
# -------------------------------------------------
# 1. Go to https://www.pwabuilder.com
# 2. Enter: https://vii-mbuni.netlify.app
# 3. Click "Package for Stores"
# 4. Select "Android" → Generate
# 5. Download the .apk or .aab file
# 6. Sign it with your keystore (or use debug key for testing)
#
# PWABuilder handles TWA setup, assetlinks.json, and signing automatically.

## Method 2: Bubblewrap CLI (More control)
# -----------------------------------------
# Requirements: Node.js 16+, Java JDK 8+, Android SDK
#
# npm install -g @bubblewrap/cli
#
# bubblewrap init --manifest https://vii-mbuni.netlify.app/manifest.json
# # Answer prompts:
# #   Package ID: app.netlify.vii_mbuni.twa
# #   App name: Vii-Mbuni
# #   Launcher name: Vii-Mbuni
# #   Start URL: https://vii-mbuni.netlify.app/?source=pwa
# #   Theme color: #c8102e
# #   Background color: #0a0a0a
# #   Signing: create new keystore
#
# bubblewrap build
# # Output: app-release-signed.apk
#
# Get SHA256 fingerprint (needed for assetlinks.json):
# keytool -list -v -keystore android.keystore
# Copy the SHA256 and update public/.well-known/assetlinks.json

## Method 3: Capacitor (Full native app)
# ----------------------------------------
# npm install @capacitor/core @capacitor/cli @capacitor/android
# npx cap init "Vii-Mbuni" "app.netlify.vii_mbuni"
# npx cap add android
# npm run build && npx cap sync
# npx cap open android  # Opens in Android Studio
# Build → Generate Signed Bundle/APK

## After generating the APK
# --------------------------
# 1. Test on device: adb install app-release.apk
# 2. For Play Store: use .aab (Android App Bundle)
# 3. For direct distribution: use signed .apk

## Important: Update assetlinks.json
# -----------------------------------
# Replace REPLACE_WITH_YOUR_KEYSTORE_SHA256_FINGERPRINT in:
# public/.well-known/assetlinks.json
# with your actual keystore SHA256 fingerprint.
# Then redeploy to Netlify.
