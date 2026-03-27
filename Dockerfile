FROM node:20-alpine

# ffmpeg-static bundles its own binary but needs these for it to run on Alpine
RUN apk add --no-cache ffmpeg

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
