// @vitest-environment happy-dom
// BO-WDG: useLeaveGuard — kaydedilmemiş değişiklikle ayrılırken onay (yönlendirici) + `beforeunload`; temizken sormaz;
// diyalog Esc ile kapanırsa sayfada kalır; `allow()` kayıttan sonraki tek gezintiyi sormadan geçirir.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useLeaveGuard, type LeaveGuard } from '../src/composables/useLeaveGuard'

const flush = () => new Promise((r) => setTimeout(r, 0))

async function setup() {
  const dirty = ref(false)
  let guard!: LeaveGuard
  const Form = defineComponent({
    setup() {
      guard = useLeaveGuard(dirty)
      return () => h('p', 'form')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/form', component: Form },
      { path: '/other', component: { render: () => h('p', 'other') } },
    ],
  })
  await router.push('/form')
  const w = mount(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] }, attachTo: document.body })
  await router.isReady()
  await flush()
  return { dirty, router, w, guard: () => guard }
}

describe('useLeaveGuard', () => {
  it('temizken sormadan gezinir', async () => {
    const { router, guard, w } = await setup()
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/other')
    expect(guard().open.value).toBe(false)
    w.unmount()
  })

  it('kirliyken sorar; "Sayfada kal" (cancel) gezintiyi iptal eder, onay geçirir', async () => {
    const { dirty, router, guard, w } = await setup()
    dirty.value = true
    const nav = router.push('/other')
    await flush()
    expect(guard().open.value).toBe(true)
    guard().cancel()
    await nav
    expect(router.currentRoute.value.path).toBe('/form')

    const nav2 = router.push('/other')
    await flush()
    expect(guard().open.value).toBe(true)
    guard().confirm()
    await nav2
    expect(router.currentRoute.value.path).toBe('/other')
    w.unmount()
  })

  it('diyalog Esc / dış tıkla kapanırsa (open=false) sayfada kalır', async () => {
    const { dirty, router, guard, w } = await setup()
    dirty.value = true
    const nav = router.push('/other')
    await flush()
    guard().open.value = false
    await nextTick()
    await nav
    expect(router.currentRoute.value.path).toBe('/form')
    w.unmount()
  })

  it('allow(): sonraki tek gezinti sormadan geçer', async () => {
    const { dirty, router, guard, w } = await setup()
    dirty.value = true
    guard().allow()
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/other')
    expect(guard().open.value).toBe(false)
    w.unmount()
  })

  it('ask(): sayfa içi "Vazgeç" düğmesi için aynı soru; temizken hemen true', async () => {
    const { dirty, guard, w } = await setup()
    await expect(guard().ask()).resolves.toBe(true)
    dirty.value = true
    const answer = guard().ask()
    expect(guard().open.value).toBe(true)
    guard().confirm()
    await expect(answer).resolves.toBe(true)
    w.unmount()
  })

  it('beforeunload: yalnız kirliyken varsayılan engellenir', async () => {
    const { dirty, w } = await setup()
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    dirty.value = true
    const ev = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    w.unmount()
    // Sayfa kapandıktan sonra dinleyici kalmaz.
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })
})
