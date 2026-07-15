/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dourado: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1f2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'], // Textos da interface
        serif: ['Fraunces', 'serif'],  // Títulos
      },
      boxShadow: {
        'foco-dourado': '0 0 0 2px rgba(15, 23, 42, 0.18)',
      }
    },
  },
  plugins: [],
}
