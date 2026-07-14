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
          50: '#fbf8ea',
          100: '#f6efc9',
          200: '#f0e197',
          300: '#e7ce5e',
          400: '#dfba32',
          500: '#d4af37', // Dourado principal exigido pelo design
          600: '#b88d25',
          700: '#946a1f',
          800: '#7a541e',
          900: '#66451d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'], // Textos da interface
        serif: ['Fraunces', 'serif'],  // Títulos
      },
      boxShadow: {
        'foco-dourado': '0 0 0 2px rgba(212, 175, 55, 0.4)',
      }
    },
  },
  plugins: [],
}