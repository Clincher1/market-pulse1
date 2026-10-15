/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0A0E1A',
        'bg-card': '#111827',
        'bg-card-hover': '#1A2235',
        'border-subtle': '#1F2937',
        'accent': '#3B82F6',
        'accent-hover': '#2563EB',
        'positive': '#10B981',
        'negative': '#EF4444',
        'neutral': '#6B7280',
        'text-primary': '#F9FAFB',
        'text-secondary': '#9CA3AF',
        'warning': '#F59E0B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl2': '16px',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
