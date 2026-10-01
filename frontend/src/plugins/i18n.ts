import { nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
// MCP-6: `mcp.*` anahtarları ayrı modülde (MCP_UI_CONTRACT §8); yerel dil yüklenince birleştirilir.
import { MCP_MESSAGES } from '@/components/mcp/mcpMessages';

let i18n:any;

export const SUPPORT_LOCALES = ['en', 'tr'];

export function setI18nLanguage(locale:any) {
  loadLocaleMessages(locale);

  if (i18n.mode === 'legacy') {
    i18n.global.locale = locale;
  } else {
    i18n.global.locale.value = locale;
  }

  if(document!=null && document.querySelector('html')!=null) {
    (<any>document).querySelector('html').setAttribute('lang', locale);
  }
  localStorage.setItem('lang', locale);
}

export async function loadLocaleMessages(locale:any) {
  // load locale messages with dynamic import
  const messages = await import(
    /* webpackChunkName: "locale-[request]" */ `./locales/${locale}.json`
  );

  // set locale and locale message
  i18n.global.setLocaleMessage(locale, messages.default);
  const extra = (MCP_MESSAGES as Record<string, object>)[locale];
  if (extra) i18n.global.mergeLocaleMessage(locale, extra);

  return nextTick();
}

export default function setupI18n() {
  if(!i18n) {
    let locale = localStorage.getItem('lang') || 'tr';
    locale = 'tr'
    i18n = createI18n({
      globalInjection: true,
      legacy: false,
      locale: locale,
      fallbackLocale: 'tr'
    });

    setI18nLanguage(locale);
  }
  return i18n;
}