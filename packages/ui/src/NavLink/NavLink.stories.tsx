import type { Meta, StoryObj } from '@storybook/react';
import { NavLink } from './NavLink.js';

const meta: Meta<typeof NavLink> = { title: 'Navigation/NavLink', component: NavLink };
export default meta;
type Story = StoryObj<typeof NavLink>;

export const Idle: Story = { args: { children: 'Dashboard', href: '#' } };
export const Active: Story = { args: { children: 'Dashboard', href: '#', active: true } };
