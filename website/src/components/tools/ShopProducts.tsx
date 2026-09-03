"use client";

import clsx from "clsx";
import { ChevronRight, ImageOff, Scale, Star, Tag } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";

const DRAM = "֏";








function money(value: number | undefined, currency = "AMD"): string {
  if (value === undefined) return "—";
  const rounded = Math.round(value * 100) / 100;
  if (currency === "AMD") {
    return `${rounded.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${DRAM}`;
  }
  try {
    return rounded.toLocaleString("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${rounded.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
  }
}

export interface ShopBrand {
  name: string;

  host: string;

  accent: string;
}

export interface ShopProduct {
  id: number | string;
  name: string;
  price?: number;
  wasPrice?: number;
  discountPercent?: number;
  discountRuns?: { from?: string; to?: string; text?: string };
  
  rating?: number;
  reviewCount?: number;
  category?: string;
  categoryPath?: string[];
  brand?: string;
  manufacturer?: string;
  country?: string;
  description?: string;
  ingredients?: string;
  howToUse?: string;
  taste?: string;
  nutrition?: string[];

  details?: string[];
  soldByWeight?: boolean | { minimumGrams?: number; stepGrams?: number };
  weightKg?: number;

  packSize?: string;

  pricePerUnit?: { amount: number; unit: string } | string;
  barcodes?: string[];
  code?: string;
  available?: string;
  tags?: string[];
  availableOnline?: boolean;
  ageRestricted?: boolean;
  url: string;
  image?: string;
  images?: string[];
  alsoConsider?: ShopProduct[];
}

function perUnitLabel(
  product: ShopProduct,
  currency: string,
): string | undefined {
  const perUnit = product.pricePerUnit;
  if (!perUnit) return undefined;
  if (typeof perUnit === "string") return perUnit;
  return `${money(perUnit.amount, currency)} / ${perUnit.unit}`;
}

function discountWindow(product: ShopProduct): string | undefined {
  const runs = product.discountRuns;
  if (!runs) return undefined;
  if (runs.text) return runs.text;
  if (runs.from && runs.to) return `discounted ${runs.from} → ${runs.to}`;
  return undefined;
}

function accentStyle(shop?: ShopBrand): CSSProperties {
  return {
    "--shop-accent": shop?.accent ?? "var(--corro-text)",
  } as CSSProperties;
}

function Shot({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={clsx(
        "flex items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-border",
        className,
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-contain p-1.5"
        />
      ) : (
        <ImageOff size={16} className="text-ink-muted/50" />
      )}
    </div>
  );
}

function DiscountBadge({ percent }: { percent: number }) {
  return (
    <span className="shrink-0 rounded-md bg-[color:var(--shop-accent)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
      −{Math.round(percent)}%
    </span>
  );
}




function Rating({ value, count }: { value?: number; count?: number }) {
  if (value === undefined) return null;
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-ink-muted">
      <Star size={9} className="fill-current" />
      <span className="tabular-nums">{value.toFixed(1)}</span>
      {count !== undefined && (
        <span className="tabular-nums">({count.toLocaleString()})</span>
      )}
    </span>
  );
}

function Price({
  price,
  wasPrice,
  discountPercent,
  currency = "AMD",
  size = "sm",
}: {
  price?: number;
  wasPrice?: number;
  discountPercent?: number;
  currency?: string;
  size?: "sm" | "lg";
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span
        className={clsx(
          "font-semibold tabular-nums",
          size === "lg" ? "text-[15px]" : "text-[13px]",
          wasPrice !== undefined
            ? "text-[color:var(--shop-accent)]"
            : "text-ink",
        )}
      >
        {money(price, currency)}
      </span>
      {wasPrice !== undefined && (
        <span className="text-[11px] tabular-nums text-ink-muted line-through">
          {money(wasPrice, currency)}
        </span>
      )}
      {discountPercent !== undefined && (
        <DiscountBadge percent={discountPercent} />
      )}
    </div>
  );
}

function ProductCard({
  product,
  currency,
}: {
  product: ShopProduct;
  currency: string;
}) {
  const perUnit = perUnitLabel(product, currency);

  return (
    <a
      href={product.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-2 transition-colors hover:bg-surface-raised"
    >
      <Shot
        src={product.image ?? product.images?.[0]}
        alt={product.name}
        className="aspect-square w-full"
      />
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {product.category && (
          <span className="truncate text-[10px] uppercase tracking-wide text-ink-muted">
            {product.category}
          </span>
        )}
        <span className="line-clamp-2 text-[12px] leading-snug text-ink group-hover:underline">
          {product.name}
        </span>
        <Rating value={product.rating} count={product.reviewCount} />
        <div className="mt-auto pt-1">
          <Price
            price={product.price}
            wasPrice={product.wasPrice}
            discountPercent={product.discountPercent}
            currency={currency}
          />
          {perUnit && (
            <p className="mt-0.5 text-[10px] tabular-nums text-ink-muted">
              {perUnit}
            </p>
          )}
          {product.soldByWeight === true && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-muted">
              <Scale size={9} /> sold by weight
            </p>
          )}
        </div>
      </div>
    </a>
  );
}

