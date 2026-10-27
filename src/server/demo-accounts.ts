import 'server-only';

export type DemoAccount = { label: string; email: string; password: string };

/** Fictional demo credentials. Passed to the login page only outside production. */
export function getDemoAccounts(): DemoAccount[] | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  const password = 'LaDorada2026!';
  return [
    { label: 'Comprador', email: 'comprador@demo.ladorada.co', password },
    { label: 'Vendedor', email: 'vendedor@demo.ladorada.co', password },
    { label: 'Back Office', email: 'admin@demo.ladorada.co', password },
  ];
}
