import type { Meta, StoryObj } from '@storybook/react';
import { ToastProvider, useToast } from './Toast.js';

const meta: Meta = { title: 'Overlay/Toast' };
export default meta;
type Story = StoryObj;

function ToastDemo({ variant }: { variant: 'info' | 'success' | 'warn' | 'error' }) {
  const { addToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => addToast({ title: 'Notification', description: 'A sample message.', variant })}
      style={{ padding: '8px 16px' }}
    >
      Show {variant} toast
    </button>
  );
}

export const Info: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo variant="info" />
    </ToastProvider>
  ),
};

export const Success: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo variant="success" />
    </ToastProvider>
  ),
};
