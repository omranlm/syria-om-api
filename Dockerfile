# Admin dashboard (React + Vite): built into /public/admin.
FROM node:22-alpine AS admin
WORKDIR /admin
COPY admin/package*.json ./
RUN npm ci --no-audit --no-fund
COPY admin ./
RUN npm run build

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY test ./test
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY public ./public
COPY --from=admin /public/admin ./public/admin
EXPOSE 3000
CMD ["node", "dist/src/index.js"]
