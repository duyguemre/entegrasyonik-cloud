import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useTheme } from 'vuetify'

export default function useThemeStore() {
/*   export const useThemeStore = defineStore('theme', () => { */
  const theme = useTheme()

  function toggleTheme() {
    //theme.global.name.value = theme.global.current.value.dark ? 'lightTheme' : 'darkTheme'
  }

  function getTheme() {
    return theme.global.name.value
  }

  function isDarkMode() {
    return theme.global.current.value.dark
  }

  return { toggleTheme, getTheme, isDarkMode }
}