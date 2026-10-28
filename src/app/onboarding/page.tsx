import type { Metadata } from 'next';
import { Check, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  DOCUMENT_LABELS,
  ONBOARDING_STEPS,
  requiredDocuments,
  type OnboardingStep,
  type VerificationDocumentType,
} from '@/domain/onboarding';
import { NotFoundError } from '@/domain/errors';
import { getCurrentUser, homePathFor } from '@/server/auth/guard';
import { getOnboardingState, type OnboardingView } from '@/server/services/onboarding';
import { DocumentSlot } from './_components/document-slot';
import { MissingBox } from './_components/missing-box';
import { ReviewSummary } from './_components/review-summary';
import { CompanyForm, LegalForm, ProfileForm } from './_components/step-forms';
import { Stepper } from './_components/stepper';
import {
  BlockedView,
  InReviewView,
  OnboardingHeader,
  RejectedView,
} from './_components/status-views';
import { SubmitButton } from './_components/submit-button';

export const metadata: Metadata = { title: 'Tu registro' };
export const dynamic = 'force-dynamic';

const DOC_HINTS: Record<VerificationDocumentType, string> = {
  NATIONAL_ID: 'Foto o escaneo legible, por ambas caras si es posible.',
  CHAMBER_OF_COMMERCE: 'Certificado de existencia y representación legal, con vigencia reciente.',
  RUT: 'Registro Único Tributario actualizado.',
  POWER_OF_ATTORNEY: 'Poder o autorización firmada por el representante legal.',
};

function parseStep(raw: string | string[] | undefined): OnboardingStep | null {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? (n as OnboardingStep) : null;
}

function firstIncomplete(view: OnboardingView): OnboardingStep {
  for (const n of [1, 2, 3, 4, 5] as const) {
    if (!view.progress.completedSteps.includes(n)) return n;
  }
  return 6;
}

type PageProps = {
  searchParams: Promise<{ paso?: string | string[]; guardado?: string | string[] }>;
};

