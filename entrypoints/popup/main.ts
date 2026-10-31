import { browser } from 'wxt/browser';

const testBtn = document.getElementById('testBtn') as HTMLButtonElement;
const statusBox = document.getElementById('statusBox') as HTMLDivElement;

testBtn.addEventListener('click', async () => {
  statusBox.textContent = 'Enviando PING para o background...';

  try {
    console.log('[AudioTranscriber Popup] Enviando mensagem PING via browser.runtime...');
    const response = await browser.runtime.sendMessage({ type: 'PING' });
    console.log('[AudioTranscriber Popup] Resposta recebida:', response);

    if (response?.status === 'ok') {
      statusBox.innerHTML = `✅ <strong>Sucesso!</strong> Resposta: "${response.message}" às ${response.timestamp}`;
      statusBox.style.color = '#008069';
      statusBox.style.borderColor = '#008069';
    } else {
      statusBox.innerHTML = `⚠️ <strong>Resposta inesperada:</strong> <code>${JSON.stringify(response)}</code>`;
      statusBox.style.color = '#d97706';
    }
  } catch (error: any) {
    console.error('[AudioTranscriber Popup] Erro ao comunicar:', error);
    statusBox.textContent = `❌ Erro: ${error?.message || 'Falha ao comunicar com background'}`;
    statusBox.style.color = '#dc2626';
  }
});
