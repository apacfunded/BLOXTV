FROM node:22-bookworm-slim
# ffmpeg + python assemble the finished episodes; fonts for the captions
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=3000
EXPOSE 3000
VOLUME /app/data
CMD ["node", "server.js"]
