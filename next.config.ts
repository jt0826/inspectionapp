/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',       // Enables static export
  images: { unoptimized: true }, // S3 cannot optimize images on-the-fly
};
export default nextConfig;
