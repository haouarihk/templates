import { staticAdapter } from '@builder.io/qwik-city/adapters/static/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

/**
 * Static site generation. Every route here is content plus client-side motion —
 * there is nothing to render per-request — so the whole portfolio prerenders to
 * flat HTML and can be hosted on any static origin.
 */
export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['@qwik-city-plan'],
      },
      outDir: 'server',
    },
    plugins: [
      staticAdapter({
        // Only used to build sitemap.xml — point this at the real domain.
        origin: 'https://templates.haouarihk.com',
      }),
    ],
  };
});
