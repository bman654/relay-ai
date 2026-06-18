import { describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  authFilePermissionWarning,
  isOpencodeOAuth,
  readOpencodeAuthFile,
  resolveOpencodeAuthPath,
} from '../src/registry/opencode-auth.js';
import {
  buildImportProviderList,
  classifyOpencodeCredentialGap,
  listCredentialSkippedProviders,
} from '../src/registry/import-build.js';
import type { RawProvider } from '../src/providers.js';

describe('resolveOpencodeAuthPath', () => {
  it('uses XDG_DATA_HOME on unix', () => {
    expect(resolveOpencodeAuthPath({ XDG_DATA_HOME: '/tmp/xdg' })).toBe('/tmp/xdg/opencode/auth.json');
  });
});

describe('readOpencodeAuthFile', () => {
  it('parses oauth entries', () => {
    const home = mkdtempSync(join(tmpdir(), 'relay-oauth-'));
    const dataHome = join(home, 'share');
    mkdirSync(join(dataHome, 'opencode'), { recursive: true });
    const path = join(dataHome, 'opencode', 'auth.json');
    writeFileSync(path, JSON.stringify({
      xai: { type: 'oauth', access: 'acc', refresh: 'ref', expires: 123 },
    }), 'utf8');
    chmodSync(path, 0o600);

    const result = readOpencodeAuthFile({ XDG_DATA_HOME: dataHome });
    expect(result?.entries['xai']).toMatchObject({ type: 'oauth', access: 'acc' });
    expect(isOpencodeOAuth(result?.entries['xai'])).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });

  it('warns when auth file is world-readable', () => {
    const home = mkdtempSync(join(tmpdir(), 'relay-oauth-'));
    const path = join(home, 'auth.json');
    writeFileSync(path, '{}', 'utf8');
    chmodSync(path, 0o644);
    expect(authFilePermissionWarning(path)).toContain('readable by others');
    rmSync(home, { recursive: true, force: true });
  });
});

describe('buildImportProviderList', () => {
  const raw: RawProvider[] = [{
    id: 'xai',
    name: 'xAI',
    models: {
      grok: {
        id: 'grok',
        api: { npm: '@ai-sdk/xai', url: '' },
      },
    },
  }, {
    id: 'groq',
    name: 'Groq',
    key: 'gsk_real_key_1234567890',
    models: {
      llama: {
        id: 'llama',
        api: { npm: '@ai-sdk/groq', url: 'https://api.groq.com/openai/v1' },
      },
    },
  }];

  it('includes oauth providers from auth.json', () => {
    const { providers, oauth } = buildImportProviderList(raw, {
      xai: { type: 'oauth', access: 'tok', refresh: 'ref', expires: 1 },
    });
    expect(providers.map(p => p.id).sort()).toEqual(['groq', 'xai']);
    expect(oauth.oauthByProviderId.has('xai')).toBe(true);
  });

  it('classifies credential gaps by provider type', () => {
    expect(classifyOpencodeCredentialGap('xai')).toBe('oauth-no-token');
    expect(classifyOpencodeCredentialGap('anthropic')).toBe('no-api-key');
    expect(classifyOpencodeCredentialGap('google-vertex')).toBe('manual-only');
  });

  it('lists oauth-capable providers without tokens', () => {
    const skipped = listCredentialSkippedProviders(raw, {}, new Set(['groq']));
    expect(skipped).toEqual([{ id: 'xai', name: 'xAI', reason: 'oauth-no-token' }]);
  });

  it('does not list random OpenCode catalog stubs without keys', () => {
    const rawCatalog: RawProvider[] = [{
      id: 'google',
      name: 'Google',
      models: { gemini: { id: 'gemini', api: { npm: '@ai-sdk/google', url: '' } } },
    }];
    expect(listCredentialSkippedProviders(rawCatalog, {}, new Set(), new Set())).toEqual([]);
  });

  it('does not duplicate providers already reported as conflict-kept', () => {
    const rawWithAnthropic: RawProvider[] = [{
      id: 'anthropic',
      name: 'Anthropic',
      key: 'anything',
      models: { m: { id: 'claude', api: { npm: '@ai-sdk/anthropic', url: '' } } },
    }];
    const skipped = listCredentialSkippedProviders(
      rawWithAnthropic,
      {},
      new Set(),
      new Set(['anthropic']),
    );
    expect(skipped).toEqual([]);
  });
});
