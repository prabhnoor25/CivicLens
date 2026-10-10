/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#166534", dark: "#14532d", light: "#dcfce7" },
        accent: { DEFAULT: "#10B981", dark: "#059669", light: "#d1fae5" },
        canvas: "#F8FAFC",
      },
      borderRadius: { xl: "0.75rem" },
    },
  },
  plugins: [],
};
