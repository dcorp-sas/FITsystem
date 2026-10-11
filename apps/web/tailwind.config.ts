/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0b1120',
        surface: '#111827',
        'surface-alt': '#1f2937',
        line: '#1e293b',
        primary: {
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
          light: '#3b82f6',
          soft: '#1e40af',
        },
        sky: '#0ea5e9',
        text: {
          DEFAULT: '#e2e8f0',
          muted: '#94a3b8',
        },
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
};