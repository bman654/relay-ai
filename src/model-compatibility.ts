// src/model-compatibility.ts — curated blacklist + models.dev capability filtering

import blacklistData from './data/model-incompatible.json';
import {
  findModelsDevModel,
  loadModelsDevCache,
  shouldHideByModelsDevCapabilities,
} from './registry/models-dev.js';

export type CompatibilityAgent = 'claude' | 'codex' | 'codex-app' | 'server' | 'gemini' | 'antigravity';

export interface CompatibilityContext {
  providerId: string;
  modelId: string;
  agent: CompatibilityAgent;
}

export interface IncompatibleModelEntry {
  provider: string;
  modelId: string;
  category: string;
  reason: string;
  agents?: CompatibilityAgent[];
  sources?: string[];
  verifiedAt?: string;
}

interface IncompatibleModelFile {
  schema_version?: string;
  entries?: IncompatibleModelEntry[];
}

const BLACKLIST_ENTRIES = (blacklistData as IncompatibleModelFile).entries ?? [];

// Antigravity OAuth's Cloud Code catalog includes helper, internal, and
// candidate slots. Expose only slots we have validated as user-selectable agent
// models; keep normal Google API models governed by the generic rules below.
// Intentionally local allow-list, not model-incompatible.json:
// model-incompatible.json is deny-only and has no allow/deny polarity.
// Moving this would require a data schema migration. See
// docs/superpowers/specs/2026-07-08-agent-launch-consolidation-design.md#111--antigravitys-model-allow-list-vs-the-shared-blacklist-file-deferred
const ANTIGRAVITY_VALIDATED_AGENT_MODELS = new Set([
  'gemini-3.5-flash-low',
  'gemini-3.5-flash-extra-low',
  'gemini-3.1-pro-low',
  'gemini-pro-agent',
  'claude-sonnet-4-6',
  'claude-opus-4-6-thinking',
  'gpt-oss-120b-medium',
]);

function matchesAgent(entryAgents: CompatibilityAgent[] | undefined, agent: CompatibilityAgent): boolean {
  if (!entryAgents || entryAgents.length === 0) return true;
  return entryAgents.includes(agent);
}

function matchesProvider(entryProvider: string, providerId: string): boolean {
  return entryProvider === providerId || entryProvider === '*';
}

export function findBlacklistEntry(ctx: CompatibilityContext): IncompatibleModelEntry | null {
  for (const entry of BLACKLIST_ENTRIES) {
    if (entry.modelId !== ctx.modelId) continue;
    if (!matchesProvider(entry.provider, ctx.providerId)) continue;
    if (!matchesAgent(entry.agents, ctx.agent)) continue;
    return entry;
  }
  return null;
}

export function hideReason(ctx: CompatibilityContext): string | null {
  if (ctx.providerId === 'antigravity' && !ANTIGRAVITY_VALIDATED_AGENT_MODELS.has(ctx.modelId)) {
    return '[antigravity-oauth] not a validated user-selectable Cloud Code agent model';
  }

  const blacklist = findBlacklistEntry(ctx);
  if (blacklist) return `[blacklist:${blacklist.category}] ${blacklist.reason}`;

  const modelsDev = findModelsDevModel(ctx.providerId, ctx.modelId, loadModelsDevCache());
  if (modelsDev && shouldHideByModelsDevCapabilities(modelsDev)) {
    return '[models.dev] incompatible capabilities for coding agents';
  }

  return null;
}

export function shouldHideModel(ctx: CompatibilityContext): boolean {
  return hideReason(ctx) !== null;
}
