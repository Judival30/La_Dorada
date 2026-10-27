import Link from 'next/link';
import { Disclaimer } from '@/components/ld/disclaimer';
import { Logo } from '@/components/ld/logo';
import { Ridge } from '@/components/ld/ridge';

const ROLES = [
  {
    name: 'Comprador',
    text: 'Busca y filtra empresas por sector, región, ingresos y EBITDA, revisa su información y negocia ofertas.',
  },
  {
    name: 'Vendedor',
    text: 'Registra tu empresa, decide qué información es pública y cuál confidencial, y atiende a los compradores interesados.',
  },
  {
    name: 'Back Office',
    text: 'Revisa usuarios y empresas, aprueba publicaciones y supervisa cada proceso sin decidir por las partes.',
  },
] as const;

const STEPS = [
  { name: 'Descubrir', text: 'Explora empresas y filtra por lo que buscas.' },
  { name: 'Validar', text: 'Verificamos usuarios y empresas antes de publicar.' },
  { name: 'Analizar', text: 'Revisa una valoración orientativa y el data room.' },
  { name: 'Conectar', text: 'Pide acceso, firma el acuerdo de confidencialidad y habla con el vendedor.' },
  { name: 'Negociar', text: 'Presenta ofertas y avanza hacia la carta de intención.' },
  { name: 'Cerrar', text: 'Formaliza el acuerdo. Tú decides en cada etapa.' },
] as const;

export default function LandingPage() {
  return (
    <>
      <header className="bg-ld-bg">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-4 md:px-8 md:py-6">
          <Link href="/" aria-label="La Dorada, inicio">
            <Logo />
          </Link>
          <nav aria-label="Secciones" className="flex items-center gap-1 md:gap-3">
            <a href="#roles" className="ld-small hidden min-h-11 items-center rounded-[var(--ld-radius-nav)] px-3 font-medium text-ld-ink hover:text-ld-navy md:inline-flex">
              Roles
            </a>
            <a href="#como-funciona" className="ld-small hidden min-h-11 items-center rounded-[var(--ld-radius-nav)] px-3 font-medium text-ld-ink hover:text-ld-navy md:inline-flex">
              Cómo funciona
            </a>
            <Link href="/login" className="ld-btn ld-btn-primary">
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="bg-ld-bg">
          <div className="mx-auto max-w-[1200px] px-5 pb-10 pt-8 md:px-8 md:pb-14 md:pt-16">
            <h1 className="ld-display max-w-[18ch]">
              Encuentra la empresa que quieres comprar o en la que quieres invertir.
            </h1>
            <p className="mt-5 max-w-[56ch] text-lg leading-8 text-ld-ink">
              La Dorada conecta compradores cualificados con empresas privadas colombianas que buscan
              vender, recibir inversión o sumar un socio, y ordena el proceso desde el descubrimiento
              hasta la negociación.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="ld-btn ld-btn-primary">
                Entrar a mi cuenta
              </Link>
              <a href="#como-funciona" className="ld-btn ld-btn-quiet">
                Ver cómo funciona
              </a>
            </div>
          </div>
          <Ridge tone="light" className="h-36 md:h-64" />
        </section>

        <section id="como-funciona" className="ld-on-navy bg-ld-navy text-white scroll-mt-0">
          <div className="mx-auto max-w-[1200px] px-5 pb-16 pt-6 md:px-8 md:pb-20">
            <h2 className="font-display text-[1.5rem] font-bold leading-8 tracking-[-0.02em] md:text-[2rem] md:leading-10">
              Del primer vistazo al cierre, en seis pasos
            </h2>
            <ol className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.name} className="flex gap-4">
                  <span className="ld-num font-display text-[2rem] font-bold leading-9 text-ld-gold" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-semibold">{s.name}</h3>
                    <p className="mt-1 max-w-[34ch] text-[#C9D6F2]">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="roles" className="bg-ld-surface">
          <div className="mx-auto max-w-[1200px] px-5 py-14 md:px-8 md:py-20">
            <h2 className="ld-h2 md:max-w-[26ch]">Tres roles, un mismo proceso</h2>
            <dl className="mt-8 border-t border-ld-border">
              {ROLES.map((r) => (
                <div
                  key={r.name}
                  className="grid gap-1 border-b border-ld-border py-5 md:grid-cols-[14rem_1fr] md:gap-8 md:py-6"
                >
                  <dt className="ld-h3">{r.name}</dt>
                  <dd className="max-w-[62ch] text-ld-ink">{r.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="bg-ld-bg">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-5 py-8 md:px-8">
          <Disclaimer>
            La Dorada no ofrece asesoría financiera regulada y no ejecuta compras ni mueve dinero.
            Las valoraciones son orientativas y cada parte decide si compra, vende o invierte.
          </Disclaimer>
          <p className="ld-small text-ld-muted">
            Los datos de esta demostración son ficticios.
          </p>
        </div>
      </footer>
    </>
  );
}
