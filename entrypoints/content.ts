import '../assets/content.css';
import { browser } from 'wxt/browser';
import { getSettings, isModelReady } from '../utils/storage';
import { decodeAudioBlob } from '../utils/audio';
import { getTranscription, saveTranscription } from '../utils/db';
import type { TranscriptionRecord } from '../utils/db';

const MIC_ICON_SVG = `
<svg viewBox="0 0 24 24">
  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
</svg>
`;

let lastCapturedAudioUrl: string | null = null;
const capturedUrlsByTime: Array<{ url: string; time: number }> = [];

// Injeta o script de hook no contexto nativo da página
function injectPageHook() {
  try {
    const script = document.createElement('script');
    script.src = browser.runtime.getURL('/inject.js' as any);
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
    console.log('[AudioTranscriber] Hook injetado com sucesso no WhatsApp Web.');
  } catch (e) {
    console.warn('[AudioTranscriber] Falha ao injetar hook:', e);
  }
}

// Ouve mensagens emitidas pelo hook na página
window.addEventListener('message', (event) => {
  if (event.data?.type === 'WA_AUDIO_BLOB_CAPTURED' || event.data?.type === 'WA_AUDIO_PLAY_CAPTURED') {
    const url = event.data.url || event.data.src;
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      lastCapturedAudioUrl = url;
      capturedUrlsByTime.push({ url, time: Date.now() });
      console.log('[AudioTranscriber] URL de áudio capturada pelo interceptor:', url);
    }
  }
});

// Obtém o blob do áudio correspondente a este balão
async function getAudioBlobUrlForContainer(container: HTMLElement): Promise<string> {
  const existingAudio = container.querySelector('audio') as HTMLAudioElement;
  if (existingAudio && existingAudio.src && existingAudio.src.startsWith('blob:')) {
    return existingAudio.src;
  }

  const playBtn = container.querySelector(
    'button[aria-label*="mensagem de voz"], button[aria-label*="voice message"], button[aria-label*="recado de voz"], button[aria-label*="Reproduzir"]'
  ) as HTMLButtonElement;

  if (!playBtn) {
    if (lastCapturedAudioUrl) {
      return lastCapturedAudioUrl;
    }
    throw new Error('Botão de reproduzir do WhatsApp não encontrado neste balão.');
  }

  const startTime = Date.now();

  const initialLabel = playBtn.getAttribute('aria-label') || '';
  if (initialLabel.includes('Pausar') || initialLabel.includes('Pause')) {
    if (lastCapturedAudioUrl) return lastCapturedAudioUrl;
  }

  playBtn.click();

  return new Promise<string>((resolve, reject) => {
    const interval = setInterval(() => {
      const recent = capturedUrlsByTime.find((item) => item.time >= startTime - 150);
      if (recent) {
        clearInterval(interval);
        const currentLabel = playBtn.getAttribute('aria-label') || '';
        if (currentLabel.includes('Pausar') || currentLabel.includes('Pause')) {
          playBtn.click();
        }
        resolve(recent.url);
        return;
      }

      if (Date.now() - startTime > 2500) {
        clearInterval(interval);
        const currentLabel = playBtn.getAttribute('aria-label') || '';
        if (currentLabel.includes('Pausar') || currentLabel.includes('Pause')) {
          playBtn.click();
        }

        if (lastCapturedAudioUrl) {
          resolve(lastCapturedAudioUrl);
        } else {
          reject(new Error('Não foi possível obter o áudio. Tente tocar o áudio e clicar novamente.'));
        }
      }
    }, 80);
  });
}

// Renderiza a caixa de texto transcrito dentro do balão de mensagem
function renderTranscriptionBox(
  container: HTMLElement,
  messageId: string,
  text: string,
  modelName: string
) {
  // Remove caixa anterior se houver
  const existing = container.querySelector('.wa-transcription-box');
  if (existing) {
    existing.remove();
  }

  const box = document.createElement('div');
  box.className = 'wa-transcription-box';
  box.setAttribute('data-transcription-id', messageId);

  const header = document.createElement('div');
  header.className = 'wa-transcription-header';

  const tag = document.createElement('span');
  tag.className = 'wa-transcription-tag';
  tag.innerHTML = `<span>🎙️</span> <span>IA Local (${modelName.replace('onnx-community/', '')})</span>`;

  const actions = document.createElement('div');
  actions.className = 'wa-transcription-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'wa-action-btn';
  copyBtn.type = 'button';
  copyBtn.innerHTML = '📋 Copiar';
  copyBtn.title = 'Copiar texto para a área de transferência';
  copyBtn.onclick = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.innerHTML = '✓ Copiado!';
      setTimeout(() => {
        copyBtn.innerHTML = '📋 Copiar';
      }, 2000);
    } catch {
      copyBtn.innerHTML = 'Falha ao copiar';
    }
  };

  const closeBtn = document.createElement('button');
  closeBtn.className = 'wa-action-btn';
  closeBtn.type = 'button';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Ocultar transcrição';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    box.remove();
  };

  actions.appendChild(copyBtn);
  actions.appendChild(closeBtn);
  header.appendChild(tag);
  header.appendChild(actions);

  const textElement = document.createElement('div');
  textElement.className = 'wa-transcription-text';
  textElement.textContent = text || '(Áudio inaudível ou sem fala detectada)';

  box.appendChild(header);
  box.appendChild(textElement);

  const parent = container.parentElement;
  const addonContainer = parent?.querySelector('[data-testid="addon-bubble-container"]') as HTMLElement;

  if (addonContainer) {
    addonContainer.appendChild(box);
  } else {
    container.appendChild(box);
  }
}

