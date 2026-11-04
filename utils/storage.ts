import { browser } from 'wxt/browser';
import type { AppSettings, WhisperModelId } from './types';
import { DEFAULT_SETTINGS, AVAILABLE_MODELS } from './types';

const STORAGE_KEYS = {
  SETTINGS: 'wa_settings',
  DOWNLOADED_MODELS: 'wa_downloaded_models',
};

// Retorna a API de storage local se disponível no contexto de execução atual
function getStorageArea(): any {
  if (typeof browser !== 'undefined' && browser.storage?.local) {
    return browser.storage.local;
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local;
  }
  return null;
}

export async function getSettings(): Promise<AppSettings> {
  const storage = getStorageArea();
  let saved: Partial<AppSettings> = {};

  if (storage) {
    const result = await storage.get(STORAGE_KEYS.SETTINGS);
    saved = (result[STORAGE_KEYS.SETTINGS] as AppSettings) || {};
  } else {
    // Fallback via background messaging para contextos sem chrome.storage direto (ex: Chrome Offscreen Document)
    try {
      const res = await browser.runtime.sendMessage({
        type: 'STORAGE_GET',
        key: STORAGE_KEYS.SETTINGS,
      });
      if (res?.success && res.data) {
        saved = res.data;
      }
    } catch (e) {
      console.warn('[AudioTranscriber Storage] Falha no fallback getSettings:', e);
    }
  }

  // Valida se o modelo salvo é válido na lista atual de modelos disponíveis
  const isModelValid = AVAILABLE_MODELS.some((m) => m.id === saved.selectedModel);
  const selectedModel = isModelValid
    ? (saved.selectedModel as WhisperModelId)
    : DEFAULT_SETTINGS.selectedModel;

  const finalSettings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    selectedModel,
  };

  // Se o modelo salvo anteriormente era inválido (ex: alteração na lista de modelos),
  // atualiza automaticamente no storage com o novo modelo ativo
  if (saved.selectedModel && !isModelValid) {
    saveSettings({ selectedModel }).catch(() => {});
  }

  return finalSettings;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  const storage = getStorageArea();

  if (storage) {
    await storage.set({ [STORAGE_KEYS.SETTINGS]: updated });
    return updated;
  }

  try {
    await browser.runtime.sendMessage({
      type: 'STORAGE_SET',
      key: STORAGE_KEYS.SETTINGS,
      value: updated,
    });
  } catch (e) {
    console.warn('[AudioTranscriber Storage] Falha no fallback saveSettings:', e);
  }
  return updated;
}

export async function getDownloadedModels(): Promise<Record<string, boolean>> {
  const storage = getStorageArea();
  if (storage) {
    const result = await storage.get(STORAGE_KEYS.DOWNLOADED_MODELS);
    return (result[STORAGE_KEYS.DOWNLOADED_MODELS] as Record<string, boolean>) || {};
  }

  try {
    const res = await browser.runtime.sendMessage({
      type: 'STORAGE_GET',
      key: STORAGE_KEYS.DOWNLOADED_MODELS,
    });
    if (res?.success && res.data) {
      return res.data;
    }
  } catch (e) {
    console.warn('[AudioTranscriber Storage] Falha no fallback getDownloadedModels:', e);
  }
  return {};
}

export async function setModelDownloaded(modelId: WhisperModelId, downloaded: boolean): Promise<void> {
  const current = await getDownloadedModels();
  current[modelId] = downloaded;
  const storage = getStorageArea();

  if (storage) {
    await storage.set({ [STORAGE_KEYS.DOWNLOADED_MODELS]: current });
    return;
  }

  try {
    await browser.runtime.sendMessage({
      type: 'STORAGE_SET',
      key: STORAGE_KEYS.DOWNLOADED_MODELS,
      value: current,
    });
  } catch (e) {
    console.warn('[AudioTranscriber Storage] Falha no fallback setModelDownloaded:', e);
  }
}

export async function isModelReady(modelId: WhisperModelId): Promise<boolean> {
  const models = await getDownloadedModels();
  return Boolean(models[modelId]);
}

