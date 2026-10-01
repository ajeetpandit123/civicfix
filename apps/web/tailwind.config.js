/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f2744',
        civic: {
          50: '#eef7f4',
          100: '#d5ebe4',
          500: '#1f7a63',
          600: '#186352',
          700: '#124d40',
        },
        sand: '#f6f1e8',
      },
    },
  },
  plugins: [],
};
