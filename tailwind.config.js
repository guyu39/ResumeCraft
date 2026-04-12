/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1A56DB',
        'primary-light': '#EEF2FF',
      },
    },
  },
  plugins: [],
}
