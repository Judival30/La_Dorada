import { AppShell } from '@/components/ld/app-shell';
import { requireUser } from '@/server/auth/guard';

export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('BACKOFFICE');
  return (
    <AppShell role="BACKOFFICE" user={{ name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}
