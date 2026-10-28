// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/auth/actions', () => ({ logoutAction: async () => {} }));

import { BlockedView, SUPPORT_EMAIL } from './status-views';

afterEach(cleanup);

describe('BlockedView', () => {
  it('says the account is blocked, shows the reason as text and the support contact', () => {
    const reason = 'Detectamos <b>actividad</b> inusual en la cuenta.';
    render(<BlockedView firstName="Valentina" reason={reason} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu cuenta está bloqueada');
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: SUPPORT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${SUPPORT_EMAIL}`,
    );
    expect(document.body.textContent).not.toMatch(/te diremos qué falta|revisa tu caso/);
  });

  it('without a stored reason it still renders a fallback', () => {
    render(<BlockedView firstName="Valentina" reason={null} />);
    expect(screen.getByText(/No registramos un motivo/)).toBeInTheDocument();
  });
});
