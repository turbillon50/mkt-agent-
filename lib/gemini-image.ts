import 'server-only';

/**
 * El candado del lado de la app.
 *
 * La implementación vive en `src/creative/gemini-image` porque las pruebas y
 * los scripts de tsx la necesitan y `server-only` los revienta. Aquí se
 * reexporta CON el candado: una pantalla que importe esto sigue sin poder
 * arrastrar la llave de Gemini al navegador.
 */
export { generateImage, type GeneratedImage } from '@/src/creative/gemini-image';
