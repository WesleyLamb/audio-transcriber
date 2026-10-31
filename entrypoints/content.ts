export default defineContentScript({
  matches: ['https://web.whatsapp.com/*'],
  main() {
    console.log('%c[AudioTranscriber] Content script ativo no WhatsApp Web!', 'color: #00a884; font-weight: bold; font-size: 14px;');

    // Notificação visual temporária na tela para confirmar que a extensão carregou na página
    const badge = document.createElement('div');
    badge.id = 'audio-transcriber-status-badge';
    badge.textContent = '🎙️ Transcritor WhatsApp: Extensão Conectada (Etapa 1)';
    badge.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      background-color: #008069;
      color: white;
      padding: 8px 14px;
      border-radius: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      z-index: 999999;
      transition: opacity 0.5s ease;
    `;

    document.body.appendChild(badge);

    // Some suavemente após 6 segundos
    setTimeout(() => {
      badge.style.opacity = '0';
      setTimeout(() => badge.remove(), 500);
    }, 6000);
  },
});

