# Sistema de diseño de La Dorada

Este documento fija la identidad visual del producto. Se escribió en dos pasadas: primero el plan, luego una revisión contra el brief del cliente (pitch) y recién después el código. Las referencias son las pantallas del pitch (`slide01`, `slide02`, `slide03`, `slide07`, `slide13`).

## 1. Plan de diseño (pasada 1)

### Sujeto, audiencia y trabajo principal

La Dorada es un marketplace donde compradores cualificados encuentran, evalúan y negocian la compra de, o la inversión en, empresas privadas colombianas. Tres roles: comprador, vendedor y Back Office. El trabajo principal de la interfaz es dar confianza: que cada cifra se lea sin esfuerzo, que quede claro qué es público y qué es confidencial, y que el proceso avance sin sorpresas. La referencia del sector es la sobriedad de la banca privada y de las notarías, no la de una app de consumo.

### Paleta (hex con nombre)

| Nombre | Hex | Uso |
|---|---|---|
| Navy | `#0B2A6B` | Títulos, wordmark, panel de marca, texto de mayor énfasis |
| Azul acción | `#1A5CE6` | Botones primarios, enlaces, foco, ítem activo |
| Oro | `#F2B21B` | Marca y la cresta dorada. Solo decoración o texto grande sobre navy |
| Niebla | `#F5F8FF` | Fondo de la aplicación |
| Papel | `#FFFFFF` | Superficies (paneles, campos) |
| Borde | `#E3E9F5` | Estructura. Casi toda la jerarquía se dibuja con borde, no con sombra |

Apoyos de texto: tinta `#33415F` (cuerpo, 10,2:1 sobre papel) y apagado `#5A6785` (secundario, 5,3:1 sobre niebla).
Semánticos (éxito `#16A34A`, advertencia `#D97706`, peligro `#DC2626`, info `#2563EB`) viven como relleno de ícono o punto. Cada uno tiene `-soft` (fondo de chip) y `-ink` (texto del chip, ≥ 6:1) porque los tonos puros no llegan a 4,5:1 sobre blanco (advertencia 3,2:1; éxito 3,3:1).

Regla del oro: sobre fondo claro el oro mide 1,9:1, así que nunca porta texto. Sobre navy mide 7,2:1 y sí puede.

### Tipografía

- **Plus Jakarta Sans** para títulos y el wordmark: peso 700 en display y h1, 600 en h2 y h3. Interletraje negativo (−0,02 em) en tamaños grandes.
- **Inter** para texto y datos, con `font-variant-numeric: tabular-nums` en toda cifra (clase `.ld-num`) para que las columnas de COP se alineen.
- Escala (razón 1,25 aproximada, mobile → escritorio):

| Rol | Mobile | Escritorio | Fuente y peso |
|---|---|---|---|
| Display | 34/38 | 52/54 | Jakarta 700 |
| H1 | 26/32 | 32/38 | Jakarta 700 |
| H2 | 20/28 | 24/32 | Jakarta 600 |
| H3 | 17/24 | 18/26 | Jakarta 600 |
| Cuerpo | 16/26 | 16/26 | Inter 400 |
| Pequeño | 14/20 | 14/20 | Inter 400/500 |
| Nota | 12/16 | 12/16 | Inter 500 (mínimo absoluto) |

- Líneas de texto de máximo 68 caracteres (`max-w-prose` en párrafos de lectura).
- Sin mayúsculas sostenidas, salvo el lema de marca "EMPRESAS CON MÁS FUTURO" dentro del logo.

### Layout (conceptos con wireframes)

**Shell de aplicación (≥ 1024 px).** Una sola columna de navegación a la izquierda, topbar fina, contenido alineado a la izquierda con ancho máximo de 1200 px.

