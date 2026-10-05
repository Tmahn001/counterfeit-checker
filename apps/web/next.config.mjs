/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: every route is prerendered so the whole app shell can be precached by the SW.
  output: 'export',
  reactStrictMode: true,
  trailingSlash: false,
  images: { unoptimized: true },
  transpilePackages: ['@authentic-edge/shared-types'],
  // The emscripten OpenCV.js build probes for node builtins; stub them out for the browser bundle.
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
};

export default nextConfig;
