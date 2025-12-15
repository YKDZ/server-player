FROM node:24-slim

# Allow using a custom APT mirror
ARG APT_MIRROR
RUN if [ -n "$APT_MIRROR" ]; then \
    sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
    fi && \
    sed -i "s|Components: main|Components: main contrib non-free non-free-firmware|g" /etc/apt/sources.list.d/debian.sources

# Install ffmpeg and intel vaapi drivers
RUN apt-get update && apt-get install -y ffmpeg intel-media-va-driver-non-free && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install

COPY . .

RUN pnpm build

EXPOSE 3000

CMD ["npx", "tsx", "server/index.ts"]
