import { ConfigService } from '@nestjs/config';
import { SupabaseStorageProvider } from './supabase-storage.provider';

describe('SupabaseStorageProvider', () => {
  let provider: SupabaseStorageProvider;
  let config: Record<string, string>;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    config = {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
      STORAGE_BUCKET: 'uploads',
    };
    const configService = {
      getOrThrow: (key: string) => {
        if (!config[key]) throw new Error(`Missing ${key}`);
        return config[key];
      },
      get: (key: string) => config[key],
    } as unknown as ConfigService;
    provider = new SupabaseStorageProvider(configService);

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('uploads with both apikey and Authorization headers and returns the public URL', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const result = await provider.upload(Buffer.from('hello'), 'abc.jpg', 'image/jpeg');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/storage/v1/object/uploads/abc.jpg',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sb_secret_test',
          apikey: 'sb_secret_test',
          'Content-Type': 'image/jpeg',
        }),
      }),
    );
    expect(result.url).toBe('https://project.supabase.co/storage/v1/object/public/uploads/abc.jpg');
  });

  it('throws with the response body when the upload fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve('Invalid Compact JWS') });

    await expect(provider.upload(Buffer.from('x'), 'abc.jpg', 'image/jpeg')).rejects.toThrow(/403.*Invalid Compact JWS/);
  });

  it('never touches config until upload() is actually called — safe to eagerly instantiate with no env set', () => {
    const emptyConfig = { getOrThrow: () => { throw new Error('should not be called'); }, get: () => undefined } as unknown as ConfigService;
    expect(() => new SupabaseStorageProvider(emptyConfig)).not.toThrow();
  });
});
