# @entegrasyonik/chat — Otopilot sohbet arayüzü (TEK önyüz)

ADR-0034 · Sözleşme: `docs/cloud-contracts/CHAT_UI_CONTRACT.md` · Kullanıcı kararları K21, K36–K39.
Web uygulaması, backoffice ve Electron masaüstü (aynı web derlemesi) bu paketi kullanır. Derleme adımı yok; kaynak olarak
tüketilir. Yerleşim kararı (web): `docs/PLACEMENT.md`. İnceleme görselleri: `docs/review/` (1440 + 390, açık + koyu).

| Giriş | İçerik |
|---|---|
| `@entegrasyonik/chat` | Bileşenler (`ChatPanel`, `ChatProviderSetup`, …), `createChatController` / `provideChat` / `useChat`, host API, `transition` (durum makinesi), i18n |
| `@entegrasyonik/chat/brand` | `CHAT_PRODUCT = { name: 'Otopilot', slug: 'otopilot' }`, `CHAT_ICON` — ürün adının TEK kaynağı |
| `@entegrasyonik/chat/controller` | Yalnız denetleyici (bileşensiz; kabuk paketine hafif giriş) |
| `@entegrasyonik/chat/protocol` | `chat/v1` zod şemaları + tipler (KANONİK `src/protocol/v1.ts`, yalnız `zod@3.25.76`) |
| `@entegrasyonik/chat/transports/sse` | `createSseTransport({ baseUrl, fetchImpl?, headers?, locale? })` |
| `@entegrasyonik/chat/transports/mock` | `createMockTransport({ config?, scenarios?, speed?, clock? })` — §6 senaryoları |
| `@entegrasyonik/chat/testing` | `createTestChat()` (mock + boş host) |

## Kurulum (host + taşıyıcı)

```ts
import { createChatController, ChatPanel } from '@entegrasyonik/chat'
import { createSseTransport } from '@entegrasyonik/chat/transports/sse'

const controller = createChatController({
  transport: createSseTransport({ baseUrl: `${apiBase}/agent` }),   // backoffice: `${apiBase}/admin-api/agent`
  host: {
    surface: 'app',
    locale: () => 'tr',
    resolveLink: (link) => /* screens.ts → { href, open } | null */ null,
    formatDefaults: () => ({ currency: 'TRY', timeZone: 'Europe/Istanbul' }),
    // isteğe bağlı: t, track, localTools (Electron, DESK-04), status, linkForEntity, settingsLink, onUnauthenticated
  },
})
```

```vue
<ChatPanel :controller="controller" mode="side" @close="…" @expand="…" />
<ChatProviderSetup :api="controller.transport.setup" variant="settings" />
```

Denetleyici uygulama düzeyinde TEK örnektir; çıkış / tenant / impersonation değişiminde `dispose()` + yeni örnek.
Web örneği: `frontend/src/chat/otopilotStore.ts`.

## Parça ekleme kuralı

1. Protokol değişikliği **yerel iştir** (`protocol/v1.ts` bulutta değiştirilmez; backend kopyasıyla eşitlik testi).
   Eklemeli değişiklik aynı dosyada, kırıcı değişiklik `v2.ts`.
2. Yeni parça: şema (`.strict()`, `max()` sınırları) → `KNOWN_PART_SCHEMAS` + `PART_TYPES` → `components/parts/Part<Ad>.vue`
   → `PartRenderer` haritası → mock senaryosu → birim testi (render, boş/sınır, `resolveLink → null`) + axe (tezgâh).
3. Bilinmeyen tür istemcide `PartUnknown` ile çizilir (ileri uyum); içerik ASLA çizilmez.
4. Görsel dil yalnız `@entegrasyonik/ui` token/bileşenleri; `ui` paketine değişiklik yapılmaz (gerekirse burada yerel bileşen).

## Kurallar (statik test + eslint + mandallar)

- `v-html` / `innerHTML` YOK — markdown `markdown-it` ile yalnız ayrıştırılır, token → VNode izinli listeden (§4.3).
- "Asistan", "Assistant", "Copilot" dizgeleri yasak; ürün adı yalnız `CHAT_PRODUCT` (küçük harfli `'assistant'` yalnız
  sözleşmedeki mesaj rolü kimliğidir).
- İçe aktarma yönü: `chat` → `@/` ve backoffice YASAK; `ui` → `chat` YASAK.
- API anahtarı yalnız `ChatProviderSetup`'ın yerel alanında; depoya/denetleyiciye/sohbete yazılmaz; kayıttan sonra silinir.
- Telemetri (`host.track`) yalnız olay adı + sayısal/kapalı alanlar; sohbet metni ve PII gönderilmez.
- Mandallar (`style` / `pattern` / `no-console` / `typecheck`) `packages/chat/src` kökünü tarar, taban 0.

## Testler

```bash
npm run test:chat                     # paket birim testleri (vitest + happy-dom)
npx playwright test e2e/specs/otopilot*.spec.ts --update-snapshots=missing
OTOPILOT_REVIEW_CAPTURE=1 npx playwright test e2e/specs/otopilot-review.spec.ts --project=chromium-desktop   # docs/review
```

Geliştirme: `localStorage['ek-chat-mock'] = 'setup-required'` (yalnız DEV) ya da `VITE_CHAT_TRANSPORT=mock`;
tezgâh `/dev/otopilot?theme=dark&ask=onay%20bekleyen%20siparişler`.
