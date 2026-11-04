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
          DEFAULT: "#00df9a",
          light: "#34d399",
          dark: "#00b87a"
        },
        accent: {
          DEFAULT: "#0ea5e9",
          blue: "#2563eb",
          gold: "#f59e0b"
        },
        bg: "#070b12",
        panel: "#0d1421"
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
