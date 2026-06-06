import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
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
  assertEditableForChanges,
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

test('parseEnvFile reads values and validateEnv treats ASC_VERSION as optional', () => {
  const env = parseEnvFile(`
ASC_KEY_ID=ABCD1234EF
ASC_ISSUER_ID=issuer-id
ASC_KEY_PATH=/tmp/AuthKey_ABCD1234EF.p8
ASC_APP_ID=1234567890
`);

  assert.equal(env.ASC_KEY_ID, 'ABCD1234EF');
  assert.equal(redactValue(env.ASC_KEY_ID), 'AB…EF');
  assert.doesNotThrow(() => validateEnv(env, { checkKeyFile: false }));
  assert.throws(() => validateEnv({ ASC_KEY_ID: 'secret' }, { checkKeyFile: false }), /Missing env values/);
});

test('parseDesiredMetadata validates legacy locales and expands version fallbacks', () => {
  const desired = parseDesiredMetadata(fs.readFileSync(path.join(fixturesDir, 'desired-valid.json'), 'utf8'));
  const expanded = expandFallbackLocales(desired.version);

  assert.deepEqual(desired.appInfo.locales, {});
  assert.equal(expanded['en-GB'].promotionalText, desired.version.locales['en-US'].promotionalText);
  assert.equal(expanded['es-MX'].whatsNew, desired.version.locales['es-ES'].whatsNew);
  assert.equal(Object.keys(expanded).length, 5);
});

test('parseDesiredMetadata validates nested appInfo, version, and review shape', () => {
  const desired = parseDesiredMetadata(JSON.stringify({
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
  }));

  assert.equal(desired.appInfo.locales['en-US'].name, 'WatchCloud');
  assert.equal(desired.version.versionString, '2.3.0');
  assert.equal(desired.review.demoAccountRequired, true);
});

test('validateDesiredMetadata rejects invalid fallback, blank fields, and mixed shapes', () => {
  assert.throws(() => validateDesiredMetadata({
    version: {
      locales: {
        'en-US': { promotionalText: 'Valid' },
      },
      fallbacks: {
        'en-GB': 'fr-FR',
      },
    },
  }), /missing source locale/);

  assert.throws(() => validateDesiredMetadata({
    version: {
      locales: {
        'en-US': { promotionalText: ' ' },
      },
    },
  }), /blank/);

  assert.throws(() => validateDesiredMetadata({
    locales: {
      'en-US': { promotionalText: 'Valid', whatsNew: 'Valid' },
    },
    version: {},
  }), /legacy top-level locales/);
});

test('field limits cover chars, bytes, and URLs', () => {
  assert.equal(unicodeLength('手首のウォッチ'), 7);
  assert.equal(utf8ByteLength('é'), 2);

  assert.throws(() => validateDesiredMetadata({
    appInfo: {
      locales: {
        'en-US': { name: 'x' },
      },
    },
  }), /minimum characters/);

  assert.throws(() => validateDesiredMetadata({
    appInfo: {
      locales: {
        'en-US': { subtitle: 'x'.repeat(31) },
      },
    },
  }), /31\/30/);

  assert.throws(() => validateDesiredMetadata({
    version: {
      locales: {
        'en-US': { promotionalText: 'x'.repeat(171) },
      },
    },
  }), /171\/170/);

  assert.throws(() => validateDesiredMetadata({
    version: {
      locales: {
        'en-US': { description: 'x'.repeat(4001) },
      },
    },
  }), /4001\/4000/);

  assert.throws(() => validateDesiredMetadata({
    version: {
      locales: {
        'en-US': { keywords: 'é'.repeat(51) },
      },
    },
  }), /102\/100 UTF-8 bytes/);

  assert.throws(() => validateDesiredMetadata({
    version: {
      locales: {
        'en-US': { supportUrl: 'example.com/support' },
      },
    },
  }), /valid URL/);

  assert.throws(() => validateDesiredMetadata({
    review: {
      notes: 'é'.repeat(2001),
    },
  }), /4002\/4000 UTF-8 bytes/);
});

test('normalizeAscText removes trailing whitespace for ASC verification', () => {
  assert.equal(normalizeAscText('hello\n'), 'hello');
  assert.equal(normalizeAscText('hello  \n\t'), 'hello');
});

