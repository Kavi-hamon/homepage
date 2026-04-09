FROM node:20-alpine AS build
WORKDIR /app/homepage

COPY homepage/package*.json ./
RUN npm ci

COPY homepage/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY infra/docker/frontend-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/homepage/dist/homepage/browser/ /usr/share/nginx/html/
# Angular's CSR output uses `index.csr.html` instead of `index.html`.
# Nginx expects `index.html`, so rename it during the image build.
RUN if [ -f /usr/share/nginx/html/index.csr.html ]; then cp /usr/share/nginx/html/index.csr.html /usr/share/nginx/html/index.html; fi

EXPOSE 80
