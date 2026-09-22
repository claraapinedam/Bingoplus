-- AlterTable
ALTER TABLE "DeliveryAssignmentHistory" ADD COLUMN     "attemptNumber" INTEGER,
ADD COLUMN     "estimatedDistanceKm" DECIMAL(8,2),
ADD COLUMN     "estimatedETAMinutes" INTEGER;

-- AlterTable
ALTER TABLE "RiderDispatchConfig" ADD COLUMN     "etaWeight" DECIMAL(5,4) NOT NULL DEFAULT 0.6,
ADD COLUMN     "locationStaleThresholdSeconds" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "maxCandidatesForEta" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "maxDispatchAttempts" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "radiusExpansionKm" INTEGER[] DEFAULT ARRAY[2, 4, 6, 8]::INTEGER[],
ADD COLUMN     "retryBackoffSeconds" INTEGER NOT NULL DEFAULT 15;
