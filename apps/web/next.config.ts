import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./lib/i18n-request.ts');

export default withNextIntl({
  // Never let `next dev` and `next build` write into the same directory.
  // Mixed development/production chunks cause stale Webpack module maps.
  distDir: process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  webpack(config) {
    if (process.env.NEXT_DISABLE_WEBPACK_CACHE === 'true') config.cache = false;
    return config;
  },
  images: {
    remotePatterns: [
      {protocol: 'https', hostname: '**.supabase.co'},
      {protocol: 'http', hostname: '127.0.0.1'}
    ]
  }
});
