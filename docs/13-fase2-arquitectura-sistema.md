# FASE 2 — Arquitectura del Sistema, Modelo de Datos y Reglas de Negocio

> Esta fase **no** implementa Checkout, Payments, Orders completos, Riders ni Delivery Tracking.
> Esos componentes son FASE 3. Este documento es el cierre formal de FASE 2: arquitectura, modelo
> de datos, reglas de negocio y APIs base, con las inconsistencias encontradas explicadas y
> corregidas (no ocultas), tests, y el checklist de disposición para FASE 3.

## A. Architecture Overview

BINGO+ sigue siendo un **monolito modular** (NestJS + Prisma + PostgreSQL, sin microservicios).
FASE 2 no cambia el stack; reorganiza el dominio de `Business` en cuatro conceptos antes
entrelazados en un solo modelo plano:

1. **Identidad** (`User`) — una única identidad por persona, con roles y accesos que se
   *adjuntan* a ella (`UserRole`, `BusinessUser`, `Rider`), nunca la duplican.
2. **Categoría** (`BusinessCategory`) — qué tipo de negocio es (Veterinaria, Petshop, Hotel
   Canino...), puramente descriptivo.
3. **Capacidades** (`BusinessCapability`) — qué puede *hacer* ese negocio en la plataforma
   (`SELLS_PRODUCTS`, `DIRECTORY_LISTING`, `SERVICES`, `BOOKINGS`, `PICKUP`, `DELIVERY`,
   `COUPONS`), independiente de la categoría.
4. **Membresía** (`BusinessMembership` → `Subscription` → `Invoice`) — la relación financiera
   entre el negocio y BINGO+ (lo que paga por visibilidad en Directorio), estructuralmente
   separada de las órdenes de Marketplace (que son ingresos del negocio, no de BINGO+).

Un mismo `Business` puede ser simultáneamente elegible para Marketplace (vende productos) y
Directorio (listado con servicios/reservas) — el registro no se duplica, sólo las capacidades
activas cambian (soporte **Hybrid** nativo).

```
User ──< UserRole >── Role ──< RolePermission >── Permission
 │
 ├──< BusinessUser >── Business ──< BusinessCapability
 │                         │   ├──< BusinessMembership ──< Subscription ──< Invoice
 │                         │   ├──< BusinessCoupon ──< CouponRedemption
 │                         │   └──< Product ──< ProductVariant / ProductSpecies
 ├──< Pet >── PetSpecies
 ├──< Cart >── CartItem
 ├──< Rider
 └──< AuditLog (actor)

AdminCoupon ──< AdminCouponRedemption >── BusinessMembership
```

## B. Entidad-Relación (delta sobre FASE 1)

Ver `docs/03-database-erd.md` para el ERD base de FASE 1 (aún vigente para `User`, `Pet`,
`Product`, `Cart`, `Order`-placeholder, `Rider`, `Review`, `Favorite`, `AuditLog`). El delta de
FASE 2 añade:

| Entidad | Cardinalidad clave | PK | FKs | Índices |
|---|---|---|---|---|
| `BusinessCapability` | 1 Business : N Capability rows | `id` | `businessId → Business` | `@@unique([businessId,capability])`, `@@index([businessId])`, `@@index([capability])` |
| `BusinessUser` | 1 Business : N Users, 1 User : N Businesses | `id` | `businessId → Business`, `userId → User` | `@@unique([businessId,userId])`, `@@index([businessId])` |
| `MarketplaceRankingConfig` | histórico append-only | `id` | — | `createdAt desc` (latest wins) |
| `MembershipPlan` | catálogo admin | `id` | — | `isDefault` (a lo sumo uno activo por convención de servicio) |
| `BusinessMembership` | 1:1 con Business | `id` | `businessId → Business` (unique), `planId → MembershipPlan` | `@@index([businessId])` (implícito por unique) |
| `Subscription` | 1 Membership : N Subscriptions | `id` | `membershipId → BusinessMembership` | `@@index([membershipId])` |
| `Invoice` | 1 Subscription : N Invoices | `id` | `subscriptionId → Subscription` | — |
| `BusinessCoupon` | 1 Business : N Coupons | `id` | `businessId → Business` | `@@unique([businessId,code])`, `@@index([businessId])` |
| `CouponRedemption` | 1 Coupon : N Redemptions | `id` | `couponId → BusinessCoupon`, `businessId → Business`, `customerId → User`, `petId → Pet?` | `@@index([couponId])`, `@@index([businessId])` |
| `AdminCoupon` | catálogo admin | `id` | — | `code` unique |
| `AdminCouponRedemption` | 1 AdminCoupon : N Redemptions | `id` | `couponId → AdminCoupon`, `membershipId → BusinessMembership` | `@@index([couponId])`, `@@index([membershipId])` |

