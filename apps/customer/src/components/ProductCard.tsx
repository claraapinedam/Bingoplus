export interface ProductCardData {
  id: string;
  name: string;
  price: string | number;
  salePrice: string | number | null;
  business: { id: string; tradeName: string };
}

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

export default function ProductCard({ product }: { product: ProductCardData }) {
  const price = Number(product.price);
  const salePrice = product.salePrice !== null ? Number(product.salePrice) : null;
  const effectivePrice = salePrice ?? price;

  return (
    <div className="bingo-product-card">
      <a href={`/products/${product.id}`}>
        <div className="bingo-product-thumb">{product.name.charAt(0).toUpperCase()}</div>
      </a>
      <div className="bingo-product-body">
        <a href={`/products/${product.id}`} className="bingo-product-name" style={{ display: 'block' }}>
          {product.name}
        </a>
        <a href={`/stores/${product.business.id}`} className="bingo-product-business">
          🏪 {product.business.tradeName}
        </a>
        <div className="bingo-product-price">
          {salePrice !== null && (
            <span className="bingo-price-strike">{currencyFormatter.format(price)}</span>
          )}
          {currencyFormatter.format(effectivePrice)}
        </div>
      </div>
    </div>
  );
}
