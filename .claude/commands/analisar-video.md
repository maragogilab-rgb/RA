---
description: Assiste a um vídeo (link ou arquivo) com o plugin watch e faz a análise para a agência
argument-hint: <link ou caminho do vídeo> [o que analisar]
---

Use a skill `watch` (plugin `watch@claude-video`) para assistir ao vídeo abaixo. Se o plugin não estiver instalado ou faltar ffmpeg/yt-dlp, diga ao usuário o que instalar (no Mac: `brew install python ffmpeg yt-dlp`) e pare.

Vídeo e pedido: $ARGUMENTS

Responda em português, com marcações de tempo (mm:ss), cobrindo o que o usuário pediu. Se ele não pediu nada específico, entregue:

1. **Resumo**: do que se trata, em 2 ou 3 frases.
2. **Gancho**: o que acontece nos 3 primeiros segundos e se prende a atenção.
3. **Estrutura e ritmo**: cortes, trilha, texto na tela, chamada para ação.
4. **Pontos fortes e o que melhorar**: com o momento exato de cada um.
5. **Ideias de post**: 3 sugestões para o quadro de Conteúdo do ERP (título, rede, legenda curta).

Não invente o que não aparece nos quadros ou na transcrição; se a evidência for só de áudio, diga isso.
