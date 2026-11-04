import '../assets/content.css';
import { browser } from 'wxt/browser';
import { getSettings, isModelReady } from '../utils/storage';
import { decodeAudioBlob } from '../utils/audio';
import { getTranscription, saveTranscription } from '../utils/db';
import type { TranscriptionRecord } from '../utils/db';

// Constrói o ícone de microfone usando SVG DOM nativo (100% seguro contra avisos de innerHTML)
function createMicIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');

  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z');

  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('d', 'M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z');

  svg.appendChild(path1);
  svg.appendChild(path2);
  return svg;
}

// Atualiza o estado visual do botão com APIs seguras do DOM
function setButtonState(
  button: HTMLButtonElement,
  options: { icon?: 'mic' | 'spinner' | null; text: string; disabled?: boolean }
) {
  button.replaceChildren();
  if (options.icon === 'mic') {
    button.appendChild(createMicIcon());
  } else if (options.icon === 'spinner') {
    const spinner = document.createElement('span');
    spinner.className = 'wa-spinner';
    button.appendChild(spinner);
  }
  const span = document.createElement('span');
  span.textContent = options.text;
  button.appendChild(span);
  if (typeof options.disabled === 'boolean') {
    button.disabled = options.disabled;
  }
}

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

// Obtém um identificador estável para a mensagem de áudio
function getMessageId(container: HTMLElement): string {
  const dataIdEl = container.closest('[data-id]') || container.querySelector('[data-id]');
  const dataId = dataIdEl?.getAttribute('data-id');
  if (dataId) return dataId;

  const convMsgEl =
    container.closest('[data-testid^="conv-msg-"]') ||
    container.querySelector('[data-testid^="conv-msg-"]');
  const convMsgId = convMsgEl?.getAttribute('data-testid');
  if (convMsgId) return convMsgId.replace('conv-msg-', '');

  const row = container.closest('[role="row"]');
  if (row?.id) return row.id;

  const meta = container.querySelector('[data-testid="msg-meta"]')?.textContent;
  if (meta) {
    return `audio_meta_${meta.trim().replace(/\s+/g, '_')}`;
  }

  return `audio_${Math.random().toString(36).substring(2, 9)}`;
}

// Localiza a linha do reprodutor de áudio (o elemento irmão logo acima da nova posição)
function findAudioPlayerRow(container: HTMLElement): HTMLElement | null {
  const trigger = container.querySelector(
    'button[aria-label*="mensagem de voz"], button[aria-label*="voice message"], button[aria-label*="recado de voz"], button[aria-label*="Play voice message"], [role="slider"][aria-label*="voz"], [role="slider"][aria-label*="voice"], [role="slider"][aria-label*="recado"], span[aria-label*="Mensagem de voz"], span[aria-label*="Voice message"], audio'
  );
  if (!trigger) return null;

  let current: HTMLElement | null = trigger as HTMLElement;

  while (current && current !== container && current.parentElement && current.parentElement !== container) {
    const parentEl: HTMLElement = current.parentElement;

    // Se o elemento pai possui timestamp (msg-meta) ou autor, 'current' é o container irmão da linha do player
    if (parentEl.querySelector('[data-testid="msg-meta"]') || parentEl.querySelector('[data-testid="author"]')) {
      return current;
    }

    // Se o elemento atual engloba o botão de play E (velocidade ou avatar), é a linha completa
    const hasPlay = current.querySelector('button[aria-label*="voz"], button[aria-label*="voice"], button[aria-label*="recado"]');
    const hasSpeedOrAvatar = current.querySelector('button[aria-label*="velocidade"], button[aria-label*="speed"], img');
    if (hasPlay && hasSpeedOrAvatar) {
      return current;
    }

    current = parentEl;
  }

  return current || (trigger.closest('div') as HTMLElement);
}

