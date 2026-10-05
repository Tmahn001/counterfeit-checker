import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eefbf3', 500: '#0f9d58', 600: '#0b7d46', 700: '#085f36' },
        danger: { 500: '#d93025', 600: '#b3261e' },
        warn: { 500: '#f9ab00' },
      },
    },
  },
  plugins: [],
};
export default config;