```
+--------------+-----------------------------------------------------+
| [^] La Dorada| [lupa Buscar empresa...........] [Colombia v] (?) (JD)|
|              |                                           Comprador  |
| [] Marketplace  ---------------------------------------------------|
| [] Guardadas | Hola, Camila                                         |
| [] Procesos  | Resumen de tu semana                                 |
| [] Due Dilig.|                                                      |
| [] Ofertas   |  +------------------------------------------------+  |
| [] Alertas   |  |  EmptyState: que veras aqui + "Muy pronto..."  |  |
|              |  +------------------------------------------------+  |
| +----------+ |                                                      |
| |Mas empres| |                                                      |
| |as fuertes| |                                                      |
| |~~~cresta | |   Disclaimer (cuando hay valoracion)                 |
| +----------+ |                                                      |
+--------------+-----------------------------------------------------+
```

**Shell móvil (< 768 px).** Header con hamburguesa que abre un cajón con la misma navegación y la tarjeta de marca; topbar reducida a búsqueda (ícono) y avatar.

```
+----------------------------+
| [=]  [^] La Dorada    (JD) |
+----------------------------+
| Hola, Camila               |
| +------------------------+ |
| | EmptyState             | |
| +------------------------+ |
+----------------------------+
```

**Login (el momento memorable).** Pantalla partida. A la izquierda un panel navy con la cresta andina: tres capas de montaña en azules oscuros y, encima, una sola línea dorada que dibuja el perfil de la cordillera una vez al cargar. A la derecha el formulario sobre niebla, alineado a la izquierda. En móvil la cresta pasa a una franja de 160 px arriba del formulario.

```
+-------------------------------+--------------------------------+
|  navy                         |  niebla                        |
|  [^] La Dorada                |                                |
|                               |   Entra a La Dorada            |
|  Encuentra, valida y          |   Ingresa con tu correo.       |
|  negocia empresas con         |                                |
|  más futuro.                  |   Correo                       |
|                               |   [______________________]     |
|        /\      /\             |   Contraseña                   |
|   /\  /  \/\  /  \  /\        |   [______________________]     |
|  /  \/       \/    \/  \      |   [ Entrar ]                   |
|  ~~~~~ cresta dorada ~~~~~    |   Cuentas demo: ...            |
+-------------------------------+--------------------------------+
```

**Landing.** Una sola página, texto alineado a la izquierda. Hero claro con título display y la misma cresta como borde inferior del hero (navy abajo, línea dorada arriba). Debajo: los tres roles, la secuencia de seis pasos, pie con el aviso legal.

```
+------------------------------------------------------------+
| [^] La Dorada                         Roles  Como funciona [Entrar]
|                                                            |
| Empresas privadas de Colombia,                             |
| a un paso de tu próxima decisión.                          |
| Descubre, valida y negocia con respaldo.  [Crear cuenta*]  |
|              /\    /\                                      |
|        /\   /  \/\/  \   /\                                |
|~~~~~~~~~~ cresta dorada sobre bloque navy ~~~~~~~~~~~~~~~~~|
+------------------------------------------------------------+
| Comprador | Vendedor | Back Office  (tres filas, no tres tarjetas)
| 1 Descubrir 2 Validar 3 Analizar 4 Conectar 5 Negociar 6 Cerrar
| Aviso legal                                                |
+------------------------------------------------------------+
```
(*) El registro se habilita más adelante; hoy el botón principal es "Entrar".

### Principios

1. **Un solo gesto memorable: la cresta dorada.** Aparece en el login y en el borde del hero de la landing. Dentro de la aplicación el oro vive solo en el logo. Nada más usa oro con protagonismo.
2. **Estructura con borde, no con sombra.** Los paneles son planos con borde de 1 px. Solo las superficies que flotan (cajón móvil, menús) llevan sombra, y es una.
3. **Radio por jerarquía.** 8 px en elementos de navegación, 12 px en controles (botones, campos), 16 px en superficies grandes (paneles, tarjeta de login), pastilla completa en chips.
4. **Cifras tabulares siempre.** El dinero se lee en columnas limpias y con el formato `COP 12.000 M`.
5. **El color semántico nunca va solo.** Cada chip lleva texto, y el texto cumple 4,5:1.
6. **Voz es-CO, activa, en minúsculas de oración.** Los errores dicen qué falló y cómo arreglarlo. Los estados vacíos invitan a actuar. Sin `→` en botones, sin metacadenas con puntos medios, sin etiquetas en mayúsculas sobre los títulos.