test('buildVersionLocalizationDiff detects unchanged, changed, and created locales', () => {
  const desired = parseDesiredMetadata(fs.readFileSync(path.join(fixturesDir, 'desired-valid.json'), 'utf8'));
  const desiredLocales = expandFallbackLocales(desired.version);
  const response = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'app-store-version-localizations.json'), 'utf8'));
  const diff = buildVersionLocalizationDiff(response.data, {
    ...desiredLocales,
    'fr-FR': {
      promotionalText: 'Ecoutez sur votre montre.',
      whatsNew: '+ Correctifs',
    },
  });

  const enUS = diff.find((change) => change.locale === 'en-US');
  const enGB = diff.find((change) => change.locale === 'en-GB');
  const frFR = diff.find((change) => change.locale === 'fr-FR');
  assert.equal(enUS.changed, false);
  assert.equal(enGB.action, 'update');
  assert.deepEqual(Object.keys(enGB.fields).sort(), ['promotionalText', 'whatsNew']);
  assert.equal(frFR.action, 'create');
  assert.match(summarizeDiff(diff), /fr-FR: CREATE/);
});

test('buildDiff remains a version-localization compatibility alias', () => {
  const response = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'app-store-version-localizations.json'), 'utf8'));
  const diff = buildDiff(response.data, {
    'en-US': {
      promotionalText: 'Different',
      whatsNew: '+ New',
    },
  });

  assert.equal(diff[0].resourceType, 'appStoreVersionLocalizations');
});

test('buildAppInfoDiff handles app-level name and subtitle fields', () => {
  const diff = buildAppInfoDiff([
    {
      type: 'appInfoLocalizations',
      id: 'app-info-en-us',
      attributes: {
        locale: 'en-US',
        name: 'WatchCloud',
        subtitle: 'Old subtitle',
      },
    },
  ], {
    'en-US': {
      name: 'WatchCloud',
      subtitle: 'Music on your watch',
    },
    'es-ES': {
      name: 'WatchCloud',
      subtitle: 'Musica en tu reloj',
    },
  });

  assert.equal(diff[0].action, 'update');
  assert.deepEqual(diff[0].fields, { subtitle: 'Music on your watch' });
  assert.equal(diff[1].action, 'create');
});

test('payload builders create ASC JSON:API shapes', () => {
  const patchPayload = buildPatchPayload({
    id: 'loc-123',
    resourceType: 'appStoreVersionLocalizations',
    fields: {
      promotionalText: 'New promo',
      whatsNew: '+ New notes',
    },
  });

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

  const createPayload = buildLocalizationCreatePayload({
    locale: 'fr-FR',
    resourceType: 'appStoreVersionLocalizations',
    createRelationshipName: 'appStoreVersion',
    createRelationshipType: 'appStoreVersions',
    desired: {
      promotionalText: 'Bonjour',
      whatsNew: '+ Notes',
    },
  }, 'version-123');

  assert.equal(createPayload.data.attributes.locale, 'fr-FR');
  assert.equal(createPayload.data.relationships.appStoreVersion.data.id, 'version-123');
});

test('version create and patch payloads use defaults and omit platform from patch', () => {
  const createPayload = buildAppStoreVersionCreatePayload({
    ASC_APP_ID: '1234567890',
    ASC_COPYRIGHT: '2026 Example',
  }, {
    versionString: '2.3.0',
  }, '2.3.0');

  assert.deepEqual(createPayload.data.attributes, {
    platform: 'IOS',
    versionString: '2.3.0',
    copyright: '2026 Example',
    releaseType: 'MANUAL',
    usesIdfa: false,
  });

  const patchPayload = buildAppStoreVersionPatchPayload('version-123', {
    platform: 'IOS',
    releaseType: 'AFTER_APPROVAL',
  });

  assert.deepEqual(patchPayload.data.attributes, {
    releaseType: 'AFTER_APPROVAL',
  });
});

test('review detail diff and summaries redact password fields', () => {
  const diff = buildReviewDetailDiff({
    type: 'appStoreReviewDetails',
    id: 'review-123',
    attributes: {
      contactFirstName: 'Ada',
      demoAccountRequired: false,
      demoAccountPassword: 'old-secret',
    },
  }, {
    contactFirstName: 'Ada',
    demoAccountRequired: true,
    demoAccountPassword: 'new-secret',
    notes: 'Use sign in.',
  });

  assert.equal(diff.action, 'update');
  assert.equal(diff.fields.demoAccountPassword, 'new-secret');
  assert.match(summarizeReviewDiff(diff), /demoAccountPassword=<redacted>/);
  assert.doesNotMatch(summarizeReviewDiff(diff), /new-secret/);

  const payload = buildReviewDetailPayload(diff, 'version-123');
  assert.equal(payload.data.id, 'review-123');
  assert.equal(payload.data.attributes.demoAccountPassword, 'new-secret');
});

