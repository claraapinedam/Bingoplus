import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt, IsNumber, Max, Min } from 'class-validator';

/** Mirrors SetDeliveryFareConfigDto's pattern exactly — every field admin-tunable, none hardcoded
 * into the dispatch engine. See RiderDispatchConfig in schema.prisma for the full rationale behind
 * each field. */
export class SetRiderDispatchConfigDto {
  @ApiProperty({ description: 'Weight of the cheap straight-line distance signal in the final score (0-1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  distanceWeight!: number;

  @ApiProperty({ description: "Weight of the rider's rating in the final score (0-1)" })
  @IsNumber()
  @Min(0)
  @Max(1)
  ratingWeight!: number;

  @ApiProperty({ description: 'Reserved for forward compatibility — availability is currently a hard filter, not a graded signal' })
  @IsNumber()
  @Min(0)
  @Max(1)
  availabilityWeight!: number;

  @ApiProperty({ description: 'Widest radius (km) ever searched — also the last step of radiusExpansionKm if not included there' })
  @IsNumber()
  @Min(0.5)
  maxSearchRadiusKm!: number;

  @ApiProperty({ description: 'Seconds a rider has to accept/reject an offer before OfferTimeoutSweeper reassigns it' })
  @IsInt()
  @Min(5)
  assignmentTimeoutSeconds!: number;

  @ApiProperty({ description: 'Weight of real ETA (Maps-provided) in the final score (0-1) — ETA is the primary ranking criterion' })
  @IsNumber()
  @Min(0)
  @Max(1)
  etaWeight!: number;

  @ApiProperty({ description: 'How many of the closest candidates get an expensive real-ETA call, out of the whole PostGIS result set' })
  @IsInt()
  @Min(1)
  maxCandidatesForEta!: number;

  @ApiProperty({ description: "Seconds — a candidate's last known GPS fix older than this is rejected as stale" })
  @IsInt()
  @Min(10)
  locationStaleThresholdSeconds!: number;

  @ApiProperty({ description: 'Ordered radius steps (km) DispatchOrchestratorService tries in sequence, e.g. [2,4,6,8]', type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  radiusExpansionKm!: number[];

  @ApiProperty({ description: 'Seconds SearchingRiderRetrySweeper waits since the last attempt before re-trying a stuck delivery' })
  @IsInt()
  @Min(5)
  retryBackoffSeconds!: number;

  @ApiProperty({ description: 'Safety-valve ceiling on total ASSIGNED attempts per delivery — never auto-fails it, just stops auto-retrying' })
  @IsInt()
  @Min(1)
  maxDispatchAttempts!: number;
}