export default async function OnboardingPage({ searchParams }: PageProps) {
  // Not requireUser: it sends every non-ENABLED user here, so it would loop.
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/onboarding');
  if (user.status === 'ENABLED' || user.role === 'BACKOFFICE') redirect(homePathFor(user.role));

  const firstName = user.name.split(' ')[0] ?? user.name;
  let view: OnboardingView;
  try {
    view = await getOnboardingState(user.id);
  } catch (err) {
    // Accounts created before M2 (demo seed) have no verification case: show their status only.
    if (!(err instanceof NotFoundError)) throw err;
    view = {
      role: user.role === 'SELLER' ? 'SELLER' : 'BUYER',
      userStatus: user.status,
      caseId: '',
      caseStatus: 'OPEN',
      profile: {},
      isLegalRepresentative: null,
      buyerType: null,
      documents: [],
      progress: { completedSteps: [], missing: [], canSubmit: false },
      correctionNotes: null,
      rejectionReason: null,
      submittedAt: null,
    };
  }

  if (view.userStatus === 'IN_REVIEW') {
    return (
      <div className="min-h-screen bg-ld-bg">
        <OnboardingHeader />
        <InReviewView view={view} firstName={firstName} />
      </div>
    );
  }
  if (view.userStatus === 'REJECTED') {
    return (
      <div className="min-h-screen bg-ld-bg">
        <OnboardingHeader />
        <RejectedView view={view} firstName={firstName} />
      </div>
    );
  }
  if (view.userStatus === 'BLOCKED') {
    return (
      <div className="min-h-screen bg-ld-bg">
        <OnboardingHeader />
        <BlockedView firstName={firstName} />
      </div>
    );
  }

  const params = await searchParams;
  const current = parseStep(params.paso) ?? firstIncomplete(view);
  const savedStep = parseStep(params.guardado);
  const steps = ONBOARDING_STEPS[view.role];
  const stepInfo = steps.find((s) => s.step === current) ?? steps[0]!;
  const titles = Object.fromEntries(steps.map((s) => [s.step, s.title]));
  const done = view.progress.completedSteps.length;
  const total = 5;
  const corrections = view.userStatus === 'CORRECTIONS_REQUESTED';
  const missingHere = view.progress.missing.filter((m) => m.step === current);
  const docOf = (t: VerificationDocumentType) => view.documents.findLast((d) => d.type === t);
  const required = requiredDocuments({
    role: view.role,
    isLegalRepresentative: view.isLegalRepresentative,
    buyerType: view.buyerType,
  });
  const supportDocs = required.filter((t) => t !== 'NATIONAL_ID');
  const roleWord = view.role === 'SELLER' ? 'vendedor' : 'comprador';

  return (
    <div className="min-h-screen bg-ld-bg">
      <OnboardingHeader />
      <main id="contenido" className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        {corrections ? (
          <section
            aria-labelledby="corrections-title"
            className="mb-8 rounded-[var(--ld-radius-panel)] border border-ld-border border-l-4 border-l-[var(--ld-warning)] bg-ld-surface p-5 md:p-6"
          >
            <h2
              id="corrections-title"
              className="ld-h3 flex items-center gap-2 !text-[var(--ld-warning-ink)]"
            >
              <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
              El equipo pidió correcciones
            </h2>
            <p className="mt-2 max-w-[68ch] whitespace-pre-line text-ld-ink">
              {view.correctionNotes ?? 'Revisa tu información y tus documentos.'}
            </p>
            <p className="ld-small mt-3 text-ld-muted">
              Ajusta lo que indica la nota y reenvía tu registro al final.
            </p>
          </section>
        ) : null}

        <h1 className="ld-h1">Completa tu registro como {roleWord}</h1>
        <p className="mt-1 max-w-[60ch] text-ld-muted">
          Sigue los pasos para validar tu identidad
          {view.role === 'SELLER'
            ? ' y la representación de la empresa'
            : ' y tu perfil de inversión'}
          .
        </p>

        <div className="mt-6 flex items-center gap-4">
          <div
            role="progressbar"
            aria-label="Progreso del registro"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-valuetext={`${done} de ${total} pasos completos`}
            className="h-2 flex-1 overflow-hidden rounded-full bg-ld-border"
          >
            <div
              className="h-full rounded-full bg-ld-primary transition-[width] duration-300"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
          <p className="ld-small ld-num shrink-0 font-medium text-ld-navy">
            {done} de {total} listos
          </p>
        </div>

        <div className="mt-6">
          <Stepper steps={steps} current={current} completed={view.progress.completedSteps} />
        </div>

        <section
          aria-labelledby="step-title"
          className="mt-8 rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5 md:p-8"
        >
          <div role="status" className="empty:hidden">
            {savedStep ? (
              <p className="ld-small mb-5 flex items-center gap-2 font-medium text-[var(--ld-success-ink)]">
                <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Guardamos tu paso {savedStep}: {titles[savedStep]}.
              </p>
            ) : null}
          </div>
          <h2 id="step-title" className="ld-h2">
            {stepInfo.title}
          </h2>
          <p className="mt-1 mb-6 max-w-[60ch] text-ld-muted">{stepInfo.description}</p>

          {current !== 6 && missingHere.length > 0 ? (
            <div className="mb-6">
              <MissingBox items={missingHere} />
            </div>
          ) : null}

          {current === 1 ? (
            <div className="max-w-xl">
              <ProfileForm role={view.role} profile={view.profile} userName={user.name} />
            </div>
          ) : null}

          {current === 2 ? (
            <ul>
              <DocumentSlot
                type="NATIONAL_ID"
                label={DOCUMENT_LABELS.NATIONAL_ID}
                hint={DOC_HINTS.NATIONAL_ID}
                doc={docOf('NATIONAL_ID')}
              />
            </ul>
          ) : null}

          {current === 3 ? <LegalForm role={view.role} profile={view.profile} /> : null}
          {current === 4 ? <CompanyForm role={view.role} profile={view.profile} /> : null}

          {current === 5 ? (
            supportDocs.length > 0 ? (
              <ul className="divide-y divide-ld-border">
                {supportDocs.map((t) => (
                  <DocumentSlot
                    key={t}
                    type={t}
                    label={DOCUMENT_LABELS[t]}
                    hint={DOC_HINTS[t]}
                    doc={docOf(t)}
                  />
                ))}
              </ul>
            ) : (
              <p className="max-w-[60ch] text-ld-ink">
                Aún no sabemos qué soportes necesitas.{' '}
                <Link
                  href="/onboarding?paso=3"
                  className="font-medium text-ld-primary underline underline-offset-4"
                >
                  Completa el paso 3
                </Link>{' '}
                y te mostraremos la lista.
              </p>
            )
          ) : null}

          {current === 6 ? (
            <div className="flex flex-col gap-6">
              <ReviewSummary view={view} editable />
              {view.progress.canSubmit ? null : (
                <MissingBox items={view.progress.missing} showLinks titles={titles} />
              )}
              <SubmitButton canSubmit={view.progress.canSubmit} resubmit={corrections} />
            </div>
          ) : null}

          {current === 2 || current === 5 ? (
            <nav
              aria-label="Navegación entre pasos"
              className="mt-8 flex flex-col gap-3 border-t border-ld-border pt-6 sm:flex-row"
            >
              <Link
                href={`/onboarding?paso=${current + 1}`}
                className="ld-btn ld-btn-primary w-full sm:w-auto"
              >
                Continuar
              </Link>
            </nav>
          ) : null}
        </section>
      </main>
    </div>
  );
}
