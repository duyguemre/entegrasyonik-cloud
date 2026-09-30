// A13 — müşteri kartı: KVKK maskeleme, boş metrik, adres ayrımı (saf mantık) + kart bileşenlerinin statik sözleşmesi.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ANONYMIZED, addressView, contactValue, customerKind, customerSince, displayName, initials, maskEmail, maskPhone,
  maskTaxNumber, metricSummary, returnRatePercent, sameAddress, splitCustomerAddresses,
} from '@/components/customer/customerCard'

const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

describe('maskeleme (KVKK: varsayılan maskeli)', () => {
  it('telefon: alan kodu + son 2 hane görünür', () => {
    expect(maskPhone('5551112233')).toBe('+90 (555) ••• •• 33')
    expect(maskPhone('+90 555 111 22 33')).toBe('+90 (555) ••• •• 33')
    expect(maskPhone('05551112233')).toBe('+90 (555) ••• •• 33')
  })
  it('telefon: tanınmayan biçimde yalnız son 2 hane', () => {
    expect(maskPhone('12345')).toBe('••• 45')
    expect(maskPhone('')).toBeNull()
    expect(maskPhone(null)).toBeNull()
  })
  it('e-posta: yerel kısmın ilk 2 (kısa adda 1) harfi + alan adı', () => {
    expect(maskEmail('ayse.yilmaz@e2e.invalid')).toBe('ay•••@e2e.invalid')
    expect(maskEmail('ali@x.com')).toBe('a•••@x.com')
    expect(maskEmail('bozuk')).toBe('b•••')
    expect(maskEmail(undefined)).toBeNull()
  })
  it('vergi / TC no: yalnız son 3 hane', () => {
    expect(maskTaxNumber('1234567890')).toBe('•••••••890')
    expect(maskTaxNumber('11111111110')).toBe('••••••••110')
  })
  it('maskeli değer tam değeri hiçbir parçada içermez', () => {
    for (const [kind, raw] of [['phone', '5551112233'], ['email', 'ayse.yilmaz@e2e.invalid'], ['tax', '1234567890']] as const) {
      const v = contactValue(kind, raw)
      expect(v.display).not.toBeNull()
      expect(v.display).not.toContain(kind === 'phone' ? '111 22' : kind === 'email' ? 'yilmaz' : '4567')
      expect(v.maskable).toBe(true)
    }
  })
  it('göster → açık değer; kopya her zaman tam değer', () => {
    const closed = contactValue('phone', '555 111 22 33')
    const open = contactValue('phone', '555 111 22 33', { revealed: true })
    expect(open.display).toBe('+90 (555) 111 22 33')
    expect(closed.copy).toBe('5551112233')
    expect(open.copy).toBe('5551112233')
  })
  it('pazaryerinin maskelediği ve anonimleştirilen değer gösterilmez / kopyalanmaz', () => {
    expect(contactValue('email', 'x@y.z', { sourceMasked: true })).toMatchObject({ display: null, copy: null, hidden: 'marketplace', maskable: false })
    expect(contactValue('phone', ANONYMIZED, { revealed: true })).toMatchObject({ display: null, copy: null, hidden: 'anonymized' })
  })
  it('boş değer: gizli değil, yalnız yok', () => {
    expect(contactValue('email', '')).toMatchObject({ display: null, hidden: null, maskable: false })
  })
})

describe('kimlik', () => {
  it('baş harfler (Türkçe büyük harf) ve ad', () => {
    expect(initials('ilker', 'şahin')).toBe('İŞ')
    expect(initials(ANONYMIZED, ANONYMIZED)).toBe('')
    expect(displayName({ firstName: 'Ayşe', lastName: 'Yılmaz' })).toBe('Ayşe Yılmaz')
    expect(displayName({ firstName: ANONYMIZED, lastName: ANONYMIZED })).toBe('Anonim müşteri')
    expect(displayName(null)).toBe('İsimsiz müşteri')
  })
  it('tür rozeti ve müşteri olma tarihi (yoksa null — uydurma yok)', () => {
    expect(customerKind(true).label).toBe('Kurumsal')
    expect(customerKind(undefined).label).toBe('Bireysel')
    expect(customerSince('2025-03-14T09:00:00.000Z')).toBe('14.03.2025')
    expect(customerSince(undefined)).toBeNull()
  })
})

