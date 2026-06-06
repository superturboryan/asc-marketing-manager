import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertEditableForChanges,
  buildAppInfoDiff,
  buildAppStoreVersionCreatePayload,
  buildAppStoreVersionPatchPayload,
  buildDiff,
  buildLocalizationCreatePayload,
  buildPatchPayload,
  buildReviewDetailDiff,
  buildReviewDetailPayload,
  buildVersionAttributeDiff,
  buildVersionLocalizationDiff,
  expandFallbackLocales,
  loadAscState,
  normalizeAscText,
  parseDesiredMetadata,
  parseEnvFile,
  redactValue,
  resolveVersionString,
  summarizeDiff,
  summarizeReviewDiff,
  unicodeLength,
  utf8ByteLength,
  validateDesiredMetadata,
  validateEnv,
} from '../scripts/asc-sync-metadata.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

const fixturePath = (name) => path.join(fixturesDir, name);
const readFixture = (name) => fs.readFileSync(fixturePath(name), 'utf8');
const readJsonFixture = (name) => JSON.parse(readFixture(name));
const parseDesiredFixture = () => parseDesiredMetadata(readFixture('desired-valid.json'));
const parseDesiredObject = (desired) => parseDesiredMetadata(JSON.stringify(desired));

const validNestedDesired = () => ({
  appInfo: {
    locales: {
      'en-US': {
        name: 'WatchCloud',
        subtitle: 'Music on your watch',
      },
    },
  },
  version: {
    versionString: '2.3.0',
    platform: 'IOS',
    copyright: '2026 Example',
    releaseType: 'AFTER_APPROVAL',
    usesIdfa: false,
    locales: {
      'en-US': {
        promotionalText: 'Listen from your wrist.',
        description: 'A focused SoundCloud player for watchOS.',
        keywords: 'soundcloud,watch,music',
        supportUrl: 'https://example.com/support',
        marketingUrl: 'https://example.com',
        whatsNew: '+ Bug fixes',
      },
    },
  },
  review: {
    contactFirstName: 'Ada',
    contactLastName: 'Lovelace',
    contactPhone: '+15555550123',
    contactEmail: 'ada@example.com',
    demoAccountRequired: true,
    demoAccountName: 'demo@example.com',
    demoAccountPassword: 'secret-password',
    notes: 'Use the demo account.',
  },
});

const matchingAscRoute = (apiPath, response) => ({
  matches: (candidatePath) => candidatePath === apiPath,
  response,
});

const ascRoutes = (routes) => {
  const calls = [];
  const request = async (method, apiPath) => {
    calls.push([method, apiPath]);
    const route = routes.find(({ matches }) => matches(apiPath));
    if (!route) throw new Error(`Unexpected call ${apiPath}`);
    return typeof route.response === 'function' ? route.response() : route.response;
  };

  return { calls, request };
};

test('given an env file without a version, when parsing and validating it, then credentials are valid', () => {
  // Given
  const envFileContents = `
ASC_KEY_ID=ABCD1234EF
ASC_ISSUER_ID=issuer-id
ASC_KEY_PATH=/tmp/AuthKey_ABCD1234EF.p8
ASC_APP_ID=1234567890
`;

  // When
  const env = parseEnvFile(envFileContents);
  const validateWithoutVersion = () => validateEnv(env, { checkKeyFile: false });
  const validateMissingRequiredValues = () => validateEnv({ ASC_KEY_ID: 'secret' }, { checkKeyFile: false });

  // Then
  assert.equal(env.ASC_KEY_ID, 'ABCD1234EF');
  assert.equal(redactValue(env.ASC_KEY_ID), 'AB…EF');
  assert.doesNotThrow(validateWithoutVersion);
  assert.throws(validateMissingRequiredValues, /Missing env values/);
});

