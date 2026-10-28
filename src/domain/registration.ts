/**
 * Sign-up rules (pure, shared by the server and the form's visible hints).
 */
import { z } from 'zod';

export const REGISTER_ROLES = ['BUYER', 'SELLER'] as const;
export type RegisterRole = (typeof REGISTER_ROLES)[number];

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Shown before submit and as the field error. */
export const PASSWORD_RULE = `Entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres, con al menos una letra y un número.`;

export const REGISTER_MESSAGES = {
  role: 'Elige cómo quieres usar La Dorada.',
  name: 'Escribe tu nombre completo, entre 2 y 120 caracteres.',
  email: 'Escribe un correo válido, por ejemplo nombre@empresa.co.',
  password: `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres, con al menos una letra y un número.`,
  consent: 'Para crear la cuenta debes autorizar el tratamiento de tus datos personales.',
} as const;

export type RegisterField = keyof typeof REGISTER_MESSAGES;

/** Per-rule checks, also used by the form to tick the requirements as the user types. */
export const PASSWORD_CHECKS = {
  length: (p: string) => p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX,
  letter: (p: string) => /\p{L}/u.test(p),
  digit: (p: string) => /\d/.test(p),
} as const;

export const passwordSchema = z
  .string({ error: REGISTER_MESSAGES.password })
  .refine((p) => Object.values(PASSWORD_CHECKS).every((check) => check(p)), {
    message: REGISTER_MESSAGES.password,
  });

/** Validated sign-up input. `consent` is the literal `true`: no consent, no account. */
export const registerInputSchema = z.object({
  role: z.enum(REGISTER_ROLES, { error: REGISTER_MESSAGES.role }),
  name: z
    .string({ error: REGISTER_MESSAGES.name })
    .trim()
    .min(2, REGISTER_MESSAGES.name)
    .max(120, REGISTER_MESSAGES.name),
  email: z
    .string({ error: REGISTER_MESSAGES.email })
    .trim()
    .toLowerCase()
    .max(254, REGISTER_MESSAGES.email)
    .pipe(z.email({ error: REGISTER_MESSAGES.email })),
  password: passwordSchema,
  consent: z.literal(true, { error: REGISTER_MESSAGES.consent }),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

/** Raw form fields → input (`consent` checkbox sends `'on'` when checked). */
export const registerFormSchema = z
  .object({
    role: z.unknown(),
    name: z.unknown(),
    email: z.unknown(),
    password: z.unknown(),
    consent: z.unknown(),
  })
  .transform((f) => ({ ...f, consent: f.consent === 'on' }))
  .pipe(registerInputSchema);