`AuditLog` (ya existente en FASE 1) se extendió con `previousValue Json?` y `newValue Json?` —
ver §I.

**Riesgo documentado — geolocalización no usa PostGIS aún:** `Business.latitude/longitude` (y las
mismas columnas en `Rider`/`PetFriendlyPlace`) son `Float` planos, no un tipo `geography`/`geometry`
con índice GiST; la distancia (`BusinessRankingService.calculateDistanceScore`,
`DirectoryService.list`) se calcula en aplicación vía Haversine, no con `ST_Distance` en SQL. Esto
viene de FASE 1 y FASE 2 no lo cambia — funciona correctamente para el volumen actual, pero no
escala a un `ORDER BY distancia` sobre millones de filas sin un índice espacial real. Queda como
riesgo/deuda técnica explícita para cuando el volumen lo justifique, no un blocker de FASE 2.

## C. Prisma Schema (resumen)

El schema completo vive en `apps/api/prisma/schema.prisma`; nuevos modelos/enums de FASE 2:

- `enum BusinessCapabilityType { SELLS_PRODUCTS DIRECTORY_LISTING SERVICES BOOKINGS PICKUP DELIVERY COUPONS }`
- `model BusinessCapability` — fila por `(business, capability)`, `enabled: Boolean`.
- `enum BusinessUserRole { OWNER MANAGER }` + `model BusinessUser`.
- `model MarketplaceRankingConfig` — 5 pesos (`speciesMatchWeight`, `distanceWeight`,
  `availabilityWeight`, `ratingWeight`, `deliveryWeight`) + `updatedBy`; histórico, nunca se
  actualiza una fila existente.
- `enum BillingFrequency`, `enum MembershipPlanStatus`, `model MembershipPlan` (con `isDefault`).
- `enum BusinessMembershipStatus { TRIAL ACTIVE PAST_DUE PAUSED CANCELLED EXPIRED }` +
  `model BusinessMembership` (1:1 con `Business`).
- `enum SubscriptionStatus`, `model Subscription`; `enum InvoiceStatus`, `model Invoice`.
- `enum CouponDiscountType { PERCENTAGE FIXED_AMOUNT }`, `enum BusinessCouponStatus`,
  `model BusinessCoupon`, `model CouponRedemption`.
- `enum AdminCouponType { PERCENTAGE_DISCOUNT FIXED_AMOUNT_DISCOUNT FREE_MONTHS FREE_TRIAL_EXTENSION }`,
  `enum AdminCouponStatus`, `model AdminCoupon`, `model AdminCouponRedemption`.
- `RoleName.BUSINESS_STAFF` → renombrado a `BUSINESS_MANAGER` (migración manual: filas huérfanas
  con el rol viejo se eliminaron antes del `ALTER TYPE`, ver §L).
- **Eliminados por no tener ningún uso en la API** (cero controllers/services los referenciaban):
  `model Promotion`, `model Coupon` (viejo), `enum DiscountType` (viejo) — reemplazados por el
  par `BusinessCoupon`/`AdminCoupon`, que sí tienen semántica y validación completas.

## D. Reglas de Negocio (RULE 1–20, mapeadas a implementación)

