import { AppShell } from '@/components/ld/app-shell';
import { requireUser } from '@/server/auth/guard';

/**
 * Deals are shared by both parties, so `/processes` lives outside the role
 * groups. Each page still authorizes per deal (`getDeal`: buyer, owning seller,
 * or Back Office read-only; 404 otherwise).
 */
export default async function ProcessesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('BUYER', 'SELLER', 'BACKOFFICE');
  return (
    <AppShell role={user.role} user={{ name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}
