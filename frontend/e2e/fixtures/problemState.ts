// Ortak hata durumu (EkErrorState → EkProblemState) için dayanıklı doğrulama.
// DS-v2 Aşama 6b'den beri "<ne oldu> — <ne yapılmalı>" tek cümlesi İKİ satıra bölünür: başlık (h3, grup adı) +
// eylem paragrafı (ilk harf büyük). Tek parça metinle `getByText` artık eşleşmez; bu yardımcı aynı mesajı
// rol/ad tabanlı seçicilerle doğrular. Ham hata/HTTP kodu sızıntısı ayrıca çağıran testte kontrol edilir.
import { expect, type Locator, type Page } from '@playwright/test'

/** EkErrorState'teki bölme kuralının aynısı (tire varsa başlık + eylem). */
export function splitProblemMessage(message: string): { title: string; action?: string } {
  const m = message.split(/\s+[—–-]\s+/)
  if (m.length < 2) return { title: message }
  return { title: m[0], action: m.slice(1).join(' — ').replace(/^./, (c) => c.toLocaleUpperCase('tr-TR')) }
}

/** Hata durumu grubunu (role=group, adı = başlık) döner. */
export function problemState(scope: Page | Locator, message: string): Locator {
  const { title } = splitProblemMessage(message)
  return scope.getByRole('group', { name: title, exact: true })
}

/** Başlık + eylem satırı + (varsayılan) "Tekrar dene" görünür. */
export async function expectProblemState(
  scope: Page | Locator,
  message: string,
  opts: { timeout?: number; retry?: boolean } = {},
): Promise<Locator> {
  const { title, action } = splitProblemMessage(message)
  const group = problemState(scope, message)
  await expect(group.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: opts.timeout })
  if (action) await expect(group.getByText(action, { exact: true })).toBeVisible()
  if (opts.retry !== false) await expect(group.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
  return group
}
