import type { Meta, StoryObj } from '@storybook/react';
import { IconButton } from './IconButton.js';
import { Bell } from 'lucide-react';

const meta: Meta<typeof IconButton> = { title: 'Forms/IconButton', component: IconButton };
export default meta;
type Story = StoryObj<typeof IconButton>;

export const Ghost: Story = { args: { label: 'Notifications', icon: <Bell size={18} />, variant: 'ghost' } };
export const Filled: Story = { args: { label: 'Notifications', icon: <Bell size={18} />, variant: 'filled' } };
export const Loading: Story = { args: { label: 'Saving', icon: <Bell size={18} />, loading: true } };