describe('metrikler (yalnız updateOrderMetrics / updateClaimMetrics alanları)', () => {
  it('projeksiyon metrik göndermiyorsa şerit yok (null) — sıfır uydurulmaz', () => {
    expect(metricSummary(undefined)).toBeNull()
    expect(metricSummary(null)).toBeNull()
  })
  it('sipariş yoksa boş durum; iade oranı hesaplanmaz', () => {
    const s = metricSummary({ totalOrderCount: 0, totalSpent: 0 })!
    expect(s.empty).toBe(true)
    expect(s.returnRate).toBeNull()
    expect(s.items.find((i) => i.key === 'returnRate')!.value).toBeNull()
    expect(s.items.find((i) => i.key === 'lastOrder')!.value).toBeNull()
  })
  it('eksik alan "—" yerine null döner (bileşen boş gösterir)', () => {
    const s = metricSummary({ totalOrderCount: 3 })!
    expect(s.empty).toBe(false)
    expect(s.items.find((i) => i.key === 'spent')!.value).toBeNull()
    expect(s.items.find((i) => i.key === 'returnRate')!.value).toBeNull()
  })
  it('dolu metrikler: tutar, son sipariş, iade oranı + ipuçları', () => {
    const s = metricSummary({ totalOrderCount: 8, totalSpent: 4250.4, totalClaimCount: 1, totalReturnAmount: 349.9, lastOrderDate: '2026-09-25T08:15:00.000Z' })!
    const by = Object.fromEntries(s.items.map((i) => [i.key, i]))
    expect(by.orders.value).toBe('8')
    expect(by.spent.value).toContain('4.250,40')
    expect(by.spent.hint).toContain('349,90')
    expect(by.lastOrder.value).toBe('25.09.2026')
    expect(by.returnRate.value).toBe('%12,5')
    expect(by.returnRate.hint).toBe('1 iade')
    expect(s.returnTone).toBe('success')
  })
  it('backend iade oranı öncelikli; eşik tonları', () => {
    expect(returnRatePercent({ totalOrderCount: 10, totalClaimCount: 1 }, 32)).toBe(32)
    expect(metricSummary({ totalOrderCount: 10 }, 32)!.returnTone).toBe('danger')
    expect(metricSummary({ totalOrderCount: 10 }, 20)!.returnTone).toBe('warning')
  })
})

describe('adresler (fatura / teslimat ayrımı)', () => {
  const home = { title: 'Ev', addressLine: 'Örnek Mah. No:1', city: 'İstanbul', state: 'Kadıköy', isDefaultShipping: true }
  const work = { title: 'İş', addressLine: 'Plaza No:12', city: 'İstanbul', state: 'Ataşehir', isDefaultBilling: true }
  it('varsayılan işaretlerine göre ayrılır', () => {
    const { billing, shipping } = splitCustomerAddresses([home, work])
    expect(billing!.region).toBe('Ataşehir / İstanbul')
    expect(shipping!.region).toBe('Kadıköy / İstanbul')
    expect(sameAddress(billing, shipping)).toBe(false)
  })
  it('tek adres iki rol için de kullanılır ve "aynı" sayılır', () => {
    const { billing, shipping } = splitCustomerAddresses([{ addressLine: 'A', city: 'B', state: 'C' }])
    expect(sameAddress(billing, shipping)).toBe(true)
  })
  it('adres yoksa null; sipariş adresi (addressLine1) de okunur; anonim adres işaretlenir', () => {
    expect(splitCustomerAddresses([])).toEqual({ billing: null, shipping: null })
    expect(addressView({ addressLine1: 'Sanayi Cad.', city: 'İzmir', state: 'Bornova' })!.line).toBe('Sanayi Cad.')
    expect(addressView({ addressLine: ANONYMIZED, city: ANONYMIZED, state: ANONYMIZED })!.anonymized).toBe(true)
  })
})

describe('kart bileşenleri — statik sözleşme', () => {
  const files = ['CustomerAvatar', 'CustomerIdentity', 'CustomerContactList', 'CustomerMetrics', 'CustomerAddresses', 'CustomerBuyerCard']
    .map((n) => [n, src(`src/components/customer/card/${n}.vue`)] as const)
  it('ham renk yok (yalnız semantik token)', () => {
    for (const [name, s] of files) expect(s, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
  it('maskeleme anahtarı aria-pressed taşır, kopya düğmeleri erişilebilir adlı', () => {
    const contact = src('src/components/customer/card/CustomerContactList.vue')
    const reveal = src('src/components/customer/card/CustomerRevealToggle.vue')
    expect(reveal).toMatch(/aria-pressed/)
    expect(reveal).toMatch(/Kişisel verileri göster/)
    expect(contact).toMatch(/action="copy"/)
  })
  it('müşteri detayı: hata boş kayıttan ayrı (EkProblemState), yükleme iskelet', () => {
    const d = src('src/components/customer/CustomerDetailComponent.vue')
    expect(d).toMatch(/<EkProblemState/)
    expect(d).toMatch(/<EkSkeleton/)
    expect(d).not.toMatch(/SADAKAT SKORU/)
  })
})