## 2. Revisión contra el brief (pasada 2)

Se contrastó el plan con el brief del cliente y con la pregunta "¿esto sale igual para cualquier marketplace B2B?".

| Hallazgo | Cambio | Motivo |
|---|---|---|
| El primer borrador del hero usaba tres tarjetas iguales para los roles, con ícono, título y párrafo | Los roles pasan a tres filas editoriales separadas por filetes, con descripción corta y un solo enlace | Tres tarjetas idénticas es el kit SaaS que se quiere evitar. Además el contenido es una lista, no tres objetos |
| La cresta estaba pensada como una foto de paisaje como en el pitch | Se dibuja como SVG propio, con capas navy y una línea dorada animada | El pitch usa fotografía de stock difuminada. Un trazo propio es más ligero, no depende de imágenes y es reconocible |
| Las capas del plan tenían el oro también en el ítem activo del menú | El ítem activo usa azul suave y texto navy; el oro queda solo en la cresta y el logo | Un acento repartido en varios sitios deja de ser memorable |
| Las tarjetas KPI iban con sombra igual que los paneles | KPI y paneles son planos con borde. La única sombra es la de superficies flotantes | Evita la misma sombra suave bajo cada elemento |
| El sidebar tenía un bloque de foto bajo el menú | Se reemplaza por una tarjeta con la frase del pitch, una cresta en miniatura y la franja tricolor sutil que pide la especificación | Mantiene la idea del pitch sin imágenes |
| Se había previsto navegación inferior móvil además del cajón | Solo cajón con hamburguesa | El comprador tiene 6 ítems y el Back Office 9. Una barra inferior no cabe, y el cajón es lo que pide el brief para < 768 px |
| Los chips usaban el color semántico puro como texto | Cada tono tiene `-ink` oscuro para el texto | El texto de advertencia y éxito puros no pasa 4,5:1 |
| El texto de apoyo del login iba en mayúsculas pequeñas como etiqueta | Se quita la etiqueta; queda el título y una línea de apoyo | Etiquetas en mayúsculas son una marca de plantilla |

El resto del plan se mantiene: tipografía, escala, paleta del brief y estructura de sidebar más topbar.

## 2b. Revisión visual con capturas

Capturas en `test-results/screens/` (1440x900 y 390x844). Cambios tras mirarlas:

| Observación | Cambio |
|---|---|
| La cresta era un diente de sierra regular, parecía un gráfico de latidos | Siluetas irregulares con una cumbre dominante en las tres capas |
| En móvil la cresta quedaba aplastada | Más alto en móvil (9 rem) |
| El lema del logo se partía en dos líneas en el sidebar y "Oportunidades guardadas" saltaba de línea | Lema sin salto, interletraje menor, sidebar de 17,5 rem |
| La tarjeta del sidebar tenía frase, franja tricolor y mini cresta | Se quita la mini cresta (el accesorio que sobra); queda la franja que pide el pitch |
| El estado vacío del marketplace llevaba un botón que sacaba a la landing | Se quita; el texto ya dice qué viene |

## 3. Tokens

Definidos en `src/app/globals.css`. Los nombres `--ld-*` son la fuente de verdad; las variables de shadcn (`--primary`, `--background`, etc.) se mapean a ellos.

| Token | Valor |
|---|---|
| `--ld-navy` | `#0B2A6B` |
| `--ld-primary` | `#1A5CE6` (hover `#154CC2`) |
| `--ld-primary-soft` | `#E8F0FF` |
| `--ld-gold` | `#F2B21B` |
| `--ld-gold-ink` | `#8A5200` (texto de oro legible sobre claro) |
| `--ld-bg` | `#F5F8FF` |
| `--ld-surface` | `#FFFFFF` |
| `--ld-border` | `#E3E9F5` |
| `--ld-ink` | `#33415F` |
| `--ld-muted` | `#5A6785` |
| `--ld-success`, `-soft`, `-ink` | `#16A34A`, `#DCFCE7`, `#166534` |
| `--ld-warning`, `-soft`, `-ink` | `#D97706`, `#FEF3C7`, `#92400E` |
| `--ld-danger`, `-soft`, `-ink` | `#DC2626`, `#FEE2E2`, `#991B1B` |
| `--ld-info`, `-soft`, `-ink` | `#2563EB`, `#DBEAFE`, `#1E40AF` |
| `--ld-neutral-soft`, `--ld-neutral-ink` | `#EEF2FA`, `#475569` |
| `--ld-radius-nav` / `-control` / `-panel` | 8 px / 12 px / 16 px |

