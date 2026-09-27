# Builds the React frontend and serves it with Caddy, which also reverse-proxies
# /api and /socket.io to the backend and handles HTTPS automatically.
FROM node:20-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000
COPY frontend/ ./
# frontend/.env (REACT_APP_* values) is read by the build if present.
ENV GENERATE_SOURCEMAP=false \
    NODE_OPTIONS=--max-old-space-size=1536
RUN yarn build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/build /srv
