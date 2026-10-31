import '../assets/content.css';
import { extractAndDecodeAudio } from '../utils/audio';
import { getSettings, isModelReady, incrementTranscriptionCount } from '../utils/storage';
import { getTranscription, saveTranscription } from '../utils/db';
import type { TranscriptionRecord } from '../utils/db';

const MIC_ICON_SVG = `
<svg viewBox="0 0 24 24">
  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
</svg>
`;

// Gera um identificador único para mensagens que não contenham data-id
function getMessageId(container: HTMLElement, audioElement: HTMLAudioElement): string {
  const dataId = container.getAttribute('data-id');
  if (dataId) return dataId;

  // Fallback baseado na fonte do áudio ou posição no DOM
  if (audioElement.src) {
    return `audio_${audioElement.src.slice(-32)}`;
  }
  return `audio_${Math.random().toString(36).substring(2, 9)}`;
}

// Renderiza a caixa com o texto da transcrição
function renderTranscriptionBox(
  targetContainer: HTMLElement,
  messageId: string,
  text: string,
  modelName: string
) {
  // Remove caixa anterior se houver
  const existingBox = targetContainer.querySelector('.wa-transcription-box');
  if (existingBox) {
    existingBox.remove();
  }

  const box = document.createElement('div');
  box.className = 'wa-transcription-box';

  const header = document.createElement('div');
  header.className = 'wa-transcription-header';

  const tag = document.createElement('span');
  tag.className = 'wa-transcription-tag';
  tag.innerHTML = `<span>🎙️</span> <span>IA Local (${modelName.replace('onnx-community/', '')})</span>`;

  const actions = document.createElement('div');
  actions.className = 'wa-transcription-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'wa-action-link';
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
  closeBtn.className = 'wa-action-link';
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
  textElement.textContent = text || '(Áudio vazio ou inaudível)';

  box.appendChild(header);
  box.appendChild(textElement);

  targetContainer.appendChild(box);
}

// Manipula o clique para transcrever
async function handleTranscribeClick(
  button: HTMLButtonElement,
  audioElement: HTMLAudioElement,
  messageContainer: HTMLElement,
  messageId: string
) {
  const settings = await getSettings();
  const ready = await isModelReady(settings.selectedModel);

  if (!ready) {
    alert(
      '⚠️ O modelo de IA ainda não foi baixado!\n\nClique no ícone da extensão no topo do navegador para baixar o modelo Whisper antes de transcrever.'
    );
    return;
  }

  const audioSrc = audioElement.src || audioElement.currentSrc;
  if (!audioSrc) {
    alert('Não foi possível obter a fonte do áudio. Tente tocar o áudio primeiro.');
    return;
  }

  button.disabled = true;
  button.innerHTML = '<span class="wa-spinner"></span> Transcrevendo...';

  try {
    // 1. Extrai e decodifica para PCM 16kHz Float32Array
    const { audioData, duration } = await extractAndDecodeAudio(audioSrc);

    // 2. Envia para o motor de IA em background/offscreen
    const response = await chrome.runtime.sendMessage({
      type: 'TRANSCRIBE_AUDIO_DATA',
      audioData: Array.from(audioData),
      language: settings.language,
      messageId,
    });

    if (response?.success && response.text) {
      const transcriptionText = response.text;

      // 3. Renderiza a transcrição no balão
      renderTranscriptionBox(messageContainer, messageId, transcriptionText, settings.selectedModel);

      // 4. Salva no IndexedDB para persistência offline ao rolar
      const record: TranscriptionRecord = {
        id: messageId,
        text: transcriptionText,
        modelUsed: settings.selectedModel,
        language: settings.language,
        durationSeconds: duration,
        createdAt: Date.now(),
      };
      await saveTranscription(record);
      await incrementTranscriptionCount();

      button.disabled = false;
      button.innerHTML = '✓ Transcrito';
    } else {
      throw new Error(response?.error || 'Não foi possível transcrever este áudio.');
    }
  } catch (error: any) {
    console.error('[AudioTranscriber] Erro na transcrição:', error);
    button.disabled = false;
    button.innerHTML = '⚠️ Erro (Tentar)';

    let errorBox = messageContainer.querySelector('.wa-transcription-error') as HTMLDivElement;
    if (!errorBox) {
      errorBox = document.createElement('div');
      errorBox.className = 'wa-transcription-error';
      messageContainer.appendChild(errorBox);
    }
    errorBox.textContent = `Erro: ${error.message || 'Falha ao processar'}`;
  }
}

// Injeta o botão no balão de áudio
async function processAudioElement(audioElement: HTMLAudioElement) {
  // Encontra o container da mensagem no DOM do WhatsApp Web
  const messageContainer =
    (audioElement.closest('[data-id]') as HTMLElement) ||
    (audioElement.closest('[role="row"]') as HTMLElement) ||
    audioElement.parentElement?.parentElement ||
    audioElement.parentElement;

  if (!messageContainer) return;

  // Se já injetamos neste balão, nada a fazer
  if (messageContainer.querySelector('.wa-transcriber-wrapper')) {
    return;
  }

  const messageId = getMessageId(messageContainer, audioElement);

  // Wrapper do botão
  const wrapper = document.createElement('div');
  wrapper.className = 'wa-transcriber-wrapper';

  const button = document.createElement('button');
  button.className = 'wa-transcriber-btn';
  button.type = 'button';
  button.innerHTML = `${MIC_ICON_SVG}<span>Transcrever</span>`;

  wrapper.appendChild(button);

  // Insere após o reprodutor de áudio ou no final do container do balão
  const playerParent = audioElement.parentElement || messageContainer;
  if (playerParent.nextSibling) {
    playerParent.parentNode?.insertBefore(wrapper, playerParent.nextSibling);
  } else {
    messageContainer.appendChild(wrapper);
  }

  // Verifica se esta mensagem já foi transcrita anteriormente (IndexedDB)
  try {
    const cached = await getTranscription(messageId);
    if (cached) {
      renderTranscriptionBox(messageContainer, messageId, cached.text, cached.modelUsed);
      button.innerHTML = '✓ Transcrito';
    }
  } catch (e) {
    // Ignora erro de leitura do cache
  }

  button.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    handleTranscribeClick(button, audioElement, messageContainer, messageId);
  };
}

// Varre o DOM em busca de novos elementos de áudio
function scanForAudioElements() {
  const audioElements = document.querySelectorAll<HTMLAudioElement>('audio');
  audioElements.forEach((audio) => {
    processAudioElement(audio);
  });
}

export default defineContentScript({
  matches: ['https://web.whatsapp.com/*'],
  cssInjectionMode: 'manifest',
  main() {
    console.log('[AudioTranscriber] Content script ativo no WhatsApp Web.');

    // Executa varredura inicial
    scanForAudioElements();

    // Observa mutações dinâmicas no DOM com debounce para performance máxima
    let scanTimeout: any = null;
    const observer = new MutationObserver(() => {
      if (scanTimeout) clearTimeout(scanTimeout);
      scanTimeout = setTimeout(() => {
        scanForAudioElements();
      }, 300);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  },
});
