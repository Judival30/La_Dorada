import { AppShell } from '@/components/ld/app-shell';
import { requireUser } from '@/server/auth/guard';
import { listNotifications } from '@/server/services/notifications';

export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('BACKOFFICE');
  return (
    <AppShell
      role="BACKOFFICE"
      user={{ name: user.name, email: user.email }}
      notifications={await listNotifications(user)}
    >
      {children}
    </AppShell>
  );
}
