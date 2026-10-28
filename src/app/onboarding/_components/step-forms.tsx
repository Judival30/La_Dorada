'use client';

import { useState } from 'react';
import {
  DEPARTMENTS,
  type BuyerType,
  type OnboardingRole,
  type ProfileData,
} from '@/domain/onboarding';
import { SECTORS, SECTOR_LABELS } from '@/domain/sectors';
import { formatPhone } from './format';
import {
  CheckOption,
  RadioCard,
  SelectField,
  StepFooter,
  TextField,
  str,
  useStepForm,
  FieldError,
  describedBy,
} from './ui';

type Profile = Partial<ProfileData>;

const DEPARTMENT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: d }));
const SECTOR_OPTIONS = SECTORS.map((s) => ({ value: s, label: SECTOR_LABELS[s] }));

export function ProfileForm({
  role,
  profile,
  userName,
}: {
  role: OnboardingRole;
  profile: Profile;
  userName: string;
}) {
  const f = useStepForm(1);
  const saved = profile.step1;
  const v = f.values;
  return (
    <form action={f.action} noValidate className="flex flex-col gap-6">
      <TextField
        name="name"
        label="Nombre completo"
        autoComplete="name"
        maxLength={120}
        defaultValue={str(v?.name) ?? saved?.name ?? userName}
        error={f.fieldErrors.name}
      />
      <TextField
        name="phone"
        label="Celular"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+57 300 123 4567"
        hint="Lo usamos solo para contactarte durante la verificación."
        defaultValue={str(v?.phone) ?? (saved?.phone ? formatPhone(saved.phone) : undefined)}
        error={f.fieldErrors.phone}
      />
      <TextField
        name="position"
        label={role === 'SELLER' ? 'Cargo en la empresa' : 'Cargo o rol'}
        autoComplete="organization-title"
        maxLength={80}
        placeholder={role === 'SELLER' ? 'Gerente general' : 'Socio, director de inversiones…'}
        defaultValue={str(v?.position) ?? saved?.position}
        error={f.fieldErrors.position}
      />
      <StepFooter pending={f.pending} error={f.error} />
    </form>
  );
}

const BUYER_TYPE_OPTIONS: { value: BuyerType; title: string; text: string }[] = [
  { value: 'FUND', title: 'Fondo de inversión', text: 'Inviertes capital de terceros.' },
  { value: 'STRATEGIC', title: 'Empresa estratégica', text: 'Compras para crecer tu negocio.' },
  {
    value: 'FAMILY_OFFICE',
    title: 'Family office',
    text: 'Gestionas el patrimonio de una familia.',
  },
  {
    value: 'ANGEL',
    title: 'Inversionista a título personal',
    text: 'Inviertes con tu propio capital.',
  },
];

export function LegalForm({ role, profile }: { role: OnboardingRole; profile: Profile }) {
  const f = useStepForm(3);
  const saved = profile.step3;
  const v = f.values;

  const savedBuyer = saved && 'buyerType' in saved ? saved : undefined;
  const [buyerType, setBuyerType] = useState<string>(
    str(v?.buyerType) ?? savedBuyer?.buyerType ?? '',
  );

  if (role === 'SELLER') {
    const savedLegal =
      saved && 'isLegalRepresentative' in saved ? saved.isLegalRepresentative : undefined;
    const current =
      str(v?.isLegalRepresentative) ??
      (savedLegal === true ? 'yes' : savedLegal === false ? 'no' : undefined);
    const err = f.fieldErrors.isLegalRepresentative;
    return (
      <form action={f.action} noValidate className="flex flex-col gap-6">
        <fieldset
          aria-describedby={describedBy(err && 'legal-error')}
          className="flex flex-col gap-3"
        >
          <legend className="ld-small mb-3 font-semibold text-ld-navy">
            ¿Eres el representante legal de la empresa?
          </legend>
          <RadioCard
            name="isLegalRepresentative"
            value="yes"
            title="Sí, soy el representante legal"
            text="Te pediremos el certificado de Cámara de Comercio y el RUT."
            defaultChecked={current === 'yes'}
          />
          <RadioCard
            name="isLegalRepresentative"
            value="no"
            title="No, actúo con un poder o autorización"
            text="Además de esos documentos, sube el poder que te autoriza."
            defaultChecked={current === 'no'}
          />
          <FieldError id="legal-error" message={err} />
        </fieldset>
        <StepFooter pending={f.pending} error={f.error} />
      </form>
    );
  }

  const err = f.fieldErrors.buyerType;
  return (
    <form action={f.action} noValidate className="flex flex-col gap-6">
      <fieldset
        aria-describedby={describedBy(err && 'buyer-type-error')}
        className="flex flex-col gap-3"
      >
        <legend className="ld-small mb-3 font-semibold text-ld-navy">¿A quién representas?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {BUYER_TYPE_OPTIONS.map((o) => (
            <RadioCard
              key={o.value}
              name="buyerType"
              value={o.value}
              title={o.title}
              text={o.text}
              defaultChecked={buyerType === o.value}
              onSelect={() => setBuyerType(o.value)}
            />
          ))}
        </div>
        <FieldError id="buyer-type-error" message={err} />
      </fieldset>
      {buyerType && buyerType !== 'ANGEL' ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            name="entityName"
            label="Nombre de la entidad"
            maxLength={160}
            defaultValue={str(v?.entityName) ?? savedBuyer?.entityName}
            error={f.fieldErrors.entityName}
          />
          <TextField
            name="entityNit"
            label="NIT de la entidad"
            placeholder="900.123.456-7"
            inputMode="numeric"
            defaultValue={str(v?.entityNit) ?? savedBuyer?.entityNit}
            error={f.fieldErrors.entityNit}
          />
        </div>
      ) : null}
      <StepFooter pending={f.pending} error={f.error} />
    </form>
  );
}

