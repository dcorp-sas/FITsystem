/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@fitsystem/ui',
    '@fitsystem/config',
    '@fitsystem/types',
    '@fitsystem/utils',
  ],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;