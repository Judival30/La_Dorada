import type { Metadata } from 'next';
import { Handshake } from 'lucide-react';
import { EmptyState } from '@/components/ld/empty-state';
import { PageHeader } from '@/components/ld/page-header';
import { DealList } from '@/app/processes/_components/deal-list';
import { requireUser } from '@/server/auth/guard';
import { listDeals } from '@/server/services/deal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Procesos de negociación' };

export default async function SellerProcessesPage() {
  const user = await requireUser('SELLER');
  const rows = await listDeals(user);
  return (
    <>
      <PageHeader
        title="Procesos de negociación"
        description="Las ofertas que recibiste por tus oportunidades y en qué etapa va cada una."
      />
      {rows.length > 0 ? (
        <DealList rows={rows} party="SELLER" />
      ) : (
        <EmptyState
          icon={Handshake}
          title="Aún no recibes ofertas"
          description="Cuando un comprador autorizado te haga una oferta, la verás aquí para aceptarla o responder con una contraoferta."
        />
      )}
    </>
  );
}
