import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/ld/logo';
import { Ridge } from '@/components/ld/ridge';
import { getCurrentUser, homePathFor } from '@/server/auth/guard';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Crear cuenta' };

const NEXT_STEPS = [
  { title: 'Crea tu cuenta', text: 'Elige tu rol y autoriza el tratamiento de tus datos.' },
  { title: 'Completa tu perfil', text: 'Tus datos, los de tu empresa o entidad y tus documentos.' },
  { title: 'Te habilitamos', text: 'Back Office revisa tu información en 1 a 2 días hábiles.' },
] as const;

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.status === 'ENABLED' ? homePathFor(user.role) : '/onboarding');

  return (
    <div className="grid min-h-screen md:grid-cols-[1fr_1.15fr]">
      {/* The column stays navy below the sticky panel when the form is taller than the viewport. */}
      <div className="bg-ld-navy">
        <section className="ld-on-navy relative flex min-h-[15rem] flex-col overflow-hidden bg-ld-navy md:sticky md:top-0 md:h-screen">
          <div className="relative z-10 px-6 pt-6 md:px-12 md:pt-10">
            <Link href="/" aria-label="La Dorada, ir al inicio">
              <Logo tone="light" />
            </Link>
            <p className="mt-8 hidden max-w-[16ch] font-display text-[2.5rem] font-bold leading-[2.875rem] tracking-[-0.02em] text-white md:block">
              Tu próxima empresa empieza con una cuenta verificada.
            </p>
            <ol className="mt-8 hidden max-w-[36ch] flex-col gap-4 md:flex">
              {NEXT_STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="ld-num font-display text-xl font-bold leading-7 text-ld-gold"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-white">{s.title}</p>
                    <p className="ld-small text-[#B6C8EE]">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <Ridge tone="navy" className="mt-auto h-36 md:h-[16rem]" />
        </section>
      </div>

      <main className="flex px-6 py-10 md:px-16 md:py-14">
        <div className="w-full max-w-xl">
          <h1 className="ld-h1">Crea tu cuenta</h1>
          <p className="mt-1 mb-7 max-w-[52ch] text-ld-muted">
            Después de crearla te pediremos tus datos y documentos para verificarte. Hasta entonces
            tu cuenta queda pendiente.
          </p>
          <RegisterForm />
          <p className="ld-small mt-8 text-ld-ink">
            ¿Ya tienes cuenta?{' '}
            <Link
              href="/login"
              className="font-medium text-ld-primary underline underline-offset-4"
            >
              Inicia sesión
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