| # | Regla | Dónde se aplica |
|---|---|---|
| 1 | Una identidad (`User`) puede tener perfil de Customer, ser dueño/staff de uno o más `Business` (`BusinessUser`), tener un `Rider`, y roles de Admin — todo sobre la misma fila de `User`, nunca duplicada. | `User` + `BusinessUser` + `Rider` + `UserRole` |
| 2 | `BusinessCategory` describe el tipo de negocio; no otorga ni implica ninguna capacidad. | `Business.categoryId` es independiente de `BusinessCapability` |
| 3 | Las capacidades se otorgan/revocan explícitamente por fila (`BusinessCapability`), nunca se infieren de la categoría ni de otros campos. | `BusinessCapabilitiesService` es el único punto de lectura/escritura |
| 4 | `SELLS_PRODUCTS=true` (+ `Business.status=ACTIVE`) es la única condición de elegibilidad para Marketplace. | `BusinessesService.listMarketplace`, `CatalogService.listPublicProducts/getPublicProduct` |
| 5 | `DIRECTORY_LISTING=true` (+ `Business.status=ACTIVE` + membresía en buen estado) es la única condición de elegibilidad para Directorio. | `DirectoryService.list` |
| 6 | Un negocio puede tener ambas capacidades a la vez (Hybrid) sin duplicar el registro. | Verificado en seed (`VetCare Quito`, `Guardería Huellitas`) y e2e |
| 7 | El onboarding pregunta explícitamente "¿Quieres vender productos?"; la respuesta decide `SELLS_PRODUCTS` y, sólo si es sí, habilita la pregunta de `PICKUP`/`DELIVERY`. | `ApplyBusinessDto.sellsProducts` (requerido) → `grantOnboardingDefaults` |
| 8 | `DIRECTORY_LISTING` se otorga por defecto a todo negocio onboardeado — ser descubrible es la base de la plataforma, no una opción del formulario. | `grantOnboardingDefaults` |
| 9 | El carrito pertenece a un único negocio a la vez; añadir un producto de otro negocio requiere `replaceCart: true` o falla con el código `CART_BELONGS_TO_DIFFERENT_BUSINESS`. | `CartService.addItem` + `CartBelongsToDifferentBusinessException` |
| 10 | El ranking de Marketplace combina coincidencia de especies, distancia, disponibilidad (abierto ahora), rating y delivery/pickup en un único `relevanceScore`, calculado 100% en backend. | `BusinessRankingService.calculateBusinessRelevance` |
| 11 | Los pesos del ranking nunca están hardcodeados — se leen de `MarketplaceRankingConfig` (histórico append-only, la fila más reciente gana) y son editables sólo por Admin. | `BusinessRankingService.getWeights/setWeights` |
| 12 | El Directorio no usa el ranking de especies — ordena por distancia (si hay coordenadas) o rating, porque un negocio Directory-only puede no tener productos/especies. | `DirectoryService.list` |
| 13 | El score crudo nunca se expone al usuario final — sólo derivados (ej. especies que coinciden, "Para tu perro"). | `BusinessRelevance` no se serializa completo hacia el cliente; sólo `matchedSpecies` |
| 14 | Un `BusinessCoupon` requiere la capacidad `COUPONS` habilitada para poder crearse. | `CouponsService.create` |
| 15 | Los cupones de negocio nunca se auto-aplican en checkout — se canjean presencialmente vía un token firmado de corta duración (5 min) que el negocio escanea y el backend re-valida por completo dentro de una transacción. | `CouponsService.requestRedemptionToken/redeem` |
| 16 | Un `AdminCoupon` sólo puede afectar la facturación de `BusinessMembership` — nunca toca Marketplace/Orders. | `MembershipsService.redeemAdminCoupon` |
| 17 | El GMV de Marketplace, los descuentos de `BusinessCoupon` y los ingresos/descuentos de Membership son dominios financieros separados y reportables independientemente. | Modelos separados sin FK cruzada entre `Order`(FASE 3)/`CouponRedemption`/`Invoice` |
| 18 | "Mes gratis" (`FREE_MONTHS`) es un periodo real de facturación en $0 que efectivamente extiende `currentPeriodEnd`/`trialEndsAt` — nunca una simulación de UI. | `MembershipsService.redeemAdminCoupon` (extiende fechas reales) |
| 19 | Toda operación administrativa/de negocio crítica queda auditada con actor, acción, entidad y diff antes/después. | `@Audit()` + `AuditLogInterceptor` (`previousValue`/`newValue`, ver §I) |
| 20 | Toda regla crítica (elegibilidad, límites de uso, fechas, capacidades) se valida en backend, nunca sólo en el cliente. | Todos los `Service` listados arriba; DTOs sólo validan forma, no reglas de negocio |

## E. RBAC Matrix

