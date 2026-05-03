import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button.js';

const meta: Meta<typeof Button> = { title: 'Forms/Button', component: Button };
export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { children: 'Continue', variant: 'primary' } };
export const Secondary: Story = { args: { children: 'Cancel', variant: 'secondary' } };
export const Ghost: Story = { args: { children: 'Skip', variant: 'ghost' } };
export const Danger: Story = { args: { children: 'Delete', variant: 'danger' } };
export const Submit: Story = { args: { children: 'Submit answers', variant: 'submit' } };
export const Loading: Story = { args: { children: 'Saving…', loading: true } };
export const Disabled: Story = { args: { children: 'Unavailable', disabled: true } };
export const Small: Story = { args: { children: 'Small', size: 'sm' } };
export const Large: Story = { args: { children: 'Large', size: 'lg' } };
