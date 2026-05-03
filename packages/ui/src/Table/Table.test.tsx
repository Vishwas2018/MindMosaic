import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from './Table.js';

describe('Table', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <Table caption="Scores">
        <TableHead>
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader>Score</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Sarah</TableCell>
            <TableCell>87%</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('loading state renders skeleton', () => {
    const { getByRole } = render(<Table loading caption="Students" />);
    expect(getByRole('status')).toBeTruthy();
  });

  it('empty state renders empty message', () => {
    const { getByText } = render(<Table empty emptyTitle="No data" caption="Students" />);
    expect(getByText('No data')).toBeTruthy();
  });
});
