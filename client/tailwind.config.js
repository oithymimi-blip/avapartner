/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6366f1",
          light: "#818cf8",
          dark: "#4f46e5"
        },
        accent: {
          DEFAULT: "#06b6d4",
          purple: "#a855f7"
        },
        bg: "#090d16",
        panel: "#0f172a"
      },
      boxShadow: {
        soft: "0 10px 20px rgba(0,0,0,0.3)"
      },
      borderRadius: {
        '2xl': '1rem'
      }
    },
  },
  plugins: [],
}
