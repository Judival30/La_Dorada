import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/ld/logo';
import { Ridge } from '@/components/ld/ridge';
import { getCurrentUser, homePathFor } from '@/server/auth/guard';
import { getDemoAccounts } from '@/server/demo-accounts';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (user) redirect(user.status === 'ENABLED' ? homePathFor(user.role) : '/onboarding');

  const { next } = await searchParams;
  const nextPath = typeof next === 'string' ? next : undefined;

  return (
    <div className="grid min-h-screen md:grid-cols-[1.1fr_1fr]">
      <section className="ld-on-navy relative flex min-h-[15rem] flex-col overflow-hidden bg-ld-navy md:min-h-screen">
        <div className="relative z-10 px-6 pt-6 md:px-12 md:pt-10">
          <Link href="/" aria-label="La Dorada, ir al inicio">
            <Logo tone="light" />
          </Link>
          <p className="mt-8 hidden max-w-[16ch] font-display text-[2.75rem] font-bold leading-[3rem] tracking-[-0.02em] text-white md:block">
            Empresas con más futuro, a un paso de ti.
          </p>
          <p className="mt-4 hidden max-w-[40ch] text-[#B6C8EE] md:block">
            Encuentra, valida y negocia la compra de empresas privadas colombianas, con cada etapa
            registrada.
          </p>
        </div>
        <Ridge tone="navy" className="mt-auto h-36 md:h-[24rem]" />
      </section>

      <main className="flex items-center px-6 py-10 md:px-16">
        <div className="w-full max-w-sm">
          <h1 className="ld-h1">Entra a La Dorada</h1>
          <p className="mt-1 mb-7 text-ld-muted">Usa el correo con el que te registraste.</p>
          <LoginForm next={nextPath} demoAccounts={getDemoAccounts()} />
          <p className="ld-small mt-8 text-ld-ink">
            ¿No tienes cuenta?{' '}
            <Link
              href="/registro"
              className="font-medium text-ld-primary underline underline-offset-4"
            >
              Crea una
            </Link>
          </p>
          <p className="ld-small mt-3">
            <Link href="/" className="font-medium text-ld-primary underline underline-offset-4">
              Volver al inicio
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
