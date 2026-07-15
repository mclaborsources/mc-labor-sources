import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3381cb',
          dark: '#0061be',
          darker: '#1f63a4',
        },
        nav: {
          DEFAULT: '#1d1812',
        },
        text: {
          DEFAULT: '#303030',
          muted: '#6b7280',
        },
        brand: {
          border: '#666666',
        },
      },
      maxWidth: {
        brand: '1500px',
      },
      fontSize: {
        body: ['18px', { lineHeight: '28px' }],
        pageTitle: ['35px', { lineHeight: '1.2' }],
      },
      fontFamily: {
        sans: ['var(--font-montserrat)', 'system-ui', 'sans-serif'],
        placeholder: ['var(--font-lato)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
