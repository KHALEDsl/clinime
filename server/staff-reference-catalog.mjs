// Label/category/SKU metadata from the user-approved reference only:
// outputs/clinime-team-preview-20261031/dist/team.js stockSeed / products.
// Prototype counts, prices, minimum levels, expiry dates and patient data are
// intentionally absent. Importing these labels does not verify physical stock.
export const REFERENCE_MATERIALS = [
  ['قفازات نيتريل', 'مواد استهلاكية'], ['شاش معقم', 'مواد استهلاكية'],
  ['سيروم هايدرا فيشل', 'مستلزمات طبية'], ['غسول البشرة', 'مستلزمات طبية'],
  ['فيلر هيالورونيك', 'مستلزمات طبية'], ['بوتكس', 'مستلزمات طبية'],
  ['محلول التقشير الكيميائي', 'مستلزمات طبية'], ['سيروم تفتيح', 'مستلزمات طبية'],
  ['رؤوس مايكرونيدلينغ', 'مستلزمات طبية'], ['محلول تعقيم', 'مواد استهلاكية'],
  ['مفارش سرير', 'مواد استهلاكية'], ['كمامات', 'مواد استهلاكية'],
  ['قطن', 'مواد استهلاكية'], ['ملابس واقية', 'مواد استهلاكية'],
  ['أدوات حقن للاستخدام الواحد', 'مستلزمات طبية'], ['ضمادات الجروح', 'مواد استهلاكية'],
].map(([name, type], index) => ({ id: 'ref-material-' + String(index + 1).padStart(2, '0'), name, type, kind: 'مستهلك', sku: (type === 'مستلزمات طبية' ? 'MED' : 'ESS') + '-' + String(index + 1).padStart(3, '0') }));
export const REFERENCE_PRODUCTS = [
  { id: 'ref-product-01', name: 'غسول لطيف للبشرة', description: 'غسول يومي للعناية بالبشرة.', category: 'منتجات العناية' },
  { id: 'ref-product-02', name: 'سيروم الترطيب', description: 'عناية مرطبة للبشرة.', category: 'منتجات العناية' },
];
