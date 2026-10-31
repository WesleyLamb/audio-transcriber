# 🎙️ Transcritor de Áudio para WhatsApp Web (IA Local & Privada)

Uma extensão de navegador para **Google Chrome**, **Mozilla Firefox**, **LibreWolf**, **Brave** e **Edge** que transcreve mensagens de voz do WhatsApp Web diretamente no seu navegador, utilizando inteligência artificial local com **Transformers.js** e **Whisper**.

---

## 🔒 100% Local & Privado
- **Zero envio para servidores externos:** A extração, decodificação e a inferência de transcrição acontecem inteiramente na máquina do usuário.
- **Funcionamento Offline:** Após baixar os pesos do modelo pela primeira vez, a transcrição não necessita de nenhuma conexão com serviços de IA.
- **Desenvolvido para Computadores Modestos:** Utiliza por padrão o modelo quantizado `Whisper-Tiny` (~75MB) rodando via WebAssembly CPU (ou WebGPU se disponível).
- **Cache Inteligente:** As mensagens transcritas são salvas no banco de dados local do navegador (`IndexedDB`). Ao rolar a página ou recarregar o WhatsApp, o texto permanece visível instantaneamente.

---

## 🚀 Como Carregar e Usar

### 🦊 No Mozilla Firefox / LibreWolf:
1. Abra uma aba e digite: `about:debugging#/runtime/this-firefox`
2. Clique no botão **Carregar extensão temporária...** (*Load Temporary Add-on...*).
3. Selecione o arquivo `manifest.json` dentro da pasta:
   ```text
   audio-transcriber/.output/firefox-mv2/manifest.json
   ```
4. O ícone da extensão surgirá na barra de ferramentas do seu navegador.

---

### 🟢 No Google Chrome / Brave / Edge:
1. Abra uma aba e digite: `chrome://extensions`
2. No canto superior direito, ative a chave **Modo do desenvolvedor** (*Developer mode*).
3. Clique em **Carregar sem compactação** (*Load unpacked*).
4. Selecione a pasta:
   ```text
   audio-transcriber/.output/chrome-mv3
   ```

---

## 🎧 Passo a Passo de Uso

1. **Baixar o Modelo de IA (apenas na 1ª vez):**
   - Clique no ícone do **Transcritor WhatsApp** na barra do navegador.
   - Escolha o modelo desejado (o `Whisper Tiny` é o recomendado para máxima leveza).
   - Clique em **"📥 Baixar Modelo Agora"** e aguarde o download (100%).
   - O status mudará para `Pronto (Offline)`.

2. **Transcrever Áudios no WhatsApp:**
   - Acesse o [WhatsApp Web](https://web.whatsapp.com).
   - Nos balões de mensagem de voz, você verá o botão **`🎙️ Transcrever`**.
   - Clique no botão: a extensão interceptará o áudio, decodificará para PCM 16kHz e executará a inferência Whisper localmente.
   - O texto surgirá diretamente dentro do balão com opções de **"📋 Copiar"** e **"✕"**.

3. **Gerenciar Histórico & Idiomas:**
   - No popup da extensão, acompanhe a quantidade de áudios salvos no histórico.
   - Limpe o histórico a qualquer momento com um clique em **"Limpar Histórico Local"**.
   - Alterne o idioma padrão da transcrição entre Português, Detecção Automática, Inglês ou Espanhol.

---

## 🛠️ Comandos de Desenvolvimento

O projeto foi construído utilizando **WXT (Web Extension Framework)** e **TypeScript**:

```bash
# Executa servidor de desenvolvimento com Hot Reload
npm run dev             # Para Chromium
npm run dev:firefox     # Para Firefox / LibreWolf

# Compila para produção
npm run build           # Compila Chromium (.output/chrome-mv3)
npm run build:firefox   # Compila Firefox (.output/firefox-mv2)
npm run build:all       # Compila ambos os navegadores

# Checagem estática de tipos TypeScript
npm run compile

# Gera pacotes .zip para publicação nas lojas de extensões
npm run zip             # Pacote .zip para Chrome Web Store
npm run zip:firefox     # Pacote .zip para Firefox AMO
```

---

## 🏗️ Arquitetura do Projeto

```
audio-transcriber/
├── entrypoints/
│   ├── background.ts        # Service Worker / Gerenciador de ciclo de vida
│   ├── content.ts           # Script injetado no WhatsApp Web (DOM & UI)
│   ├── offscreen/           # Motor de IA dedicado (Transformers.js + Whisper)
│   │   ├── index.html
│   │   └── main.ts
│   └── popup/               # Interface de configurações da extensão
│       ├── index.html
│       └── main.ts
├── assets/
│   └── content.css          # Estilos do botão e caixa de texto (Light & Dark)
├── public/
│   ├── inject.js            # Interceptor no contexto nativo da página
│   ├── icon.svg             # Ícone vetorial da extensão
│   ├── icon-*.png           # Ícones renderizados
│   └── wasm/                # Binários do ONNX Runtime WebAssembly locais
├── utils/
│   ├── audio.ts             # Decodificação e resampling Web Audio API (PCM 16kHz)
│   ├── db.ts                # Armazenamento compartilhado de transcrições
│   ├── storage.ts           # Gerenciamento de configurações e fallback de storage
│   └── types.ts             # Tipos TypeScript compartilhados
└── wxt.config.ts            # Configuração do framework WXT
```

---

## 📄 Licença & Agradecimentos

Distribuído sob a licença **MIT**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

- **[OpenAI Whisper](https://github.com/openai/whisper):** Modelo de reconhecimento automático de fala de ponta a ponta (Licença MIT).
- **[Transformers.js](https://github.com/huggingface/transformers.js) & [ONNX Community](https://huggingface.co/onnx-community):** Portabilidade do modelo Whisper para execução local em navegadores via WebAssembly e WebGPU (Licença Apache 2.0).


