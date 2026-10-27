import type { Metadata } from 'next';
import { LogOut } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/ld/logo';
import { StatusChip, type ChipTone } from '@/components/ld/status-chip';
import type { UserStatus } from '@/domain/machines/user';
import { logoutAction } from '@/server/auth/actions';
import { getCurrentUser, homePathFor } from '@/server/auth/guard';

export const metadata: Metadata = { title: 'Tu registro' };

type Copy = { chip: string; tone: ChipTone; title: string; description: string };

const COPY: Record<Exclude<UserStatus, 'ENABLED'>, Copy> = {
  PENDING: {
    chip: 'Registro pendiente',
    tone: 'neutral',
    title: 'Falta completar tu registro',
    description:
      'Necesitamos validar tu identidad y tu representación antes de habilitar tu cuenta. El formulario de registro estará disponible muy pronto y te avisaremos por correo.',
  },
  IN_REVIEW: {
    chip: 'En revisión',
    tone: 'info',
    title: 'Estamos revisando tu registro',
    description:
      'Nuestro equipo está verificando tu información. Tarda de 1 a 2 días hábiles y te escribiremos por correo cuando tu cuenta esté lista.',
  },
  CORRECTIONS_REQUESTED: {
    chip: 'Correcciones pendientes',
    tone: 'warning',
    title: 'Tenemos correcciones pendientes',
    description:
      'Encontramos datos o documentos que debes ajustar antes de aprobar tu cuenta. Revisa tu correo para ver qué falta y por qué, y reenvía tu solicitud cuando lo corrijas.',
  },
  REJECTED: {
    chip: 'Registro no aprobado',
    tone: 'danger',
    title: 'No pudimos aprobar tu registro',
    description:
      'Tu solicitud no cumplió los requisitos de verificación. Si crees que hubo un error, responde al correo en el que te lo notificamos y revisaremos tu caso.',
  },
  BLOCKED: {
    chip: 'Cuenta bloqueada',
    tone: 'danger',
    title: 'Tu cuenta está bloqueada',
    description:
      'Bloqueamos el acceso mientras Back Office revisa tu caso. Para recuperarlo, responde al correo de notificación y te diremos qué falta.',
  },
};

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.status === 'ENABLED') redirect(homePathFor(user.role));

  const copy = COPY[user.status];
  const firstName = user.name.split(' ')[0];

  return (
    <div className="min-h-screen bg-ld-bg">
      <header className="flex items-center justify-between border-b border-ld-border bg-ld-surface px-4 py-3 md:px-10">
        <Logo />
        <form action={logoutAction}>
          <button type="submit" className="ld-btn ld-btn-quiet min-h-10 px-3">
            <LogOut aria-hidden="true" className="size-4" />
            Cerrar sesión
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10 md:py-16">
        <p className="ld-small text-ld-muted">Hola, {firstName}</p>
        <div className="mt-3 rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-6 md:p-8">
          <StatusChip tone={copy.tone}>{copy.chip}</StatusChip>
          <h1 className="ld-h1 mt-4">{copy.title}</h1>
          <p className="mt-3 max-w-[60ch] text-ld-ink">{copy.description}</p>
        </div>
      </main>
    </div>
  );
}
