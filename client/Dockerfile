FROM node:18-alpine AS builder

WORKDIR /app

ARG API_URL=http://localhost:3000
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

EXPOSE 8081

ENV NODE_ENV=production
ENV PORT=8081
CMD ["node", "server.js"]
