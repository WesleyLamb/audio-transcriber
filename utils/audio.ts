/**
 * Decodifica e converte áudios do WhatsApp Web para PCM 16kHz mono Float32Array,
 * formato padrão exigido pelos modelos Whisper.
 */
export async function extractAndDecodeAudio(audioSrc: string): Promise<{ audioData: Float32Array; duration: number }> {
  if (!audioSrc) {
    throw new Error('URL de áudio inválida.');
  }

  // 1. Busca o blob do áudio
  const response = await fetch(audioSrc);
  if (!response.ok) {
    throw new Error(`Falha ao obter áudio do WhatsApp (${response.status} ${response.statusText})`);
  }

  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();

  // 2. Decodifica usando AudioContext com sampleRate nativo de 16kHz
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass({ sampleRate: 16000 });

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;

    // 3. Converte para mono
    let channelData: Float32Array;
    if (audioBuffer.numberOfChannels === 1) {
      channelData = audioBuffer.getChannelData(0);
    } else {
      const ch0 = audioBuffer.getChannelData(0);
      const ch1 = audioBuffer.getChannelData(1);
      channelData = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i++) {
        channelData[i] = ((ch0[i] ?? 0) + (ch1[i] ?? 0)) / 2;
      }
    }

    return {
      audioData: channelData,
      duration,
    };
  } finally {
    await audioContext.close().catch(() => {});
  }
}
