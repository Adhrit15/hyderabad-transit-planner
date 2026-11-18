# Build context is the repo root, because the frontend imports ../backend/.../data/*.json
FROM node:22-alpine AS build
WORKDIR /repo
COPY backend/src/main/resources/data backend/src/main/resources/data
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL
RUN cd frontend && npm run build

FROM nginx:1.27-alpine
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
EXPOSE 80
