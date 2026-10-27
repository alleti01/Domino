# The Domino site (landing page + console) as a static build, for Railway.
# The recorded runs in samples/ are bundled into the build; nothing runs server-side.

FROM node:22-alpine AS build
WORKDIR /app/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui/ ./
COPY samples/ /app/samples/
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/ui/dist /srv
# Railway sets PORT; the Caddyfile listens on it (8080 when run elsewhere).
EXPOSE 8080
