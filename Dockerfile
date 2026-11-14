# Single container: gateway API + dashboard on one port.
#   docker build -t conduit .
#   docker run -p 8787:8787 -v conduit-data:/data -e ADMIN_TOKEN=... -e ANTHROPIC_API_KEY=... conduit
FROM node:22-alpine AS build
WORKDIR /app
COPY core ./core
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
# VITE_API_URL=/ makes the dashboard call the gateway on its own origin.
ARG VITE_API_TOKEN=
RUN cd frontend && VITE_API_URL=/ VITE_API_TOKEN=$VITE_API_TOKEN npm run build
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci
COPY backend ./backend
RUN cd backend && npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production STATIC_DIR=/app/public DATA_DIR=/data PORT=8787
COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/frontend/dist ./public
VOLUME /data
EXPOSE 8787
CMD ["node", "dist/server.js"]
