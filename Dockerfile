FROM node:20-slim

# Install ffmpeg with full codec/filter support (includes libfreetype for drawtext)
RUN apt-get update && apt-get install -y ffmpeg --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build the React frontend
RUN npm run build

# Default data dir for local/fallback use
RUN mkdir -p /app/data/uploads/hooks /app/data/uploads/rests /app/data/output

ENV DATA_DIR=/app/data

EXPOSE 3001

CMD ["npm", "run", "start"]
