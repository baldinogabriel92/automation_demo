import { mockProvider } from './providers/mock.js';

/**
 * MODE=mock (default) runs deterministic local stand-ins — no key, no network.
 * MODE=live calls the Anthropic API via the official SDK.
 */
export async function getProvider(mode = process.env.MODE ?? 'mock') {
  if (mode === 'live') {
    const { anthropicProvider } = await import('./providers/anthropic.js');
    return anthropicProvider;
  }
  return mockProvider;
}
