import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS } from '../utils/types';
import { getSettings, saveSettings } from '../utils/storage';

async function ensureEngine() {
  // 1. Caso Chromium com chrome.offscreen (Manifest V3)
  if (typeof chrome !== 'undefined' && typeof chrome.offscreen !== 'undefined') {
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
      await chrome.offscreen.createDocument({
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

  // Garante que o motor esteja acordado quando o popup ou content script enviar mensagens
  browser.runtime.onMessage.addListener(async (message: any, _sender, sendResponse) => {
    if (message?.type === 'PING') {
      const response = {
        status: 'ok',
        message: 'PONG do Background Worker!',
        timestamp: new Date().toLocaleTimeString(),
      };
      sendResponse(response);
      return Promise.resolve(response);
    }

    if (message?.type === 'START_DOWNLOAD' || message?.type === 'DELETE_MODEL') {
      await ensureEngine();
    }
  });

  // Inicia o motor logo na inicialização
  ensureEngine();
});
