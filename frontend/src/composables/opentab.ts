import { defineStore } from 'pinia'

export const useTabStore = defineStore('useTabStore', () => {
  var openTabMethod: any = undefined
  const setOpenTabMethod = (method:any)=> {
    openTabMethod = method
  }
  const openTab = (value: any, parameters:any) => {
    openTabMethod(undefined,value+"", parameters+"")
  }

  return {
    openTab,
    setOpenTabMethod
  };
})