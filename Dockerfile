FROM node:22-alpine AS base
WORKDIR /app
COPY package.json yarn.lock ./


FROM base AS deps
RUN yarn install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn prisma generate
RUN yarn build

FROM base AS production
ENV NODE_ENV=production
RUN yarn install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/src/main.js"]