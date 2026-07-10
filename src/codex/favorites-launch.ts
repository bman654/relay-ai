import * as p from '@clack/prompts';
import type { CodexProxyRoute } from '../codex-proxy.js';
import { buildFavoritesList, resolveFavorite } from '../favorites-resolver.js';
import type { ResolveContext, ResolvedFavorite } from '../favorites-resolver.js';
import { shouldHideModel, type CompatibilityAgent } from '../model-compatibility.js';
import { resolveCodexRoute } from './routing.js';
import type { LocalProvider, LocalProviderModel, FavoriteModel } from '../types.js';
import { codexCliFavoritesSlug } from './favorites-catalog.js';

export type FavoriteStartingModelResult =
  | { provider: LocalProvider; model: LocalProviderModel }
  | 'cancelled'
  | 'unavailable';

export type BootSelectionResult =
  | { provider: LocalProvider; model: LocalProviderModel }
  | { error: string };

type ProviderWrapper = (provider: LocalProvider) => LocalProvider;

const identityProvider: ProviderWrapper = provider => provider;

export async function pickFavoriteStartingModel(
  compatible: LocalProvider[],
  favorites: FavoriteModel[],
  agent: CompatibilityAgent,
  productLabel: string,
  wrapProvider: ProviderWrapper = identityProvider,
): Promise<FavoriteStartingModelResult> {
  const favoriteProviders = compatible.map(wrapProvider);
  const available: Array<{ provider: LocalProvider; model: LocalProviderModel }> = [];

  for (const fav of favorites) {
    if (shouldHideModel({ providerId: fav.providerId, modelId: fav.modelId, agent })) {
      continue;
    }
    const provider = favoriteProviders.find(lp => lp.id === fav.providerId);
    const model = provider?.models.find(m => m.id === fav.modelId);
    if (provider && model) available.push({ provider, model });
  }

  if (available.length === 0) {
    p.log.warn(`No saved ${productLabel} favorites are currently available.`);
    return 'unavailable';
  }

  const favOptions = available.map((f, i) => ({
    value: String(i),
    label: `${f.model.name || f.model.id} — ${f.provider.name}`,
    hint: f.model.id,
  }));
  const pickedIdx = await p.select<string>({
    message: 'Starting model?',
    options: favOptions,
    initialValue: '0',
  });
  if (p.isCancel(pickedIdx)) {
    p.cancel('Cancelled.');
    return 'cancelled';
  }

  return available[Number(pickedIdx)] ?? 'unavailable';
}

export function resolveBootSelection(
  compatible: LocalProvider[],
  launchProvider: string,
  launchModel: string,
  wrapProvider: ProviderWrapper = identityProvider,
): BootSelectionResult {
  const foundProvider = compatible.find(provider => provider.id === launchProvider);
  if (!foundProvider) {
    return { error: `Provider not found: ${launchProvider}` };
  }

  const provider = wrapProvider(foundProvider);
  const model = provider.models.find(m => m.id === launchModel);
  if (!model) {
    return { error: `Model ${launchModel} not found on provider ${foundProvider.name}` };
  }

  return { provider, model };
}

export function buildCodexProxyRoutesFromResolved(
  resolved: ResolvedFavorite[],
  providersById: Map<string, LocalProvider>,
): CodexProxyRoute[] {
  const skippedOAuth: string[] = [];
  const routes = resolved
    .map(r => {
      const provider = providersById.get(r.providerId);
      if (!provider) return undefined;
      const model = r.model as LocalProviderModel;

      // Skip if OAuth provider has empty apiKey (OAuth refresh flows not supported in favorites proxy)
      if (!r.apiKey && provider.authType === 'oauth') {
        skippedOAuth.push(`${r.providerId}/${model.id}`);
        return undefined;
      }

      const route = resolveCodexRoute(provider, model, r.apiKey);
      return {
        modelId: codexCliFavoritesSlug(r.providerId, model.id),
        npm: route.npm,
        apiKey: route.apiKey,
        baseURL: route.baseURL,
        upstreamModelId: route.upstreamModelId,
        providerId: route.providerId,
        authType: route.authType,
        oauthAccountId: route.oauthAccountId,
        providerData: route.providerData,
        contextWindow: route.contextWindow,
        headers: route.headers,
      } as CodexProxyRoute;
    })
    .filter((r): r is CodexProxyRoute => r !== undefined);

  if (skippedOAuth.length > 0) {
    p.log.warn(
      `Skipped ${skippedOAuth.length} OAuth favorite(s) (OAuth auth not supported in favorites catalog): ${skippedOAuth.join(', ')}`,
    );
  }

  return routes;
}


export async function resolveCodexFavorites(
  activeProvider: LocalProvider,
  selectedModel: LocalProviderModel,
  compatible: LocalProvider[],
  favorites: FavoriteModel[],
  agent: CompatibilityAgent,
): Promise<{
  resolvedFavorites: ResolvedFavorite[];
  providersById: Map<string, LocalProvider>;
}> {
  const ctx: ResolveContext = {
    agent,
    localProviders: compatible,
    findLocalModel: (pid, mid) => {
      const provider = compatible.find(lp => lp.id === pid);
      const model = provider?.models.find(m => m.id === mid);
      return provider && model ? { provider, model } : undefined;
    },
  };
  const startingResolved = await resolveFavorite(
    { providerId: activeProvider.id, modelId: selectedModel.id },
    ctx,
  );
  const { resolved, droppedFavorites } = await buildFavoritesList(
    startingResolved,
    favorites,
    ctx,
  );
  if (droppedFavorites.length > 0) {
    p.log.warn(
      `Skipped ${droppedFavorites.length} stale/unauthorized favorite(s): ${droppedFavorites.map(f => `${f.providerId}:${f.modelId}`).join(', ')}`,
    );
  }
  return {
    resolvedFavorites: resolved,
    providersById: new Map(compatible.map(lp => [lp.id, lp])),
  };
}