export function CompanyForm({ role, profile }: { role: OnboardingRole; profile: Profile }) {
  const f = useStepForm(4);
  const v = f.values;
  const saved = profile.step4;

  if (role === 'SELLER') {
    const s = saved && 'legalName' in saved ? saved : undefined;
    return (
      <form action={f.action} noValidate className="flex flex-col gap-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            name="legalName"
            label="Razón social"
            maxLength={160}
            autoComplete="organization"
            defaultValue={str(v?.legalName) ?? s?.legalName}
            error={f.fieldErrors.legalName}
          />
          <TextField
            name="nit"
            label="NIT"
            placeholder="900.123.456-7"
            inputMode="numeric"
            defaultValue={str(v?.nit) ?? s?.nit}
            error={f.fieldErrors.nit}
          />
          <SelectField
            name="sector"
            label="Sector"
            placeholder="Selecciona un sector"
            options={SECTOR_OPTIONS}
            defaultValue={str(v?.sector) ?? s?.sector}
            error={f.fieldErrors.sector}
          />
          <SelectField
            name="department"
            label="Departamento"
            placeholder="Selecciona un departamento"
            options={DEPARTMENT_OPTIONS}
            defaultValue={str(v?.department) ?? s?.department}
            error={f.fieldErrors.department}
          />
          <TextField
            name="city"
            label="Ciudad"
            autoComplete="address-level2"
            defaultValue={str(v?.city) ?? s?.city}
            error={f.fieldErrors.city}
          />
        </div>
        <StepFooter pending={f.pending} error={f.error} />
      </form>
    );
  }

  const b = saved && 'sectors' in saved ? saved : undefined;
  const sectors = new Set(Array.isArray(v?.sectors) ? v.sectors : (b?.sectors ?? []));
  const regions = new Set(Array.isArray(v?.regions) ? v.regions : (b?.regions ?? []));
  return (
    <form action={f.action} noValidate className="flex flex-col gap-8">
      <fieldset aria-describedby={describedBy(f.fieldErrors.sectors && 'sectors-error')}>
        <legend className="ld-small mb-2 font-semibold text-ld-navy">Sectores de interés</legend>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {SECTOR_OPTIONS.map((o) => (
            <CheckOption
              key={o.value}
              name="sectors"
              value={o.value}
              label={o.label}
              defaultChecked={sectors.has(o.value)}
            />
          ))}
        </div>
        <FieldError id="sectors-error" message={f.fieldErrors.sectors} />
      </fieldset>
      <fieldset aria-describedby={describedBy(f.fieldErrors.regions && 'regions-error')}>
        <legend className="ld-small mb-2 font-semibold text-ld-navy">Regiones de interés</legend>
        <div className="gap-x-4 sm:columns-2 lg:columns-3">
          {DEPARTMENT_OPTIONS.map((o) => (
            <CheckOption
              key={o.value}
              name="regions"
              value={o.value}
              label={o.label}
              defaultChecked={regions.has(o.value)}
            />
          ))}
        </div>
        <FieldError id="regions-error" message={f.fieldErrors.regions} />
      </fieldset>
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField
          name="ticketMinMillions"
          label="Ticket mínimo (COP millones)"
          inputMode="numeric"
          placeholder="2.000"
          hint="Escribe el monto en millones de pesos: 2.000 equivale a COP 2.000 M."
          defaultValue={str(v?.ticketMinMillions) ?? (b ? String(b.ticketMinMillions) : undefined)}
          error={f.fieldErrors.ticketMinMillions}
        />
        <TextField
          name="ticketMaxMillions"
          label="Ticket máximo (COP millones)"
          inputMode="numeric"
          placeholder="15.000"
          defaultValue={str(v?.ticketMaxMillions) ?? (b ? String(b.ticketMaxMillions) : undefined)}
          error={f.fieldErrors.ticketMaxMillions}
        />
      </div>
      <StepFooter pending={f.pending} error={f.error} />
    </form>
  );
}
