# 🎙️ Transcritor de Áudio para WhatsApp Web (IA Local & Privada)

Uma extensão de navegador para **Google Chrome** e **Mozilla Firefox** que transcreve mensagens de voz do WhatsApp Web diretamente no seu navegador, utilizando inteligência artificial local (**Transformers.js** / **ONNX Runtime Web** com **Whisper**).

---

## 🔒 100% Privado e Local
- **Zero envio para servidores externos:** Todo o áudio e a transcrição são processados exclusivamente na CPU / WebGPU da sua própria máquina.
- **Funcionamento Offline:** Após o download inicial dos pesos do modelo (armazenados em cache no navegador), a transcrição funciona sem conexão com servidores de IA.
- **Leve para computadores modestos:** Utiliza por padrão o modelo quantizado `Whisper-Tiny` (~75MB), com opção para `Whisper-Base` (~140MB) para maior precisão.
- **Cache Inteligente:** As mensagens transcritas são salvas no banco de dados local (`IndexedDB`), evitando reprocessamento ao rolar o chat ou recarregar a página.

---

## 🚀 Como Testar a Extensão no Navegador

### 🟢 No Google Chrome / Brave / Edge:
1. Abra o navegador e digite na barra de endereços: `chrome://extensions`
2. No canto superior direito, ative o **Modo do desenvolvedor** (Developer mode).
3. Clique no botão **Carregar sem compactação** (Load unpacked).
4. Selecione a pasta:
   ```
   audio-transcriber/.output/chrome-mv3
   ```
5. Pronto! O ícone da extensão aparecerá na sua barra de extensões.

---

### 🦊 No Mozilla Firefox:
1. Abra o Firefox e digite na barra de endereços: `about:debugging#/runtime/this-firefox`
2. Clique no botão **Carregar extensão temporária...** (Load Temporary Add-on...).
3. Navegue até a pasta do projeto e selecione o arquivo `manifest.json` dentro de:
   ```
   audio-transcriber/.output/firefox-mv2/manifest.json
   ```
   *(Ou se preferir MV3: `audio-transcriber/.output/firefox-mv3/manifest.json`)*
4. Pronto! A extensão estará carregada e ativa.

---

## 📖 Como Usar Passo a Passo

1. **Baixar o Modelo de IA:**
   - Clique no ícone do **Transcritor WhatsApp** na barra de ferramentas do seu navegador.
   - Escolha o modelo desejado (o `Whisper Tiny` já vem selecionado por padrão e é o mais recomendado para computadores modestos).
   - Clique em **"📥 Baixar Modelo Agora"** e aguarde a barra de progresso atingir 100%.
   - O status mudará para **"Pronto (Offline)"**. Você só precisa fazer este download uma única vez!

2. **Transcrever Áudios no WhatsApp Web:**
   - Acesse [web.whatsapp.com](https://web.whatsapp.com).
   - Em qualquer balão de áudio recebido ou enviado, você verá um botão discreto **"🎙️ Transcrever"**.
   - Clique no botão: a extensão extrairá o áudio, decodificará para PCM 16kHz e executará a inferência Whisper localmente.
   - O texto transcrito aparecerá logo abaixo do player, acompanhado de um botão **"📋 Copiar"**.

3. **Gerenciar Configurações & Cache:**
   - No popup da extensão, você pode alterar o idioma padrão (Português, Detecção Automática, Inglês, Espanhol).
   - Pode acompanhar quantos áudios foram transcritos e, se desejar, clicar em **"Limpar histórico de transcrições"**.

---

## 🛠️ Comandos de Desenvolvimento

Caso deseje modificar ou continuar desenvolvendo a extensão:

```bash
# Executa servidor de desenvolvimento com auto-reload
npm run dev             # Para Chrome
npm run dev:firefox     # Para Firefox

# Compila para produção
npm run build           # Gera .output/chrome-mv3
npm run build:firefox   # Gera .output/firefox-mv2

# Checagem de tipos TypeScript
npm run compile

# Gera pacotes .zip prontos para distribuição
npm run zip
```

