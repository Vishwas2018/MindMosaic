import type { Meta, StoryObj } from '@storybook/react';
import { ErrorBoundary } from './ErrorBoundary.js';

const meta: Meta<typeof ErrorBoundary> = { title: 'Layout/ErrorBoundary', component: ErrorBoundary };
export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

export const Normal: Story = {
  args: { children: <p>Normal content renders here.</p> },
};

export const WithCustomFallback: Story = {
  args: {
    children: <p>Normal content</p>,
    fallback: <div role="alert"><p>Custom error UI</p></div>,
  },
};
