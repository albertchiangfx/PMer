FROM node:20-alpine

# Chromium runtime for puppeteer-core (合約 PDF 產生器使用)
# font-noto-cjk 解決中文字型；ttf-* 補英文與符號
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      font-noto-cjk

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .
RUN mkdir -p /app/uploads
EXPOSE 3001
CMD ["node", "src/server.js"]