Contrastes verificados (WCAG): navy sobre papel 13,5:1; azul acción sobre papel 5,7:1; blanco sobre azul acción 5,7:1; tinta sobre papel 10,2:1; apagado sobre niebla 5,3:1; apagado sobre azul suave 4,9:1; oro sobre navy 7,2:1; oro sobre papel 1,9:1 (solo decoración); tintas `-ink` sobre su `-soft` entre 6,4:1 y 7,2:1.

Modo oscuro: opcional, vía tokens (no se implementa en esta entrega).

## 4. Componentes (`src/components/ld`)

| Componente | Notas |
|---|---|
| `Logo` | `variant="full"` (marca + wordmark + lema) o `"mark"`. SVG propio con dos montañas doradas. |
| `Ridge` | La cresta: capas navy y línea dorada. Se anima una vez (dibujo del trazo) salvo con `prefers-reduced-motion`. |
| `AppShell` | Sidebar (17,5 rem), topbar y cajón móvil. Recibe `role` y `user`. |
| `StatusChip` | Tonos `success`, `warning`, `danger`, `info`, `neutral`. Siempre con texto. |
| `KpiCard` | Valor tabular, etiqueta y variación opcional. Plano con borde. |
| `Disclaimer` | Muestra `VALUATION_DISCLAIMER`. Obligatorio junto a valoración, score y ofertas (R3). |
| `EmptyState` | Título, descripción y acción opcional. Invita a hacer algo. |

## 5. Estados

- **Vacío:** dice qué aparecerá ahí y qué puede hacer la persona ahora. Si la función aún no existe: "Muy pronto podrás…".
- **Error de formulario:** debajo del campo o encima del botón, en una región `aria-live="polite"`, con ícono y texto. Dice qué pasó y cómo arreglarlo ("Correo o contraseña incorrectos. Revisa los datos e intenta de nuevo.").
- **Carga:** esqueletos con el mismo radio del contenido que reemplazan. El botón de envío muestra "Entrando…" y queda deshabilitado.

## 6. Voz y microcopy (es-CO)

- Tuteo, verbos en activo, oraciones cortas. "Entra a tu cuenta", no "Proceda a autenticarse".
- Botones nombran la acción: "Entrar", "Cerrar sesión", "Ver oportunidades".
- Siempre aclarar qué es público y qué confidencial cuando haya datos de una empresa.
- Tiempos estimados concretos ("1 a 2 días hábiles").
- Moneda: `COP 12.000 M`.
- No se mencionan hitos internos del proyecto. Lo pendiente se dice "Muy pronto podrás…".

## 7. Accesibilidad (WCAG 2.2 AA)

- Foco visible en todo elemento interactivo: anillo de 2 px azul acción con separación de 2 px (`:focus-visible`).
- Todo campo con `<label>` asociado. Búsqueda y selector de región con `aria-label`.
- Errores anunciados con `aria-live`. El error de login usa `role="alert"`.
- Contraste de texto ≥ 4,5:1 en todos los pares (ver sección 3). Objetivos táctiles ≥ 44 px en móvil.
- `prefers-reduced-motion`: se anulan el dibujo de la cresta y las transiciones.
- Navegación con `<nav aria-label>`, ítem activo con `aria-current="page"`, un solo `<h1>` por página, enlace "Saltar al contenido".

## 8. PWA

`public/manifest.webmanifest` con nombre, nombre corto, `theme_color` `#0B2A6B` e ícono SVG derivado del logo. Sin service worker por ahora.
