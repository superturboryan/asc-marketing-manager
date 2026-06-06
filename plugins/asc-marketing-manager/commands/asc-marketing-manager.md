---
description: Start an App Store Connect marketing metadata workflow.
---

# /asc-marketing-manager

Start ASC Marketing Manager for App Store Connect text metadata.

## Arguments

- `env`: path to the App Store Connect env file (optional)
- `desired`: path to desired-state JSON (optional)
- `version`: App Store version string (optional)
- `sheet`: Google Sheet ID or sheet context (optional)
- `mode`: `setup`, `dry-run`, or `apply` (optional; default: infer from request)

## Workflow

1. Use the `asc-marketing-manager` skill.
2. Read the skill's `SKILL.md` before making App Store Connect changes.
3. If using Google Sheets, read `references/google-sheet-localizations.md` and use the Google Sheets connector to build transient desired-state JSON in `/private/tmp`.
4. Always run the bundled `asc-sync-metadata.mjs` script with `--dry-run` first.
5. Do not run `--apply` unless the user explicitly asks after reviewing a clean dry run.
6. Keep credentials and unreleased desired metadata out of the repo.

## Guardrails

- Never print full `.env` files, `.p8` contents, JWTs, review passwords, or other credentials.
- Treat screenshot, app preview, build selection, review attachment, submission, phased-release creation, routing coverage, and rating reset as future scope.
