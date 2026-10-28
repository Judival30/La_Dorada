import type { Role } from '../../../src/domain/roles';
import type { UserStatus } from '../../../src/domain/machines/user';

/** Usuarios ficticios de demo. Todos los correos son minúsculas bajo demo.ladorada.co. */
export type SeedUser = {
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  organization: {
    name: string;
    nit: string;
    kind: 'COMPANY' | 'BUYER_ENTITY';
    buyerType?: 'FONDO' | 'ESTRATEGICO' | 'FAMILY_OFFICE' | 'ANGEL';
  } | null;
  /** Only for BLOCKED accounts: the reason Back Office gave (ficticio). */
  blockedReason?: string;
};

/** Contraseña compartida por todas las cuentas demo. Solo para datos de demostración. */
export const DEMO_PASSWORD = 'LaDorada2026!';

export const SEED_USERS: SeedUser[] = [
  // Cuentas demo principales.
  {
    email: 'comprador@demo.ladorada.co',
    name: 'Luis Martínez',
    role: 'BUYER',
    status: 'ENABLED',
    organization: {
      name: 'Andes Capital Partners',
      nit: '900.201.001-1',
      kind: 'BUYER_ENTITY',
      buyerType: 'FONDO',
    },
  },
  {
    email: 'vendedor@demo.ladorada.co',
    name: 'María González',
    role: 'SELLER',
    status: 'ENABLED',
    organization: {
      name: 'Cafés de Antioquia S.A.S.',
      nit: '900.101.001-1',
      kind: 'COMPANY',
    },
  },
  {
    email: 'admin@demo.ladorada.co',
    name: 'Back Office',
    role: 'BACKOFFICE',
    status: 'ENABLED',
    organization: null,
  },
  {
    email: 'revision@demo.ladorada.co',
    name: 'Carolina Restrepo Vélez',
    role: 'BUYER',
    status: 'IN_REVIEW',
    organization: {
      name: 'Inversiones Río Claro S.A.S.',
      nit: '900.202.002-2',
      kind: 'BUYER_ENTITY',
      buyerType: 'ANGEL',
    },
  },

  // Vendedores habilitados que son dueños de las 14 empresas restantes.
  {
    email: 'paola.quintero@demo.ladorada.co',
    name: 'Paola Quintero',
    role: 'SELLER',
    status: 'ENABLED',
    organization: {
      name: 'Logística Caribe S.A.S.',
      nit: '900.102.002-2',
      kind: 'COMPANY',
    },
  },
  {
    email: 'tomas.arango@demo.ladorada.co',
    name: 'Tomás Arango',
    role: 'SELLER',
    status: 'ENABLED',
    organization: {
      name: 'Tecnipagos Pyme S.A.S.',
      nit: '900.103.003-3',
      kind: 'COMPANY',
    },
  },
  {
    email: 'juliana.mora@demo.ladorada.co',
    name: 'Juliana Mora',
    role: 'SELLER',
    status: 'ENABLED',
    organization: {
      name: 'AgroAndina S.A.S.',
      nit: '900.104.004-4',
      kind: 'COMPANY',
    },
  },
  {
    email: 'hernan.castano@demo.ladorada.co',
    name: 'Hernán Castaño Duarte',
    role: 'SELLER',
    status: 'ENABLED',
    organization: {
      name: 'Textiles Santa Rosa S.A.S.',
      nit: '900.105.005-5',
      kind: 'COMPANY',
    },
  },
  {
    email: 'esteban.rojas@demo.ladorada.co',
    name: 'Esteban Rojas',
    role: 'SELLER',
    status: 'ENABLED',
    organization: {
      name: 'Clínica Andina del Sur S.A.S.',
      nit: '900.106.006-6',
      kind: 'COMPANY',
    },
  },

  // Solicitudes de vendedores fuera de estado ENABLED. No son dueños de ninguna empresa.
  {
    email: 'gustavo.ariza@demo.ladorada.co',
    name: 'Gustavo Ariza Peña',
    role: 'SELLER',
    status: 'PENDING',
    organization: {
      name: 'Avícola Los Robles S.A.S.',
      nit: '900.301.001-1',
      kind: 'COMPANY',
    },
  },
  {
    email: 'sandra.cardenas@demo.ladorada.co',
    name: 'Sandra Milena Cárdenas',
    role: 'SELLER',
    status: 'IN_REVIEW',
    organization: {
      name: 'Confecciones Altavista S.A.S.',
      nit: '900.302.002-2',
      kind: 'COMPANY',
    },
  },
  {
    email: 'ricardo.villamizar@demo.ladorada.co',
    name: 'Ricardo Villamizar',
    role: 'SELLER',
    status: 'CORRECTIONS_REQUESTED',
    organization: {
      name: 'Droguería Sabana Verde S.A.S.',
      nit: '900.303.003-3',
      kind: 'COMPANY',
    },
  },
  {
    email: 'lorena.ospina@demo.ladorada.co',
    name: 'Lorena Ospina',
    role: 'SELLER',
    status: 'REJECTED',
    organization: {
      name: 'Turismo Frontera Viva S.A.S.',
      nit: '900.304.004-4',
      kind: 'COMPANY',
    },
  },
  {
    email: 'mauricio.penaloza@demo.ladorada.co',
    name: 'Mauricio Peñaloza',
    role: 'SELLER',
    status: 'BLOCKED',
    organization: {
      name: 'Mineras del Nevado S.A.S.',
      nit: '900.305.005-5',
      kind: 'COMPANY',
    },
    blockedReason:
      'Recibimos un reporte sobre la titularidad de la empresa y la estamos verificando con los soportes.',
  },

  // Más solicitudes en revisión para la cola del Back Office.
  {
    email: 'andres.bernal@demo.ladorada.co',
    name: 'Andrés Bernal Cuesta',
    role: 'BUYER',
    status: 'IN_REVIEW',
    organization: {
      name: 'Fondo Sierra Nevada S.A.S.',
      nit: '900.203.003-3',
      kind: 'BUYER_ENTITY',
      buyerType: 'FONDO',
    },
  },
  {
    email: 'felipe.zapata@demo.ladorada.co',
    name: 'Felipe Zapata Gil',
    role: 'BUYER',
    status: 'IN_REVIEW',
    organization: {
      name: 'Grupo Industrial Zapata S.A.S.',
      nit: '900.204.004-4',
      kind: 'BUYER_ENTITY',
      buyerType: 'ESTRATEGICO',
    },
  },
  {
    email: 'diana.lozano@demo.ladorada.co',
    name: 'Diana Lozano Mejía',
    role: 'SELLER',
    status: 'IN_REVIEW',
    organization: {
      name: 'Panificadora Santa Clara S.A.S.',
      nit: '900.306.006-6',
      kind: 'COMPANY',
    },
  },
];
