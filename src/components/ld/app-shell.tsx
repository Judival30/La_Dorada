'use client';

import { ChevronDown, CircleHelp, LogOut, MapPin, Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Role } from '@/domain/roles';
import { NAV, ROLE_LABEL, type NavItem } from '@/config/nav';
import { cn } from '@/lib/utils';
import { logoutAction } from '@/server/auth/actions';
import { Logo } from './logo';

type ShellUser = { name: string; email: string };
type AppShellProps = { role: Role; user: ShellUser; children: React.ReactNode };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function isActive(item: NavItem, pathname: string, homes: string[]): boolean {
  if (homes.includes(item.href)) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavList({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAV[role];
  // Items that are a prefix of a sibling (home pages) only match exactly.
  const homes = items
    .filter((i) => items.some((o) => o !== i && o.href.startsWith(`${i.href}/`)))
    .map((i) => i.href);
  return (
    <nav aria-label="Navegación principal">
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isActive(item, pathname, homes);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-[var(--ld-radius-nav)] px-3 text-[0.9375rem] font-medium transition-colors',
                  active
                    ? 'bg-ld-primary-soft text-ld-navy'
                    : 'text-ld-ink hover:bg-[var(--ld-neutral-soft)] hover:text-ld-navy',
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn('size-5 shrink-0', active ? 'text-ld-primary' : 'text-ld-muted')}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Brand card from the pitch: the phrase, a small crest and the quiet tricolor stripe. */
function BrandCard() {
  return (
    <div className="overflow-hidden rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface">
      <p className="px-4 pt-4 font-display text-[0.9375rem] font-semibold leading-5 text-ld-navy">
        Más empresas fuertes para un mejor Colombia.
      </p>
      <div aria-hidden="true" className="mx-4 mt-3 flex h-[3px] overflow-hidden rounded-full">
        <span className="flex-[2] bg-[#F2B21B]" />
        <span className="flex-1 bg-[#1A5CE6]" />
        <span className="flex-1 bg-[#DC2626]" />
      </div>
      <div className="h-4" />
    </div>
  );
}

export function AppShell({ role, user, children }: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Close the drawer when the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const button = menuButton.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      button?.focus();
    };
  }, [open]);

  const roleLabel = ROLE_LABEL[role];

  return (
    <div className="min-h-screen md:grid md:grid-cols-[17.5rem_1fr]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-[var(--ld-radius-control)] focus:bg-ld-navy focus:px-4 focus:py-2 focus:text-white"
      >
        Saltar al contenido
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden border-r border-ld-border bg-ld-surface md:block">
        <div className="sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto px-4 py-5">
          <Link href={NAV[role][0]?.href ?? '/'} aria-label="La Dorada, ir al inicio" className="px-2">
            <Logo />
          </Link>
          <NavList role={role} />
          <div className="mt-auto">
            <BrandCard />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-2 border-b border-ld-border bg-ld-surface px-3 md:hidden">
          <button
            ref={menuButton}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={open}
            aria-controls="menu-movil"
            className="flex size-11 items-center justify-center rounded-[var(--ld-radius-control)] text-ld-navy hover:bg-[var(--ld-neutral-soft)]"
          >
            <Menu aria-hidden="true" className="size-6" />
          </button>
          <Logo variant="mark" className="[&_svg]:h-7" />
          <span className="font-display text-lg font-bold tracking-[-0.02em] text-ld-navy">La Dorada</span>
          <span className="ml-auto flex size-9 items-center justify-center rounded-full bg-ld-navy text-[0.8125rem] font-semibold text-white">
            <span aria-hidden="true">{initials(user.name)}</span>
            <span className="sr-only">{`${user.name}, ${roleLabel}`}</span>
          </span>
        </header>

        {/* Desktop topbar */}
        <header className="hidden h-16 items-center gap-3 border-b border-ld-border bg-ld-surface px-8 md:flex">
          <div className="relative max-w-xl flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-ld-muted"
            />
            <input
              type="search"
              disabled
              aria-label="Buscar por empresa, sector o palabra clave (disponible pronto)"
              placeholder="Buscar por empresa, sector o palabra clave"
              className="ld-field pl-10 disabled:cursor-not-allowed"
            />
          </div>
          <button
            type="button"
            disabled
            aria-label="Región: Colombia (selector disponible pronto)"
            className="ld-btn ld-btn-quiet disabled:cursor-not-allowed"
          >
            <MapPin aria-hidden="true" className="size-4 text-ld-muted" />
            Colombia
            <ChevronDown aria-hidden="true" className="size-4 text-ld-muted" />
          </button>
          <Link
            href="/#como-funciona"
            aria-label="Ayuda"
            className="flex size-11 items-center justify-center rounded-full text-ld-muted hover:bg-[var(--ld-neutral-soft)] hover:text-ld-navy"
          >
            <CircleHelp aria-hidden="true" className="size-5" />
          </Link>
          <div className="ml-1 flex items-center gap-3 border-l border-ld-border pl-4">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-ld-navy text-[0.8125rem] font-semibold text-white"
            >
              {initials(user.name)}
            </span>
            <div className="leading-tight">
              <p className="ld-small font-semibold text-ld-navy">{user.name}</p>
              <p className="ld-note text-ld-muted">{roleLabel}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="ld-btn ld-btn-quiet min-h-10 px-3"
              >
                <LogOut aria-hidden="true" className="size-4" />
                Cerrar sesión
              </button>
            </form>
          </div>
        </header>

        <main id="contenido" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-ld-navy/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            id="menu-movil"
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            className="absolute inset-y-0 left-0 flex w-[19rem] max-w-[85vw] flex-col gap-5 overflow-y-auto bg-ld-surface px-4 py-4 shadow-[0_12px_40px_rgba(11,42,107,0.28)]"
          >
            <div className="flex items-center justify-between">
              <Logo />
              <button
                ref={closeButton}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="flex size-11 items-center justify-center rounded-[var(--ld-radius-control)] text-ld-navy hover:bg-[var(--ld-neutral-soft)]"
              >
                <X aria-hidden="true" className="size-6" />
              </button>
            </div>
            <div className="ld-small border-b border-ld-border pb-4">
              <p className="font-semibold text-ld-navy">{user.name}</p>
              <p className="text-ld-muted">{roleLabel}</p>
            </div>
            <NavList role={role} onNavigate={() => setOpen(false)} />
            <div className="mt-auto flex flex-col gap-3">
              <BrandCard />
              <form action={logoutAction}>
                <button type="submit" className="ld-btn ld-btn-quiet w-full">
                  <LogOut aria-hidden="true" className="size-4" />
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
