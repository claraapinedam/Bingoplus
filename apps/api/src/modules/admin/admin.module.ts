import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { RidersModule } from '../riders/riders.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { RankingModule } from '../ranking/ranking.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { AdminCouponsModule } from '../admin-coupons/admin-coupons.module';
import { PricingModule } from '../pricing/pricing.module';
import { OrdersModule } from '../orders/orders.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PaymentsModule } from '../payments/payments.module';
import { CouponsModule } from '../coupons/coupons.module';
import { ServicesModule } from '../services/services.module';
import { BookingsModule } from '../bookings/bookings.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PetFriendlyPlacesModule } from '../pet-friendly-places/pet-friendly-places.module';
import { ContractsModule } from '../contracts/contracts.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminCustomersController } from './admin-customers.controller';
import { AdminBusinessesController } from './admin-businesses.controller';
import { AdminRidersController } from './admin-riders.controller';
import { AdminDeliveryController } from '../delivery/admin-delivery.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminMembershipPlansController, AdminBusinessMembershipController } from './admin-memberships.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminProductsController } from './admin-products.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminBusinessCouponsController } from './admin-business-coupons.controller';
import { AdminCommissionsController } from './admin-commissions.controller';
import { AdminServicesController } from './admin-services.controller';
import { AdminBookingsController } from './admin-bookings.controller';
import { AdminReviewsController } from './admin-reviews.controller';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminPetFriendlyPlacesController } from './admin-pet-friendly-places.controller';

@Module({
  imports: [
    UsersModule,
    BusinessesModule,
    RidersModule,
    DeliveryModule,
    RankingModule,
    MembershipsModule,
    AdminCouponsModule,
    PricingModule,
    OrdersModule,
    CatalogModule,
    PaymentsModule,
    CouponsModule,
    ServicesModule,
    BookingsModule,
    ReviewsModule,
    PromotionsModule,
    AnalyticsModule,
    PetFriendlyPlacesModule,
    ContractsModule,
  ],
  controllers: [
    AdminUsersController,
    AdminCustomersController,
    AdminBusinessesController,
    AdminRidersController,
    AdminDeliveryController,
    AdminSettingsController,
    AdminMembershipPlansController,
    AdminBusinessMembershipController,
    AdminOrdersController,
    AdminProductsController,
    AdminPaymentsController,
    AdminBusinessCouponsController,
    AdminCommissionsController,
    AdminServicesController,
    AdminBookingsController,
    AdminReviewsController,
    AdminPromotionsController,
    AdminAnalyticsController,
    AdminPetFriendlyPlacesController,
  ],
})
export class AdminModule {}
