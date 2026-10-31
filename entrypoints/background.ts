import { browser } from 'wxt/browser';

export default defineBackground(() => {
  console.log('[AudioTranscriber] Background Service Worker iniciado com sucesso.');

  // Comunicação universal compatível com Chrome, Firefox e LibreWolf
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('[AudioTranscriber] Mensagem recebida no background:', message);

    if (message?.type === 'PING') {
      const response = {
        status: 'ok',
        message: 'PONG do Background Worker!',
        timestamp: new Date().toLocaleTimeString(),
      };

      // Firefox/LibreWolf exige retornar uma Promise com os dados.
      // Chrome/Chromium utiliza o callback sendResponse.
      sendResponse(response);
      return Promise.resolve(response);
    }
  });
});