test('resolveVersionString precedence is args, desired, then env', () => {
  assert.equal(resolveVersionString({ version: '3.0' }, { ASC_VERSION: '1.0' }, { version: { versionString: '2.0' } }), '3.0');
  assert.equal(resolveVersionString({}, { ASC_VERSION: '1.0' }, { version: { versionString: '2.0' } }), '2.0');
  assert.equal(resolveVersionString({}, { ASC_VERSION: '1.0' }, { version: {} }), '1.0');
  assert.throws(() => resolveVersionString({}, {}, { version: {} }), /Missing version string/);
});

test('buildVersionAttributeDiff models missing and existing ASC versions', () => {
  const createDiff = buildVersionAttributeDiff(null, {
    versionString: '2.3.0',
    copyright: '2026 Example',
  }, '2.3.0');
  assert.equal(createDiff.action, 'create');

  const updateDiff = buildVersionAttributeDiff({
    id: 'version-123',
    attributes: {
      versionString: '2.3.0',
      releaseType: 'MANUAL',
    },
  }, {
    releaseType: 'AFTER_APPROVAL',
  }, '2.3.0');
  assert.deepEqual(updateDiff.fields, { releaseType: 'AFTER_APPROVAL' });
});

test('assertEditableForChanges rejects changed metadata on noneditable versions', () => {
  assert.throws(() => assertEditableForChanges({
    id: 'version-123',
    attributes: {
      versionString: '2.3.0',
      appStoreState: 'READY_FOR_DISTRIBUTION',
    },
  }, {
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
  }), /not editable/);
});

test('loadAscState loads app info, version localizations, and review details', async () => {
  const calls = [];
  const ascRequest = async (method, apiPath) => {
    calls.push([method, apiPath]);
    if (apiPath.startsWith('/apps/') && apiPath.includes('/appInfos')) {
      return { data: [{ id: 'app-info-123', type: 'appInfos' }] };
    }
    if (apiPath.startsWith('/appInfos/')) {
      return {
        data: [
          {
            id: 'app-info-loc-en-us',
            attributes: { locale: 'en-US', name: 'WatchCloud', subtitle: 'Music' },
          },
        ],
      };
    }
    if (apiPath.startsWith('/apps/')) {
      return {
        data: [
          {
            id: 'version-123',
            attributes: {
              versionString: '1.2.3',
              appStoreState: 'PREPARE_FOR_SUBMISSION',
            },
          },
        ],
      };
    }
    if (apiPath.includes('/appStoreVersionLocalizations')) {
      return JSON.parse(fs.readFileSync(path.join(fixturesDir, 'app-store-version-localizations.json'), 'utf8'));
    }
    if (apiPath.includes('/appStoreReviewDetail')) {
      return {
        data: {
          id: 'review-123',
          attributes: {
            contactFirstName: 'Ada',
          },
        },
      };
    }
    throw new Error(`Unexpected call ${apiPath}`);
  };

  const state = await loadAscState(ascRequest, { ASC_APP_ID: '1234567890', ASC_VERSION: '1.2.3' });
  assert.equal(state.appVersion.id, 'version-123');
  assert.equal(state.appInfo.id, 'app-info-123');
  assert.equal(state.localizations.length, 5);
  assert.equal(state.reviewDetail.id, 'review-123');
  assert.equal(calls.length, 5);
});

test('loadAscState can allow a missing version for ensure-version dry-runs', async () => {
  const ascRequest = async (method, apiPath) => {
    if (apiPath.startsWith('/apps/') && apiPath.includes('/appInfos')) {
      return { data: [{ id: 'app-info-123', type: 'appInfos' }] };
    }
    if (apiPath.startsWith('/appInfos/')) return { data: [] };
    if (apiPath.startsWith('/apps/')) {
      return {
        data: [
          {
            id: 'version-123',
            attributes: { versionString: '1.2.3' },
          },
        ],
      };
    }
    throw new Error(`Unexpected call ${apiPath}`);
  };

  const state = await loadAscState(ascRequest, { ASC_APP_ID: '1234567890' }, {
    versionString: '2.0.0',
    allowMissingVersion: true,
  });
  assert.equal(state.appVersion, null);
  assert.deepEqual(state.versionLocalizations, []);
});
