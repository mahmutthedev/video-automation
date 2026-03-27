FROM node:20-alpine

# ffmpeg-static bundles its own binary but needs these for it to run on Alpine
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build the React frontend
RUN npm run build

# Persistent data directories
RUN mkdir -p uploads/hooks uploads/rests output

EXPOSE 3001

CMD ["npm", "run", "start"]
