import { browser } from 'wxt/browser';

export interface TranscriptionRecord {
  id: string;
  text: string;
  modelUsed: string;
  language: string;
  durationSeconds?: number;
  createdAt: number;
}

const STORAGE_KEY = 'wa_transcriptions_cache';

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

// Lê todas as transcrições salvas no armazenamento da extensão
async function getAllTranscriptions(): Promise<Record<string, TranscriptionRecord>> {
  try {
    const storage = getStorageArea();
    if (storage) {
      const res = await storage.get(STORAGE_KEY);
      return (res[STORAGE_KEY] as Record<string, TranscriptionRecord>) || {};
    }
    const res = await browser.runtime.sendMessage({
      type: 'STORAGE_GET',
      key: STORAGE_KEY,
    });
    return (res?.data as Record<string, TranscriptionRecord>) || {};
  } catch (e) {
    console.warn('[AudioTranscriber DB] Erro ao ler storage:', e);
    return {};
  }
}

// Salva ou atualiza uma transcrição no cache
export async function saveTranscription(record: TranscriptionRecord): Promise<void> {
  const all = await getAllTranscriptions();
  all[record.id] = record;
  const storage = getStorageArea();
  if (storage) {
    await storage.set({ [STORAGE_KEY]: all });
  } else {
    try {
      await browser.runtime.sendMessage({
        type: 'STORAGE_SET',
        key: STORAGE_KEY,
        value: all,
      });
    } catch (e) {
      console.warn('[AudioTranscriber DB] Falha ao salvar via mensagem:', e);
    }
  }
  console.log(`[AudioTranscriber DB] Transcrição salva para id "${record.id}". Total salvo: ${Object.keys(all).length}`);
}

// Busca uma transcrição pelo id da mensagem
export async function getTranscription(id: string): Promise<TranscriptionRecord | null> {
  const all = await getAllTranscriptions();
  return all[id] || null;
}

// Limpa todo o histórico de transcrições salvas
export async function clearAllTranscriptions(): Promise<void> {
  const storage = getStorageArea();
  if (storage) {
    await storage.remove(STORAGE_KEY);
  } else {
    try {
      await browser.runtime.sendMessage({
        type: 'STORAGE_REMOVE',
        key: STORAGE_KEY,
      });
    } catch (e) {
      console.warn('[AudioTranscriber DB] Falha ao limpar via mensagem:', e);
    }
  }
  console.log('[AudioTranscriber DB] Todo o histórico de transcrições foi limpo.');
}

// Retorna a contagem total de mensagens transcritas
export async function getStoredTranscriptionsCount(): Promise<number> {
  const all = await getAllTranscriptions();
  return Object.keys(all).length;
}
