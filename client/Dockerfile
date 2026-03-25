FROM node:25-alpine AS builder

WORKDIR /app

ARG API_URL=http://localhost:3824
ENV API_URL=$API_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/build ./build
COPY server.js ./

EXPOSE 8193

ENV NODE_ENV=production
ENV PORT=8193
CMD ["node", "server.js"]
