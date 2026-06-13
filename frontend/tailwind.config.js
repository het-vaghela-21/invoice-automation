export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          50:  '#f0f5f2',
          100: '#d9ebe2',
          200: '#b3d6c5',
          300: '#7db8a0',
          400: '#4d9778',
          500: '#2d7a5a',
          600: '#1e5c42',
          700: '#16432f',
          800: '#0f2c1f',
          900: '#091810',
        },
        amber: {
          50:  '#fdf8ee',
          100: '#faefd4',
          200: '#f5dda3',
          300: '#edc568',
          400: '#e4a832',
          500: '#c97b2e',
          600: '#a5611e',
          700: '#864a17',
          800: '#6d3b16',
          900: '#5a3115',
        },
        ivory: {
          50:  '#fefdf9',
          100: '#faf8f1',
          200: '#f5f2eb',
          300: '#ede9e0',
          400: '#e0dcd2',
          /* 500+ are used as *text* colours on white/ivory surfaces, so they
             are kept dark enough for WCAG AA contrast. */
          500: '#7d7568',
          600: '#675f53',
          700: '#534c42',
          800: '#3e3933',
          900: '#2b2722',
        },
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.08), 0 1px 3px -1px rgba(0,0,0,0.05)',
        'modal': '0 20px 60px -12px rgba(0,0,0,0.25)',
      },
      animation: {
        'fade-up': 'fadeUp 0.4s ease-out both',
        'fade-in': 'fadeIn 0.3s ease-out both',
        'slide-in': 'slideIn 0.3s ease-out both',
      },
      keyframes: {
        fadeUp:   { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeIn:   { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn:  { '0%': { opacity: '0', transform: 'translateX(-12px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
      },
    },
  },
  plugins: [],
};
