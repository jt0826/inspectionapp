// tailwind.config.js (or .ts)
const { fontFamily } = require('tailwindcss/defaultTheme');

module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', ...fontFamily.sans], // Use the CSS variable
        // You can add other custom names too
        // heading: ['var(--font-inter)', ...fontFamily.sans], 
      },
    },
  },
  plugins: [],
};