test('given legacy desired metadata with locale fallbacks, when parsing and expanding version locales, then fallback locales copy source locale text', () => {
  // Given
  const desired = parseDesiredFixture();

  // When
  const expanded = expandFallbackLocales(desired.version);

  // Then
  assert.deepEqual(desired.appInfo.locales, {});
  assert.equal(expanded['en-GB'].promotionalText, desired.version.locales['en-US'].promotionalText);
  assert.equal(expanded['es-MX'].whatsNew, desired.version.locales['es-ES'].whatsNew);
  assert.deepEqual(Object.keys(expanded).sort(), ['en-GB', 'en-US', 'es-ES', 'es-MX', 'ja']);
});

test('given nested desired metadata, when parsing it, then app info, version, and review fields are preserved', () => {
  // Given
  const desiredJson = validNestedDesired();

  // When
  const desired = parseDesiredObject(desiredJson);

  // Then
  assert.equal(desired.appInfo.locales['en-US'].name, 'WatchCloud');
  assert.equal(desired.version.versionString, '2.3.0');
  assert.equal(desired.review.demoAccountRequired, true);
});

test('given invalid desired metadata shapes, when validating them, then each shape fails with the expected error', () => {
  const scenarios = [
    {
      name: 'fallback to a missing source locale',
      given: {
        version: {
          locales: {
            'en-US': { promotionalText: 'Valid' },
          },
          fallbacks: {
            'en-GB': 'fr-FR',
          },
        },
      },
      then: /missing source locale/,
    },
    {
      name: 'blank locale fields',
      given: {
        version: {
          locales: {
            'en-US': { promotionalText: ' ' },
          },
        },
      },
      then: /blank/,
    },
    {
      name: 'mixed legacy and nested shape',
      given: {
        locales: {
          'en-US': { promotionalText: 'Valid', whatsNew: 'Valid' },
        },
        version: {},
      },
      then: /legacy top-level locales/,
    },
  ];

  for (const scenario of scenarios) {
    // Given
    const desired = scenario.given;

    // When
    const validate = () => validateDesiredMetadata(desired);

    // Then
    assert.throws(validate, scenario.then, scenario.name);
  }
});

test('given Unicode text, when counting characters and bytes, then character count and UTF-8 byte count are distinct', () => {
  // Given
  const japaneseText = '手首のウォッチ';
  const accentedCharacter = 'é';

  // When
  const characterCount = unicodeLength(japaneseText);
  const byteCount = utf8ByteLength(accentedCharacter);

  // Then
  assert.equal(characterCount, 7);
  assert.equal(byteCount, 2);
});

test('given desired metadata that exceeds field limits or has a bad URL, when validating it, then the matching limit error is raised', () => {
  const scenarios = [
    {
      name: 'name minimum length',
      given: { appInfo: { locales: { 'en-US': { name: 'x' } } } },
      then: /minimum characters/,
    },
    {
      name: 'subtitle maximum length',
      given: { appInfo: { locales: { 'en-US': { subtitle: 'x'.repeat(31) } } } },
      then: /31\/30/,
    },
    {
      name: 'promotional text maximum length',
      given: { version: { locales: { 'en-US': { promotionalText: 'x'.repeat(171) } } } },
      then: /171\/170/,
    },
    {
      name: 'description maximum length',
      given: { version: { locales: { 'en-US': { description: 'x'.repeat(4001) } } } },
      then: /4001\/4000/,
    },
    {
      name: 'keywords byte limit',
      given: { version: { locales: { 'en-US': { keywords: 'é'.repeat(51) } } } },
      then: /102\/100 UTF-8 bytes/,
    },
    {
      name: 'URL protocol requirement',
      given: { version: { locales: { 'en-US': { supportUrl: 'example.com/support' } } } },
      then: /valid URL/,
    },
    {
      name: 'review notes byte limit',
      given: { review: { notes: 'é'.repeat(2001) } },
      then: /4002\/4000 UTF-8 bytes/,
    },
  ];

  for (const scenario of scenarios) {
    // Given
    const desired = scenario.given;

    // When
    const validate = () => validateDesiredMetadata(desired);

    // Then
    assert.throws(validate, scenario.then, scenario.name);
  }
});

