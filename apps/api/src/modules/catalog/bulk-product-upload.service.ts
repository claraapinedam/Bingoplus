import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductTaxCategory } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';

// Column headers — shared between the generated template and the upload parser, so the two never
// drift apart. Images are deliberately never a column here (per the feature's own design): every
// bulk-created product starts with none, and the owner attaches photos manually afterwards from
// the product's own detail page, the same upload flow as a single product.
const HEADERS = {
  name: 'Nombre*',
  description: 'Descripción',
  category: 'Categoría*',
  price: 'Precio*',
  salePrice: 'Precio de oferta',
  sku: 'SKU',
  stock: 'Stock*',
  taxCategory: 'IVA (General/Exento)',
  weight: 'Peso (kg)',
  species: 'Especies (separadas por coma)',
} as const;

const TEMPLATE_EXAMPLE_ROWS: Record<string, string | number>[] = [
  {
    [HEADERS.name]: 'Alimento Premium Perro Adulto 15kg',
    [HEADERS.description]: 'Alimento balanceado para perros adultos',
    [HEADERS.category]: 'Alimento',
    [HEADERS.price]: 35.99,
    [HEADERS.salePrice]: '',
    [HEADERS.sku]: 'ALIM-001',
    [HEADERS.stock]: 20,
    [HEADERS.taxCategory]: 'General',
    [HEADERS.weight]: 15,
    [HEADERS.species]: 'Perro',
  },
  {
    [HEADERS.name]: 'Rascador para Gatos',
    [HEADERS.description]: 'Rascador de sisal con base de peluche',
    [HEADERS.category]: 'Juguetes',
    [HEADERS.price]: 18.5,
    [HEADERS.salePrice]: 15.99,
    [HEADERS.sku]: 'JUG-002',
    [HEADERS.stock]: 10,
    [HEADERS.taxCategory]: 'General',
    [HEADERS.weight]: 1.2,
    [HEADERS.species]: 'Gato',
  },
];

export interface BulkProductRow {
  /** 1-based row number as it appears in the spreadsheet (header is row 1, so data starts at 2). */
  row: number;
  raw: Record<string, string>;
  /** Column key → error message, only for columns that failed validation on this row. */
  fieldErrors: Record<string, string>;
  /** Present only when every column on this row passed — the exact CreateProductDto ready to
   * resubmit to bulkCreate(), with category/species names already resolved to slugs. */
  product?: CreateProductDto;
  valid: boolean;
}

