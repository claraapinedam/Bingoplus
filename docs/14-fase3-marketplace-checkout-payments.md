# FASE 3 — Marketplace Checkout + Payments + Orders + Directory Coupons

> Regla final del spec, verificada: Marketplace (Cart→Checkout→Payment→Order) y Directory
> (Coupon→QR→Redemption) son dos flujos completamente separados. Ninguna `BusinessCoupon`/
> `CouponRedemption` se conecta a `Order`/`Payment`, y viceversa. No se avanzó a FASE 4 (rider
> dispatch, GPS, tracking) — todo lo relacionado queda preparado en el schema pero sin
> implementar, tal como se pidió explícitamente.

## 1. Estado actual (antes de esta fase)

El schema de Prisma ya traía, desde FASE 1, placeholders nunca conectados a ninguna API:
`Address`, `Order`, `OrderItem`, `PaymentMethod`, `Payment`, `Transaction`,
`FulfillmentType`/`OrderStatus`/`PaymentStatus`. No existía ningún módulo de código para
Checkout, Orders ni Payments. `Cart` sí estaba completo y en uso, pero `CartService.addItem` no
validaba `SELLS_PRODUCTS` — un gap real que se cerró en esta fase. `BusinessCoupon`/
`CouponRedemption` (Directory) ya existían completos desde FASE 2, con QR firmado y protección
transaccional contra doble canje — aunque, como se documenta en §10, esa protección tenía un
hueco de concurrencia real que se corrigió aquí.

## 2. Implementado

**Marketplace**: `AddressesModule` (CRUD, un solo default), `PricingModule`
(`PricingConfigService`, `PriceCalculationService`, `TaxCalculationService`, `DiscountService`,
`StockService`), `PaymentsModule` (`PaymentProvider` abstracto + `SandboxPaymentProvider`,
`PaymentService`, `PaymentMethodsService`), `OrdersModule` (`OrderStateMachine`, `OrdersService`,
`CancellationService`, `RefundService`), `CheckoutModule` (`CheckoutService` orquestando todo,
+ webhook).

**Directory**: detalle público de cupón, QR (ver/descargar como imagen PNG), separación
validate/redeem, historial de redenciones, `couponSummary` en el detalle de negocio (regla de
visibilidad de 3 estados), códigos de error nombrados (`COUPON_EXPIRED`,
`COUPON_WRONG_BUSINESS`, etc.), y una corrección real de concurrencia (§10).

## 3. Base de datos

Modificadas: `Order` (+`platformFee`, +`deliveryAddressSnapshot`, +`cancelledAt`), `OrderItem`
(+`skuSnapshot`), `PaymentStatus` (+`REQUIRES_ACTION`, +`CANCELLED`), `Payment`
(+`idempotencyKey` único), `PaymentMethod` (+`expirationMonth`/`expirationYear`).

Nuevas: `Refund` (+`RefundStatus`), `WebhookEvent` (único por `provider`+`externalEventId`),
`PricingConfiguration` (histórico append-only, igual patrón que `MarketplaceRankingConfig`).

No se duplicó ninguna entidad existente — `Business`, `Product`, `Cart`, `BusinessCoupon`,
`CouponRedemption` se usan tal cual, sin una segunda versión.

## 4. Migraciones

`20260914233000_fase3_orders_payments` (Refund, WebhookEvent, PricingConfiguration, columnas
nuevas en Order/OrderItem/Payment, `PaymentStatus` +2 valores) y
`20260914234500_payment_method_expiration` (`PaymentMethod` +2 columnas). Ambas aplicadas a
`bingoplus` (dev) y `bingoplus_test` (e2e).

## 5. APIs — Marketplace

```
Addresses:    GET/POST/PATCH/DELETE /addresses
Checkout:     POST /checkout/validate | /checkout/create-payment | /checkout/confirm
Orders:       GET /orders | GET /orders/:id | POST /orders/:id/cancel
Business:     GET /me/business/:businessId/orders[/:id] | PATCH .../orders/:id/status
              | POST .../orders/:id/cancel | GET .../orders/:id/refunds
Payments:     GET /payments/:id | POST /payments/webhooks/:provider
PaymentMethods: GET/POST/DELETE /payment-methods
Admin:        GET/PATCH /admin/settings/pricing
```

