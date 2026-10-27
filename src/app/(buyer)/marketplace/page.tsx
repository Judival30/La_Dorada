import type { Metadata } from 'next';
import { Store } from 'lucide-react';
import { EmptyState } from '@/components/ld/empty-state';
import { PageHeader } from '@/components/ld/page-header';
import { requireUser } from '@/server/auth/guard';

export const metadata: Metadata = { title: 'Marketplace' };

export default async function MarketplacePage() {
  const user = await requireUser('BUYER');
  const firstName = user.name.split(' ')[0];
  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description="Este es tu marketplace: las empresas que buscan comprador, inversión o socio."
      />
      <EmptyState
        icon={Store}
        title="Aquí verás las empresas disponibles"
        description="Muy pronto podrás filtrar por sector, región, ingresos y EBITDA, guardar tus favoritas y comparar hasta tres empresas lado a lado."
      />
    </>
  );
}