// Injeta o botão de transcrição dentro do balão de áudio
function injectButtonIntoMessage(container: HTMLElement) {
  if (
    container.querySelector('.wa-transcriber-wrapper') ||
    container.parentElement?.querySelector('.wa-transcriber-wrapper')
  ) {
    return;
  }

  const messageId =
    container.closest('[data-id]')?.getAttribute('data-id') ||
    container.getAttribute('data-id') ||
    `audio_${Math.random().toString(36).substring(2, 9)}`;

  const wrapper = document.createElement('div');
  wrapper.className = 'wa-transcriber-wrapper';

  const button = document.createElement('button');
  button.className = 'wa-transcriber-btn';
  button.type = 'button';
  button.innerHTML = `${MIC_ICON_SVG}<span>Transcrever</span>`;

  wrapper.appendChild(button);

  const parent = container.parentElement;
  const addonContainer = parent?.querySelector('[data-testid="addon-bubble-container"]') as HTMLElement;

  if (addonContainer) {
    addonContainer.appendChild(wrapper);
  } else {
    container.appendChild(wrapper);
  }

  // Verifica se esta mensagem já foi transcrita anteriormente no IndexedDB
  getTranscription(messageId)
    .then((cached) => {
      if (cached) {
        renderTranscriptionBox(container, messageId, cached.text, cached.modelUsed);
        button.innerHTML = '✓ Transcrito';
      }
    })
    .catch(() => {});

  // Ação de clique para transcrição completa
  button.onclick = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    const settings = await getSettings();
    const ready = await isModelReady(settings.selectedModel);

    if (!ready) {
      alert(
        '⚠️ Modelo de IA não baixado!\n\nPor favor, abra o popup da extensão no topo do navegador e faça o download do modelo Whisper antes de transcrever.'
      );
      return;
    }

    button.disabled = true;
    button.innerHTML = '<span class="wa-spinner"></span><span>Decodificando áudio...</span>';

    try {
      // 1. Extrai o áudio
      const blobUrl = await getAudioBlobUrlForContainer(container);

      // 2. Converte para PCM 16kHz mono
      const { audioData, duration } = await decodeAudioBlob(blobUrl);

      // 3. Envia para o motor de IA Whisper local
      button.innerHTML = '<span class="wa-spinner"></span><span>Transcrevendo com IA local...</span>';
      console.log(`[AudioTranscriber] Enviando ${audioData.length} amostras para inferência Whisper...`);

      const response = await browser.runtime.sendMessage({
        type: 'TRANSCRIBE_AUDIO_DATA',
        audioData: Array.from(audioData),
        language: settings.language,
      });

      if (response?.success && typeof response.text === 'string') {
        const transcriptionText = response.text.trim();
        console.log('[AudioTranscriber] Transcrição recebida com sucesso:', transcriptionText);

        // 4. Renderiza inline no balão
        renderTranscriptionBox(container, messageId, transcriptionText, settings.selectedModel);

        // 5. Salva no IndexedDB
        const record: TranscriptionRecord = {
          id: messageId,
          text: transcriptionText,
          modelUsed: settings.selectedModel,
          language: settings.language,
          durationSeconds: duration,
          createdAt: Date.now(),
        };
        await saveTranscription(record);

        button.disabled = false;
        button.innerHTML = '✓ Transcrito';
      } else {
        throw new Error(response?.error || 'Não foi possível transcrever o áudio.');
      }
    } catch (err: any) {
      console.error('[AudioTranscriber] Erro durante a transcrição:', err);
      button.disabled = false;
      button.innerHTML = '<span>⚠️ Tentar novamente</span>';
      alert(`Falha na transcrição: ${err.message || 'Erro inesperado'}`);
    }
  };
}

// Varre a tela em busca de mensagens de áudio
function scanForAudioMessages() {
  const audioContainers = new Set<HTMLElement>();

  const targetSelectors = [
    'button[aria-label*="mensagem de voz"]',
    'button[aria-label*="voice message"]',
    'button[aria-label*="recado de voz"]',
    '[role="slider"][aria-label*="voz"]',
    '[role="slider"][aria-label*="voice"]',
    '[role="slider"][aria-label*="recado"]',
    'span[aria-label*="Mensagem de voz"]',
    'span[aria-label*="Voice message"]',
    'audio',
  ];

  targetSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      const container = (el.closest('[data-testid="msg-container"]') ||
        el.closest('[data-id]') ||
        el.closest('[role="row"]') ||
        el.parentElement) as HTMLElement;

      if (container) {
        audioContainers.add(container);
      }
    });
  });

  audioContainers.forEach((container) => {
    injectButtonIntoMessage(container);
  });
}

export default defineContentScript({
  matches: ['https://web.whatsapp.com/*'],
  cssInjectionMode: 'manifest',
  main() {
    console.log('%c[AudioTranscriber] Content script ativo no WhatsApp Web!', 'color: #00a884; font-weight: bold;');

    injectPageHook();
    scanForAudioMessages();

    let timer: any = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        scanForAudioMessages();
      }, 250);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  },
});
