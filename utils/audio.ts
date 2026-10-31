/**
 * Decodifica e converte o áudio do WhatsApp para PCM 16kHz mono Float32Array,
 * formato padrão esperado pelos modelos de IA Whisper.
 */
export async function decodeAudioBlob(
  audioSource: string | ArrayBuffer
): Promise<{ audioData: Float32Array; duration: number }> {
  let arrayBuffer: ArrayBuffer;

  if (typeof audioSource === 'string') {
    const response = await fetch(audioSource);
    if (!response.ok) {
      throw new Error(`Falha ao carregar áudio (${response.status} ${response.statusText})`);
    }
    const blob = await response.blob();
    arrayBuffer = await blob.arrayBuffer();
  } else {
    arrayBuffer = audioSource;
  }

  // Decodifica usando AudioContext com sampleRate nativo de 16.000 Hz
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass({ sampleRate: 16000 });

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;

    // Converte para canal mono Float32Array
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