Roles: `CUSTOMER`, `BUSINESS_OWNER`, `BUSINESS_MANAGER`, `RIDER`, `ADMIN`, `SUPER_ADMIN`.
Ver `docs/08-roles-permissions.md` (actualizado en esta fase) para el detalle general de
enforcement (`JwtAuthGuard` → `RolesGuard` → `BusinessOwnershipGuard`). Matriz de los módulos
nuevos/tocados en FASE 2:

| Recurso / Acción | CUSTOMER | BUSINESS_OWNER/MANAGER (propio negocio) | ADMIN/SUPER_ADMIN |
|---|---|---|---|
| Ver capacidades de un negocio | ✅ (público, vía `getPublicBusiness`) | ✅ | ✅ |
| Cambiar `SERVICES/BOOKINGS/COUPONS/PICKUP/DELIVERY` | ❌ | ✅ | ✅ |
| Cambiar `SELLS_PRODUCTS/DIRECTORY_LISTING` | ❌ | ❌ (403 — reservado a Admin) | ✅ |
| Crear/editar `BusinessCoupon` | ❌ | ✅ (requiere capability `COUPONS`) | ✅ |
| Canjear `BusinessCoupon` (escanear QR) | ❌ | ✅ (propio negocio) | ✅ |
| Solicitar token de canje de un cupón | ✅ (propio) | — | — |
| Ver/gestionar `MembershipPlan` (catálogo) | ❌ | ❌ (sólo lectura vía `/public/membership-plans`) | ✅ |
| Ver membresía de un negocio | ❌ | ✅ (propio) | ✅ |
| Canjear `AdminCoupon` contra la membresía propia | ❌ | ✅ (propio negocio) | — |
| Cambiar estado de `BusinessMembership` | ❌ | ❌ | ✅ |
| CRUD `AdminCoupon` | ❌ | ❌ | ✅ |
| Listar Directorio / Marketplace | ✅ (público) | ✅ | ✅ |

**Gap documentado (no silenciado):** `BusinessOwnershipGuard` no distingue aún `OWNER` de
`MANAGER` dentro de un mismo negocio — ambos pasan las mismas rutas hoy. Acciones que
deberían ser OWNER-only (gestión de staff, finanzas) no existen todavía como rutas separadas en
FASE 2, así que el gap no tiene impacto funcional hoy, pero queda anotado como pendiente de FASE 3
en el propio código (`business-ownership.guard.ts`) y aquí.

## F. Módulos NestJS (API)

Módulos de primer nivel registrados en `AppModule` (más `RidersModule`, anidado dentro de
`AdminModule` porque hoy sólo se consume desde Admin):

`PrismaModule · AuthModule · UsersModule · PetsModule · BusinessesModule ·
BusinessCapabilitiesModule · CatalogModule · CartModule · DirectoryModule ·
MembershipsModule · CouponsModule · AdminCouponsModule · AdminModule (→ RidersModule,
RankingModule) · HealthModule`

Nuevos en FASE 2: `BusinessCapabilitiesModule`, `DirectoryModule`, `MembershipsModule`,
`CouponsModule`, `AdminCouponsModule`, más los controllers de administración añadidos dentro de
`AdminModule` (`AdminBusinessesController` con endpoints de capacidades,
`AdminMembershipPlansController`, `AdminBusinessMembershipController`).

## G. Marketplace Ranking Design

Ver `BusinessRankingService` (`apps/api/src/modules/ranking/business-ranking.service.ts`). Fórmula:

```
relevanceScore = speciesMatch.score  * w.speciesMatch   (peso inicial 0.45)
                + distance.score     * w.distance        (0.25)
                + availability.score * w.availability     (0.10)
                + ratingScore        * w.rating            (0.10)
                + deliveryScore      * w.delivery          (0.10)
```

- `speciesMatch.score` = fracción de las especies de las mascotas del usuario cubiertas por
  productos activos del negocio (0 si el usuario no tiene mascotas registradas).
- `distance.score` = `1 - km/15` (clamp a 0), o `0.5` neutro si no hay coordenadas de ninguna de
  las dos partes.
- `availability.score` = 1 si el negocio está abierto ahora según `openingHours`, 0 si cerrado,
  0.5 neutro si no configuró horario.
- `ratingScore` = `ratingAvg / 5` clamp [0,1].
- `deliveryScore` = fracción de `{pickupEnabled, deliveryEnabled}` en true.

