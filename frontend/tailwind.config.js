/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        tics: {
          navy: '#0a0b1e',
          navy2: '#121332',
          bg: '#0a0b1e',
          bg2: '#0d1028',
          card: 'rgba(255,255,255,0.06)',
          stroke: 'rgba(255,255,255,0.12)',
          text: '#F8FAFC',
          muted: 'rgba(226,232,240,0.72)',
          green: '#22C55E',
          green2: '#16A34A',
          red: '#EF4444',
          amber: '#F59E0B',
          blue: '#3B82F6',
          purple: '#8B5CF6',
        },
      },
      borderRadius: {
        '4xl': 34,
      },
    },
  },
  plugins: [],
};

