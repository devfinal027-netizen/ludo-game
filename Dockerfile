# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* .eslintrc.json .prettierrc ./
RUN npm install --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]