test('given ASC text with trailing whitespace, when normalizing it, then trailing whitespace is removed', () => {
  // Given
  const textWithNewline = 'hello\n';
  const textWithMixedTrailingWhitespace = 'hello  \n\t';

  // When
  const normalizedNewlineText = normalizeAscText(textWithNewline);
  const normalizedMixedWhitespaceText = normalizeAscText(textWithMixedTrailingWhitespace);

  // Then
  assert.equal(normalizedNewlineText, 'hello');
  assert.equal(normalizedMixedWhitespaceText, 'hello');
});

test('given existing and desired version localizations, when building the diff, then unchanged, update, and create actions are reported', () => {
  // Given
  const desired = parseDesiredFixture();
  const desiredLocales = {
    ...expandFallbackLocales(desired.version),
    'fr-FR': {
      promotionalText: 'Ecoutez sur votre montre.',
      whatsNew: '+ Correctifs',
    },
  };
  const existingLocalizations = readJsonFixture('app-store-version-localizations.json').data;

  // When
  const diff = buildVersionLocalizationDiff(existingLocalizations, desiredLocales);
  const byLocale = Object.fromEntries(diff.map((change) => [change.locale, change]));

  // Then
  assert.equal(byLocale['en-US'].changed, false);
  assert.equal(byLocale['en-GB'].action, 'update');
  assert.deepEqual(Object.keys(byLocale['en-GB'].fields).sort(), ['promotionalText', 'whatsNew']);
  assert.equal(byLocale['fr-FR'].action, 'create');
  assert.match(summarizeDiff(diff), /fr-FR: CREATE/);
});

test('given callers use the legacy buildDiff alias, when building a localization diff, then version localization resources are returned', () => {
  // Given
  const existingLocalizations = readJsonFixture('app-store-version-localizations.json').data;
  const desiredLocales = {
    'en-US': {
      promotionalText: 'Different',
      whatsNew: '+ New',
    },
  };

  // When
  const diff = buildDiff(existingLocalizations, desiredLocales);

  // Then
  assert.equal(diff[0].resourceType, 'appStoreVersionLocalizations');
});

test('given app info localizations with one changed locale and one new locale, when building the diff, then update and create actions are returned', () => {
  // Given
  const existingLocalizations = [
    {
      type: 'appInfoLocalizations',
      id: 'app-info-en-us',
      attributes: {
        locale: 'en-US',
        name: 'WatchCloud',
        subtitle: 'Old subtitle',
      },
    },
  ];
  const desiredLocales = {
    'en-US': {
      name: 'WatchCloud',
      subtitle: 'Music on your watch',
    },
    'es-ES': {
      name: 'WatchCloud',
      subtitle: 'Musica en tu reloj',
    },
  };

  // When
  const diff = buildAppInfoDiff(existingLocalizations, desiredLocales);

  // Then
  assert.equal(diff[0].action, 'update');
  assert.deepEqual(diff[0].fields, { subtitle: 'Music on your watch' });
  assert.equal(diff[1].action, 'create');
});

test('given localization update and create changes, when building payloads, then ASC JSON:API fields and relationships are included', () => {
  // Given
  const updateChange = {
    id: 'loc-123',
    resourceType: 'appStoreVersionLocalizations',
    fields: {
      promotionalText: 'New promo',
      whatsNew: '+ New notes',
    },
  };
  const createChange = {
    locale: 'fr-FR',
    resourceType: 'appStoreVersionLocalizations',
    createRelationshipName: 'appStoreVersion',
    createRelationshipType: 'appStoreVersions',
    desired: {
      promotionalText: 'Bonjour',
      whatsNew: '+ Notes',
    },
  };

  // When
  const patchPayload = buildPatchPayload(updateChange);
  const createPayload = buildLocalizationCreatePayload(createChange, 'version-123');

  // Then
  assert.deepEqual(patchPayload, {
    data: {
      type: 'appStoreVersionLocalizations',
      id: 'loc-123',
      attributes: {
        promotionalText: 'New promo',
        whatsNew: '+ New notes',
      },
    },
  });
  assert.equal(createPayload.data.attributes.locale, 'fr-FR');
  assert.equal(createPayload.data.relationships.appStoreVersion.data.id, 'version-123');
});

