import { describe, expect, it, vi, beforeEach } from 'vitest';
import { refreshProviderModels } from '../src/registry/refresh-models.js';
import type { ProviderRegistry } from '../src/registry/types.js';

vi.mock('../src/registry/fetch-template-models.js', () => ({
  fetchTemplateModels: vi.fn(),
}));
vi.mock('../src/registry/custom-endpoint.js', () => ({
  fetchAnthropicModels: vi.fn(),
}));
vi.mock('../src/registry/io.js', () => ({
  loadRegistry: vi.fn(() => ({ version: 1, providers: [] })),
  saveRegistry: vi.fn(),
}));

import { fetchTemplateModels } from '../src/registry/fetch-template-models.js';
import { saveRegistry } from '../src/registry/io.js';

describe('refreshProviderModels', () => {
  beforeEach(() => {
    vi.mocked(fetchTemplateModels).mockReset();
    vi.mocked(saveRegistry).mockClear();
  });

  it('rejects restricted provider API URLs before refreshing models', async () => {
    const registry: ProviderRegistry = {
      version: 1,
      providers: [{
        id: 'bad',
        templateId: 'custom-openai',
        name: 'Bad',
        enabled: true,
        authRef: 'keyring:provider:bad',
        authType: 'api',
        api: { npm: '@ai-sdk/openai-compatible', url: 'https://169.254.169.254/v1' },
        addedAt: '2026-06-17T00:00:00.000Z',
      }],
    };

    const result = await refreshProviderModels('bad', 'sk-real-key', registry);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/restricted|private|blocked/i);
    expect(fetchTemplateModels).not.toHaveBeenCalled();
    expect(saveRegistry).not.toHaveBeenCalled();
  });
});
