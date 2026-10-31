import type { AppSettings, WhisperModelId } from './types';
import { DEFAULT_SETTINGS } from './types';

const STORAGE_KEYS = {
  SETTINGS: 'wa_settings',
  DOWNLOADED_MODELS: 'wa_downloaded_models',
  TRANSCRIPTIONS_COUNT: 'wa_transcriptions_count',
};

export async function getSettings(): Promise<AppSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
  return updated;
}

export async function getDownloadedModels(): Promise<Record<string, boolean>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DOWNLOADED_MODELS);
  return (result[STORAGE_KEYS.DOWNLOADED_MODELS] as Record<string, boolean>) || {};
}

export async function setModelDownloaded(modelId: WhisperModelId, downloaded: boolean): Promise<void> {
  const current = await getDownloadedModels();
  current[modelId] = downloaded;
  await chrome.storage.local.set({ [STORAGE_KEYS.DOWNLOADED_MODELS]: current });
}

export async function isModelReady(modelId: WhisperModelId): Promise<boolean> {
  const models = await getDownloadedModels();
  return Boolean(models[modelId]);
}

export async function getTranscriptionCount(): Promise<number> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TRANSCRIPTIONS_COUNT);
  return (result[STORAGE_KEYS.TRANSCRIPTIONS_COUNT] as number) || 0;
}

export async function incrementTranscriptionCount(): Promise<number> {
  const count = (await getTranscriptionCount()) + 1;
  await chrome.storage.local.set({ [STORAGE_KEYS.TRANSCRIPTIONS_COUNT]: count });
  return count;
}

export async function resetTranscriptionCount(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.TRANSCRIPTIONS_COUNT]: 0 });
}
