FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY test ./test

ENV NODE_ENV=production
VOLUME ["/app/data"]

CMD ["node", "src/index.js", "start"]