Se mantuvo la convención ya existente del proyecto (`me/business/:businessId/...` con
`BusinessOwnershipGuard`) en vez de la ruta literal del spec (`business/orders` sin
`:businessId`), porque un usuario puede pertenecer a más de un negocio — el spec autorizaba
explícitamente este ajuste.

## 6. APIs — Directory Coupons

```
GET  /public/coupons/:id                                    (detalle, sin login)
GET  /me/coupons/:couponId/qr                                (token)
GET  /me/coupons/:couponId/qr/download                       (imagen QR, data URL)
POST /me/business/:businessId/coupons/validate                (dry run, sin escribir)
POST /me/business/:businessId/coupons/redeem                  (real, transaccional)
GET  /me/business/:businessId/coupons/redemptions[/:id]      (historial)
```

Ya existían (sin cambios de contrato): listar/crear/editar/activar/pausar/cancelar cupón.

## 7. Payments

**SANDBOX.** `PaymentProvider` es una clase abstracta (`createPayment/confirmPayment/
getPayment/refundPayment/verifyWebhookSignature/parseWebhookEvent`); la única implementación es
`SandboxPaymentProvider` — determinística, sin gateway real. Si `NODE_ENV=production` y
`PAYMENT_PROVIDER` está vacío o es `"sandbox"`, el arranque de la aplicación falla a propósito
(§75) — nunca se usa el mock en producción por accidente. Un valor de proveedor real (`stripe`,
etc.) hoy lanza un error explícito de "no implementado todavía", no un fallback silencioso.

## 8. Flujo de Orden (Marketplace)

```
Cart (ya existente, ahora valida SELLS_PRODUCTS)
  ↓ POST /checkout/validate         — dry run, recalcula todo, nunca confía en el cliente
  ↓ POST /checkout/create-payment   — 1 transacción: reserva stock (UPDATE...WHERE stock>=qty,
  │                                    nunca lee-y-luego-escribe), crea Order (PAYMENT_PENDING)
  │                                    + OrderItems (snapshot de nombre/SKU/precio), crea Payment,
  │                                    vacía el Cart. Idempotente por idempotencyKey — verificado
  │                                    ANTES de tocar el carrito, para que un reintento después de
  │                                    que el carrito ya se vació devuelva la misma Order/Payment.
  ↓ POST /checkout/confirm          — llama al provider; PAID -> Order PAID; FAILED -> libera
  │                                    stock y Order CANCELLED. Idempotente.
  ↓ Business: PATCH .../status      — CONFIRMED → PREPARING → READY_FOR_PICKUP → COMPLETED,
                                       validado por OrderStateMachine (transiciones ilegales
                                       rechazadas con código INVALID_ORDER_TRANSITION)
```

Cancelación (§35): el cliente puede cancelar hasta CONFIRMED; una vez en PREPARING sólo el
negocio. Cancelar siempre libera stock, y si ya estaba pagado, dispara un refund automático
completo — dejar a un cliente cobrado por una orden cancelada habría sido un bug real, no un
edge case aceptable.

## 9. Flujo de Directorio (Cupones)

```
Directorio → Business → "Ver cupón" (sólo si COUPONS=true Y hay ≥1 cupón ACTIVE vigente)
  ↓ GET /public/coupons/:id         — detalle público, sin login
  ↓ GET /me/coupons/:id/qr          — token firmado (JWT, 5 min), nunca el monto del descuento
  ↓ GET /me/coupons/:id/qr/download — mismo token, renderizado como imagen PNG (data URL)
  ↓ Business escanea / ingresa el token manualmente (mismo endpoint, sin distinción en backend)
  ↓ POST .../coupons/validate       — dry run opcional, sin escribir nada
  ↓ POST .../coupons/redeem         — transaccional, con SELECT...FOR UPDATE sobre el cupón (§10)
  ↓ CouponRedemption creada. NUNCA se crea Payment ni Order.
```

