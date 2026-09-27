FROM node:24.21.0-bookworm-slim AS base

WORKDIR /app

RUN npm install --global npm@11.19.0 --ignore-scripts --no-audit --no-fund \
    && test "$(npm --version)" = "11.19.0"

FROM base AS build

COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .
RUN npm run typecheck:ts6 && npm run build:server

FROM base AS runtime

ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

COPY --from=build /app/dist-server ./dist-server

USER node

EXPOSE 8787

CMD ["node", "dist-server/server.js"]
