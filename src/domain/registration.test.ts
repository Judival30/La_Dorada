import { describe, expect, it } from 'vitest';
import { REGISTER_MESSAGES, passwordSchema, registerFormSchema } from './registration';

const valid = {
  role: 'SELLER',
  name: '  Valentina Ríos ',
  email: ' Valentina@Empresa.CO ',
  password: 'Montana2026dorada',
  consent: 'on',
};

describe('registerFormSchema', () => {
  it('normalizes the email and name and turns the checkbox into consent: true', () => {
    expect(registerFormSchema.parse(valid)).toEqual({
      role: 'SELLER',
      name: 'Valentina Ríos',
      email: 'valentina@empresa.co',
      password: 'Montana2026dorada',
      consent: true,
    });
  });

  it.each([undefined, '', 'off', 'true'])('rejects consent %s', (consent) => {
    const r = registerFormSchema.safeParse({ ...valid, consent });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({
      path: ['consent'],
      message: REGISTER_MESSAGES.consent,
    });
  });

  it('only accepts BUYER or SELLER', () => {
    for (const role of ['BACKOFFICE', '', undefined]) {
      expect(registerFormSchema.safeParse({ ...valid, role }).success).toBe(false);
    }
  });
});

describe('passwordSchema', () => {
  it.each(['Montana2026', 'ñandú12345', `a1${'x'.repeat(126)}`])('accepts %s', (p) => {
    expect(passwordSchema.safeParse(p).success).toBe(true);
  });

  it.each(['abc123456', 'soloLetrasAqui', '12345678901', `a1${'x'.repeat(127)}`])(
    'rejects %s',
    (p) => {
      expect(passwordSchema.safeParse(p).success).toBe(false);
    },
  );
});
