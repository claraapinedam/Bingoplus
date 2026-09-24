import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BINGO+ Cliente',
    short_name: 'BINGO+',
    description: 'Todo lo que tu mascota necesita, en un solo lugar.',
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