test('given a version create request without optional attributes, when building the payload, then default ASC values are used', () => {
  // Given
  const env = {
    ASC_APP_ID: '1234567890',
    ASC_COPYRIGHT: '2026 Example',
  };
  const desiredVersion = {
    versionString: '2.3.0',
  };

  // When
  const payload = buildAppStoreVersionCreatePayload(env, desiredVersion, '2.3.0');

  // Then
  assert.deepEqual(payload.data.attributes, {
    platform: 'IOS',
    versionString: '2.3.0',
    copyright: '2026 Example',
    releaseType: 'MANUAL',
    usesIdfa: false,
  });
});

test('given changed version fields include platform, when building the patch payload, then platform is omitted', () => {
  // Given
  const versionId = 'version-123';
  const changedFields = {
    platform: 'IOS',
    releaseType: 'AFTER_APPROVAL',
  };

  // When
  const payload = buildAppStoreVersionPatchPayload(versionId, changedFields);

  // Then
  assert.deepEqual(payload.data.attributes, {
    releaseType: 'AFTER_APPROVAL',
  });
});

test('given review detail changes include a password, when diffing and summarizing them, then summaries redact the password', () => {
  // Given
  const currentReviewDetail = {
    type: 'appStoreReviewDetails',
    id: 'review-123',
    attributes: {
      contactFirstName: 'Ada',
      demoAccountRequired: false,
      demoAccountPassword: 'old-secret',
    },
  };
  const desiredReviewDetail = {
    contactFirstName: 'Ada',
    demoAccountRequired: true,
    demoAccountPassword: 'new-secret',
    notes: 'Use sign in.',
  };

  // When
  const diff = buildReviewDetailDiff(currentReviewDetail, desiredReviewDetail);
  const summary = summarizeReviewDiff(diff);
  const payload = buildReviewDetailPayload(diff, 'version-123');

  // Then
  assert.equal(diff.action, 'update');
  assert.equal(diff.fields.demoAccountPassword, 'new-secret');
  assert.match(summary, /demoAccountPassword=<redacted>/);
  assert.doesNotMatch(summary, /new-secret/);
  assert.equal(payload.data.id, 'review-123');
  assert.equal(payload.data.attributes.demoAccountPassword, 'new-secret');
});

test('given args and desired metadata contain version values, when resolving the version string, then args win before desired', () => {
  // Given
  const desired = { version: { versionString: '2.0' } };
  const desiredWithoutVersion = { version: {} };

  // When
  const versionFromArgs = resolveVersionString({ version: '3.0' }, desired);
  const versionFromDesired = resolveVersionString({}, desired);
  const resolveMissingVersion = () => resolveVersionString({}, desiredWithoutVersion);

  // Then
  assert.equal(versionFromArgs, '3.0');
  assert.equal(versionFromDesired, '2.0');
  assert.throws(resolveMissingVersion, /Missing version string/);
});

