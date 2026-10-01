/** Güvenli markdown/düz metin görünümü — render fonksiyonu (v-html YOK; bkz. markdown/renderMarkdown.ts). */
import { defineComponent, h, type PropType } from 'vue'
import { renderMarkdown, renderPlain } from '../markdown/renderMarkdown'

export default defineComponent({
  name: 'ChatMarkdownView',
  props: {
    source: { type: String, required: true },
    format: { type: String as PropType<'plain' | 'markdown'>, default: 'markdown' },
  },
  setup(props) {
    return () => h('div', { class: 'ek-chat-md' }, props.format === 'markdown' ? renderMarkdown(props.source) : renderPlain(props.source))
  },
})
