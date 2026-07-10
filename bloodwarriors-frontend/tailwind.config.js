/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── "Red Love" Pivot Palette — crimson/ruby medical-emergency urgency ──
        'ruby-dark': '#8B0000',
        'ruby-main': '#C41E3A',
        'ruby-light': '#FF4C4C',
        'slate-nav': '#1E293B',
        'slate-body': '#0F172A',
        // ── Legacy Airbnb Pivot Palette (retained for un-migrated pages) ──
        rausch: '#ff385c',
        'rausch-dark': '#e00b41',
        'rausch-light': '#ff5a7d',
        babu: '#00a699',
        ink: '#222222',
        body: '#3f3f3f',
        muted: '#6a6a6a',
        'muted-soft': '#929292',
        hof: '#f7f7f7',
        cloud: '#ffffff',
        hackberry: '#EB4D5C',
        'error-text': '#c13515',
        hairline: '#dddddd',
        'hairline-soft': '#ebebeb',
        'surface-strong': '#f2f2f2',
        'primary-disabled': '#ffd1da',
      },
      fontFamily: {
        // Inter is the default UI/body face; JetBrains Mono is reserved for data cells only.
        sans: ['Inter', '-apple-system', 'system-ui', 'Roboto', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      borderRadius: {
        xs: '4px',    // micro chips
        sm: '8px',    // buttons
        md: '14px',   // cards
        lg: '20px',   // modals / large surfaces
        xl: '32px',   // category strips
        full: '9999px', // pills, inputs, orbs
      },
      boxShadow: {
        // Single elevation tier — hover cards, search bars, dropdowns
        elevated: 'rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.1) 0 4px 8px',
      },
      keyframes: {
        'pulse-fast': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'consent-fadeout': {
          '0%': { opacity: '1', filter: 'blur(0px)' },
          '100%': { opacity: '0.25', filter: 'blur(1px)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-out-right': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        // Gentle entrance for page/section content
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Subtle lift for card hover
        'scale-up': {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.02)' },
        },
        // Infinite marquee — track is duplicated, so -50% loops seamlessly
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'pulse-fast': 'pulse-fast 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'consent-fadeout': 'consent-fadeout 0.6s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.35s ease-out',
        'slide-out-right': 'slide-out-right 0.35s ease-in forwards',
        'fade-in': 'fade-in 0.4s ease-out both',
        'scale-up': 'scale-up 0.2s ease-out forwards',
        marquee: 'marquee 28s linear infinite',
      },
    },
  },
  plugins: [],
};
