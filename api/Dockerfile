FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig-paths.js ./
COPY src ./src

RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/build ./build
COPY tsconfig.json tsconfig-paths.js ./

EXPOSE 3824

ENV NODE_ENV=production
CMD ["node", "-r", "./tsconfig-paths.js", "build/index.js"]
