'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { markAllNotificationsReadAction } from '@/server/notify/actions';
import type { NotificationsView } from '@/server/services/notifications';

/** Topbar bell: unread badge and a popover with the latest notifications. */
export function NotificationBell({ data }: { data: NotificationsView }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const unread = data.unread;
  const badge = unread > 9 ? '9+' : String(unread);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
        className="relative flex size-11 items-center justify-center rounded-full text-ld-muted hover:bg-[var(--ld-neutral-soft)] hover:text-ld-navy"
      >
        <Bell aria-hidden="true" className="size-5" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="ld-num absolute right-1 top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-[var(--ld-danger)] px-1 text-[0.6875rem] font-bold leading-none text-white"
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Notificaciones"
          className="absolute right-0 top-full z-30 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface shadow-[0_12px_40px_rgba(11,42,107,0.18)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ld-border px-4 py-3">
            <p className="font-semibold text-ld-navy">Notificaciones</p>
            {unread > 0 ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => markAllNotificationsReadAction())}
                className="ld-small font-semibold text-ld-primary hover:underline disabled:opacity-60"
              >
                {pending ? 'Marcando…' : 'Marcar todas como leídas'}
              </button>
            ) : null}
          </div>
          {data.items.length > 0 ? (
            <ul className="max-h-[24rem] overflow-y-auto">
              {data.items.map((n) => {
                const body = (
                  <>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        n.read ? 'bg-transparent' : 'bg-ld-primary',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'ld-small block',
                          n.read ? 'text-ld-ink' : 'font-semibold text-ld-navy',
                        )}
                      >
                        {n.title}
                        {n.read ? null : <span className="sr-only"> (sin leer)</span>}
                      </span>
                      <span className="ld-note ld-num mt-0.5 block text-ld-muted">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </span>
                  </>
                );
                const cls = 'flex gap-3 border-b border-ld-border px-4 py-3 last:border-b-0';
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link href={n.href} className={cn(cls, 'hover:bg-[var(--ld-neutral-soft)]')}>
                        {body}
                      </Link>
                    ) : (
                      <div className={cls}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ld-small px-4 py-6 text-center text-ld-muted">
              No tienes notificaciones todavía.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
