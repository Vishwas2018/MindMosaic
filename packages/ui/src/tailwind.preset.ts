import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  theme: {
    extend: {
      fontFamily: {
        sans:  ['var(--font-sans)',  'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      colors: {
        brand:     { 50:'#F5F3FF',100:'#EDE9FE',200:'#DDD6FE',300:'#C4B5FD',400:'#8B5CF6',500:'#5925a8',600:'#4a1d96',700:'#3b1584',800:'#2e0f5c',900:'#1E1B4B' },
        slate:     { 25:'#FDFCFE',50:'#FAF8FF',75:'#F0EDF8',100:'#E9E5F5',150:'#D6D0E8',200:'#D6D0E8',300:'#A8A0C0',400:'#A8A0C0',500:'#7C7399',600:'#3B3566',700:'#3B3566',800:'#1E1B4B',900:'#1E1B4B',950:'#0e1118' },
        correct:   { 50:'#f0fdf4',100:'#dcfce7',200:'#bbf7d0',500:'#22c55e',600:'#16a34a',700:'#15803d' },
        incorrect: { 50:'#fef2f2',100:'#fee2e2',200:'#fecaca',500:'#ef4444',600:'#dc2626',700:'#b91c1c' },
        warn:      { 50:'#fffbeb',100:'#fef3c7',200:'#fde68a',500:'#f59e0b',600:'#d97706',700:'#b45309' },
        accent:    { 300:'#f9a825',400:'#ef8c56',500:'#ef6843' },
      },
      boxShadow: {
        card:         'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        elevated:     'var(--shadow-elevated)',
        modal:        'var(--shadow-modal)',
        form:         'var(--shadow-form)',
        focus:        'var(--shadow-focus)',
        'focus-subtle': 'var(--shadow-focus-subtle)',
      },
      borderRadius: {
        btn:     'var(--r-btn)',
        card:    'var(--r-card)',
        'card-lg': 'var(--r-card-lg)',
        field:   'var(--r-field)',
        opt:     'var(--r-opt)',
        pill:    'var(--r-pill)',
        xl:      '12px',
        '2xl':   '16px',
      },
      fontSize: {
        base: ['15px', { lineHeight: '1.65' }],
        lg:   ['17px', { lineHeight: '1.5' }],
      },
      transitionTimingFunction: {
        'out-smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '400ms',
      },
    },
  },
};

export default preset;
