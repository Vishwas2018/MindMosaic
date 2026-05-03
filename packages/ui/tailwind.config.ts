import type { Config } from 'tailwindcss';
import preset from './src/tailwind.preset.js';

const config: Config = {
  presets: [preset as Config],
  content: [
    './src/**/*.{ts,tsx}',
    './.storybook/**/*.{ts,tsx}',
  ],
};

export default config;
