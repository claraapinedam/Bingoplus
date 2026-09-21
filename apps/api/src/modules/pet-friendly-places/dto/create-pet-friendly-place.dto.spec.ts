import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePetFriendlyPlaceDto } from './create-pet-friendly-place.dto';

const VALID_BASE = { name: 'Parque Central', category: 'OUTDOOR_SPACE', address: 'Av. Siempre Viva 123', latitude: -0.18, longitude: -78.47 };

describe('CreatePetFriendlyPlaceDto', () => {
  it('accepts an empty photoUrl — the form field is optional and submits "" when left blank', async () => {
    const dto = plainToInstance(CreatePetFriendlyPlaceDto, { ...VALID_BASE, photoUrl: '' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.photoUrl).toBeUndefined();
  });

  it('still rejects a genuinely malformed photoUrl', async () => {
    const dto = plainToInstance(CreatePetFriendlyPlaceDto, { ...VALID_BASE, photoUrl: 'this is not a url' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'photoUrl')).toBe(true);
  });
});
