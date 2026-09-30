/**
 * frontend/src/help/feedback.ts — makale "Faydalı mıydı?" yanıtı. YALNIZ YEREL (backend yok, sunucuya gönderilmez);
 * aynı tarayıcıda tekrar açıldığında verilen yanıt hatırlanır. Depo erişilemezse (gizli mod) yalnız bellekte tutulur.
 */
import { ref } from 'vue'

const KEY = 'ek.help.v1.feedback'
export type HelpVote = 'up' | 'down'

function read(): Record<string, HelpVote> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const votes = ref<Record<string, HelpVote>>(read())

export function useHelpFeedback() {
  function vote(articleId: string, value: HelpVote | null) {
    const next = { ...votes.value }
    if (value) next[articleId] = value
    else delete next[articleId]
    votes.value = next
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // depo yoksa yanıt yalnız bu oturumda kalır
    }
  }
  return { votes, vote, voteOf: (id: string) => votes.value[id] }
}

export function __resetHelpFeedbackForTest() {
  votes.value = read()
}