// Obtém ou cria a linha de transcrição imediatamente abaixo do reprodutor de áudio
function getOrCreateTranscriberRow(container: HTMLElement): HTMLElement {
  const playerRow = findAudioPlayerRow(container);

  if (playerRow) {
    // Se o próximo irmão imediato já for a linha de transcrição, reutiliza-o
    const next = playerRow.nextElementSibling as HTMLElement;
    if (next && next.classList.contains('wa-transcriber-row')) {
      return next;
    }

    // Se já existir uma linha de transcrição em outro local dentro do container, reposiciona
    const existing = container.querySelector('.wa-transcriber-row') as HTMLElement;
    if (existing) {
      if (existing !== next) {
        playerRow.after(existing);
      }
      return existing;
    }

    const row = document.createElement('div');
    // Clona dinamicamente as classes do elemento logo acima (playerRow)
    if (playerRow.className) {
      row.className = playerRow.className;
    }
    row.classList.add('wa-transcriber-row');
    playerRow.after(row);
    return row;
  }

  // Fallback seguro caso playerRow não seja localizado
  const existing = container.querySelector('.wa-transcriber-row') as HTMLElement;
  if (existing) return existing;

  const fallbackRow = document.createElement('div');
  fallbackRow.className = 'wa-transcriber-row';
  const addon = container.parentElement?.querySelector('[data-testid="addon-bubble-container"]') as HTMLElement;
  if (addon) {
    addon.appendChild(fallbackRow);
  } else {
    container.appendChild(fallbackRow);
  }
  return fallbackRow;
}

// Remove caixas de transcrição anteriores para evitar duplicatas ao retranscrever
function removeExistingTranscriptionBoxes(container: HTMLElement, messageId?: string) {
  if (messageId) {
    document.querySelectorAll(`[data-transcription-id="${messageId}"]`).forEach((el) => el.remove());
  }

  container.querySelectorAll('.wa-transcription-box').forEach((el) => el.remove());

  const parent = container.parentElement;
  if (parent) {
    parent.querySelectorAll('.wa-transcription-box').forEach((el) => el.remove());
    const addon = parent.querySelector('[data-testid="addon-bubble-container"]');
    if (addon) {
      addon.querySelectorAll('.wa-transcription-box').forEach((el) => el.remove());
    }
  }

  const wrapper =
    container.closest('[data-id]') ||
    container.closest('[data-testid^="conv-msg-"]') ||
    container.closest('[role="row"]');
  if (wrapper && wrapper !== parent && wrapper !== container) {
    wrapper.querySelectorAll('.wa-transcription-box').forEach((el) => el.remove());
  }
}

// Renderiza a caixa de texto transcrito dentro da linha de transcrição
function renderTranscriptionBox(
  container: HTMLElement,
  messageId: string,
  text: string,
  modelName: string
) {
  // Remove caixa anterior se houver
  removeExistingTranscriptionBoxes(container, messageId);

  const row = getOrCreateTranscriberRow(container);

  const box = document.createElement('div');
  box.className = 'wa-transcription-box';
  box.setAttribute('data-transcription-id', messageId);

  const header = document.createElement('div');
  header.className = 'wa-transcription-header';

  const tag = document.createElement('span');
  tag.className = 'wa-transcription-tag';
  const iconSpan = document.createElement('span');
  iconSpan.textContent = '🎙️';
  const labelSpan = document.createElement('span');
  labelSpan.textContent = 'Transcrição';
  tag.append(iconSpan, labelSpan);

  const actions = document.createElement('div');
  actions.className = 'wa-transcription-actions';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'wa-action-btn';
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Ocultar transcrição';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    box.remove();
    const btn = row.querySelector('.wa-transcriber-btn') as HTMLButtonElement;
    if (btn) {
      setButtonState(btn, { icon: 'mic', text: 'Transcrever' });
    }
  };

  actions.appendChild(closeBtn);
  header.appendChild(tag);
  header.appendChild(actions);

  const textElement = document.createElement('div');
  textElement.className = 'wa-transcription-text';
  textElement.textContent = text || '(Áudio inaudível ou sem fala detectada)';

  box.appendChild(header);
  box.appendChild(textElement);

  // Anexa abaixo do botão dentro da linha de transcrição
  row.appendChild(box);
}

