import '../assets/content.css';
import { getSettings, isModelReady } from '../utils/storage';

const MIC_ICON_SVG = `
<svg viewBox="0 0 24 24">
  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
</svg>
`;

// Injeta o botão de transcrição dentro do balão de áudio
function injectButtonIntoMessage(container: HTMLElement) {
  // Verifica se o botão já foi injetado nesta mensagem
  if (
    container.querySelector('.wa-transcriber-wrapper') ||
    container.parentElement?.querySelector('.wa-transcriber-wrapper')
  ) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'wa-transcriber-wrapper';

  const button = document.createElement('button');
  button.className = 'wa-transcriber-btn';
  button.type = 'button';
  button.innerHTML = `${MIC_ICON_SVG}<span>Transcrever</span>`;

  wrapper.appendChild(button);

  // Ponto de injeção ideal:
  // Se houver addon-bubble-container (contêiner nativo para extras do balão), injeta nele;
  // senão, anexa ao final do contêiner da mensagem.
  const parent = container.parentElement;
  const addonContainer = parent?.querySelector('[data-testid="addon-bubble-container"]') as HTMLElement;

  if (addonContainer) {
    addonContainer.appendChild(wrapper);
  } else {
    container.appendChild(wrapper);
  }

  // Ação de clique para o teste da Etapa 3
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

    const messageId =
      container.closest('[data-id]')?.getAttribute('data-id') ||
      container.getAttribute('data-id') ||
      'id_desconhecido';

    console.log('[AudioTranscriber] Balão de áudio detectado com sucesso!', {
      messageId,
      modelReady: ready,
      selectedModel: settings.selectedModel,
      container,
    });

    // Feedback visual para validação da Etapa 3
    button.classList.add('wa-btn-ready');
    button.innerHTML = '<span>✓ Áudio conectado (Etapa 3 OK)</span>';
    setTimeout(() => {
      button.innerHTML = `${MIC_ICON_SVG}<span>Transcrever</span>`;
      button.classList.remove('wa-btn-ready');
    }, 3000);
  };
}

// Varre a tela em busca de mensagens de áudio usando os seletores reais do WhatsApp Web
function scanForAudioMessages() {
  const audioContainers = new Set<HTMLElement>();

  // 1. Procura por botões de reproduzir mensagem de voz ou controle deslizante
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

//   // 2. Procura por ícones SVG característicos de mensagens de voz
//   document.querySelectorAll('svg title').forEach((titleEl) => {
//     const text = titleEl.textContent || '';
//     if (
//       text.includes('ic-keyboard-voice') ||
//       text.includes('ic-play-arrow') ||
//       text.includes('ic-pause')
//     ) {
//       const container = (titleEl.closest('[data-testid="msg-container"]') ||
//         titleEl.closest('[data-id]') ||
//         titleEl.closest('[role="row"]')) as HTMLElement;

//       if (container && (container.querySelector('[role="slider"]') || text.includes('voice'))) {
//         audioContainers.add(container);
//       }
//     }
//   });

  // Injeta o botão em cada contêiner de mensagem de áudio identificado
  audioContainers.forEach((container) => {
    injectButtonIntoMessage(container);
  });
}

export default defineContentScript({
  matches: ['https://web.whatsapp.com/*'],
  cssInjectionMode: 'manifest',
  main() {
    console.log('%c[AudioTranscriber] Content script ativo e monitorando mensagens de áudio no WhatsApp Web!', 'color: #00a884; font-weight: bold;');

    // Varredura imediata
    scanForAudioMessages();

    // Observa o carregamento dinâmico de conversas e mensagens com debounce
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
