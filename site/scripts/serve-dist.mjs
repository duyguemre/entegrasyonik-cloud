// Yerel statik sunucu — E2E (Playwright) ve Lighthouse için. `astro preview`'dan farkı:
//   1) `dist/_headers` UYGULANIR → CSP gerçekten tarayıcıda zorlanır (üretim davranışı),
//   2) brotli/gzip sıkıştırma (Lighthouse/JS-boyutu gerçekçi),
//   3) bilinmeyen yol → 404.html + 404 durum kodu.
// Kullanım: node scripts/serve-dist.mjs --dir dist --port 4381 [--host 127.0.0.1]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { parseHeadersFile, pathMatches } from '../src/lib/headers.mjs'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
}
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.txt', '.xml', '.json'])

export function startServer({ dir, port, host = '127.0.0.1' }) {
  const root = path.resolve(dir)
  const headersFile = path.join(root, '_headers')
  const blocks = fs.existsSync(headersFile) ? parseHeadersFile(fs.readFileSync(headersFile, 'utf8')) : []
  const cache = new Map()

  const resolveFile = (pathname) => {
    const clean = decodeURIComponent(pathname).replace(/\0/g, '')
    const candidates = [clean, path.posix.join(clean, 'index.html'), `${clean}.html`]
    for (const c of candidates) {
      const abs = path.join(root, c)
      if (!abs.startsWith(root)) return undefined // yol kaçışı
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs
    }
    return undefined
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    let file = resolveFile(url.pathname)
    let status = 200
    if (!file) {
      file = path.join(root, '404.html')
      status = 404
    }
    const ext = path.extname(file)
    const headers = { 'Content-Type': MIME[ext] ?? 'application/octet-stream' }
    for (const block of blocks) {
      if (pathMatches(block.path, url.pathname)) Object.assign(headers, block.headers)
    }
    let body = cache.get(file)
    if (!body) {
      body = fs.readFileSync(file)
      cache.set(file, body)
    }
    if (COMPRESSIBLE.has(ext)) {
      const accept = String(req.headers['accept-encoding'] ?? '')
      const encoding = accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : undefined
      if (encoding) {
        const key = `${file}::${encoding}`
        let packed = cache.get(key)
        if (!packed) {
          packed = encoding === 'br' ? zlib.brotliCompressSync(body) : zlib.gzipSync(body)
          cache.set(key, packed)
        }
        body = packed
        headers['Content-Encoding'] = encoding
        headers['Vary'] = 'Accept-Encoding'
      }
    }
    headers['Content-Length'] = body.length
    res.writeHead(status, headers)
    res.end(req.method === 'HEAD' ? undefined : body)
  })

  return new Promise((resolve) => server.listen(port, host, () => resolve(server)))
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > -1 ? process.argv[i + 1] : fallback
  }
  const dir = arg('dir', 'dist')
  const port = Number(arg('port', process.env.E2E_PORT ?? 4381))
  const host = arg('host', '127.0.0.1')
  if (!fs.existsSync(path.resolve(dir))) {
    console.error(`Dizin yok: ${dir} — önce derleyin.`)
    process.exit(1)
  }
  await startServer({ dir, port, host })
  console.log(`serve-dist: http://${host}:${port} (${path.resolve(dir)})`)
}
