import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BINGO+ Negocio',
    short_name: 'BINGO+ Negocio',
    description: 'Opera tus pedidos con BINGO+.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#172b4d',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
