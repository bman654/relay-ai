# Changelog

## [0.2.5] - 2026-06-18 (Official Launch Release)

### Added
- **Native provider registry** — Add, list, remove, refresh, and import providers with secure OS credential storage and templates for OpenRouter, Groq, Mistral, Together AI, Zen/Go, and SDK-backed custom endpoints.
- **Claude Code and Codex launchers** — Launch registry models through `relay-ai`, including provider/model boot flags, local OpenCode provider discovery, recent models, search, pagination, and favorites catalogs for mid-session switching.
- **Unified SDK gateway** — Route non-Anthropic providers through the Vercel AI SDK adapter while preserving Anthropic-compatible tool use, streaming, context windows, and model catalogs.
- **Codex App integration** — Launch the desktop app with registry providers and restore Codex App model settings after interrupted sessions.
- **Reasoning capability metadata** — Resolve reasoning controls from provider metadata, including OpenRouter `supported_parameters`, so models such as GLM 5.2 receive compatible reasoning options instead of stale defaults.
- **Foreground server gateway** — Run `relay-ai server` for Claude Desktop or LAN usage, with registry-backed routing, password protection, and optional Vertex AI support.
- **First-run setup** — Configure providers from an inline wizard or import existing OpenCode provider settings.

