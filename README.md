# ASC Marketing Manager

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![skills.sh](https://skills.sh/b/superturboryan/asc-marketing-manager)](https://skills.sh/superturboryan/asc-marketing-manager/asc-marketing-manager)
![Node.js 18+](https://img.shields.io/badge/node-18%2B-339933)
![App Store Connect](https://img.shields.io/badge/App%20Store%20Connect-metadata-0A84FF)

ASC Marketing Manager is a Codex marketplace plugin for safely syncing App Store Connect text metadata.

It reads localized marketing copy from Google Sheets or desired-state JSON, runs a dry-run comparison first, and applies only explicitly reviewed App Store Connect changes.

Screenshot and app preview upload support is planned as a later command because asset uploads use a separate App Store Connect workflow.

## Install In Codex

Add this repo as a marketplace source:

```zsh
codex plugin marketplace add superturboryan/asc-marketing-manager
```

Then install or browse **ASC Marketing Manager** from that marketplace in Codex. The plugin bundles the `asc-marketing-manager` skill under `plugins/asc-marketing-manager/skills/asc-marketing-manager`.

Start the workflow from a new Codex thread with:

```text
/asc-marketing-manager
```

When using Google Sheets, Codex still needs access to the Google Sheets connector. The script itself only talks to App Store Connect and reads desired-state JSON from disk.

### Other Install Paths

Install the skill through skills.sh:

```zsh
npx skills add superturboryan/asc-marketing-manager
```

Install the plugin through Codex Marketplace:

```zsh
npx codex-marketplace add superturboryan/asc-marketing-manager --plugins
```

## At a Glance

- Dry-run-first App Store Connect sync for localized text metadata.
- Installable as a Codex plugin, with a bundled Node script that has no npm dependencies.
- Supports Google Sheets connector workflows and explicit desired-state JSON.
- Keeps credentials outside the repo and redacts sensitive review/demo-account values.
- Published as an early `0.1.0` pre-release; contributions are welcome.

<details open>
<summary><strong>Supported Metadata</strong></summary>

- localized app name
- localized subtitle
- localized description
- localized keywords
- localized support URL
- localized marketing URL
- `whatsNew`
- `promotionalText`
- App Review contact, demo account, and notes text fields
- starting a new editable App Store version when explicitly requested

</details>

<details open>
<summary><strong>What It Does</strong></summary>

- Reads localized marketing copy from Google Sheets through a Codex Google Sheets connector workflow.
- Creates a WatchCloud-style localization Google Sheet when one does not already exist.
- Builds a desired-state JSON file.
- Runs a bundled Node script against the App Store Connect API.
- Performs dry-run comparison before any write.
- PATCHes or creates only changed text metadata resources.
- Keeps App Info, App Store Version Localization, App Store Version, and App Review Detail updates separate.
- Can dry-run and then create a missing App Store version with `--ensure-version`.
- Re-fetches App Store Connect state and verifies the result after apply.

</details>

<details>
<summary><strong>Requirements</strong></summary>

- Node.js 18 or newer.
- A Codex environment with the Google Sheets connector if you want sheet extraction or creation.
- An App Store Connect Team API key.

The script itself does not require external npm dependencies.

</details>

<details>
<summary><strong>Google Sheet Source</strong></summary>

When `ASC_SHEET_ID` points to an existing spreadsheet, the skill reads that sheet through the Google Sheets connector. If `ASC_SHEET_ID` is missing or the spreadsheet cannot be found, the skill can create a native Google Sheet first, then ask you to fill and review the localization rows before any App Store Connect sync.

New sheets follow the WatchCloud strings layout:

- spreadsheet title pattern: `<App Name> strings 🌎🌍🌏`
- `Pages` tab first, for storefront flag and App Store URL reference rows
- version tab named from `ASC_SHEET_NAME`, or `ASC_VERSION` when `ASC_SHEET_NAME` is omitted
- version tab headers: version label, `Name`, `Subtitle`, `Promotional Text`, `Description`, `What's new`, `Keywords`
- `Reviewer Notes` section below the localization table

Example CSV templates are in `plugins/asc-marketing-manager/skills/asc-marketing-manager/assets/examples/localization-sheet-template.csv` and `plugins/asc-marketing-manager/skills/asc-marketing-manager/assets/examples/pages-sheet-template.csv`. Full connector creation and extraction rules are in `plugins/asc-marketing-manager/skills/asc-marketing-manager/references/google-sheet-localizations.md`.

</details>

<details>
<summary><strong>App Store Connect API Key</strong></summary>

Create a Team API key:

1. Open App Store Connect.
2. Go to **Users and Access**.
3. Open **Integrations**.
4. Open **App Store Connect API**.
5. Use **Team Keys**.
6. Generate a key.
7. Choose the least-privilege role that supports this workflow. **Marketing** should be suitable
   for App Store metadata, screenshots, and app previews; do not use **Full Access** unless a
   future workflow specifically requires it.
8. Download the `.p8` private key immediately. Apple only allows downloading it once.

Store credentials outside the repo:

```zsh
mkdir -p ~/.appstoreconnect
chmod 700 ~/.appstoreconnect
mv ~/Downloads/AuthKey_<KEY_ID>.p8 ~/.appstoreconnect/
chmod 600 ~/.appstoreconnect/AuthKey_<KEY_ID>.p8
```

Create an env file:

```zsh
ASC_KEY_ID=<KEY_ID>
ASC_ISSUER_ID=<ISSUER_ID>
ASC_KEY_PATH=/Users/you/.appstoreconnect/AuthKey_<KEY_ID>.p8
ASC_APP_ID=<APP_ID>
ASC_VERSION=<VERSION>
ASC_PLATFORM=IOS
ASC_COPYRIGHT=2026 Your Name
ASC_SHEET_ID=<GOOGLE_SHEET_ID>
ASC_SHEET_NAME=<SHEET_TAB_NAME>
```

Secure it:

```zsh
chmod 600 ~/.appstoreconnect/*.env
chmod 600 ~/.appstoreconnect/*.p8
```

Never commit `.env`, JWT, or `.p8` files.

</details>

<details>
<summary><strong>Desired Metadata JSON</strong></summary>

The script accepts this nested shape:

```json
{
  "appInfo": {
    "locales": {
      "en-US": {
        "name": "Example App",
        "subtitle": "Music on your watch"
      }
    }
  },
  "version": {
    "versionString": "2.3.0",
    "platform": "IOS",
    "copyright": "2026 Example",
    "releaseType": "MANUAL",
    "usesIdfa": false,
    "locales": {
      "en-US": {
        "promotionalText": "Short promotional text, max 170 characters.",
        "description": "Long App Store description.",
        "keywords": "music,watch,streaming",
        "supportUrl": "https://example.com/support",
        "marketingUrl": "https://example.com",
        "whatsNew": "+ Release note one\n+ Release note two"
      }
    }
  },
  "review": {
    "contactFirstName": "Ada",
    "contactLastName": "Lovelace",
    "contactPhone": "+15555550123",
    "contactEmail": "ada@example.com",
    "demoAccountRequired": true,
    "demoAccountName": "demo@example.com",
    "demoAccountPassword": "secret",
    "notes": "Use the demo account to sign in."
  }
}
```

The old top-level `locales` shape is still accepted for `promotionalText` and `whatsNew`.

Use `fallbacks`, `appInfo.fallbacks`, or `version.fallbacks` for App Store Connect locale variants that should reuse another locale's copy.

</details>

<details open>
<summary><strong>Dry Run</strong></summary>

```zsh
node plugins/asc-marketing-manager/skills/asc-marketing-manager/scripts/asc-sync-metadata.mjs \
  --env ~/.appstoreconnect/my-app.env \
  --desired /private/tmp/asc-desired-metadata.json \
  --dry-run
```

To start a new release if the version does not exist, include a version from `--version`, `ASC_VERSION`, or `version.versionString`, then add `--ensure-version`:

```zsh
node plugins/asc-marketing-manager/skills/asc-marketing-manager/scripts/asc-sync-metadata.mjs \
  --env ~/.appstoreconnect/my-app.env \
  --desired /private/tmp/asc-desired-metadata.json \
  --version 2.3.0 \
  --ensure-version \
  --dry-run
```

</details>

<details>
<summary><strong>Apply</strong></summary>

Only apply after reviewing a clean dry-run:

```zsh
node plugins/asc-marketing-manager/skills/asc-marketing-manager/scripts/asc-sync-metadata.mjs \
  --env ~/.appstoreconnect/my-app.env \
  --desired /private/tmp/asc-desired-metadata.json \
  --apply
```

</details>

<details>
<summary><strong>Tests</strong></summary>

Run unit tests with Node's built-in test runner:

```zsh
node --test plugins/asc-marketing-manager/skills/asc-marketing-manager/tests/*.test.mjs
```

Tests do not call App Store Connect and do not require real credentials.

</details>

<details open>
<summary><strong>Contributing</strong></summary>

Contributions are welcome, especially for real App Store Connect workflows that can make the sync safer or easier to review.

Good first areas:

- additional locale and field validation fixtures
- clearer Google Sheet templates and extraction rules
- improved dry-run summaries
- App Store Connect edge cases around editable version state
- documentation for common release-manager workflows

Please keep changes dependency-light, dry-run-first, and careful about credentials. Screenshot and app preview upload support should land as a separate command/workflow because ASC asset uploads use reservation, upload, commit, and reorder APIs.

</details>

<details>
<summary><strong>Safety Model</strong></summary>

- Dry-run first.
- Exact locale matching.
- Locale fallback validation.
- Character and byte limit validation for all supported text fields.
- URL validation for support and marketing URLs.
- Blank field rejection.
- Trailing whitespace normalization because App Store Connect strips trailing whitespace.
- Secret redaction for credentials and review passwords in summaries.
- No screenshot, preview, build selection, review attachment, submission, phased-release creation, routing coverage, or rating reset behavior.

</details>
