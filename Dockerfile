FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/server ./server

RUN rm -rf ./node_modules/.prisma ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

RUN if find ./node_modules/.prisma -name 'libquery_engine-linux-musl.so.node' | grep -q .; then echo 'Unexpected linux-musl Prisma engine found in runtime image'; exit 1; fi \
  && find ./node_modules/.prisma -name 'libquery_engine-debian-openssl-*.so.node' | grep -q .

USER nextjs

EXPOSE 3000
EXPOSE 3001

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
