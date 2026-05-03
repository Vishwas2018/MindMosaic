import type { Meta, StoryObj } from '@storybook/react';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from './Table.js';

const meta: Meta<typeof Table> = { title: 'Data/Table', component: Table };
export default meta;
type Story = StoryObj<typeof Table>;

export const Default: Story = {
  render: () => (
    <Table caption="Student scores">
      <TableHead>
        <TableRow>
          <TableHeader>Name</TableHeader>
          <TableHeader>Score</TableHeader>
          <TableHeader>Date</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableCell>Sarah J.</TableCell>
          <TableCell>87%</TableCell>
          <TableCell>2026-05-01</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Alex K.</TableCell>
          <TableCell>72%</TableCell>
          <TableCell>2026-05-01</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const Loading: Story = { render: () => <Table loading caption="Students" /> };
export const Empty: Story = { render: () => <Table empty emptyTitle="No students found" caption="Students" /> };
