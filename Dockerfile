FROM node:24.13.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS test
RUN npx playwright install --with-deps chromium webkit
COPY . .
ENV CI=true
CMD ["npm", "run", "check"]

FROM dependencies AS build
COPY . .
ARG VITE_BASE_PATH=./
ENV VITE_BASE_PATH=$VITE_BASE_PATH
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.28.1-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
