import '../src/tokens.css';
import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    a11y: {
      // X5: Storybook addon-a11y is dev-time visual review only.
      // CI gate is Vitest + jest-axe (toHaveNoSeriousViolations).
      config: {},
      options: {},
    },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/ } },
  },
};

export default preview;
