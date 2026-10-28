import { AppShell } from '@/components/ld/app-shell';
import { requireUser } from '@/server/auth/guard';
import { listNotifications } from '@/server/services/notifications';

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('BUYER');
  return (
    <AppShell
      role="BUYER"
      user={{ name: user.name, email: user.email }}
      notifications={await listNotifications(user)}
    >
      {children}
    </AppShell>
  );
}