@Injectable()
export class BulkProductUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  /** Generates the downloadable .xlsx — a "Productos" sheet (headers + 2 example rows) and a
   * read-only "Valores válidos" reference sheet listing every real category/species name, since
   * both columns are free text matched by name, not something a spreadsheet dropdown can enforce. */
  async getTemplate(): Promise<Buffer> {
    const [categories, species] = await Promise.all([
      this.prisma.productCategory.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
      this.prisma.petSpecies.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
    ]);

    const productSheet = XLSX.utils.json_to_sheet(TEMPLATE_EXAMPLE_ROWS, { header: Object.values(HEADERS) });
    productSheet['!cols'] = Object.values(HEADERS).map((h) => ({ wch: Math.max(h.length, 18) }));

    const referenceRows = Array.from({ length: Math.max(categories.length, species.length) }, (_, i) => ({
      Categorías: categories[i]?.name ?? '',
      Especies: species[i]?.name ?? '',
    }));
    const referenceSheet = XLSX.utils.json_to_sheet(referenceRows);
    referenceSheet['!cols'] = [{ wch: 24 }, { wch: 24 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, productSheet, 'Productos');
    XLSX.utils.book_append_sheet(workbook, referenceSheet, 'Valores válidos');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async validate(buffer: Buffer): Promise<{ rows: BulkProductRow[]; allValid: boolean }> {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('El archivo no es un Excel (.xlsx) válido');
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new BadRequestException('El archivo no tiene ninguna hoja');
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (records.length === 0) {
      throw new BadRequestException('El archivo no tiene ninguna fila de datos');
    }

    const [categories, species] = await Promise.all([
      this.prisma.productCategory.findMany(),
      this.prisma.petSpecies.findMany(),
    ]);

    const rows = records.map((record, i) => this.validateRow(record, i + 2, categories, species));
    return { rows, allValid: rows.every((r) => r.valid) };
  }

  private validateRow(
    record: Record<string, unknown>,
    rowNumber: number,
    categories: { id: string; name: string; slug: string }[],
    species: { id: string; name: string; slug: string }[],
  ): BulkProductRow {
    const cell = (key: string) => String(record[key] ?? '').trim();
    const raw: Record<string, string> = {};
    for (const key of Object.values(HEADERS)) raw[key] = cell(key);

    const fieldErrors: Record<string, string> = {};

    const name = cell(HEADERS.name);
    if (name.length < 2) fieldErrors.name = 'Obligatorio, mínimo 2 caracteres';

    const categoryName = cell(HEADERS.category);
    const category = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
    if (!categoryName) {
      fieldErrors.category = 'Obligatorio';
    } else if (!category) {
      fieldErrors.category = `"${categoryName}" no existe. Válidas: ${categories.map((c) => c.name).join(', ')}`;
    }

    const priceText = cell(HEADERS.price);
    const price = Number(priceText);
    if (!priceText || Number.isNaN(price) || price < 0) {
      fieldErrors.price = 'Obligatorio, debe ser un número mayor o igual a 0';
    }

    const stockText = cell(HEADERS.stock);
    const stock = Number(stockText);
    if (!stockText || !Number.isInteger(stock) || stock < 0) {
      fieldErrors.stock = 'Obligatorio, debe ser un número entero mayor o igual a 0';
    }

    const salePriceText = cell(HEADERS.salePrice);
    let salePrice: number | undefined;
    if (salePriceText) {
      salePrice = Number(salePriceText);
      if (Number.isNaN(salePrice) || salePrice < 0) {
        fieldErrors.salePrice = 'Debe ser un número mayor o igual a 0';
      } else if (!fieldErrors.price && salePrice >= price) {
        fieldErrors.salePrice = 'Debe ser menor que el precio';
      }
    }

    const taxCategoryText = cell(HEADERS.taxCategory);
    let taxCategory: ProductTaxCategory = ProductTaxCategory.STANDARD;
    if (taxCategoryText) {
      const normalized = taxCategoryText.toLowerCase();
      if (normalized === 'general') taxCategory = ProductTaxCategory.STANDARD;
      else if (normalized === 'exento') taxCategory = ProductTaxCategory.ZERO;
      else fieldErrors.taxCategory = 'Debe ser "General" o "Exento" (o dejarse vacío)';
    }

    const weightText = cell(HEADERS.weight);
    let weight: number | undefined;
    if (weightText) {
      weight = Number(weightText);
      if (Number.isNaN(weight) || weight < 0) fieldErrors.weight = 'Debe ser un número mayor o igual a 0';
    }

    const speciesText = cell(HEADERS.species);
    let speciesSlugs: string[] | undefined;
    if (speciesText) {
      const names = speciesText.split(',').map((s) => s.trim()).filter(Boolean);
      const resolved = names.map((n) => species.find((s) => s.name.toLowerCase() === n.toLowerCase()));
      const unknown = names.filter((_, idx) => !resolved[idx]);
      if (unknown.length > 0) {
        fieldErrors.species = `${unknown.join(', ')} no existe(n). Válidas: ${species.map((s) => s.name).join(', ')}`;
      } else {
        speciesSlugs = resolved.map((s) => s!.slug);
      }
    }

    const valid = Object.keys(fieldErrors).length === 0;
    return {
      row: rowNumber,
      raw,
      fieldErrors,
      valid,
      product: valid
        ? {
            name,
            description: cell(HEADERS.description) || undefined,
            categorySlug: category!.slug,
            price,
            salePrice,
            sku: cell(HEADERS.sku) || undefined,
            stock,
            taxCategory,
            weight,
            speciesSlugs,
          }
        : undefined,
    };
  }

  /** All-or-nothing — reuses CatalogService.create()'s own validation for every row inside one
   * transaction, so a row that somehow slipped past client-side validation (e.g. a category
   * deleted between validate and confirm) rolls the whole batch back instead of partially creating. */
  async bulkCreate(businessId: string, products: CreateProductDto[]) {
    return this.prisma.$transaction((tx) => Promise.all(products.map((dto) => this.catalog.create(businessId, dto, tx))));
  }
}