Desempate final: nombre alfabético (`localeCompare` es-ES). Los pesos nunca están en código — se
leen de `MarketplaceRankingConfig` (histórico, última fila gana) y Admin los edita vía
`PATCH /admin/settings/ranking-weights`, validado a que sumen 1. El score crudo no se expone al
cliente — sólo `matchedSpecies` y metadatos derivados.

## H. Marketplace vs Directory Design

| | Marketplace | Directory |
|---|---|---|
| Gate de elegibilidad | `SELLS_PRODUCTS=true` | `DIRECTORY_LISTING=true` **+** membresía `TRIAL`/`ACTIVE` |
| Unidad de navegación | Tienda primero (RULE del spec de ranking previo) | Listado de negocios |
| Orden | `BusinessRankingService` (especies + distancia + disponibilidad + rating + delivery) | Distancia si hay coordenadas, si no rating desc |
| Carrito/compra | Sí (single-business, RULE 9) | No — es un directorio informativo/de reservas, no de venta |
| Requiere `Product` | Sí, para el filtro por especie/categoría de producto | No |

**Decisión arquitectónica explícita:** el gate de Directorio exige membresía en buen estado
porque el Directorio es literalmente lo que la membresía paga (visibilidad); el gate de
Marketplace no lo exige porque vender productos no es una funcionalidad de pago en este alcance —
sólo depende de la capacidad y de que el negocio esté `ACTIVE`. Esta asimetría es intencional, no
un bug: una membresía `PAST_DUE`/`CANCELLED` oculta al negocio del Directorio pero no le impide
seguir vendiendo en Marketplace. Se documenta aquí explícitamente porque a primera vista parece
una inconsistencia entre `BusinessesService.listMarketplace` y `DirectoryService.list`.

Un negocio Hybrid (ambas capacidades) aparece en ambos listados con el mismo `Business.id` — sin
duplicación de datos, verificado en seed y e2e (`VetCare Quito`, `Guardería Huellitas`).

## I. Membership Design

`MembershipPlan` (catálogo admin, con `isDefault`) → `BusinessMembership` (1:1 con `Business`,
estado `TRIAL|ACTIVE|PAST_DUE|PAUSED|CANCELLED|EXPIRED`) → `Subscription` (periodos) →
`Invoice` (documentos de cobro). `MembershipsService.startTrialIfMissing` se dispara una sola vez,
al aprobar un negocio (`BusinessesService.approve`), y es idempotente — una segunda llamada es
no-op. Si no hay ningún `MembershipPlan` configurado, retorna `null` en vez de fabricar una
membresía falsa (gap documentado explícitamente en el propio código, no oculto).

No existe todavía un motor de facturación/cobro real (eso es FASE 3/Payments) — `Invoice` y
`Subscription` modelan el *estado*, no el procesamiento de pago.

## J. Coupon Design (Business vs Admin — separación financiera)

Dos sistemas de cupón deliberadamente distintos y sin FK cruzada:

- **`BusinessCoupon`** — lo crea un negocio (requiere capability `COUPONS`), lo canjea un
  cliente *presencialmente* (nunca en checkout). Flujo: el cliente pide un token firmado
  (`JwtService.sign`, TTL 5 min, payload mínimo `{couponId, customerId}` — nunca el monto del
  descuento) que codifica como QR; el negocio lo escanea y llama `redeem(businessId, token, ...)`,
  que dentro de una única transacción Prisma revalida: pertenencia al negocio, estado `ACTIVE`,
  rango de fechas, `minimumPurchase`, `usageLimit` global y `usagePerCustomer` (recontados en la
  misma transacción para que una carrera no permita doble canje), antes de escribir el
  `CouponRedemption`.
- **`AdminCoupon`** — lo crea la plataforma, afecta *sólo* `BusinessMembership` (nunca Marketplace
  ni `BusinessCoupon`). `PERCENTAGE_DISCOUNT`/`FIXED_AMOUNT_DISCOUNT` se registran como recibo
  inmutable (`AdminCouponRedemption.appliedValue`) para que la próxima factura lo aplique (aún no
  hay motor de facturación); `FREE_MONTHS`/`FREE_TRIAL_EXTENSION` extienden de verdad
  `currentPeriodEnd`/`trialEndsAt` — un mes gratis es un periodo real en $0, nunca simulado en UI.