// Injeta o botão de transcrição dentro do balão de áudio
function injectButtonIntoMessage(container: HTMLElement) {
  const row = getOrCreateTranscriberRow(container);

  // Evita duplicatas se já injetado na nova linha
  if (row.querySelector('.wa-transcriber-wrapper')) {
    return;
  }

  // Remove wrapper legado no addon-bubble-container se existir
  const oldAddonWrapper = container.parentElement?.querySelector(
    '[data-testid="addon-bubble-container"] .wa-transcriber-wrapper'
  );
  if (oldAddonWrapper) {
    oldAddonWrapper.remove();
  }

  const messageId = getMessageId(container);

  const wrapper = document.createElement('div');
  wrapper.className = 'wa-transcriber-wrapper';

  const button = document.createElement('button');
  button.className = 'wa-transcriber-btn';
  button.type = 'button';
  setButtonState(button, { icon: 'mic', text: 'Transcrever' });

  wrapper.appendChild(button);

  // Insere o botão no topo da linha (antes da caixa de texto se houver)
  const firstChild = row.firstElementChild;
  if (firstChild) {
    row.insertBefore(wrapper, firstChild);
  } else {
    row.appendChild(wrapper);
  }

  // Verifica se esta mensagem já foi transcrita anteriormente
  getTranscription(messageId)
    .then((cached) => {
      if (cached) {
        renderTranscriptionBox(container, messageId, cached.text, cached.modelUsed);
        setButtonState(button, { text: '✓ Transcrito' });
      }
    })
    .catch(() => {});

  // Ação de clique para transcrição completa
  button.onclick = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Remove qualquer caixa anterior imediatamente ao retranscrever
    removeExistingTranscriptionBoxes(container, messageId);

    const settings = await getSettings();
    const ready = await isModelReady(settings.selectedModel);

    if (!ready) {
      alert(
        `⚠️ Modelo "${settings.selectedModel}" não baixado!\n\nPor favor, abra o popup da extensão no topo do navegador e faça o download do modelo antes de transcrever.`
      );
      return;
    }

    setButtonState(button, { icon: 'spinner', text: 'Decodificando áudio...', disabled: true });

    try {
      // 1. Extrai o áudio
      const blobUrl = await getAudioBlobUrlForContainer(container);

      // 2. Converte para PCM 16kHz mono
      const { audioData, duration } = await decodeAudioBlob(blobUrl);

      // 3. Envia para o motor de IA Whisper local
      setButtonState(button, { icon: 'spinner', text: 'Transcrevendo ...', disabled: true });
      console.log(`[AudioTranscriber] Enviando ${audioData.length} amostras para inferência Whisper...`);

      const response = await browser.runtime.sendMessage({
        type: 'TRANSCRIBE_AUDIO_DATA',
        audioData: Array.from(audioData),
        language: settings.language,
        modelId: settings.selectedModel,
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

        setButtonState(button, { text: '✓ Transcrito', disabled: false });
      } else {
        throw new Error(response?.error || 'Não foi possível transcrever o áudio.');
      }
    } catch (err: any) {
      console.error('[AudioTranscriber] Erro durante a transcrição:', err);
      setButtonState(button, { text: '⚠️ Tentar novamente', disabled: false });
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

    // Sincroniza limpeza de histórico em tempo real se o usuário limpar no popup
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes['wa_transcriptions_cache']) {
        const newValue = changes['wa_transcriptions_cache'].newValue;
        if (!newValue || Object.keys(newValue).length === 0) {
          document.querySelectorAll('.wa-transcription-box').forEach((el) => el.remove());
          document.querySelectorAll<HTMLButtonElement>('.wa-transcriber-btn').forEach((btn) => {
            setButtonState(btn, { icon: 'mic', text: 'Transcrever' });
          });
        }
      }
    });

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
