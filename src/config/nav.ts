import {
  Bell,
  Bookmark,
  Building2,
  CalendarDays,
  ChartColumn,
  FileSearch,
  FolderOpen,
  Handshake,
  House,
  KeyRound,
  Lightbulb,
  MessageSquare,
  ScrollText,
  Settings,
  ShieldCheck,
  ArrowLeftRight,
  Store,
  Users,
  Vault,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/domain/roles';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** false: no screen yet; the shell renders it as "Pronto", not as a link. */
  available: boolean;
};

/** Sidebar entries per role (spec section 8). The first item is each role's home. */
export const NAV: Record<Role, NavItem[]> = {
  BUYER: [
    { href: '/marketplace', label: 'Marketplace', icon: Store, available: true },
    { href: '/saved', label: 'Oportunidades guardadas', icon: Bookmark, available: false },
    { href: '/processes', label: 'Mis procesos', icon: FolderOpen, available: false },
    { href: '/processes/due-diligence', label: 'Due Diligence', icon: FileSearch, available: false },
    { href: '/processes/offers', label: 'Ofertas', icon: Handshake, available: false },
    { href: '/alerts', label: 'Alertas', icon: Bell, available: false },
  ],
  SELLER: [
    { href: '/seller', label: 'Inicio', icon: House, available: true },
    { href: '/seller/company', label: 'Mi empresa', icon: Building2, available: false },
    { href: '/seller/opportunity', label: 'Mis oportunidades', icon: Lightbulb, available: false },
    { href: '/seller/access-requests', label: 'Solicitudes de acceso', icon: KeyRound, available: false },
    { href: '/seller/data-room', label: 'Data room', icon: Vault, available: false },
    { href: '/messages', label: 'Mensajes', icon: MessageSquare, available: false },
    { href: '/seller/meetings', label: 'Reuniones', icon: CalendarDays, available: false },
  ],
  BACKOFFICE: [
    { href: '/bo', label: 'Inicio', icon: House, available: true },
    { href: '/bo/users', label: 'Usuarios', icon: Users, available: true },
    { href: '/bo/companies', label: 'Empresas', icon: Building2, available: false },
    { href: '/bo/opportunities', label: 'Oportunidades', icon: Lightbulb, available: false },
    { href: '/bo/confidentiality', label: 'Confidencialidad', icon: ShieldCheck, available: false },
    { href: '/bo/transactions', label: 'Transacciones', icon: ArrowLeftRight, available: false },
    { href: '/bo/reports', label: 'Reportes', icon: ChartColumn, available: false },
    { href: '/bo/settings', label: 'Configuración', icon: Settings, available: false },
    { href: '/bo/audit', label: 'Auditoría', icon: ScrollText, available: false },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  BUYER: 'Comprador',
  SELLER: 'Vendedor',
  BACKOFFICE: 'Back Office',
};
