FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy source
COPY src/ ./src/
COPY tsconfig.json ./

# Build
RUN pnpm build

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
