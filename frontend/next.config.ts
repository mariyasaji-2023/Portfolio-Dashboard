/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // ✅ This makes Vercel ignore ESLint errors during build
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
