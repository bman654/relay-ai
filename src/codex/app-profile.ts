// Codex App config.toml content — keep the built-in OpenAI provider so existing threads remain visible.
import type { CodexRoute } from './routing.js';

/** Legacy provider id used by relay-ai <= 0.2.6. Retained for cleanup and recovery. */
export const CODEX_APP_PROVIDER_ID = 'relay-ai-launch-codex-app';

/**
 * Model ID written to config.toml so Codex records a recognizable name in session history.
 * The proxy routes all requests to the actual selected model via its fallback mechanism.
 * Update this when a newer flagship OpenAI model supersedes gpt-5.5.
 */
export const CODEX_APP_DISPLAY_MODEL = 'gpt-5.5';
export const PREVIEW_PROXY_PORT = 54321;

export function codexAppModelSlug(rawModelId: string): string {
  return rawModelId.startsWith('models/') ? rawModelId.slice('models/'.length) : rawModelId;
}

export function parseCodexAppModelSlug(modelKey: string): string {
  // Backward compatibility for catalogs written by relay-ai <= 0.2.6.
  const prefix = `${CODEX_APP_PROVIDER_ID}/`;
  return modelKey.startsWith(prefix) ? modelKey.slice(prefix.length) : modelKey;
}

export interface CodexAppConfigSpec {
  route: CodexRoute;
  proxyPort: number;
  catalogPath: string;
}

export function buildCodexAppRootConfig(spec: CodexAppConfigSpec): {
  model: string;
  model_provider: string;
  openai_base_url: string;
  model_catalog_json: string;
  model_context_window?: number;
  model_auto_compact_token_limit?: number;
} {
  const ctxWindow = spec.route.contextWindow;
  return {
    model: CODEX_APP_DISPLAY_MODEL,
    model_provider: 'openai',
    openai_base_url: `http://127.0.0.1:${spec.proxyPort}/v1`,
    model_catalog_json: spec.catalogPath,
    ...(ctxWindow && ctxWindow > 0 ? {
      model_context_window: ctxWindow,
      model_auto_compact_token_limit: Math.floor(ctxWindow * 0.7),
    } : {}),
  };
}
