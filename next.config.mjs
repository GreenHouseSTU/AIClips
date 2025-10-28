/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const apiPort = process.env.API_PORT || process.env.PORT || '4000';
    return [
      {
        source: "/api/:path*",
        destination: `http://localhost:${apiPort}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
