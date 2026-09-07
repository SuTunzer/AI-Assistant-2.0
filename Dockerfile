FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.server.json ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN npx tsc -p tsconfig.server.json
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/server ./dist/server
COPY package.json ./
USER node
EXPOSE 8080
CMD ["node", "dist/server/apps/api/src/index.js"]
