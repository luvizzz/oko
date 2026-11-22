# build com Node oficial em container: imune aos bloqueios de postinstall do npm da máquina do Pedro
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# >=1.31.9: corrigi NGINX2Root (CVE-2026-121810/123007/123633/123634/113425)
FROM nginx:1.31-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
