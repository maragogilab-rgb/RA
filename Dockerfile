# Imagem para hospedar o ERP (Railway, Render, Fly.io ou qualquer servidor com Docker).
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

# Os dados ficam em /app/data: monte um volume persistente nesse caminho.
# (Volumes de hospedagens como o Railway são montados como root, por isso o processo roda como root.)
RUN mkdir -p /app/data

ENV NODE_ENV=production \
    ERP_DB=/app/data/erp.db \
    ERP_COOKIE_SEGURO=1 \
    ERP_PROXY=1 \
    PORT=3000

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/api/saude || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
