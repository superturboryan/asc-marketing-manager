---
name: asc-marketing-manager
description: Sync App Store Connect marketing metadata safely, including localized name, subtitle, description, keywords, support URL, marketing URL, What's New, Promotional Text, App Review text fields, and release-version setup from Google Sheets or desired-state JSON. Use when updating localized App Store copy or starting a new editable App Store version.
metadata:
  display_name: ASC Marketing Manager
  short_description: Sync localized App Store Connect marketing metadata with dry-run safety.
---

# ASC Marketing Manager

Use this skill to update App Store Connect text metadata with a dry-run-first workflow.

## Core Workflow

1. Confirm the target app, version, and credential env file.
2. If using Google Sheets, read `references/google-sheet-localizations.md` first.
   - sheet ID from `ASC_SHEET_ID`
   - tab from `ASC_SHEET_NAME`, defaulting to `ASC_VERSION` only when omitted
   - if `ASC_SHEET_ID` is missing or the spreadsheet cannot be found, create a native Google
     Sheet with the Google Sheets connector before asking the user to fill copy
   - new sheets should follow the WatchCloud strings layout: a `Pages` tab plus one version tab
     with headers `Name`, `Subtitle`, `Promotional Text`, `Description`, `What's new`, `Keywords`
3. Build a transient desired-state JSON in `/private/tmp`.
4. Run the bundled script with `--dry-run`.
5. Require explicit user confirmation before running `--apply`.
6. After apply, rely on the script's re-fetch verification before reporting success.

If the target version does not exist, ask the user for the version number unless it is already in
`ASC_VERSION`, `--version`, or `version.versionString`. Use `--ensure-version` only when the user
wants to start a new editable release. Dry-run reports the version creation; apply creates it.

## Script

Use `scripts/asc-sync-metadata.mjs`.

```zsh
node scripts/asc-sync-metadata.mjs \
  --env ~/.appstoreconnect/my-app.env \
  --desired /private/tmp/asc-desired-metadata.json \
  --version 2.3.0 \
  --ensure-version \
  --dry-run
```

```zsh
node scripts/asc-sync-metadata.mjs \
  --env ~/.appstoreconnect/my-app.env \
  --desired /private/tmp/asc-desired-metadata.json \
  --version 2.3.0 \
  --ensure-version \
  --apply
```

The script syncs App Store Connect only. It does not read or create Google Sheets directly.

## Desired JSON

Read `references/desired-json-schema.md` before creating desired-state JSON by hand. The current
nested shape separates `appInfo.locales`, `version.locales`, version attributes, and `review`
fields. The old top-level `locales` shape remains supported for `promotionalText` and `whatsNew`.

## Credentials

Read `references/app-store-connect-credentials.md` before helping a user set up credentials. Never print full key IDs, issuer IDs, JWTs, `.p8` contents, or env files containing secrets.

## Safety Rules

- Always dry-run first.
- Do not run `--apply` until the user explicitly asks for it after a clean dry-run.
- Keep `.env` and `.p8` files outside repos.
- Do not commit desired JSON if it contains unreleased marketing copy.
- Do not print review passwords, JWTs, `.p8` contents, or env files containing secrets.
- Treat screenshot, app preview, build selection, review attachment, submission, phased-release creation,
  routing coverage, and rating reset as future/planning scope. This script supports text metadata only.
