import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card.js';

const meta: Meta<typeof Card> = { title: 'Data/Card', component: Card };
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = { args: { children: <p>Card content</p> } };
export const Interactive: Story = { args: { interactive: true, children: <p>Click me</p> } };
export const Dense: Story = { args: { padding: 'dense', children: <p>Dense padding</p> } };
