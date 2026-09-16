import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MapService } from './map.service';
import { MAP_PROVIDER_TOKEN } from './providers/map-provider.interface';
import { MockMapProvider } from './providers/mock-map.provider';
import { GoogleMapsProvider } from './providers/google-maps.provider';

const logger = new Logger('MapModule');

@Module({
  providers: [
    MapService,
    MockMapProvider,
    GoogleMapsProvider,
    {
      provide: MAP_PROVIDER_TOKEN,
      useFactory: (config: ConfigService, mock: MockMapProvider, google: GoogleMapsProvider) => {
        const configuredProvider = config.get<string>('MAP_PROVIDER');
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        const usingMock = !configuredProvider || configuredProvider === 'mock';

        // §88: never silently accept the mock in production — a boot-time configuration error,
        // same rule PaymentsModule already applies to PAYMENT_PROVIDER.
        if (isProduction && usingMock) {
          throw new Error(
            'MAP_PROVIDER is unset or "mock" while NODE_ENV=production. Refusing to start with a ' +
              'fake map provider in production — set MAP_PROVIDER=google and GOOGLE_MAPS_API_KEY.',
          );
        }
        if (usingMock) {
          logger.warn('Using MockMapProvider — no real map/geocoding provider is configured.');
          return mock;
        }
        if (configuredProvider === 'google') {
          return google;
        }
        throw new Error(`MAP_PROVIDER="${configuredProvider}" has no implementation yet — use "mock" or "google".`);
      },
      inject: [ConfigService, MockMapProvider, GoogleMapsProvider],
    },
  ],
  exports: [MapService],
})
export class MapModule {}
