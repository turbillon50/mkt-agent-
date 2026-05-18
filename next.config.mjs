/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
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
