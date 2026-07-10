import { describe, expect, it } from 'vitest';
import { isUiApiRoute, resolveUiShutdownDecision } from '../src/ui-command.js';

describe('ui command routing', () => {
  it('routes API and OAuth callback requests to the API handler', () => {
    expect(isUiApiRoute('/api/providers/oauth/start')).toBe(true);
    expect(isUiApiRoute('/oauth/callback?state=abc&code=123')).toBe(true);
  });

  it('leaves static UI paths on the static file handler', () => {
    expect(isUiApiRoute('/')).toBe(false);
    expect(isUiApiRoute('/index.html')).toBe(false);
    expect(isUiApiRoute('/app.js')).toBe(false);
  });

  it('keeps the UI running when Ctrl+C prompt is declined', async () => {
    const decision = await resolveUiShutdownDecision('SIGINT', async () => false);

    expect(decision).toBe('keep');
  });

  it('closes the UI when Ctrl+C prompt is accepted', async () => {
    const decision = await resolveUiShutdownDecision('SIGINT', async () => true);

    expect(decision).toBe('close');
  });

  it('closes the UI on non-interactive termination signals without prompting', async () => {
    let prompted = false;
    const decision = await resolveUiShutdownDecision('SIGTERM', async () => {
      prompted = true;
      return false;
    });

    expect(decision).toBe('close');
    expect(prompted).toBe(false);
  });
});
