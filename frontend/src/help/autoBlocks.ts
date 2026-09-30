/**
 * frontend/src/help/autoBlocks.ts — makalelerdeki OTOMATİK blokların verisi. Elle kopya YOK:
 *  - `shortcuts`          → `navigation/shortcuts.ts` kayıt defteri (kabuğun dinleyicisi, ipuçları ve `?` diyaloğu ile aynı kaynak)
 *  - `integrationErrors`  → `composables/useIntegrationError.ts` sınıflandırıcısının kullanıcıya gösterdiği metinler
 *                           (A6a entegrasyon hata paneli ile birebir; sınıflandırıcı sentetik sinyalle çağrılır)
 *  - `channelGuides`      → `help/channels.ts` (site `connect.ts` ile eşliği test korur)
 */
import { SHORTCUT_GROUPS, type ShortcutDefinition } from '@/navigation/shortcuts'
import { classifyIntegrationError, type IntegrationErrorInfo } from '@/composables/useIntegrationError'
import { HELP_CHANNELS, channelSteps, type HelpChannelGuide } from './channels'

export interface ShortcutRow {
  group: string
  keys: string[]
  label: string
  aliases: string[][]
  inEditable: boolean
}

export function shortcutRows(): ShortcutRow[] {
  return SHORTCUT_GROUPS.flatMap((g) =>
    g.items.map((s: ShortcutDefinition) => ({
      group: g.label,
      keys: [...s.keys],
      label: s.label,
      aliases: (s.aliases ?? []).map((a) => [...a]),
      inEditable: !!s.allowInEditable,
    })),
  )
}

export interface IntegrationErrorRow {
  id: string
  /** Kullanıcının panelde gördüğü başlık (ör. "Pazaryeri yanıt vermedi"). */
  title: string
  /** Hangi durumda görülür (teknik sinyalin sade dili). */
  when: string
  cause: string
  action: string
  /** Panelde "Tekrar dene" / "Entegrasyon ayarına git" görünür mü. */
  retry: boolean
  settings: boolean
}

const SAMPLES: Array<{ id: string; when: string; resp: unknown }> = [
  { id: 'timeout', when: 'Pazaryeri zamanında yanıt vermediğinde', resp: { isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 0ms exceeded' } },
  { id: 'server', when: 'Sunucu ya da pazaryeri hata döndürdüğünde', resp: { isAxiosError: true, response: { status: 500, data: {} } } },
  { id: 'rate', when: 'Kısa sürede çok fazla istek yapıldığında', resp: { isAxiosError: true, response: { status: 429, data: {} } } },
  { id: 'auth', when: 'Oturum süresi dolduğunda ya da yetki olmadığında', resp: { isAxiosError: true, response: { status: 403, data: {} } } },
  { id: 'notFound', when: 'İstenen kayıt bulunamadığında', resp: { isAxiosError: true, response: { status: 404, data: {} } } },
  { id: 'network', when: 'İnternet bağlantısı ya da sunucu erişimi olmadığında', resp: { isAxiosError: true, message: 'Network Error' } },
  { id: 'empty', when: 'Pazaryeri boş liste döndürdüğünde', resp: [] },
  { id: 'unknown', when: 'Yanıt beklenmeyen biçimde geldiğinde', resp: { unexpected: true } },
]

export function integrationErrorRows(platformTitle = 'Pazaryeri'): IntegrationErrorRow[] {
  return SAMPLES.map(({ id, when, resp }) => {
    const info = classifyIntegrationError(resp, { service: 'help', platformTitle, subject: 'categories' }) as IntegrationErrorInfo
    return { id, title: info.title, when, cause: info.cause, action: info.action, retry: info.retryable, settings: info.canOpenSettings }
  })
}

export interface ChannelGuideRow extends HelpChannelGuide {
  steps: string[]
}

export function channelGuideRows(): ChannelGuideRow[] {
  return HELP_CHANNELS.map((c) => ({ ...c, credentials: [...c.credentials], steps: channelSteps(c.kind) }))
}

/** Arama dizini için otomatik blokların düz metni. */
export function autoBlockSearchText(): Record<'shortcuts' | 'integrationErrors' | 'channelGuides', string[]> {
  return {
    shortcuts: shortcutRows().map((r) => `${r.keys.join('+')} ${r.label}`),
    integrationErrors: integrationErrorRows().map((r) => `${r.title}. ${r.cause} ${r.action}`),
    channelGuides: channelGuideRows().map((r) => `${r.name}: ${r.credentials.join(', ')}. ${r.note ?? ''}`),
  }
}
