import * as XLSX from 'xlsx';
import { BulkProductUploadService } from './bulk-product-upload.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from './catalog.service';

const CATEGORIES = [
  { id: 'cat-alimento', name: 'Alimento', slug: 'alimento' },
  { id: 'cat-juguetes', name: 'Juguetes', slug: 'juguetes' },
];
const SPECIES = [
  { id: 'sp-perro', name: 'Perro', slug: 'dog' },
  { id: 'sp-gato', name: 'Gato', slug: 'cat' },
];

function bufferFromRows(rows: Record<string, unknown>[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Productos');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('BulkProductUploadService', () => {
  let service: BulkProductUploadService;
  let prisma: any;
  let catalog: any;

  beforeEach(() => {
    prisma = {
      productCategory: { findMany: jest.fn().mockResolvedValue(CATEGORIES) },
      petSpecies: { findMany: jest.fn().mockResolvedValue(SPECIES) },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    catalog = { create: jest.fn().mockResolvedValue({ id: 'created' }) };
    service = new BulkProductUploadService(prisma as unknown as PrismaService, catalog as unknown as CatalogService);
  });

  describe('getTemplate', () => {
    it('produces a workbook whose header row matches the parser it will later be validated with', async () => {
      const buffer = await service.getTemplate();
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      expect(workbook.SheetNames).toEqual(['Productos', 'Valores válidos']);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Productos']);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ 'Nombre*': expect.any(String), 'Categoría*': 'Alimento' });
    });
  });

  describe('validate', () => {
    it('accepts a well-formed row and resolves category/species names to slugs', async () => {
      const buffer = bufferFromRows([
        {
          'Nombre*': 'Snack de pollo',
          Descripción: 'Rico',
          'Categoría*': 'alimento', // case-insensitive match on purpose
          'Precio*': 5.5,
          'Precio de oferta': '',
          SKU: 'SKU-1',
          'Stock*': 10,
          'IVA (General/Exento)': 'General',
          'Peso (kg)': 0.5,
          'Especies (separadas por coma)': 'Perro, Gato',
        },
      ]);

      const { rows, allValid } = await service.validate(buffer);

      expect(allValid).toBe(true);
      expect(rows[0].valid).toBe(true);
      expect(rows[0].product).toEqual(
        expect.objectContaining({ categorySlug: 'alimento', speciesSlugs: ['dog', 'cat'], price: 5.5, stock: 10 }),
      );
    });

    it('flags an unknown category with a field-level error and no product payload', async () => {
      const buffer = bufferFromRows([
        {
          'Nombre*': 'Producto X',
          'Categoría*': 'Categoría Inventada',
          'Precio*': 10,
          'Stock*': 1,
        },
      ]);

      const { rows, allValid } = await service.validate(buffer);

      expect(allValid).toBe(false);
      expect(rows[0].valid).toBe(false);
      expect(rows[0].fieldErrors.category).toMatch(/no existe/);
      expect(rows[0].product).toBeUndefined();
    });

    it('rejects a salePrice that is not lower than price', async () => {
      const buffer = bufferFromRows([
        {
          'Nombre*': 'Producto Y',
          'Categoría*': 'Alimento',
          'Precio*': 10,
          'Precio de oferta': 10,
          'Stock*': 1,
        },
      ]);

      const { rows } = await service.validate(buffer);
      expect(rows[0].fieldErrors.salePrice).toMatch(/menor que el precio/);
    });

    it('rejects a non-integer or negative stock', async () => {
      const buffer = bufferFromRows([{ 'Nombre*': 'Producto Z', 'Categoría*': 'Alimento', 'Precio*': 10, 'Stock*': -3 }]);
      const { rows } = await service.validate(buffer);
      expect(rows[0].fieldErrors.stock).toBeDefined();
    });

    it('throws when the sheet has no data rows', async () => {
      const buffer = bufferFromRows([]);
      await expect(service.validate(buffer)).rejects.toThrow();
    });
  });

  describe('bulkCreate', () => {
    it('creates every product inside one transaction, delegating to CatalogService.create for each', async () => {
      const products = [
        { name: 'A', categorySlug: 'alimento', price: 1, stock: 1 } as any,
        { name: 'B', categorySlug: 'juguetes', price: 2, stock: 2 } as any,
      ];

      const result = await service.bulkCreate('biz-1', products);

      expect(catalog.create).toHaveBeenCalledTimes(2);
      expect(catalog.create).toHaveBeenCalledWith('biz-1', products[0], prisma);
      expect(catalog.create).toHaveBeenCalledWith('biz-1', products[1], prisma);
      expect(result).toEqual([{ id: 'created' }, { id: 'created' }]);
    });
  });
});
