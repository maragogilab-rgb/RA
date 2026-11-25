# Regras para o Claude neste projeto

- Seja econômico: respostas curtas, sem repetir o que já foi dito, sem resumos longos no fim.
- Leia só os trechos de arquivo necessários (grep antes de abrir arquivos inteiros).
- Não crie subagentes nem use pesquisa web sem necessidade clara.
- Não use conectores (Gmail, Drive, Agenda, Supermetrics, Adobe, Canva, Figma) a menos que o pedido precise deles.
- Projeto: ERP Node 22 sem dependências (`npm test` roda os testes). Textos em português do Brasil.
