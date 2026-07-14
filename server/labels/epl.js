const LINE_WIDTH = 38;

const cleanText = (value, maxLength = 80) => {
  const text = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLength);
};

const pick = (source, keys, fallback = '') => {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return fallback;
};

const toNumber = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const compact = String(value ?? '').trim().replace(/\s+/g, '');
  const hasComma = compact.includes(',');
  const hasDot = compact.includes('.');
  const canonical = hasComma && hasDot
    ? compact.replace(/\./g, '').replace(',', '.')
    : hasComma
      ? compact.replace(',', '.')
      : compact;
  const parsed = Number(canonical);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const splitLines = (value, maxLines = 2) => {
  const words = cleanText(value, 120).split(' ').filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= LINE_WIDTH) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word.slice(0, LINE_WIDTH);
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines.length ? lines : ['PRODUTO'];
};

const normalizeItems = (payload, order) => {
  const directItems = payload?.items || payload?.itens || payload?.order_items;
  const orderItems = order?.items || order?.itens || order?.order_items;
  const item = payload?.item || payload?.produto || payload?.product;
  const items = Array.isArray(directItems)
    ? directItems
    : Array.isArray(orderItems)
      ? orderItems
      : item
        ? [item]
        : [];
  return items.filter(Boolean);
};

const normalizePayload = (payload = {}) => {
  const order = payload.order || payload.pedido || payload.sale || payload;
  const items = normalizeItems(payload, order);
  return { order, items };
};

const getOrderNumber = (order) => cleanText(pick(order, [
  'displayId',
  'numero_pedido',
  'numeroPedido',
  'numero_orcamento',
  'numeroOrcamento',
  'order_number',
  'orderId',
  'remoteId',
  'id'
], ''), 28);

const normalizeItem = (item) => {
  const product = item?.produto || item?.product || {};
  return {
    code: cleanText(pick(item, [
      'codigo_produto',
      'product_code',
      'productId',
      'codigo',
      'code',
      'plu',
      'id'
    ], pick(product, ['codigo', 'code', 'plu', 'id'], '')), 32),
    name: cleanText(pick(item, [
      'nome_produto',
      'productName',
      'name',
      'descricao',
      'description'
    ], pick(product, ['nome', 'name', 'descricao', 'description'], 'Produto')), 110),
    quantity: toNumber(pick(item, ['quantidade', 'quantity', 'qty', 'amount'], 1), 1),
    unit: cleanText(pick(item, ['unidade', 'unit'], pick(product, ['unidade', 'unit'], 'un')), 8),
    barcode: cleanText(pick(item, ['barcode', 'codigo_barras', 'ean'], pick(product, ['barcode', 'codigo_barras', 'ean'], '')), 32)
  };
};

const formatQuantity = (quantity, unit) => {
  const normalized = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return cleanText(`${normalized} ${unit || ''}`, 16);
};

const buildSingleLabel = ({ orderNumber, item, copyIndex, totalCopies }) => {
  const label = normalizeItem(item);
  const lines = splitLines(label.name, 2);
  const qty = formatQuantity(label.quantity, label.unit);
  const copySuffix = totalCopies > 1 ? ` ${copyIndex}/${totalCopies}` : '';
  const commands = [
    'N',
    'q783',
    'Q400,24',
    'D10',
    'S2',
    'ZT',
    'LO24,24,735,2',
    'LO24,360,735,2',
    `A36,38,0,4,1,1,N,"${lines[0]}"`,
    `A36,82,0,3,1,1,N,"${lines[1] || ''}"`,
    `A36,132,0,3,1,1,N,"COD: ${label.code || '-'}"`,
    `A36,176,0,3,1,1,N,"QTD: ${qty}"`,
    `A36,220,0,3,1,1,N,"PEDIDO: ${orderNumber || '-'}${copySuffix}"`,
  ];

  if (label.barcode) {
    commands.push(`B36,270,0,1,2,2,62,B,"${label.barcode}"`);
  }

  commands.push('P1');
  return `${commands.join('\r\n')}\r\n`;
};

export const buildEtiquetaEpl = (payload = {}) => {
  const { order, items } = normalizePayload(payload);
  if (!items.length) {
    throw new Error('Nenhum item informado para gerar etiqueta.');
  }

  const orderNumber = getOrderNumber(order);
  const labels = [];

  items.forEach((rawItem) => {
    const normalized = normalizeItem(rawItem);
    const copies = Math.max(1, Math.ceil(normalized.quantity || 1));
    for (let copyIndex = 1; copyIndex <= copies; copyIndex += 1) {
      labels.push(buildSingleLabel({ orderNumber, item: rawItem, copyIndex, totalCopies: copies }));
    }
  });

  return labels.join('');
};

export const buildEtiquetaEplBuffer = (payload = {}) => Buffer.from(buildEtiquetaEpl(payload), 'ascii');
