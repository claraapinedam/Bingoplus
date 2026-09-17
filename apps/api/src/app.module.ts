import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PetsModule } from './modules/pets/pets.module';
import { BusinessesModule } from './modules/businesses/businesses.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CartModule } from './modules/cart/cart.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { BusinessCapabilitiesModule } from './modules/business-capabilities/business-capabilities.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { AdminCouponsModule } from './modules/admin-coupons/admin-coupons.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { RidersModule } from './modules/riders/riders.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { MapModule } from './modules/maps/map.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { ServicesModule } from './modules/services/services.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { PetFriendlyPlacesModule } from './modules/pet-friendly-places/pet-friendly-places.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    PetsModule,
    BusinessesModule,
    BusinessCapabilitiesModule,
    CatalogModule,
    CartModule,
    DirectoryModule,
    MembershipsModule,
    CouponsModule,
    AdminCouponsModule,
    FavoritesModule,
    AddressesModule,
    PricingModule,
    PaymentsModule,
    OrdersModule,
    CheckoutModule,
    MapModule,
    RidersModule,
    DeliveryModule,
    ReviewsModule,
    AuditLogsModule,
    ServicesModule,
    BookingsModule,
    NotificationsModule,
    PromotionsModule,
    AnalyticsModule,
    UploadsModule,
    PetFriendlyPlacesModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
