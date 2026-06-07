---
name: asc-marketing-manager
description: Sync App Store Connect marketing metadata safely, including localized name, subtitle, description, keywords, support URL, marketing URL, What's New, Promotional Text, App Review text fields, and release-version setup from Google Sheets or desired-state JSON. Use when updating localized App Store copy or starting a new editable App Store version.
---

# Workflow

Use this skill to update App Store Connect text metadata with a dry-run-first workflow.

## Core Workflow

1. Confirm the target app, version, and credential env file.
2. If using Google Sheets, read `references/google-sheet-localizations.md` first.
   - sheet ID from `ASC_SHEET_ID`
   - tab from `ASC_SHEET_NAME`; if omitted, use the confirmed target version
   - if `ASC_SHEET_ID` is missing or the spreadsheet cannot be found, create a native Google
     Sheet with the Google Sheets connector before asking the user to fill copy
   - after reading sheet values through the connector, use the dependency-free mapper in
     `lib/sheet-mapper.mjs` to convert the 2D range into desired JSON
   - new sheets should follow the WatchCloud strings layout: a `Pages` tab plus one version tab
     with headers `Name`, `Subtitle`, `Promotional Text`, `Description`, `What's new`, `Keywords`
3. Build a transient desired-state JSON in `/private/tmp`.
   - If the sheet is edited manually after JSON generation or after a dry-run, re-read the sheet,
     rerun the mapper, and regenerate JSON before another dry-run or apply.
   - For newly added locales, include both `appInfo.locales` (`name`, `subtitle`) and
     `version.locales` in the first desired JSON. Default `name` from the primary English row
     unless the app intentionally localizes its brand/title; localize the `subtitle`.
   - App `name` and `subtitle` must not include Apple device names such as `iPhone`, `iPad`,
     `Apple Watch`, `Apple TV`, `Apple Vision`, or `Vision Pro`; use generic wording like
     `phone`, `watch`, or localized equivalents.
   - If App Store Connect rejects app-info create/update because of app state, report the blocked
     `name`/`subtitle` fields explicitly, then retry/apply a version-locales-only JSON so
     promotional text, description, what's new, and keywords can still sync.
4. Run the bundled script with `--dry-run`.
5. Require explicit user confirmation before running `--apply`. If the user already gave explicit
   apply intent before the dry-run, a clean dry-run immediately before apply is sufficient.
6. After apply, rely on the script's re-fetch verification before reporting success.

If the user's prompt does not specify which App Store version to edit or create, stop and ask for
the target version before reading sheets or running the script. Use `--ensure-version` only when
the user wants to start a new editable release. Dry-run reports the version creation; apply creates
it.

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

`appInfo.locales` (`name`, `subtitle`) and `version.locales` (promotional text, description,
keywords, What's New, URLs) are separate ASC resources. If app-level `name` or `subtitle` changes
are rejected due to App Store Connect state, rerun a version-locales-only dry-run/apply so allowed
version metadata can still sync.

## Credentials

Read `references/app-store-connect-credentials.md` before helping a user set up credentials. Never print full key IDs, issuer IDs, JWTs, `.p8` contents, or env files containing secrets.
Tell users to follow the least privilege principle for App Store Connect API keys. Recommend the
**Marketing** role for this skill's current metadata workflows, and do not request or recommend
**Full Access**.

## Safety Rules

- Always dry-run first.
- Do not run `--apply` until the user explicitly asks for it after a clean dry-run.
- Keep `.env` and `.p8` files outside repos.
- Do not commit desired JSON if it contains unreleased marketing copy.
- Do not print review passwords, JWTs, `.p8` contents, or env files containing secrets.
- Treat screenshot, app preview, build selection, review attachment, submission, phased-release creation,
  routing coverage, and rating reset as future/planning scope. This script supports text metadata only.
