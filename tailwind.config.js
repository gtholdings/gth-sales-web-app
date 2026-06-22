/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Inter for Latin; Noto Sans Sinhala covers Sinhala glyphs via fallback.
        sans: ['var(--font-inter)', 'var(--font-sinhala)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: '#1e40af',
        secondary: '#64748b',
      },
    },
  },
  plugins: [],
}
