// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusChip } from './status-chip';

afterEach(cleanup);

describe('StatusChip', () => {
  it('renders the warning soft background and its text', () => {
    render(<StatusChip tone="warning">En revisión</StatusChip>);
    const chip = screen.getByText('En revisión');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass('bg-[var(--ld-warning-soft)]');
    expect(chip).toHaveClass('text-[var(--ld-warning-ink)]');
  });

  it.each([
    ['success', 'bg-[var(--ld-success-soft)]'],
    ['danger', 'bg-[var(--ld-danger-soft)]'],
    ['info', 'bg-[var(--ld-info-soft)]'],
    ['neutral', 'bg-[var(--ld-neutral-soft)]'],
  ] as const)('maps tone %s to %s', (tone, cls) => {
    render(<StatusChip tone={tone}>Estado</StatusChip>);
    expect(screen.getByText('Estado')).toHaveClass(cls);
  });
});
