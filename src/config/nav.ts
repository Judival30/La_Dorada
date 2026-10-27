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

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Sidebar entries per role (spec section 8). The first item is each role's home. */
export const NAV: Record<Role, NavItem[]> = {
  BUYER: [
    { href: '/marketplace', label: 'Marketplace', icon: Store },
    { href: '/saved', label: 'Oportunidades guardadas', icon: Bookmark },
    { href: '/processes', label: 'Mis procesos', icon: FolderOpen },
    { href: '/processes/due-diligence', label: 'Due Diligence', icon: FileSearch },
    { href: '/processes/offers', label: 'Ofertas', icon: Handshake },
    { href: '/alerts', label: 'Alertas', icon: Bell },
  ],
  SELLER: [
    { href: '/seller', label: 'Inicio', icon: House },
    { href: '/seller/company', label: 'Mi empresa', icon: Building2 },
    { href: '/seller/opportunity', label: 'Mis oportunidades', icon: Lightbulb },
    { href: '/seller/access-requests', label: 'Solicitudes de acceso', icon: KeyRound },
    { href: '/seller/data-room', label: 'Data room', icon: Vault },
    { href: '/messages', label: 'Mensajes', icon: MessageSquare },
    { href: '/seller/meetings', label: 'Reuniones', icon: CalendarDays },
  ],
  BACKOFFICE: [
    { href: '/bo', label: 'Inicio', icon: House },
    { href: '/bo/users', label: 'Usuarios', icon: Users },
    { href: '/bo/companies', label: 'Empresas', icon: Building2 },
    { href: '/bo/opportunities', label: 'Oportunidades', icon: Lightbulb },
    { href: '/bo/confidentiality', label: 'Confidencialidad', icon: ShieldCheck },
    { href: '/bo/transactions', label: 'Transacciones', icon: ArrowLeftRight },
    { href: '/bo/reports', label: 'Reportes', icon: ChartColumn },
    { href: '/bo/settings', label: 'Configuración', icon: Settings },
    { href: '/bo/audit', label: 'Auditoría', icon: ScrollText },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  BUYER: 'Comprador',
  SELLER: 'Vendedor',
  BACKOFFICE: 'Back Office',
};
