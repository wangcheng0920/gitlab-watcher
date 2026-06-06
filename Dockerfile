FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY src/ ./src/
COPY bin/ ./bin/

EXPOSE 3099

CMD ["node", "bin/serve.js"]
