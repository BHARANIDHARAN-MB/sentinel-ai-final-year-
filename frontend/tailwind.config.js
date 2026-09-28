/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B0F19',
        surface: '#131A2A',
        surface2: '#1B2438',
        border: '#232E47',
        amber: '#E8A33D',
        amberDim: '#8A6220',
        threat: '#E5484D',
        verified: '#3DDC97',
        ink: '#E4E7EC',
        muted: '#7C8698',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
