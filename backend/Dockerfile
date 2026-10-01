# ADR-0006 Karar 3/7: tek imaj, rol `APP_ROLE=web|worker|all` (varsayılan `all`) ortam değişkeninden seçilir
# (bkz. `entegrasyonik.ts`, `.env.example`). Entegrasyon başına ayrı imaj YOK (bilinçli sapma, ADR'de gerekçeli).
# MongoDB bu imaja/derlemeye dahil DEĞİL — bağlantı `DB_URL`/`LOCAL_DB_URL` env'inden kurulur (CLAUDE.md kural 5).

# ---- Stage 1: build (bağımlılıklar + derleme; native modüller burada derlenir) ----
FROM node:20-alpine AS builder
WORKDIR /usr/src/app

# bcrypt/sharp/kerberos/snappy/mongodb-client-encryption/@mongodb-js/zstd alpine (musl) için prebuilt ikili
# bulamazsa kaynaktan derler; derleme araçları SADECE bu aşamada bulunur. `krb5-dev` (gssapi/gssapi.h) `kerberos`
# paketi (mongodb sürücüsünün isteğe bağlı GSSAPI kimlik doğrulama bağımlılığı) için GEREKLİ — Alpine resmi
# Node imajında ÖN TANIMLI DEĞİL, docker build ile doğrulanarak bulundu.
RUN apk add --no-cache python3 make g++ krb5-dev

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# `npm run build`: rimraf dist/ && tsc --build && tsc-alias -> gerçek çıktı: dist/entegrasyonik.js (bkz. package.json)
RUN npm run build

# Runtime imajına yalnızca üretim bağımlılıkları taşınır (derlenmiş native ikililer korunur; devDependencies silinir).
RUN npm prune --omit=dev

# ---- Stage 2: runtime (yalnızca dist + üretim node_modules; derleme araçları/kaynak/testler YOK) ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY --from=builder --chown=node:node /usr/src/app/package.json ./package.json
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/dist ./dist

USER node
EXPOSE 5001

# ADR-0006 Karar 5: `/health` her zaman 200 (liveness); bağımlılık kontrolü yapmaz. Ayrı ağ aracı (curl/wget)
# EKLEMEMEK için Node'un kendi http istemcisiyle kontrol edilir. `SERVER_PORT` `worker` rolünde de aynı env'i kullanır.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.SERVER_PORT||5001,path:'/health',timeout:3000},(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/entegrasyonik.js"]
