FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/storage/invoices && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm", "run", "start:production"]