## 10. Seguridad

Ownership en cada capa (`BusinessOwnershipGuard` para negocio propio; comparación directa
`order.userId`/`redemption` contra el usuario autenticado). Ningún precio/total/estado de pago es
confiable si viene del cliente — `PriceCalculationService` recalcula siempre desde el precio
vigente del producto. Idempotencia real en creación de pago (`Payment.idempotencyKey` único) y en
webhooks (`WebhookEvent` único por `provider`+`externalEventId`). Stock protegido con
`UPDATE...WHERE stock >= cantidad` (nunca lee-y-luego-escribe).

**Corrección de concurrencia encontrada y arreglada**: `CouponsService.redeem` ya validaba
`usageLimit`/`usagePerCustomer` dentro de una transacción, pero bajo el nivel de aislamiento por
defecto de Postgres (READ COMMITTED) dos transacciones concurrentes podían ambas leer el conteo
antes de que cualquiera confirmara, permitiendo doble canje pese al límite. Se corrigió agregando
`SELECT id FROM "BusinessCoupon" WHERE id = $1 FOR UPDATE` al inicio de la transacción de
`redeem()`, serializando los intentos concurrentes sobre el mismo cupón. Verificado con un test
e2e real de dos requests simultáneos contra Postgres real (no mockeado) — sólo uno logra canjear.

## 11. Tests

```
Unit  123/123 passed  (incluye PriceCalculationService, StockService, OrderStateMachine,
                        CancellationService, PaymentService — nuevos en esta fase)
E2E    52/52  passed  (incluye checkout-and-orders.e2e-spec.ts: 16 tests — camino feliz
                        completo §62, race condition de stock §66, idempotencia de pago §67,
                        cancelación+refund automático, ownership, anti-manipulación de precio;
                        directory-coupons.e2e-spec.ts: 14 tests — camino feliz completo §63,
                        regla de visibilidad de 3 estados, ownership, doble-canje concurrente §69)
Lint / Typecheck / Build:  limpios
```

No se escribió un test unitario aislado para `CheckoutService` (su lógica está cubierta de forma
real por los 30 tests e2e de los dos archivos nuevos, contra Postgres real) ni para
`TaxCalculationService`/`DiscountService` individualmente (son triviales hoy — un stub y una
multiplicación — y están ejercitados indirectamente por los tests de `PriceCalculationService`).

## 12. Pendiente (configuración externa)

- Un proveedor de pago real (Stripe/MercadoPago) — hoy sólo existe el Sandbox.
- `PAYMENT_WEBHOOK_SECRET` real de ese proveedor (hoy hay un valor de desarrollo/test, nunca de
  producción).
- Frontend: no se construyó ninguna pantalla nueva (Checkout, Payment, Order, Coupon QR) — el
  spec pidió "definir contratos, no construir funcionalidades de fases posteriores"; los
  contratos están en las respuestas JSON documentadas arriba.

## 13. Riesgos

- `TaxCalculationService` es una tasa plana global (`PricingConfiguration.defaultTaxPercent`) —
  arquitectura preparada para reglas por categoría/ubicación, pero no implementada.
- `RefundService` nunca ejecuta un refund real contra un proveedor (Sandbox siempre "tiene
  éxito") — correcto para esta fase, pero el día que haya un proveedor real, `refundPayment` debe
  manejar fallos parciales/asíncronos que hoy no existen.
- Sin un proveedor de pago real, el flujo completo de `REQUIRES_ACTION` (3-D Secure y similares)
  nunca se ejercita — el estado existe en el enum pero ningún camino de código lo produce todavía.

## 14. Próxima fase (FASE 4)

Rider dispatch/asignación, GPS y tracking en vivo, ETA en vivo (los modelos `Delivery`/`Rider`/
`RiderEarning` ya existen del schema de FASE 1, sin usar), un proveedor de pago real, motor de
facturación de Membership (ya identificado como pendiente desde FASE 2), y — si se pide —
frontend de Checkout/Payment/Order/Coupon QR sobre los contratos ya definidos aquí.
