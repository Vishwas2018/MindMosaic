/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@mm/ui', '@mm/sdk', '@mm/types'],
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
}

export default nextConfig
