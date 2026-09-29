// R9b / H-01 — oturum-bağlı durum sıfırlama kayıt defteri.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerStoreReset, resetAllStores, registeredResetIds } from '../../src/stores/resetRegistry'

describe('resetRegistry', () => {
  beforeEach(() => {
    // test izolasyonu: önceki testlerin kayıtlarını etkisiz hale getir
    for (const id of registeredResetIds()) registerStoreReset(id, () => {})
  })

  it('kayıtlı tüm sıfırlayıcıları çalıştırır', () => {
    const calls: string[] = []
    registerStoreReset('a', () => calls.push('a'))
    registerStoreReset('b', () => calls.push('b'))
    expect(resetAllStores()).toEqual([])
    expect(calls).toEqual(['a', 'b'])
  })

  it('aynı id yeniden kaydedilirse üzerine yazılır (store yeniden örneklenirse tek kopya)', () => {
    let n = 0
    registerStoreReset('dup', () => { n += 1 })
    registerStoreReset('dup', () => { n += 10 })
    resetAllStores()
    expect(n).toBe(10)
  })

  it('biri hata verse de diğerleri çalışır ve hata veren id döner', () => {
    const calls: string[] = []
    registerStoreReset('bad', () => { throw new Error('boom') })
    registerStoreReset('good', () => calls.push('good'))
    expect(resetAllStores()).toEqual(['bad'])
    expect(calls).toEqual(['good'])
  })
})

describe('oturum-bağlı durum sahipleri kayıt defterine bağlı (statik kapı)', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src')
  const expected: Record<string, string> = {
    'stores/brandsStore.ts': 'brandsStore',
    'stores/categoriesStore.ts': 'categoriesStore',
    'stores/choicesStore.ts': 'choicesStore',
    'stores/hashtagsStore.ts': 'hashtagsStore',
    'stores/integrationStore.ts': 'integrationStore',
    'stores/notificationDrawer.ts': 'notificationDrawer',
    'stores/site/attributeMapping.ts': 'attributeMappingStore',
    'stores/site/menu.ts': 'menu',
    'stores/workspace.ts': 'workspace',
    'composables/user.ts': 'userSession',
  }
  it.each(Object.entries(expected))('%s -> registerStoreReset(%s)', (file, id) => {
    const src = readFileSync(path.join(root, file), 'utf8')
    expect(src).toContain(`registerStoreReset('${id}'`)
  })

  it('giriş ekranı açıldığında resetAllStores çağrılır', () => {
    const src = readFileSync(path.join(root, 'components/login/LoginComponent.vue'), 'utf8')
    expect(src).toMatch(/onMounted\(\(\) => \{ resetAllStores\(\) \}\)/)
  })
})
