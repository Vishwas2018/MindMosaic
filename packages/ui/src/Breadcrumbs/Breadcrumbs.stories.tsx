import type { Meta, StoryObj } from '@storybook/react';
import { Breadcrumbs } from './Breadcrumbs.js';

const meta: Meta<typeof Breadcrumbs> = { title: 'Navigation/Breadcrumbs', component: Breadcrumbs };
export default meta;
type Story = StoryObj<typeof Breadcrumbs>;

export const Default: Story = {
  args: {
    items: [
      { label: 'Teacher Dashboard', href: '#' },
      { label: 'Students', href: '#' },
      { label: 'Sarah Johnson' },
    ],
  },
};