export function ShopSearchResults({
  products,
  shop,
  query,
  totalMatches,
  page,
  pageCount,
  shelf,
  currency = "AMD",
}: {
  products: ShopProduct[];
  shop?: ShopBrand;
  query?: string;
  totalMatches?: number;
  page?: number;
  pageCount?: number;
  
  shelf?: string;
  
  currency?: string;
}) {
  if (!products.length) {
    return (
      <p className="text-[12px] text-ink-muted">
        Nothing in {shop?.name ?? "the catalogue"} matched
        {query ? ` “${query}”` : ""}.
      </p>
    );
  }

  const scope = query
    ? `matching “${query}”`
    : shelf === "discounts"
      ? "on the discount shelf"
      : "products";

  return (
    <div className="space-y-2" style={accentStyle(shop)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} currency={currency} />
        ))}
      </div>
      <p className="text-[10px] text-ink-muted">
        {totalMatches !== undefined
          ? `${products.length} of ${totalMatches.toLocaleString()} `
          : `${products.length} `}
        {scope}
        {page !== undefined && pageCount !== undefined && pageCount > 1
          ? ` · page ${page} of ${pageCount.toLocaleString()}`
          : ""}
        {shop ? ` · ${shop.host}` : ""}
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[11px] leading-relaxed">
      <span className="w-20 shrink-0 text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1 text-ink">{value}</span>
    </div>
  );
}

function Prose({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </p>

      <p className="whitespace-pre-line text-[12px] leading-relaxed text-ink">
        {text}
      </p>
    </div>
  );
}

