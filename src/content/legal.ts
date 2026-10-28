/**
 * Legal copy shown at sign-up (Habeas Data, Ley 1581 de 2012). Reference text
 * only: it must be reviewed by legal counsel before production (M6).
 */

/** Visible marker that the text is not yet legally validated. */
export const LEGAL_REVIEW_NOTE = 'Texto de referencia — validar con asesor legal';

/** Label of the consent checkbox. */
export const HABEAS_DATA_CONSENT =
  'Autorizo a La Dorada a tratar mis datos personales, conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013, para verificar mi identidad, acreditarme como usuario y operar el marketplace. Conozco mi derecho a conocer, actualizar, rectificar y suprimir mis datos.';

/** Summary of the data-processing policy, shown inside a `<details>`. */
export const HABEAS_DATA_POLICY = {
  title: 'Política de tratamiento de datos (resumen)',
  sections: [
    {
      heading: 'Responsable',
      text: 'La Dorada es responsable del tratamiento de los datos que entregas al crear tu cuenta y durante el proceso de verificación.',
    },
    {
      heading: 'Qué datos tratamos',
      text: 'Nombre, correo, celular, cargo, datos de la empresa o entidad que representas y los documentos que adjuntes para verificar tu identidad y tu representación.',
    },
    {
      heading: 'Para qué',
      text: 'Verificar tu identidad, acreditarte como comprador o vendedor, consultar listas restrictivas, operar el marketplace y comunicarnos contigo sobre tu cuenta y tus procesos.',
    },
    {
      heading: 'Tus derechos',
      text: 'Puedes conocer, actualizar, rectificar y suprimir tus datos, revocar esta autorización y pedir prueba de ella. También puedes presentar quejas ante la Superintendencia de Industria y Comercio.',
    },
    {
      heading: 'Cómo ejercerlos',
      text: 'Escríbenos desde el correo de tu cuenta. Respondemos consultas en máximo 10 días hábiles y reclamos en máximo 15 días hábiles.',
    },
  ],
} as const;
