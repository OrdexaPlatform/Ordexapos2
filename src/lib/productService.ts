import { supabase } from './supabase';
import { 
  Product, 
  ProductCategory, 
  ProductBrand, 
  ProductUnit, 
  ProductBarcode 
} from '../types';
import { logActivity } from './activityLogger';

export interface FetchProductsOptions {
  search?: string;
  categoryId?: string;
  brandId?: string;
  stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
  isActive?: boolean | 'all';
  limit?: number;
  offset?: number;
}

export interface ProductsFetchResult {
  products: Product[];
  totalCount: number;
  stats: {
    totalProducts: number;
    activeProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
  };
}

export async function fetchProducts(
  clientId: string,
  options: FetchProductsOptions = {}
): Promise<ProductsFetchResult> {
  if (!clientId) {
    return {
      products: [],
      totalCount: 0,
      stats: { totalProducts: 0, activeProducts: 0, lowStockProducts: 0, outOfStockProducts: 0 },
    };
  }

  // 1. Fetch products with joins
  let query = supabase
    .from('products')
    .select(`
      *,
      category:product_categories(*),
      brand:product_brands(*),
      unit:product_units(*),
      barcodes:product_barcodes(*)
    `, { count: 'exact' })
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  // Filter by active status
  if (options.isActive !== undefined && options.isActive !== 'all') {
    query = query.eq('is_active', options.isActive);
  }

  // Filter by category
  if (options.categoryId && options.categoryId !== 'all') {
    query = query.eq('category_id', options.categoryId);
  }

  // Filter by brand
  if (options.brandId && options.brandId !== 'all') {
    query = query.eq('brand_id', options.brandId);
  }

  // Search by name, SKU, or primary barcode
  if (options.search?.trim()) {
    const term = options.search.trim();
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
  }

  // Stock status filter (if needed at database level or client filter)
  if (options.stockStatus === 'out_of_stock') {
    query = query.lte('current_stock', 0);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching products:', error);
    throw new Error(error.message || 'فشل في جلب المنتجات');
  }

  let products = (data || []) as Product[];

  // Filter stockStatus for low_stock (requires comparing current_stock <= min_stock)
  if (options.stockStatus === 'low_stock') {
    products = products.filter(p => p.track_stock && p.current_stock > 0 && p.current_stock <= p.min_stock);
  } else if (options.stockStatus === 'in_stock') {
    products = products.filter(p => !p.track_stock || p.current_stock > p.min_stock);
  }

  // 2. Fetch stats for the dashboard cards
  const { data: allProductsForStats } = await supabase
    .from('products')
    .select('is_active, current_stock, min_stock, track_stock')
    .eq('client_id', clientId);

  const stats = {
    totalProducts: allProductsForStats?.length || 0,
    activeProducts: allProductsForStats?.filter(p => p.is_active).length || 0,
    lowStockProducts: allProductsForStats?.filter(p => p.track_stock && p.current_stock > 0 && p.current_stock <= p.min_stock).length || 0,
    outOfStockProducts: allProductsForStats?.filter(p => p.track_stock && p.current_stock <= 0).length || 0,
  };

  return {
    products,
    totalCount: count || products.length,
    stats,
  };
}

