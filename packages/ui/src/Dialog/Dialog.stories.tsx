import type { Meta, StoryObj } from '@storybook/react';
import { Dialog } from './Dialog.js';

const meta: Meta<typeof Dialog> = { title: 'Overlay/Dialog', component: Dialog };
export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  args: {
    title: 'Confirm action',
    description: 'This cannot be undone.',
    open: true,
    children: <p style={{ fontSize: 14 }}>Are you sure you want to proceed?</p>,
  },
};