Ambos flujos comparten el mismo patrón de validación (existencia → estado → fechas →
límites globales → límites por cliente/negocio → efecto) implementado independientemente en
`CouponsService`/`MembershipsService`, deliberadamente sin abstracción compartida — son dominios
financieros distintos y una fusión prematura arriesgaría acoplar Marketplace discounts con
Membership billing.

## K. Audit Design

`AuditLog { actorUserId?, action, entityType, entityId, previousValue?, newValue?, metadata,
ipAddress, createdAt }`. `AuditLogInterceptor` se dispara en cualquier ruta decorada con
`@Audit(action, entityType)`:

1. Antes del handler, intenta un snapshot "before" (`previousValue`) — por defecto vía
   `prisma[lowerFirst(entityType)].findUnique({ where: { id: entityId } })`; `BusinessCapability`
   (que son N filas por negocio, no una) y `BusinessMembership` (cuya clave natural es
   `businessId`, no `id`) tienen overrides explícitos. Para una creación (la entidad aún no
   existe) esto resuelve a `null` de forma esperada, no como error.
2. Después del handler, `newValue` es el valor efectivamente retornado por el controller.
3. Todo el flujo es best-effort: un fallo de lookup o de escritura de auditoría nunca hace fallar
   la petición real (`.catch(() => undefined)` / `try/catch` interno).

**Inconsistencia encontrada y corregida en esta fase:** el schema ya traía `previousValue`/
`newValue` como columnas, pero el interceptor sólo escribía `metadata.body` — los campos existían
sin usarse. Se corrigió implementando el snapshot antes/después descrito arriba (verificado con
una consulta directa a `AuditLog` tras correr el e2e suite: las filas de `business.approve`,
`business.activate`, `product.activate/deactivate/updateStock` ahora traen el estado completo
antes y después del cambio). De paso se corrigió `@Audit('settings.ranking-weights.update',
'PlatformSetting')` → `'MarketplaceRankingConfig'`, que quedó apuntando al modelo viejo tras la
migración de esta fase (las tablas nunca fue una porque los pesos no se movieron de
`PlatformSetting` hasta este mismo trabajo).

## L. Migraciones manuales relevantes

- `20260914213221_capabilities_membership_coupons` — requirió borrar manualmente filas
  `UserRole`/`RolePermission`/`Role` con `name='BUSINESS_STAFF'` antes del `ALTER TYPE` del enum
  `RoleName`, porque el ambiente de desarrollo ya tenía usuarios con ese rol y el cast
  automático de Prisma no sabe mapear un valor de enum eliminado.
- `20260914214047_membership_plan_default` — añade `MembershipPlan.isDefault`.

Ambas aplicadas con `prisma migrate deploy` a la base de dev (`bingoplus`) y a la base de test
(`bingoplus_test`, vía `npm run prisma:deploy:test`).

## M. Test Results (estado actual, verificado en esta sesión)

```
Unit  (npm run test)     11 suites / 69 tests — PASS
E2E   (npm run test:e2e)  3 suites / 22 tests — PASS
Lint  (npm run lint)                            — 0 errores, 0 warnings
Typecheck (tsc --noEmit)                        — 0 errores
Build (nest build)                              — dist/main.js emitido correctamente
```

Tests nuevos añadidos en esta fase (cubren la lista explícita del spec):

- `business-capabilities.service.spec.ts` — validación de capacidades, elegibilidad Marketplace
  (RULE 4), elegibilidad Directory (RULE 5), soporte Hybrid, defaults de onboarding.
- `coupons.service.spec.ts` — creación requiere capability `COUPONS`, token inválido/expirado,
  cupón de otro negocio, fuera de rango de fechas, `usageLimit` global, `usagePerCustomer`
  (doble canje), cálculo de descuento con `maximumDiscount`.
- `memberships.service.spec.ts` — estados de membresía (`startTrialIfMissing` idempotente y sin
  fabricar datos si no hay plan), validación de `AdminCoupon` (sin membresía, código
  desconocido, fuera de fecha, plan no aplicable, `usageLimit`, `usagePerBusiness`, extensión
  real de `currentPeriodEnd` con `FREE_MONTHS`).
