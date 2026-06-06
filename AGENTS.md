# ASC Marketing Manager Handoff

## Project

`asc-marketing-manager` is a publishable Codex skill for safely syncing localized App Store Connect marketing metadata.

Current local path:

`/Users/ryan/Developer/Xcode/asc-marketing-manager`

Flattened standalone skill layout:

```text
asc-marketing-manager/
  README.md
  AGENTS.md
  SKILL.md
  scripts/
    asc-sync-metadata.mjs
  tests/
    asc-sync-metadata.test.mjs
    fixtures/
      desired-valid.json
      app-store-version-localizations.json
  references/
    desired-json-schema.md
    app-store-connect-credentials.md
    google-sheet-localizations.md
  assets/
    examples/
      app.env.example
      desired-metadata.example.json
      localization-sheet-template.csv
      pages-sheet-template.csv
```

## Current Status

The text metadata expansion package has been implemented and tested.

Verification command:

```zsh
cd /Users/ryan/Developer/Xcode/asc-marketing-manager
node --test tests/*.test.mjs
```

Last known result: 17 tests passed.

## Purpose

The skill helps agents sync App Store Connect text metadata, including:

- localized app name
- localized subtitle
- localized description
- localized keywords
- localized support URL
- localized marketing URL
- `whatsNew`
- `promotionalText`
- App Review contact, demo account, and notes text fields
- explicit creation of a missing editable App Store version with `--ensure-version`

Future scope:

- screenshots
- app previews
- build selection
- review attachments
- submission workflows
- phased-release creation
- routing coverage files
- rating reset

Screenshot and preview upload should be added as a separate command/workflow because ASC asset uploads use reservation/upload/commit/reorder APIs.

## Important Implementation Details

The script is dependency-free Node and uses Node built-ins only.

ASC JWT signing must use:

```js
crypto.sign("sha256", Buffer.from(signingInput), {
  key,
  dsaEncoding: "ieee-p1363"
})
```

This matters. A previous Ruby signing attempt returned ASC `401`; the Node `ieee-p1363` signature worked.

The script only talks to App Store Connect. It does not read or create Google Sheets directly. The skill/agent should read Google Sheets through the Google Sheets connector, then write transient desired-state JSON to `/private/tmp`.

If `ASC_SHEET_ID` is missing or the spreadsheet cannot be found, the skill can create a native Google Sheet first. New sheets should follow the WatchCloud strings format documented in `references/google-sheet-localizations.md`:

- spreadsheet title pattern: `<App Name> strings 🌎🌍🌏`
- `Pages` tab first
- one version tab named from `ASC_SHEET_NAME`, or `ASC_VERSION` when omitted
- row 1: version label, `Name`, `Subtitle`, `Promotional Text`, `Description`, `What's new`, `Keywords`
- localization rows keyed by display labels such as `English 🇺🇸`
- `Reviewer Notes` below the localization table

After creating a blank sheet, do not apply ASC changes until the user fills and reviews the copy.

Expected sheet mapping:

- WatchCloud-style sheets use column `A` for language label, `B` for `Name`, `C` for `Subtitle`,
  `D` for `Promotional Text`, `E` for `Description`, `F` for `What's new`, and `G` for `Keywords`.
- Generic sheets may use named headers matching desired JSON fields:
  `locale`, `name`, `subtitle`, `promotionalText`, `description`, `keywords`,
  `supportUrl`, `marketingUrl`, `whatsNew`
- If a WatchCloud-style sheet needs localized URL overrides, add optional columns named exactly
  `supportUrl` and `marketingUrl` after `Keywords`.

Use `ASC_SHEET_NAME` from the env file. If omitted, default to `ASC_VERSION`.

## Script Commands

Dry run:

```zsh
node scripts/asc-sync-metadata.mjs \
  --env ~/.appstoreconnect/my-app.env \
  --desired /private/tmp/asc-desired-metadata.json \
  --version 2.3.0 \
  --ensure-version \
  --dry-run
```

Apply:

```zsh
node scripts/asc-sync-metadata.mjs \
  --env ~/.appstoreconnect/my-app.env \
  --desired /private/tmp/asc-desired-metadata.json \
  --version 2.3.0 \
  --ensure-version \
  --apply
```

Always run dry-run first. Only apply after the user explicitly asks.

## Credential Rules

Never commit or print full credentials.

Required env values:

```zsh
ASC_KEY_ID=...
ASC_ISSUER_ID=...
ASC_KEY_PATH=/Users/you/.appstoreconnect/AuthKey_XXXXXXXXXX.p8
ASC_APP_ID=...
ASC_VERSION=...
ASC_PLATFORM=...
ASC_COPYRIGHT=...
ASC_SHEET_ID=...
ASC_SHEET_NAME=...
```

`ASC_VERSION` can be replaced by `--version` or `version.versionString`.
`ASC_PLATFORM` and `ASC_COPYRIGHT` are only needed when creating a missing version.

Recommended permissions:

```zsh
chmod 700 ~/.appstoreconnect
chmod 600 ~/.appstoreconnect/*.env
chmod 600 ~/.appstoreconnect/*.p8
```

Least privilege ASC key role: `Marketing`.

## Desired JSON Shape

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

The old top-level `locales` shape still works for `promotionalText` and `whatsNew`.
Fallbacks copy source-locale fields into ASC locale variants that do not have separate sheet rows.

## Safety Behavior

The script validates:

- required env values
- key file readability
- desired JSON shape
- locale fallback validity
- blank fields
- field character and byte limits
- support and marketing URL shape

The script normalizes trailing whitespace because ASC strips trailing whitespace on save.

## Publishing Direction

For v1, publish this as a standalone skill, not a plugin.

A plugin is only needed if this grows into a bundle with multiple skills, MCP servers, hooks, apps, or marketplace-level packaging.

Possible future plugin/collection name:

`app-store-release-tools`

Possible skills in that future collection:

- `asc-marketing-manager`
- `testflight-manager`
- `app-review-submission`
