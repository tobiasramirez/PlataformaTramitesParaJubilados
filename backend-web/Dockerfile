FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm install --omit=dev
COPY . .
USER node
EXPOSE 3002
CMD ["node", "src/index.js"]