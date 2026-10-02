/**
 * Configuración de ESLint (formato plano, el de ESLint 9).
 *
 * Por qué existe: hasta la corrida 13, `npm run lint` era `next lint`, que armaba la
 * configuración solo. **Next 16 quitó `next lint`**, así que desde que se subió a
 * Next 16 (commit d71aa79, por la RCE de AVIF) el comando venía fallando con
 * "Invalid project directory provided, no such directory: .../lint" — interpretaba
 * la palabra `lint` como una carpeta. El repo llevaba corridas SIN linter y el error
 * no se veía porque nadie leía la salida. Ahora se llama a `eslint` directo y la
 * configuración vive aquí, a la vista.
 */
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
// El plugin se importa explícitamente porque en configuración plana una regla solo
// se puede ajustar dentro de un bloque que declare su plugin: no se hereda del
// bloque de `core-web-vitals`.
import reactHooks from 'eslint-plugin-react-hooks';

const config = [
  {
    // Lo que no se lintea. `motor/` sí se lintea: es código del repo que corre en
    // el servidor, y que no vaya al bundle de Vercel no lo hace menos código.
    ignores: [
      '.next/**',
      'node_modules/**',
      'drizzle/**',
      'public/**',
      'capturas-*/**',
      'motor/radar/mediciones/**',
    ],
  },

  // `core-web-vitals` es el nivel que el repo tenía cuando `next lint` servía: era
  // su configuración por omisión.
  //
  // Se probó también con `eslint-config-next/typescript`, que agrega las reglas de
  // typescript-eslint: saca **306 errores** más, casi todos `no-explicit-any` en las
  // suites de prueba. Subir ese escalón a media corrida del motor sería cambiar el
  // estándar del repo y tocar decenas de archivos que esta corrida no tiene por qué
  // tocar. Queda anotado como deuda en el reporte, con el número medido, para que se
  // decida a propósito y no por accidente.
  ...nextCoreWebVitals,

  {
    /*
     * `services/baileys` NO es React: es un servicio de Node suelto.
     *
     * La regla `rules-of-hooks` lo marcaba porque Baileys tiene una función que se
     * llama `useMultiFileAuthState`, y el plugin la toma por un hook de React por el
     * nombre. Es un falso positivo del 100%: ahí no hay React. Apagar las reglas de
     * React en un servicio que no usa React no es esconder nada — es dejar de
     * preguntarle a un archivo algo que no le aplica.
     */
    files: ['services/**/*.{ts,tsx,js,mjs}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  {
    /*
     * Las reglas del React Compiler, en `warn` en vez de `error`.
     *
     * Estas tres NO EXISTÍAN cuando se escribió este código: llegaron con el plugin
     * de la era del React Compiler que trae Next 16. Los 34 avisos que salen
     * (32 de `set-state-in-effect`, 1 de `immutability`, 1 de `refs`) son un efecto
     * secundario de haber subido de Next, y ninguno está en el código del motor.
     *
     * Ponerlas en `error` hoy significaría reescribir los efectos de más de treinta
     * componentes de UI que hoy funcionan, a media corrida y con la entrega de EXCI
     * el viernes. Eso es cambiar el alcance por la puerta de atrás y arriesgar
     * regresiones en pantallas que nadie pidió tocar.
     *
     * Van en `warn` y NO se silencian: `npm run lint` las sigue imprimiendo todas,
     * con archivo y renglón. Son deuda con nombre y con número en el reporte, no un
     * problema tapado. Cuando se decida pagarlas, se sube este bloque a `error`.
     */
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
];

export default config;
