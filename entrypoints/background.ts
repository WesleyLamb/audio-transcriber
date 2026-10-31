import { DEFAULT_SETTINGS } from '../utils/types';
import { getSettings, saveSettings } from '../utils/storage';

async function ensureOffscreenDocument() {
  if (typeof chrome === 'undefined' || typeof chrome.offscreen === 'undefined') {
    return;
  }

  // Verifica se o documento já está ativo
  if ('getContexts' in chrome.runtime) {
    try {
      const contexts = await (chrome.runtime as any).getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL('offscreen.html')],
      });
      if (contexts && contexts.length > 0) {
        return;
      }
    } catch {
      // Ignora erro e tenta criar
    }
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK, chrome.offscreen.Reason.WORKERS],
      justification: 'Execução de inferência de IA local e decodificação de áudio',
    });
    console.log('[AudioTranscriber] Offscreen document criado com sucesso.');
  } catch (error: any) {
    if (!error?.message?.includes('Only a single offscreen document may be created')) {
      console.warn('[AudioTranscriber] Erro ao criar documento offscreen:', error);
    }
  }
}

export default defineBackground(() => {
  console.log('[AudioTranscriber] Background service worker iniciado.');

  chrome.runtime.onInstalled.addListener(async () => {
    const settings = await getSettings();
    if (!settings.selectedModel) {
      await saveSettings(DEFAULT_SETTINGS);
    }
    await ensureOffscreenDocument();
  });

  // Intercepta requisições de download ou transcrição para garantir que o motor offscreen esteja ativo
  chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, _sendResponse: (response?: any) => void) => {
    if (message.type === 'START_DOWNLOAD' || message.type === 'TRANSCRIBE_AUDIO_DATA') {
      ensureOffscreenDocument();
    }
  });
});
