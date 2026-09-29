/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
    // Leitores de PDF/Word da base de conhecimento rodam como pacotes Node, sem bundling
    serverComponentsExternalPackages: ["unpdf", "mammoth"],
  },
};

export default nextConfig;
