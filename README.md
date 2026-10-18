# LIFE RPG Android

This repository packages the LIFE RPG offline web app as an Android APK through GitHub Actions.

## Build and install

Open the Actions tab and inspect the latest Build LIFE RPG Android APK run. A successful run publishes a debug APK as a GitHub Release asset. The app currently stores progress locally on the device; it does not sync to a server yet.

The web app HTML payload is gzip-compressed and base64-encoded in mobile/web_payload/part*.txt so CI can reconstruct it deterministically. The build validates the HTML checksum before packaging it.

## Security and storage

The WebView loads a bundled local HTML file. The native bridge handles user-initiated JSON/CSV exports through Android's document picker. Imports use Android's file picker. No API keys or backend credentials are included.
