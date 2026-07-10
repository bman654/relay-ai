import { describe, expect, it } from 'vitest';
import {
  classifyFreeStatus,
  freeStatusLabel,
  isFreeStatus,
  isZeroCost,
} from '../src/free-models.js';

describe('free model classification', () => {
  it('treats explicit zero input and output pricing as verified free', () => {
    const status = classifyFreeStatus({
      model: { cost: { input: 0, output: 0 } },
      providerId: 'kilo',
      templateId: 'kilo',
    });

    expect(status).toBe('verified_free');
    expect(isFreeStatus(status)).toBe(true);
    expect(freeStatusLabel(status)).toBe('Free');
  });

  it('treats NVIDIA as free provider access without claiming zero pricing', () => {
    const status = classifyFreeStatus({
      model: {},
      providerId: 'nvidia',
      templateId: 'nvidia',
    });

    expect(status).toBe('free_provider');
    expect(isFreeStatus(status)).toBe(true);
    expect(freeStatusLabel(status)).toBe('Free dev access');
  });

  it('does not mark unknown or paid pricing as free', () => {
    expect(classifyFreeStatus({ model: {}, providerId: 'openai', templateId: 'openai' })).toBe('unknown');
    expect(classifyFreeStatus({
      model: { cost: { input: 0.1, output: 0 } },
      providerId: 'openrouter',
      templateId: 'openrouter',
    })).toBe('paid');
  });

  it('lets fresh pricing override stale cached freeStatus metadata', () => {
    expect(classifyFreeStatus({
      model: { cost: { input: 0, output: 0 }, freeStatus: 'paid' },
      providerId: 'openrouter',
      templateId: 'openrouter',
    })).toBe('verified_free');
    expect(classifyFreeStatus({
      model: { cost: { input: 1, output: 1 }, freeStatus: 'verified_free' },
      providerId: 'openrouter',
      templateId: 'openrouter',
    })).toBe('paid');
  });

  it('accepts zero cache pricing without requiring cache fields to exist', () => {
    expect(isZeroCost({ input: 0, output: 0 })).toBe(true);
    expect(isZeroCost({ input: 0, output: 0, cache_read: 0, cache_write: 0 })).toBe(true);
    expect(isZeroCost({ input: 0, output: 0, cache_read: 0.01 })).toBe(false);
  });
});
