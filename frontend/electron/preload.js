// DESK-00 — preload (sandbox: true → yalnız `contextBridge`/`ipcRenderer` kullanılabilir).
// Sayfaya YALNIZ salt-okunur bir kimlik bayrağı açılır; Node/Electron API'si, ipcRenderer ya da dosya erişimi AÇILMAZ.
// Yerel köprü (izinli klasörler, yazıcı, bildirim — DESK-01..04) ayrı ve dar bir API olarak sonra eklenir.
'use strict'
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld(
  'entegrasyonikDesktop',
  Object.freeze({ isDesktop: true, platform: process.platform })
)
