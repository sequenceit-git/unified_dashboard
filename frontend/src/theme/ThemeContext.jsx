import { createContext, useContext, useEffect, useState } from 'react'
import { FiMoon, FiSun } from 'react-icons/fi'

const STORAGE_KEY = 'ecompilot-theme'

const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
})

export function getStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme) {
  const dark = theme === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0c1222' : '#4F46E5')
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Ignore storage failures and keep the choice for this session.
    }
  }, [theme])

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={dark ? 'Light mode' : 'Dark mode'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      className={`rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 ${className}`}
    >
      {dark ? <FiSun size={18} /> : <FiMoon size={18} />}
    </button>
  )
}