test('given missing and existing ASC versions, when building version attribute diffs, then create and update changes are modeled', () => {
  // Given
  const desiredVersionForCreate = {
    versionString: '2.3.0',
    copyright: '2026 Example',
  };
  const existingVersion = {
    id: 'version-123',
    attributes: {
      versionString: '2.3.0',
      releaseType: 'MANUAL',
    },
  };
  const desiredVersionUpdate = {
    releaseType: 'AFTER_APPROVAL',
  };

  // When
  const createDiff = buildVersionAttributeDiff(null, desiredVersionForCreate, '2.3.0');
  const updateDiff = buildVersionAttributeDiff(existingVersion, desiredVersionUpdate, '2.3.0');

  // Then
  assert.equal(createDiff.action, 'create');
  assert.deepEqual(updateDiff.fields, { releaseType: 'AFTER_APPROVAL' });
});

test('given a noneditable released version with pending metadata changes, when asserting editability, then an error is raised', () => {
  // Given
  const releasedVersion = {
    id: 'version-123',
    attributes: {
      versionString: '2.3.0',
      appStoreState: 'READY_FOR_DISTRIBUTION',
    },
  };
  const pendingChanges = {
    appInfoChanges: [],
    versionLocalizationChanges: [
      {
        changed: true,
        fields: {
          description: 'Updated description',
        },
      },
    ],
    versionAttributeChange: { changed: false },
    reviewDetailChange: { changed: false },
  };

  // When
  const assertEditable = () => assertEditableForChanges(releasedVersion, pendingChanges);

  // Then
  assert.throws(assertEditable, /not editable/);
});

test('given ASC API responses for app info, version, localizations, and review, when loading ASC state, then all state pieces are returned', async () => {
  // Given
  const { calls, request } = ascRoutes([
    matchingAscRoute('/apps/1234567890/appInfos?limit=200', {
      data: [{ id: 'app-info-123', type: 'appInfos' }],
    }),
    matchingAscRoute('/appInfos/app-info-123/appInfoLocalizations?limit=200', {
      data: [
        {
          id: 'app-info-loc-en-us',
          attributes: { locale: 'en-US', name: 'WatchCloud', subtitle: 'Music' },
        },
      ],
    }),
    matchingAscRoute('/apps/1234567890/appStoreVersions?limit=200', {
      data: [
        {
          id: 'version-123',
          attributes: {
            versionString: '1.2.3',
            appStoreState: 'PREPARE_FOR_SUBMISSION',
          },
        },
      ],
    }),
    matchingAscRoute('/appStoreVersions/version-123/appStoreVersionLocalizations?limit=200', () => (
      readJsonFixture('app-store-version-localizations.json')
    )),
    matchingAscRoute('/appStoreVersions/version-123/appStoreReviewDetail', {
      data: {
        id: 'review-123',
        attributes: {
          contactFirstName: 'Ada',
        },
      },
    }),
  ]);

  // When
  const state = await loadAscState(request, { ASC_APP_ID: '1234567890' }, { versionString: '1.2.3' });

  // Then
  assert.equal(state.appVersion.id, 'version-123');
  assert.equal(state.appInfo.id, 'app-info-123');
  assert.equal(state.localizations.length, 5);
  assert.equal(state.reviewDetail.id, 'review-123');
  assert.equal(calls.length, 5);
});

test('given ASC has no matching version and missing versions are allowed, when loading ASC state, then version-specific state is empty', async () => {
  // Given
  const { request } = ascRoutes([
    matchingAscRoute('/apps/1234567890/appInfos?limit=200', {
      data: [{ id: 'app-info-123', type: 'appInfos' }],
    }),
    matchingAscRoute('/appInfos/app-info-123/appInfoLocalizations?limit=200', { data: [] }),
    matchingAscRoute('/apps/1234567890/appStoreVersions?limit=200', {
      data: [
        {
          id: 'version-123',
          attributes: { versionString: '1.2.3' },
        },
      ],
    }),
  ]);

  // When
  const state = await loadAscState(request, { ASC_APP_ID: '1234567890' }, {
    versionString: '2.0.0',
    allowMissingVersion: true,
  });

  // Then
  assert.equal(state.appVersion, null);
  assert.deepEqual(state.versionLocalizations, []);
});