- `roles.guard.spec.ts` / `business-ownership.guard.spec.ts` — RBAC: rutas sin `@Roles`, rol
  correcto/incorrecto, no autenticado, ADMIN/SUPER_ADMIN bypass de `BusinessOwnershipGuard`,
  negocio inexistente, usuario sin membresía en ese negocio específico.
- Reforzado `catalog-and-cart.e2e-spec.ts` para afirmar el código exacto
  `CART_BELONGS_TO_DIFFERENT_BUSINESS` (RULE 9), no sólo el status 409.

Ya existentes y verificados sin regresión: `business-ranking.service.spec.ts` (cálculo de
ranking) y `marketplace-ranking.e2e-spec.ts` (species matching end-to-end, pesos configurables).

## N. Decisiones Arquitectónicas y Riesgos

1. **`Business.ownerId` es sólo un puntero denormalizado** — el control de acceso real vive en
   `BusinessUser`. Se mantuvo el campo (en vez de eliminarlo) porque sigue siendo útil para
   mostrar "dueño legal" sin un join, pero ningún guard lo usa para autorizar.
2. **`Promotion`/`Coupon`/`DiscountType` (modelos viejos) se eliminaron** en vez de mantenerlos
   en desuso — no tenían ninguna referencia en la API; mantenerlos habría sido deuda muerta.
3. **Geolocalización sin PostGIS real** (§B) — riesgo de escalabilidad documentado, no bloqueante
   para el volumen actual.
4. **`BusinessOwnershipGuard` no distingue OWNER de MANAGER** (§E) — gap documentado, sin
   impacto funcional porque no existen todavía rutas OWNER-only.
5. **Directorio exige membresía en buen estado, Marketplace no** (§H) — asimetría intencional,
   documentada explícitamente para que no se lea como bug en una futura revisión.
6. **No hay motor de facturación real** — `Invoice`/`Subscription` modelan estado, no cobro; los
   descuentos porcentuales/fijos de `AdminCoupon` se guardan como recibo para que una futura
   FASE 3 (Payments) los aplique al generar la próxima factura.
7. **`AuditLog.previousValue`/`newValue` estaban sin usar** — corregido en esta fase (§K); es
   best-effort por diseño (nunca bloquea la petición real).
8. **`@Audit(..., 'PlatformSetting')` apuntaba al modelo equivocado** tras mover los pesos de
   ranking a `MarketplaceRankingConfig` — corregido (§K).

## FASE 3 — Readiness Checklist

- [x] `User`/`BusinessUser`/`Rider`/roles sin duplicar identidad.
- [x] `BusinessCategory` y `BusinessCapability` desacoplados.
- [x] Marketplace y Directory como superficies separadas, con soporte Hybrid verificado.
- [x] Onboarding pregunta explícita por `sellsProducts`.
- [x] `BusinessRankingService` con pesos configurables (no hardcodeados), transparente al cliente.
- [x] Carrito single-business con código de error explícito (`CART_BELONGS_TO_DIFFERENT_BUSINESS`).
- [x] `BusinessMembership`/`Subscription`/`Invoice` como dominio financiero separado de Orders.
- [x] `BusinessCoupon` (presencial, nunca auto-aplicado) y `AdminCoupon` (sólo Membership) sin
      cruce entre sí.
- [x] `AuditLog` con `previousValue`/`newValue` realmente poblados.
- [x] RBAC: `BUSINESS_MANAGER` reemplaza a `BUSINESS_STAFF` en todo el código y las migraciones.
- [x] Unit + e2e + lint + typecheck + build en verde.
- [ ] Checkout/Payments/Orders completos — **fuera de alcance de FASE 2 por instrucción explícita**.
- [ ] Riders/Delivery Tracking — **fuera de alcance de FASE 2 por instrucción explícita**.
- [ ] Distinción OWNER vs MANAGER en `BusinessOwnershipGuard` — pendiente, sin bloquear FASE 3.
- [ ] Motor de facturación real para `Invoice`/`Subscription` — pendiente, corresponde a FASE 3
      (Payments).

FASE 2 se considera **arquitectónicamente cerrada** con las salvedades explícitas de la lista de
pendientes de arriba (ninguna bloquea el inicio de FASE 3, todas están documentadas, ninguna fue
ocultada). No se ha comenzado ningún trabajo de Checkout/Payments/Orders/Riders/Delivery Tracking.
