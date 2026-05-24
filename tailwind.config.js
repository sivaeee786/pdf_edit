/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        workspace: {
          light: '#f3f4f6',
          dark: '#0f1015',
        },
        panel: {
          light: '#ffffff',
          dark: '#16171d',
        },
        border: {
          light: '#e5e7eb',
          dark: '#262833',
        },
        accent: {
          primary: '#6366f1', // Figma-style indigo
          secondary: '#8b5cf6', // Canva-style purple
          hover: '#4f46e5',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        premium: '0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 10px -1px rgba(0, 0, 0, 0.03)',
        panel: '0 10px 30px -10px rgba(0, 0, 0, 0.15)',
        glow: '0 0 15px rgba(99, 102, 241, 0.15)',
      }
    },
  },
  plugins: [],
}