function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);

  return (
    <div className="w-28 shrink-0 space-y-1.5 sm:w-32">
      <Shot src={images[active]} alt={alt} className="aspect-square w-full" />
      {images.length > 1 && (
        <div className="flex gap-1">
          {images.slice(0, 4).map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`${alt}, photo ${i + 1}`}
              className={clsx(
                "size-7 overflow-hidden rounded-md ring-1 transition-colors",
                i === active ? "ring-ink" : "ring-border hover:ring-ink-muted",
              )}
            >
              <Shot src={src} alt="" className="size-full ring-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function sizeNote(product: ShopProduct): string | undefined {
  const byWeight = product.soldByWeight;
  if (byWeight && typeof byWeight === "object") {
    const bits = [
      byWeight.minimumGrams ? `from ${byWeight.minimumGrams} g` : "",
      byWeight.stepGrams ? `in ${byWeight.stepGrams} g steps` : "",
    ].filter(Boolean);
    return `Sold by weight${bits.length ? ` — ${bits.join(", ")}` : ""}`;
  }
  if (byWeight === true) return "Sold by weight";
  if (product.packSize) return product.packSize;
  return product.weightKg ? `${product.weightKg} kg` : undefined;
}

function ProductDetail({
  product,
  currency,
}: {
  product: ShopProduct;
  currency: string;
}) {
  const images = product.images?.length
    ? product.images
    : product.image
      ? [product.image]
      : [];
  const size = sizeNote(product);
  const window = discountWindow(product);
  const perUnit = perUnitLabel(product, currency);

  const hasBody =
    product.description ||
    product.ingredients ||
    product.howToUse ||
    product.taste ||
    product.nutrition?.length ||
    product.details?.length;

  return (
    <div className="rounded-xl border border-border bg-surface p-2.5">
      <div className="flex gap-3">
        <Gallery images={images} alt={product.name} />

        <div className="min-w-0 flex-1 space-y-2">
          <div>
            {product.categoryPath?.length && (
              <p className="mb-0.5 flex flex-wrap items-center gap-0.5 text-[10px] text-ink-muted">
                {product.categoryPath.map((step, i) => (
                  <span key={step} className="flex items-center gap-0.5">
                    {i > 0 && <ChevronRight size={9} />}
                    {step}
                  </span>
                ))}
              </p>
            )}
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-medium leading-snug text-ink hover:underline"
            >
              {product.name}
            </a>
            <Rating value={product.rating} count={product.reviewCount} />
          </div>

          <div>
            <Price
              price={product.price}
              wasPrice={product.wasPrice}
              discountPercent={product.discountPercent}
              currency={currency}
              size="lg"
            />
            {perUnit && (
              <p className="mt-0.5 text-[10px] tabular-nums text-ink-muted">
                {perUnit}
              </p>
            )}
          </div>

          {window && (
            <p className="flex items-center gap-1 text-[10px] text-ink-muted">
              <Tag size={9} />
              {window}
            </p>
          )}

          <div className="space-y-0.5">
            {product.brand && <Fact label="Brand" value={product.brand} />}
            {product.country && <Fact label="Origin" value={product.country} />}
            {product.manufacturer && (
              <Fact label="Made by" value={product.manufacturer} />
            )}
            {size && <Fact label="Size" value={size} />}
            {product.available && (
              <Fact label="Stock" value={product.available} />
            )}
            {product.barcodes?.length && (
              <Fact label="Barcode" value={product.barcodes.join(", ")} />
            )}
            {product.code && <Fact label="Code" value={product.code} />}
            {product.availableOnline === false && (
              <Fact label="Stock" value="Not available online" />
            )}
          </div>
        </div>
      </div>

      {hasBody && (
        <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
          {product.description && (
            <Prose label="Description" text={product.description} />
          )}
          {product.taste && <Prose label="Taste" text={product.taste} />}
          {product.ingredients && (
            <Prose label="Ingredients" text={product.ingredients} />
          )}
          {product.howToUse && <Prose label="Use" text={product.howToUse} />}
          {(product.nutrition?.length || product.details?.length) && (
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                {product.nutrition?.length ? "Nutrition" : "Details"}
              </p>
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                {(product.nutrition ?? product.details ?? []).map((line) => (
                  <li key={line} className="text-[11px] tabular-nums text-ink">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {product.alsoConsider?.length && (
        <div className="mt-2.5 border-t border-border pt-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            Also on the shelf
          </p>
          <ul className="space-y-1">
            {product.alsoConsider.slice(0, 5).map((alt) => (
              <li key={alt.id}>
                <a
                  href={alt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-baseline gap-2 rounded-md px-1 py-0.5 hover:bg-surface-raised"
                >
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink">
                    {alt.name}
                  </span>
                  <Price
                    price={alt.price}
                    wasPrice={alt.wasPrice}
                    discountPercent={alt.discountPercent}
                    currency={currency}
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ShopProductDetails({
  products,
  shop,
  failed,
  currency = "AMD",
}: {
  products: ShopProduct[];
  shop?: ShopBrand;
  failed?: Array<{ id?: number; slug?: string; url?: string; error?: string }>;
  
  currency?: string;
}) {
  return (
    <div className="space-y-2" style={accentStyle(shop)}>
      {products.map((p) => (
        <ProductDetail key={p.id} product={p} currency={currency} />
      ))}
      {failed?.map((f) => (
        <p
          key={f.id ?? f.slug ?? f.url}
          className="rounded-lg bg-contradicted/5 px-2.5 py-2 text-[12px] text-contradicted"
        >
          {f.id ?? f.slug ?? f.url}: {f.error}
        </p>
      ))}
    </div>
  );
}

export interface ShopCategory {
  id?: number | string;
  slug?: string;
  name: string;
  productCount?: number;
  ageRestricted?: boolean;
  image?: string;

  children?: Array<{ id?: number | string; slug?: string; name: string }>;
}

function categoryKey(category: {
  id?: number | string;
  slug?: string;
  name: string;
}): string {
  return String(category.id ?? category.slug ?? category.name);
}

export function ShopCategories({
  categories,
  shop,
  level,
}: {
  categories: ShopCategory[];
  shop?: ShopBrand;
  level?: string;
}) {
  if (!categories.length) {
    return (
      <p className="text-[12px] text-ink-muted">
        This section has no sub-categories.
      </p>
    );
  }

  const nested = categories.some((c) => c.children?.length);

  return (
    <div className="space-y-2" style={accentStyle(shop)}>
      {nested ? (
        <ul className="space-y-1.5">
          {categories.map((c) => (
            <li key={categoryKey(c)}>
              <div className="flex items-center gap-1.5">
                {c.image && <Shot src={c.image} alt="" className="size-5" />}
                <span className="text-[12px] font-medium text-ink">
                  {c.name}
                </span>
                <span className="font-mono text-[9px] text-ink-muted/60">
                  {c.slug ?? c.id}
                </span>
              </div>
              {c.children?.length ? (
                <p className="ml-1 mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                  {c.children.map((child) => child.name).join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <li
              key={categoryKey(c)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1"
            >
              {c.image && <Shot src={c.image} alt="" className="size-5" />}
              <span className="text-[12px] text-ink">{c.name}</span>
              {c.productCount !== undefined && (
                <span className="tabular-nums text-[10px] text-ink-muted">
                  {c.productCount.toLocaleString()}
                </span>
              )}
              {c.ageRestricted && (
                <span className="rounded bg-surface-raised px-1 text-[9px] font-semibold text-ink-muted">
                  18+
                </span>
              )}
              <span className="font-mono text-[9px] text-ink-muted/60">
                {c.slug ?? `#${c.id}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-ink-muted">
        {categories.length} {level === "top" ? "top-level " : ""}
        {categories.length === 1 ? "category" : "categories"}
        {shop ? ` · ${shop.host}` : ""}
      </p>
    </div>
  );
}
