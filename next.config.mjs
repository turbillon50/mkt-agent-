/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  /**
   * Las fuentes de las piezas viajan CON la función.
   *
   * El runtime de Vercel no trae ninguna fuente instalada, así que librsvg
   * —dentro de sharp— pintaba una cajita vacía por letra: las 18 piezas de
   * MOMENTUM salieron ilegibles (QA del 16-sep). El rastreador de Next no ve
   * `assets/fonts/` porque nadie las importa: se leen por ruta en tiempo de
   * ejecución. Sin esta línea el arreglo funciona en local y NO en producción,
   * que es la peor de las dos opciones.
   */
  outputFileTracingIncludes: {
    '/**': ['./assets/fonts/**'],
  },
  serverExternalPackages: [
    'pg',
    '@neondatabase/serverless',
    'drizzle-orm',
    'twitter-api-v2',
    '@mastra/core',
    '@mastra/memory',
    '@mastra/pg',
    'openai',
  ],
  typescript: { ignoreBuildErrors: false },
  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