export async function fetchProductDetails(productId: string, clientId: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      category:product_categories(*),
      brand:product_brands(*),
      unit:product_units(*),
      barcodes:product_barcodes(*),
      balances:inventory_balances(
        *,
        warehouse:warehouses(*)
      )
    `)
    .eq('id', productId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'فشل في جلب تفاصيل المنتج');
  }

  return data as Product | null;
}

export interface CreateProductInput {
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category_id?: string | null;
  brand_id?: string | null;
  unit_id?: string | null;
  cost_price: number;
  selling_price: number;
  tax_rate: number;
  min_stock: number;
  track_stock: boolean;
  is_active: boolean;
  additional_barcodes?: string[];
}

export async function createProduct(
  clientId: string,
  input: CreateProductInput
): Promise<Product> {
  if (!clientId) throw new Error('معرف المنشأة مطلوب');
  if (!input.name?.trim()) throw new Error('اسم المنتج مطلوب');
  if (!input.sku?.trim()) throw new Error('رمز الصنف (SKU) مطلوب');
  if (input.selling_price < 0) throw new Error('سعر البيع لا يمكن أن يكون سالبًا');
  if (input.cost_price < 0) throw new Error('سعر التكلفة لا يمكن أن يكون سالبًا');

  const trimmedSku = input.sku.trim();
  const trimmedBarcode = input.barcode?.trim() || null;

  // 1. Check SKU uniqueness
  const { data: existingSku } = await supabase
    .from('products')
    .select('id')
    .eq('client_id', clientId)
    .eq('sku', trimmedSku)
    .maybeSingle();

  if (existingSku) {
    throw new Error(`رمز الصنف (SKU: ${trimmedSku}) مستخدم مسبقاً في منشأتك`);
  }

  // 2. Check Barcode uniqueness if provided
  if (trimmedBarcode) {
    const { data: existingBarcode } = await supabase
      .from('products')
      .select('id')
      .eq('client_id', clientId)
      .eq('barcode', trimmedBarcode)
      .maybeSingle();

    if (existingBarcode) {
      throw new Error(`الباركود (${trimmedBarcode}) مستخدم مسبقاً لمنتج آخر`);
    }
  }

  // 3. Insert Product
  const { data: newProduct, error: insertError } = await supabase
    .from('products')
    .insert({
      client_id: clientId,
      sku: trimmedSku,
      barcode: trimmedBarcode,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category_id: input.category_id || null,
      brand_id: input.brand_id || null,
      unit_id: input.unit_id || null,
      cost_price: Number(input.cost_price) || 0,
      selling_price: Number(input.selling_price) || 0,
      tax_rate: Number(input.tax_rate) || 0,
      min_stock: Number(input.min_stock) || 0,
      current_stock: 0,
      track_stock: input.track_stock !== false,
      is_active: input.is_active !== false,
    })
    .select(`
      *,
      category:product_categories(*),
      brand:product_brands(*),
      unit:product_units(*)
    `)
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      throw new Error('رمز الصنف أو الباركود مستخدم بالفعل');
    }
    throw new Error(insertError.message || 'فشل في حفظ المنتج');
  }

  // 4. Insert Barcodes into product_barcodes
  const barcodesToInsert: Array<{ client_id: string; product_id: string; barcode: string; is_primary: boolean }> = [];

  if (trimmedBarcode) {
    barcodesToInsert.push({
      client_id: clientId,
      product_id: newProduct.id,
      barcode: trimmedBarcode,
      is_primary: true,
    });
  }

  if (input.additional_barcodes && input.additional_barcodes.length > 0) {
    for (const b of input.additional_barcodes) {
      const cleanB = b.trim();
      if (cleanB && cleanB !== trimmedBarcode) {
        barcodesToInsert.push({
          client_id: clientId,
          product_id: newProduct.id,
          barcode: cleanB,
          is_primary: false,
        });
      }
    }
  }

  if (barcodesToInsert.length > 0) {
    const { error: bcError } = await supabase
      .from('product_barcodes')
      .insert(barcodesToInsert);

    if (bcError) {
      console.warn('Could not insert secondary barcodes:', bcError);
    }
  }

  await logActivity({
    action: 'product_created',
    entityType: 'product',
    entityId: newProduct.id,
    metadata: {
      name: newProduct.name,
      sku: newProduct.sku,
      selling_price: newProduct.selling_price,
    },
  });

  return newProduct as Product;
}

export async function updateProduct(
  productId: string,
  clientId: string,
  input: Partial<CreateProductInput>
): Promise<Product> {
  if (!productId || !clientId) throw new Error('معرف المنتج والمنشأة مطلوبان');

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.sku !== undefined) updates.sku = input.sku.trim();
  if (input.barcode !== undefined) updates.barcode = input.barcode?.trim() || null;
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.category_id !== undefined) updates.category_id = input.category_id || null;
  if (input.brand_id !== undefined) updates.brand_id = input.brand_id || null;
  if (input.unit_id !== undefined) updates.unit_id = input.unit_id || null;
  if (input.cost_price !== undefined) updates.cost_price = Number(input.cost_price) || 0;
  if (input.selling_price !== undefined) updates.selling_price = Number(input.selling_price) || 0;
  if (input.tax_rate !== undefined) updates.tax_rate = Number(input.tax_rate) || 0;
  if (input.min_stock !== undefined) updates.min_stock = Number(input.min_stock) || 0;
  if (input.track_stock !== undefined) updates.track_stock = !!input.track_stock;
  if (input.is_active !== undefined) updates.is_active = !!input.is_active;

  // Check SKU conflict if changed
  if (updates.sku) {
    const { data: existingSku } = await supabase
      .from('products')
      .select('id')
      .eq('client_id', clientId)
      .eq('sku', updates.sku)
      .neq('id', productId)
      .maybeSingle();

    if (existingSku) {
      throw new Error(`رمز الصنف (SKU: ${updates.sku}) مستخدم لمنتج آخر`);
    }
  }

  // Check Barcode conflict if changed
  if (updates.barcode) {
    const { data: existingBarcode } = await supabase
      .from('products')
      .select('id')
      .eq('client_id', clientId)
      .eq('barcode', updates.barcode)
      .neq('id', productId)
      .maybeSingle();

    if (existingBarcode) {
      throw new Error(`الباركود (${updates.barcode}) مستخدم لمنتج آخر`);
    }
  }

  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', productId)
    .eq('client_id', clientId)
    .select(`
      *,
      category:product_categories(*),
      brand:product_brands(*),
      unit:product_units(*)
    `)
    .single();

  if (error) {
    throw new Error(error.message || 'فشل في تحديث بيانات المنتج');
  }

  // Update primary barcode in product_barcodes table
  if (updates.barcode) {
    await supabase
      .from('product_barcodes')
      .upsert({
        client_id: clientId,
        product_id: productId,
        barcode: updates.barcode,
        is_primary: true,
      }, { onConflict: 'client_id, barcode' });
  }

  await logActivity({
    action: 'product_updated',
    entityType: 'product',
    entityId: productId,
    metadata: updates,
  });

  return data as Product;
}

export async function toggleProductActive(
  productId: string,
  clientId: string,
  isActive: boolean
): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)
    .eq('client_id', clientId);

  if (error) {
    throw new Error(error.message || 'فشل في تغيير حالة المنتج');
  }

  await logActivity({
    action: isActive ? 'product_activated' : 'product_deactivated',
    entityType: 'product',
    entityId: productId,
    metadata: { is_active: isActive },
  });
}

// ============================================================================
// Categories, Brands, and Units Sub-services
// ============================================================================

export async function fetchProductCategories(clientId: string): Promise<ProductCategory[]> {
  if (!clientId) return [];
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .eq('client_id', clientId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message || 'فشل في جلب التصنيفات');
  return (data || []) as ProductCategory[];
}

export async function createProductCategory(
  clientId: string,
  name: string,
  description?: string
): Promise<ProductCategory> {
  const { data, error } = await supabase
    .from('product_categories')
    .insert({
      client_id: clientId,
      name: name.trim(),
      description: description?.trim() || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('التصنيف موجود مسبقاً');
    throw new Error(error.message || 'فشل في إضافة التصنيف');
  }
  return data as ProductCategory;
}

export async function fetchProductBrands(clientId: string): Promise<ProductBrand[]> {
  if (!clientId) return [];
  const { data, error } = await supabase
    .from('product_brands')
    .select('*')
    .eq('client_id', clientId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message || 'فشل في جلب العلامات التجارية');
  return (data || []) as ProductBrand[];
}

export async function createProductBrand(
  clientId: string,
  name: string,
  description?: string
): Promise<ProductBrand> {
  const { data, error } = await supabase
    .from('product_brands')
    .insert({
      client_id: clientId,
      name: name.trim(),
      description: description?.trim() || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('العلامة التجارية مسجلة مسبقاً');
    throw new Error(error.message || 'فشل في إضافة العلامة التجارية');
  }
  return data as ProductBrand;
}

export async function fetchProductUnits(clientId: string): Promise<ProductUnit[]> {
  if (!clientId) return [];
  const { data, error } = await supabase
    .from('product_units')
    .select('*')
    .eq('client_id', clientId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message || 'فشل في جلب وحدات القياس');
  return (data || []) as ProductUnit[];
}

export async function createProductUnit(
  clientId: string,
  name: string,
  symbol: string
): Promise<ProductUnit> {
  const { data, error } = await supabase
    .from('product_units')
    .insert({
      client_id: clientId,
      name: name.trim(),
      symbol: symbol.trim(),
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('وحدة القياس موجودة مسبقاً');
    throw new Error(error.message || 'فشل في إضافة وحدة القياس');
  }
  return data as ProductUnit;
}

export async function ensureDefaultUnits(clientId: string): Promise<ProductUnit[]> {
  const existing = await fetchProductUnits(clientId);
  if (existing.length > 0) return existing;

  const standardUnits = [
    { name: 'قطعة', symbol: 'قطعة' },
    { name: 'علبة / كرتونة', symbol: 'علبة' },
    { name: 'كيلوجرام', symbol: 'كجم' },
    { name: 'جرام', symbol: 'جم' },
    { name: 'لتر', symbol: 'لتر' },
    { name: 'متر', symbol: 'متر' },
    { name: 'حبة', symbol: 'حبة' },
  ];

  await supabase
    .from('product_units')
    .insert(standardUnits.map(u => ({
      client_id: clientId,
      name: u.name,
      symbol: u.symbol,
      is_active: true,
    })));

  return await fetchProductUnits(clientId);
}
