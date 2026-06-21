/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Winston relies on dynamic requires; keep it out of the webpack bundle
  // so it runs as a normal Node module in API routes.
  serverExternalPackages: ['winston'],
};

export default nextConfig;
