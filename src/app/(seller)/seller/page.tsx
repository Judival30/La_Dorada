import type { Metadata } from 'next';
import { Building2 } from 'lucide-react';
import { EmptyState } from '@/components/ld/empty-state';
import { PageHeader } from '@/components/ld/page-header';
import { requireUser } from '@/server/auth/guard';

export const metadata: Metadata = { title: 'Inicio del vendedor' };

export default async function SellerHomePage() {
  const user = await requireUser('SELLER');
  const firstName = user.name.split(' ')[0];
  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description="Desde aquí gestionas tu empresa y las oportunidades que publicas."
      />
      <EmptyState
        icon={Building2}
        title="Aquí verás el estado de tu empresa y tus oportunidades"
        description="Muy pronto podrás registrar tu empresa, publicar una oportunidad y decidir qué información es pública y cuál queda confidencial."
      />
    </>
  );
}
