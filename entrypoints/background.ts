import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS } from '../utils/types';
import { getSettings, saveSettings, setModelDownloaded } from '../utils/storage';

async function ensureEngine() {
  // 1. Caso Chromium com chrome.offscreen (Manifest V3)
  if (import.meta.env.BROWSER === 'chrome') {
    if (typeof chrome !== 'undefined' && typeof (chrome as any).offscreen !== 'undefined') {
      if ('getContexts' in chrome.runtime) {
        try {
          const contexts = await (chrome.runtime as any).getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [browser.runtime.getURL('/offscreen.html')],
          });
          if (contexts && contexts.length > 0) return;
        } catch {
          // Ignora erro
        }
      }
      try {
        await (chrome as any).offscreen.createDocument({
          url: browser.runtime.getURL('/offscreen.html'),
          reasons: ['AUDIO_PLAYBACK', 'WORKERS'],
          justification: 'Speech recognition ML pipeline',
        });
        console.log('[AudioTranscriber] Documento offscreen criado no Chrome.');
      } catch (e: any) {
        if (!e?.message?.includes('single offscreen')) {
          console.warn('[AudioTranscriber] Aviso offscreen:', e);
        }
      }
    }
    return;
  }

  // 2. Caso Firefox / LibreWolf (Manifest V2 background page com DOM)
  if (typeof document !== 'undefined') {
    if (!document.getElementById('ai-engine-frame')) {
      const iframe = document.createElement('iframe');
      iframe.id = 'ai-engine-frame';
      iframe.src = browser.runtime.getURL('/offscreen.html');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      console.log('[AudioTranscriber] Engine iframe conectado no background do Firefox/LibreWolf.');
    }
  }
}

export default defineBackground(() => {
  console.log('[AudioTranscriber] Background Service Worker iniciado com sucesso.');

  // Inicializa configurações padrão na instalação
  browser.runtime.onInstalled.addListener(async () => {
    const settings = await getSettings();
    if (!settings.selectedModel) {
      await saveSettings(DEFAULT_SETTINGS);
    }
    await ensureEngine();
  });

  // NÃO marque esta função como async para evitar retornar Promises prematuras que resolvam em undefined!
  browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    if (message?.type === 'PING') {
      const response = {
        status: 'ok',
        message: 'PONG do Background Worker!',
        timestamp: new Date().toLocaleTimeString(),
      };
      sendResponse(response);
      return Promise.resolve(response);
    }

    // Proxies de acesso ao chrome.storage para contextos restritos (ex: Chrome Offscreen Document)
    if (message?.type === 'STORAGE_GET') {
      const storage = browser.storage?.local || (typeof chrome !== 'undefined' ? chrome.storage?.local : null);
      if (storage) {
        storage.get(message.key).then((data: any) => {
          sendResponse({ success: true, data: data[message.key] });
        }).catch((err: any) => {
          sendResponse({ success: false, error: err?.message });
        });
      } else {
        sendResponse({ success: false, error: 'Storage API indisponível' });
      }
      return true;
    }

    if (message?.type === 'STORAGE_SET') {
      const storage = browser.storage?.local || (typeof chrome !== 'undefined' ? chrome.storage?.local : null);
      if (storage) {
        storage.set({ [message.key]: message.value }).then(() => {
          sendResponse({ success: true });
        }).catch((err: any) => {
          sendResponse({ success: false, error: err?.message });
        });
      } else {
        sendResponse({ success: false, error: 'Storage API indisponível' });
      }
      return true;
    }

    if (message?.type === 'STORAGE_REMOVE') {
      const storage = browser.storage?.local || (typeof chrome !== 'undefined' ? chrome.storage?.local : null);
      if (storage) {
        storage.remove(message.key).then(() => {
          sendResponse({ success: true });
        }).catch((err: any) => {
          sendResponse({ success: false, error: err?.message });
        });
      } else {
        sendResponse({ success: false, error: 'Storage API indisponível' });
      }
      return true;
    }

    if (message?.type === 'DOWNLOAD_COMPLETE') {
      if (message.modelId) {
        setModelDownloaded(message.modelId, true).catch(() => {});
      }
    }

    if (
      message?.type === 'START_DOWNLOAD' ||
      message?.type === 'DELETE_MODEL' ||
      message?.type === 'TRANSCRIBE_AUDIO_DATA'
    ) {
      ensureEngine();
      // Não retorne nada aqui para que o ouvinte do motor offscreen/iframe responda à mensagem!
    }
  });

  // Inicia o motor logo na inicialização
  ensureEngine();
});
