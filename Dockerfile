FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

RUN mkdir -p /app/data

VOLUME ["/app/data"]

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
