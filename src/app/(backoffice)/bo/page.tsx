import type { Metadata } from 'next';
import { ClipboardCheck } from 'lucide-react';
import { EmptyState } from '@/components/ld/empty-state';
import { PageHeader } from '@/components/ld/page-header';
import { requireUser } from '@/server/auth/guard';

export const metadata: Metadata = { title: 'Inicio de Back Office' };

export default async function BackofficeHomePage() {
  const user = await requireUser('BACKOFFICE');
  return (
    <>
      <PageHeader
        title={`Hola, ${user.name}`}
        description="Revisa usuarios y empresas, y supervisa los procesos en curso."
      />
      <EmptyState
        icon={ClipboardCheck}
        title="Aquí verás lo que está esperando tu revisión"
        description="Muy pronto podrás aprobar registros, evaluar empresas antes de publicarlas y consultar la auditoría de cada acción."
      />
    </>
  );
}
