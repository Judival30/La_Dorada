/** Economic sectors. Literals mirror the Prisma `Sector` enum. */
export const SECTORS = [
  'AGROINDUSTRIA',
  'ALIMENTOS_BEBIDAS',
  'LOGISTICA',
  'SERVICIOS_FINANCIEROS',
  'MANUFACTURA',
  'TECNOLOGIA',
  'SALUD',
  'RETAIL',
  'CONSTRUCCION',
  'ENERGIA',
] as const;

export type Sector = (typeof SECTORS)[number];

/** Display labels in es-CO. */
export const SECTOR_LABELS: Record<Sector, string> = {
  AGROINDUSTRIA: 'Agroindustria',
  ALIMENTOS_BEBIDAS: 'Alimentos y Bebidas',
  LOGISTICA: 'Logística',
  SERVICIOS_FINANCIEROS: 'Servicios Financieros',
  MANUFACTURA: 'Manufactura',
  TECNOLOGIA: 'Tecnología',
  SALUD: 'Salud',
  RETAIL: 'Retail',
  CONSTRUCCION: 'Construcción',
  ENERGIA: 'Energía',
};
