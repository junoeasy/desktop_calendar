# macOS Signing and Notarization

macOS Gatekeeper warning can only be removed by signing the app with an Apple Developer ID certificate and notarizing it with Apple.

## Required GitHub Secrets

Add these repository secrets before publishing a macOS release:

- `MACOS_CSC_LINK`: base64 encoded `.p12` certificate exported from Keychain Access
- `MACOS_CSC_KEY_PASSWORD`: password used when exporting the `.p12`
- `APPLE_ID`: Apple Developer account email
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for the Apple ID
- `APPLE_TEAM_ID`: Apple Developer Team ID

## Export the Certificate

1. In Apple Developer, create or download a `Developer ID Application` certificate.
2. Install it in Keychain Access.
3. Export the certificate and private key as a `.p12` file.
4. Encode it for GitHub Actions:

```bash
base64 -i DeveloperIDApplication.p12 | pbcopy
```

Paste the copied value into `MACOS_CSC_LINK`.

## Create an App-Specific Password

Create an app-specific password for the Apple ID and store it as `APPLE_APP_SPECIFIC_PASSWORD`.

## Release

After all secrets are configured, publish a tag:

```bash
git tag v1.0.10
git push origin v1.0.10
```

The release workflow signs, notarizes, and uploads:

- Windows installer
- macOS Apple Silicon DMG/ZIP
- macOS Intel DMG/ZIP

If notarization succeeds, macOS should open the app without the "Apple could not verify" Gatekeeper block.
