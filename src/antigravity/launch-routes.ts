import { MAX_MODEL_CATALOG } from '../constants.js';
import { resolveLocalProviderApiKey } from '../provider-catalog.js';
import { buildFavoritesList, type ResolveContext } from '../favorites-resolver.js';
import type { FavoriteModel, LocalProvider, LocalProviderModel } from '../types.js';
import { buildAntigravityRoutes } from './catalog.js';
import type { AntigravityRoute } from './types.js';

export interface ResolveAntigravityLaunchRoutesOptions {
  provider: LocalProvider;
  model: LocalProviderModel;
  allProviders: LocalProvider[];
  favorites?: FavoriteModel[];
  maxRoutes?: number;
}

export interface ResolveAntigravityLaunchRoutesResult {
  routes: AntigravityRoute[];
  apiKey: string;
  droppedFavorites: FavoriteModel[];
  capacitySkippedFavorites: FavoriteModel[];
}

export async function resolveAntigravityLaunchRoutes(
  opts: ResolveAntigravityLaunchRoutesOptions,
): Promise<ResolveAntigravityLaunchRoutesResult | null> {
  const maxRoutes = opts.maxRoutes ?? MAX_MODEL_CATALOG;
  const apiKey = await resolveLocalProviderApiKey(opts.provider);
  if (!apiKey) return null;

  const starting = {
    providerId: opts.provider.id,
    providerName: opts.provider.name,
    model: opts.model,
    apiKey,
    authType: opts.provider.authType,
    oauthAccountId: opts.provider.oauthAccountId,
    providerData: opts.provider.providerData,
  };
  const ctx: ResolveContext = {
    agent: 'antigravity',
    localProviders: opts.allProviders,
    findLocalModel: (providerId, modelId) => {
      const provider = opts.allProviders.find(candidate => candidate.id === providerId);
      const model = provider?.models.find(candidate => candidate.id === modelId);
      return provider && model ? { provider, model } : undefined;
    },
  };
  const { resolved, droppedFavorites, capacitySkippedFavorites } = await buildFavoritesList(
    starting,
    opts.favorites ?? [],
    ctx,
    maxRoutes,
    { dropEmptyApiKey: true, trackCapacitySkipped: true },
  );

  return {
    routes: buildAntigravityRoutes(resolved, maxRoutes),
    apiKey,
    droppedFavorites,
    capacitySkippedFavorites,
  };
}
