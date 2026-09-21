import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServiceDto } from './create-service.dto';

const VALID_BASE = { type: 'GROOMING', name: 'Baño', price: 10, durationMinutes: 30 };

describe('CreateServiceDto', () => {
  it('accepts an empty imageUrl — the form field is optional and submits "" when left blank', async () => {
    const dto = plainToInstance(CreateServiceDto, { ...VALID_BASE, imageUrl: '' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.imageUrl).toBeUndefined();
  });

  it('still rejects a genuinely malformed imageUrl', async () => {
    const dto = plainToInstance(CreateServiceDto, { ...VALID_BASE, imageUrl: 'this is not a url' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'imageUrl')).toBe(true);
  });

  it('accepts a real imageUrl unchanged', async () => {
    const dto = plainToInstance(CreateServiceDto, { ...VALID_BASE, imageUrl: 'https://example.com/photo.jpg' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.imageUrl).toBe('https://example.com/photo.jpg');
  });
});
