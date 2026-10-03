/**
 * Standart liste bantları için bağlam: tablo bir BoSection içindeyse ve bölüm başlığı sayaç (`count`) ya da alt şeridi
 * sayfalama (BoPagination) taşıyorsa, tablonun kendi üst bandı sayıyı, alt bandı kayıt bilgisini TEKRARLAMAZ.
 */
import { onMounted, reactive, ref } from 'vue'

export function useListChrome() {
  const root = ref<HTMLElement | null>(null)
  const ext = reactive({ count: false, pager: false })
  onMounted(() => {
    const sec = root.value?.closest('[data-bo-section]')
    if (!sec) return
    ext.count = !!sec.querySelector(':scope > .bo-section__head .bo-section__count')
    ext.pager = !!sec.querySelector(':scope > .bo-section__foot [data-bo-pagination]')
  })
  return { root, ext }
}
