import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { db, ensureStoreInfoRow } from '../db.js';
import { getStoreIdFromRequest, getStoreIdForProducts } from '../config.js';

const formatMoney = (value) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatDatePtBr = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return date.toLocaleDateString('pt-BR');
  }
};
const formatDateTimePtBr = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return date.toLocaleString('pt-BR');
  }
};

const getReceiptDocumentKind = (receipt = {}) => {
  const status = String(receipt.status || '').trim().toLowerCase();
  const businessStatus = String(receipt.businessStatus || receipt.business_status || '').trim().toLowerCase();
  const documentType = String(receipt.documentType || receipt.document_type || '').trim().toLowerCase();
  if (
    documentType === 'orcamento' ||
    documentType === 'orçamento' ||
    documentType === 'budget' ||
    status === 'draft' ||
    status === 'rascunho' ||
    businessStatus === 'orcamento' ||
    businessStatus === 'rascunho'
  ) {
    return 'orcamento';
  }
  return 'pedido';
};

const getReceiptDocumentLabels = (kind) => {
  const isBudget = kind === 'orcamento';
  return {
    headline: isBudget ? 'ORÇAMENTO' : 'PEDIDO',
    cover: isBudget ? 'ORÇAMENTO COMERCIAL' : 'COMPROVANTE DE PEDIDO',
    subtitle: '',
    items: isBudget ? 'ITENS DO ORÇAMENTO' : 'ITENS DO PEDIDO',
    numberLabel: isBudget ? 'ORÇAMENTO Nº' : 'PEDIDO Nº',
    filenamePrefix: isBudget ? 'orcamento' : 'pedido',
  };
};

const renderReceiptPDF = (doc, receipt, store) => {
  const documentKind = getReceiptDocumentKind(receipt);
  const documentLabels = getReceiptDocumentLabels(documentKind);
  const marginLeft = doc.page.margins.left;
  const marginTop = doc.page.margins.top;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const contentBottom = doc.page.height - doc.page.margins.bottom;
  const dateLabel = formatDatePtBr(receipt.createdAt);
  const total = Number(receipt.total || 0);
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const paymentPlan = receipt.paymentPlanDescription
    ? `Plano: ${receipt.paymentPlanDescription}${receipt.paymentInstallments ? ` (${receipt.paymentInstallments}x)` : ''}`
    : null;

  const formatDisplayLabel = (value, fallback = '—') => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return fallback;

    const dictionary = {
      pix: 'PIX',
      dinheiro: 'Dinheiro',
      cartao: 'Cartão',
      boleto: 'Boleto',
      retirada: 'Retirada',
      entrega_propria: 'Entrega Própria',
      transportadora: 'Transportadora',
      sem_frete: 'Sem frete',
      fob: 'Retirada',
      cif: 'Entrega'
    };

    if (dictionary[normalized]) return dictionary[normalized];

    return normalized
      .split(/[ _-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const paymentMethodLabel = formatDisplayLabel(receipt.paymentMethod);
  const shippingMethodLabel = formatDisplayLabel(receipt.shippingMethod);

  const drawBox = (x, y, width, height, options = {}) => {
    const { fill = null, stroke = '#d7dee7', radius = 10, lineWidth = 1 } = options;
    doc.save();
    doc.lineWidth(lineWidth);
    doc.roundedRect(x, y, width, height, radius);
    if (fill) {
      doc.fillAndStroke(fill, stroke);
    } else {
      doc.strokeColor(stroke).stroke();
    }
    doc.restore();
  };

  const writeLabel = (label, x, y, width, align = 'left', color = '#64748b') => {
    doc.fillColor(color).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, y, { width, align });
  };

  const metaTop = marginTop;
  const metaHeight = 128;
  const orderCardWidth = 200;
  const orderCardHeight = 96;
  const companyWidth = pageWidth - orderCardWidth - 16;
  const hasStoreIdentity = Boolean(store && (store.trade_name || store.legal_name || store.document || store.logo_url));

  drawBox(marginLeft, metaTop, pageWidth, metaHeight, { fill: '#f8fafc', stroke: '#d7dee7', radius: 14 });

  let logoOffset = 0;
  if (hasStoreIdentity && store?.logo_url) {
    try {
      doc.image(store.logo_url, marginLeft + 16, metaTop + 16, { fit: [54, 54], align: 'center', valign: 'center' });
      drawBox(marginLeft + 12, metaTop + 12, 62, 62, { stroke: '#d7dee7', radius: 12 });
      logoOffset = 72;
    } catch {}
  }

  const companyX = marginLeft + 18 + logoOffset;
  const companyY = metaTop + 16;
  const companyTextWidth = companyWidth - logoOffset - 10;
  const companyBottomLimit = metaTop + metaHeight - 14;

  writeLabel(documentLabels.cover, companyX, companyY, companyTextWidth);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(18).text(store?.trade_name || documentLabels.headline, companyX, companyY + 14, { width: companyTextWidth, lineBreak: false });

  let companyCursorY = companyY + 40;
  if (hasStoreIdentity) {
    doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text(store?.legal_name || documentLabels.subtitle, companyX, companyCursorY, { width: companyTextWidth, lineBreak: false });
  } else {
    doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(9.5).text('Dados da loja indisponíveis', companyX, companyCursorY, { width: companyTextWidth, lineBreak: false });
  }
  companyCursorY += 16;

  if (store?.document) {
    doc.fontSize(8.5).text(`CNPJ/CPF: ${store.document}`, companyX, companyCursorY, { width: companyTextWidth, lineBreak: false });
    companyCursorY += 12;
  }

  const addr = [store?.street, store?.number, store?.neighborhood, store?.city && `${store.city}/${store.state}`, store?.zip]
    .filter(Boolean)
    .join(' - ');

  if (addr) {
    const addressOptions = { width: companyTextWidth, lineGap: -1 };
    const addrHeight = doc.fontSize(7.8).heightOfString(addr, addressOptions);
    doc.text(addr, companyX, companyCursorY, addressOptions);
    companyCursorY += addrHeight + 4;
  }

  const contactLine = [store?.phone ? `Fone: ${store.phone}` : null, store?.email || null]
    .filter(Boolean)
    .join('  •  ');

  if (contactLine && companyCursorY < companyBottomLimit) {
    doc.fontSize(7.8).text(contactLine, companyX, Math.min(companyCursorY, companyBottomLimit - 8), {
      width: companyTextWidth,
      lineBreak: false,
      ellipsis: true
    });
  }

  const orderX = marginLeft + pageWidth - orderCardWidth - 16;
  const orderY = metaTop + 16;
  const boxTextWidth = orderCardWidth - 24;
  drawBox(orderX, orderY, orderCardWidth, orderCardHeight, { fill: '#ffffff', stroke: '#d7dee7', radius: 12 });
  writeLabel(documentLabels.numberLabel, orderX + 12, orderY + 10, boxTextWidth);

  // Render number with smart wrapping at dash boundaries
  const numberStr = `#${receipt.numero_orcamento || receipt.numero_pedido || receipt.displayId || ''}`;
  doc.fillColor('#0f172a').font('Helvetica-Bold');

  let numFontSize = 10;
  doc.fontSize(numFontSize);

  // Split at dashes and render line by line, measuring each
  const segs = numberStr.split('-');
  const numLines = [];
  let cur = segs[0];
  for (let i = 1; i < segs.length; i++) {
    const test = cur + '-' + segs[i];
    if (doc.widthOfString(test) <= boxTextWidth) {
      cur = test;
    } else {
      numLines.push(cur);
      cur = segs[i];
    }
  }
  numLines.push(cur);

  // If still doesn't fit on available lines, reduce font
  const maxLines = Math.floor((56 - 4) / 14); // lines within 56pt space at 14pt line height
  if (numLines.length > maxLines) {
    numFontSize = 8;
    doc.fontSize(numFontSize);
    // re-split
    numLines.length = 0;
    cur = segs[0];
    for (let i = 1; i < segs.length; i++) {
      const test = cur + '-' + segs[i];
      if (doc.widthOfString(test) <= boxTextWidth) {
        cur = test;
      } else {
        numLines.push(cur);
        cur = segs[i];
      }
    }
    numLines.push(cur);
  }

  const lineH = numFontSize * 1.4;
  numLines.forEach((line, i) => {
    doc.text(line, orderX + 12, orderY + 30 + i * lineH, { width: boxTextWidth });
  });

  const numberBlockBottom = orderY + 30 + numLines.length * lineH + 4;
  const separatorY = Math.max(orderY + 56, numberBlockBottom);
  doc.save();
  doc.moveTo(orderX + 12, separatorY).lineTo(orderX + orderCardWidth - 12, separatorY).strokeColor('#e2e8f0').lineWidth(1).stroke();
  doc.restore();
  writeLabel('Data de Emissão', orderX + 12, separatorY + 8, boxTextWidth);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(dateLabel, orderX + 12, separatorY + 20, { width: boxTextWidth });

  const infoTop = metaTop + metaHeight + 16;
  const gap = 12;
  const sellerWidth = 160;
  const customerWidth = pageWidth - sellerWidth - gap;
  const infoHeight = 72;

  drawBox(marginLeft, infoTop, customerWidth, infoHeight, { stroke: '#d7dee7', radius: 12 });
  writeLabel('Cliente', marginLeft + 14, infoTop + 12, customerWidth - 28);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(receipt.customer || '—', marginLeft + 14, infoTop + 28, { width: customerWidth - 28 });
  doc.fillColor('#475569').font('Helvetica').fontSize(9).text(`Doc: ${receipt.customerDoc || 'N/A'}`, marginLeft + 14, infoTop + 50, { width: customerWidth - 28 });

  const sellerX = marginLeft + customerWidth + gap;
  drawBox(sellerX, infoTop, sellerWidth, infoHeight, { stroke: '#d7dee7', radius: 12 });
  writeLabel('Vendedor', sellerX + 14, infoTop + 12, sellerWidth - 28);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(receipt.sellerName || '—', sellerX + 14, infoTop + 28, { width: sellerWidth - 28 });
  doc.fillColor('#475569').font('Helvetica').fontSize(9).text(`Matrícula: ${receipt.sellerId || '—'}`, sellerX + 14, infoTop + 50, { width: sellerWidth - 28 });

  const tableTop = infoTop + infoHeight + 18;
  const tableHeaderHeight = 34;
  const colQty = marginLeft + 14;
  const colUnit = marginLeft + 60;
  const colDesc = marginLeft + 102;
  const colUnitPrice = marginLeft + pageWidth - 150;
  const colTotal = marginLeft + pageWidth - 82;
  const descWidth = colUnitPrice - colDesc - 12;

  drawBox(marginLeft, tableTop, pageWidth, tableHeaderHeight, { fill: '#f1f5f9', stroke: '#d7dee7', radius: 12 });
  writeLabel(documentLabels.items, marginLeft + 14, tableTop + 8, 180);
  doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9).text(items.length + ' item(ns)', marginLeft + 14, tableTop + 18, { width: 180 });
  doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text('Valores em reais', marginLeft, tableTop + 13, { width: pageWidth - 14, align: 'right' });

  const headerY = tableTop + tableHeaderHeight + 8;
  doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8.5);
  doc.text('Qtd', colQty, headerY, { width: 34 });
  doc.text('Un', colUnit, headerY, { width: 28 });
  doc.text('Descrição', colDesc, headerY, { width: descWidth });
  doc.text('Unit.', colUnitPrice, headerY, { width: 58, align: 'right' });
  doc.text('Total', colTotal, headerY, { width: 58, align: 'right' });
  doc.save();
  doc.moveTo(marginLeft, headerY + 14).lineTo(marginLeft + pageWidth, headerY + 14).strokeColor('#d7dee7').lineWidth(1).stroke();
  doc.restore();

  let cursorY = headerY + 22;
  items.forEach((it, index) => {
    const quantity = Number(it.quantity || 0);
    const unitPrice = Number(it.price || 0);
    const lineTotal = quantity * unitPrice;
    const title = String(it.name || '');
    const detail = String(it.description || it.id || '');
    const descHeight = doc.heightOfString(title, { width: descWidth }) + doc.heightOfString(detail, { width: descWidth });
    const rowHeight = Math.max(26, descHeight + 6);

    if (index % 2 === 0) {
      doc.save();
      doc.roundedRect(marginLeft + 4, cursorY - 4, pageWidth - 8, rowHeight + 4, 8).fill('#fcfdff');
      doc.restore();
    }

    doc.fillColor('#334155').font('Helvetica').fontSize(9).text(String(quantity), colQty, cursorY, { width: 34 });
    doc.text(String(it.unit || ''), colUnit, cursorY, { width: 28 });
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(title, colDesc, cursorY, { width: descWidth });
    doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(detail, colDesc, cursorY + 12, { width: descWidth });
    doc.fillColor('#334155').font('Helvetica').fontSize(9).text(formatMoney(unitPrice), colUnitPrice, cursorY, { width: 58, align: 'right' });
    doc.font('Helvetica-Bold').text(formatMoney(lineTotal), colTotal, cursorY, { width: 58, align: 'right' });

    cursorY += rowHeight + 8;
  });

  let lowerTop = cursorY + 12;
  const notesWidth = pageWidth - 200 - gap;
  const sideCardWidth = 200;
  const notesHeight = 116;
  const lowerBlockHeight = notesHeight + 16 + 72 + 26 + 42;
  if (cursorY + lowerBlockHeight > contentBottom) {
    doc.addPage({ margin: 40, size: 'A4' });
    lowerTop = marginTop;
  }

  drawBox(marginLeft, lowerTop, notesWidth, notesHeight, { stroke: '#d7dee7', radius: 12 });
  writeLabel('Observações', marginLeft + 14, lowerTop + 12, notesWidth - 28);
  doc.fillColor('#334155').font('Helvetica').fontSize(9.5).text(receipt.notes || 'Nenhuma observação informada.', marginLeft + 14, lowerTop + 30, {
    width: notesWidth - 28,
    height: notesHeight - 44
  });

  const summaryX = marginLeft + notesWidth + gap;
  drawBox(summaryX, lowerTop, sideCardWidth, notesHeight, { fill: '#f8fafc', stroke: '#cbd5e1', radius: 12 });
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.6).text('RESUMO FINANCEIRO', summaryX + 14, lowerTop + 14, { width: sideCardWidth - 28 });
  const summaryLabelWidth = 82;
  const summaryValueX = summaryX + 14 + summaryLabelWidth;
  const summaryValueWidth = sideCardWidth - 28 - summaryLabelWidth;
  doc.fillColor('#475569').font('Helvetica').fontSize(8.3).text('Itens', summaryX + 14, lowerTop + 34, { width: summaryLabelWidth });
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.8).text(String(items.length), summaryValueX, lowerTop + 34, { width: summaryValueWidth, align: 'right' });
  doc.fillColor('#475569').font('Helvetica').fontSize(8.3).text('Pagamento', summaryX + 14, lowerTop + 54, { width: summaryLabelWidth });
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.8).text(paymentMethodLabel, summaryValueX, lowerTop + 54, { width: summaryValueWidth, align: 'right' });
  doc.save();
  doc.moveTo(summaryX + 14, lowerTop + 76).lineTo(summaryX + sideCardWidth - 14, lowerTop + 76).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.restore();
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.8).text('TOTAL GERAL', summaryX + 14, lowerTop + 84, { width: sideCardWidth - 28 });
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12.5).text(formatMoney(total), summaryX + 14, lowerTop + 98, {
    width: sideCardWidth - 28,
    align: 'right'
  });

  const paymentTop = lowerTop + notesHeight + 16;
  const paymentWidth = (pageWidth - gap) / 2;
  const paymentHeight = 72;

  drawBox(marginLeft, paymentTop, paymentWidth, paymentHeight, { stroke: '#d7dee7', radius: 12 });
  writeLabel('Forma de Pagamento', marginLeft + 14, paymentTop + 12, paymentWidth - 28);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(paymentMethodLabel, marginLeft + 14, paymentTop + 30, { width: paymentWidth - 28 });
  if (paymentPlan) {
    doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text(paymentPlan, marginLeft + 14, paymentTop + 46, { width: paymentWidth - 28 });
  }

  const shippingX = marginLeft + paymentWidth + gap;
  drawBox(shippingX, paymentTop, paymentWidth, paymentHeight, { stroke: '#d7dee7', radius: 12 });
  writeLabel('Tipo de Frete', shippingX + 14, paymentTop + 12, paymentWidth - 28);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(shippingMethodLabel, shippingX + 14, paymentTop + 30, { width: paymentWidth - 28 });

  const footerY = paymentTop + paymentHeight + 26;
  doc.save();
  doc.moveTo(marginLeft, footerY).lineTo(marginLeft + pageWidth, footerY).dash(3, { space: 3 }).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.undash();
  doc.restore();
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(8.5).text('Emitido via SalesForce App', marginLeft, footerY + 12, { width: pageWidth, align: 'center' });
  doc.text(formatDateTimePtBr(), marginLeft, footerY + 24, { width: pageWidth, align: 'center' });
};

const renderProductCatalogPDF = (doc, payload = {}) => {
  const products = Array.isArray(payload.products) ? payload.products : [];
  const searchTerm = String(payload.searchTerm || '').trim();
  const selectedCategory = String(payload.category || 'Todas').trim() || 'Todas';
  const generatedAt = formatDateTimePtBr(new Date().toISOString());
  const marginLeft = doc.page.margins.left;
  const marginTop = doc.page.margins.top;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const contentBottom = doc.page.height - doc.page.margins.bottom;
  const colCode = marginLeft + 14;
  const colDesc = marginLeft + 110;
  const colMeta = marginLeft + pageWidth - 180;
  const colPrice = marginLeft + pageWidth - 84;
  const descWidth = colMeta - colDesc - 12;
  let pageNumber = 0;
  let cursorY = marginTop;

  const grouped = products.reduce((acc, product) => {
    const categoryName = String(product.category || 'Sem categoria').trim() || 'Sem categoria';
    if (!acc.has(categoryName)) acc.set(categoryName, []);
    acc.get(categoryName).push(product);
    return acc;
  }, new Map());

  const drawPageHeader = () => {
    doc.save();
    doc.roundedRect(marginLeft, marginTop, pageWidth, 78, 14).fill('#f8fafc');
    doc.restore();

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(20).text('Catálogo de Produtos', marginLeft + 18, marginTop + 16, {
      width: pageWidth - 36
    });
    doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text(
      `Gerado em ${generatedAt}`,
      marginLeft + 18,
      marginTop + 42,
      { width: pageWidth - 36 }
    );

    const filterSummary = [
      searchTerm ? `Busca: "${searchTerm}"` : 'Busca: todas',
      selectedCategory && selectedCategory.toLowerCase() !== 'todas' ? `Categoria: ${selectedCategory}` : 'Categoria: todas',
      `Produtos: ${products.length}`
    ].join('  •  ');

    doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text(
      filterSummary,
      marginLeft + 18,
      marginTop + 56,
      { width: pageWidth - 96 }
    );

    doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(8).text(
      `Pág. ${pageNumber}`,
      marginLeft,
      marginTop + 58,
      { width: pageWidth - 18, align: 'right' }
    );

    return marginTop + 98;
  };

  const startPage = () => {
    if (pageNumber > 0) doc.addPage();
    pageNumber += 1;
    cursorY = drawPageHeader();
  };

  const ensureSpace = (requiredHeight) => {
    if (cursorY + requiredHeight <= contentBottom - 24) return;
    startPage();
  };

  const drawCategoryHeader = (categoryName, itemCount) => {
    ensureSpace(34);
    doc.save();
    doc.roundedRect(marginLeft, cursorY, pageWidth, 24, 10).fill('#dbeafe');
    doc.restore();
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(11).text(categoryName, marginLeft + 12, cursorY + 7, {
      width: pageWidth - 140
    });
    doc.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(8.5).text(
      `${itemCount} item(ns)`,
      marginLeft,
      cursorY + 8,
      { width: pageWidth - 12, align: 'right' }
    );
    cursorY += 32;
  };

  const drawProductRow = (product, index) => {
    const code = String(product.id || product.plu || product.code || '-');
    const title = String(product.name || 'Produto');
    const detailParts = [
      product.description ? String(product.description) : null,
      product.unit ? `Unidade: ${product.unit}` : null,
      Number.isFinite(Number(product.stock)) ? `Estoque: ${Number(product.stock)}` : null
    ].filter(Boolean);
    const detail = detailParts.join('  •  ');
    const titleHeight = doc.heightOfString(title, { width: descWidth });
    const detailHeight = detail ? doc.heightOfString(detail, { width: descWidth }) : 0;
    const rowHeight = Math.max(38, titleHeight + detailHeight + 14);

    ensureSpace(rowHeight + 8);

    if (index % 2 === 0) {
      doc.save();
      doc.roundedRect(marginLeft + 4, cursorY - 2, pageWidth - 8, rowHeight, 8).fill('#fcfdff');
      doc.restore();
    }

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8.5).text(code, colCode, cursorY + 4, { width: 86 });
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(title, colDesc, cursorY + 4, { width: descWidth });
    if (detail) {
      doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(detail, colDesc, cursorY + 18, { width: descWidth });
    }
    doc.fillColor('#334155').font('Helvetica').fontSize(8.5).text(
      `SKU ${code}`,
      colMeta,
      cursorY + 4,
      { width: 72, align: 'right' }
    );
    doc.font('Helvetica-Bold').fontSize(10).text(
      formatMoney(product.price),
      colPrice,
      cursorY + 4,
      { width: 70, align: 'right' }
    );

    cursorY += rowHeight + 8;
  };

  startPage();

  if (products.length === 0) {
    doc.fillColor('#64748b').font('Helvetica').fontSize(11).text(
      'Nenhum produto encontrado para os filtros informados.',
      marginLeft,
      cursorY + 16,
      { width: pageWidth, align: 'center' }
    );
    return;
  }

  Array.from(grouped.entries())
    .sort((left, right) => left[0].localeCompare(right[0], 'pt-BR'))
    .forEach(([categoryName, items]) => {
      drawCategoryHeader(categoryName, items.length);
      items.forEach((product, index) => drawProductRow(product, index));
      cursorY += 6;
    });
};

export function createPDFRoutes(ctx) {
  const router = Router();
  const { verifyToken } = ctx;

  // POST /api/recibo/pdf — generate receipt PDF (auth)
  router.post('/api/recibo/pdf', verifyToken, async (req, res) => {
    try {
      const receipt = req.body || {};
      const storeId = getStoreIdFromRequest(req);

      let store = receipt.store;
      if (!store) {
        try {
          await ensureStoreInfoRow(storeId);
          store = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
        } catch {}
      }

      const documentKind = getReceiptDocumentKind(receipt);
      const documentLabels = getReceiptDocumentLabels(documentKind);
      const number = receipt.numero_orcamento || receipt.numero_pedido || receipt.displayId || 'recibo';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${documentLabels.filenamePrefix}-${number}.pdf`);

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      doc.pipe(res);
      renderReceiptPDF(doc, receipt, store);
      doc.end();

    } catch (e) {
      console.error('[PDF_ERROR]', e);
      res.status(500).json({ message: 'Falha ao gerar PDF.' });
    }
  });

  // POST /api/recibo/pdf/public — generate receipt PDF (public, no auth)
  router.post('/api/recibo/pdf/public', async (req, res) => {
    try {
      const receipt = req.body || {};
      const storeId = getStoreIdFromRequest(req);
      let store = receipt.store;
      if (!store) {
        try {
          await ensureStoreInfoRow(storeId);
          store = await db.get("SELECT * FROM store_info WHERE id = ?", [storeId]);
        } catch {}
      }

      const documentKind = getReceiptDocumentKind(receipt);
      const documentLabels = getReceiptDocumentLabels(documentKind);
      const number = receipt.numero_orcamento || receipt.numero_pedido || receipt.displayId || 'recibo';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${documentLabels.filenamePrefix}-${number}.pdf`);

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      doc.pipe(res);
      renderReceiptPDF(doc, receipt, store);
      doc.end();
    } catch (e) {
      console.error('[PDF_PUBLIC_ERROR]', e);
      res.status(500).json({ message: 'Falha ao gerar PDF.' });
    }
  });

  // GET /api/catalogo-produtos/pdf — generate product catalog PDF (auth)
  router.get('/api/catalogo-produtos/pdf', verifyToken, async (req, res) => {
    try {
      const storeId = getStoreIdForProducts(req);
      const searchTerm = String(req.query.search || '').trim();
      const category = String(req.query.category || '').trim();
      let query = `
        SELECT plu, name, description, price, stock, category, unit
        FROM products
        WHERE (store_id = ? OR store_id IS NULL)
      `;
      const params = [storeId];

      if (searchTerm) {
        const normalizedSearch = `%${searchTerm.toLowerCase()}%`;
        query += ` AND (
          LOWER(COALESCE(plu, '')) LIKE ?
          OR LOWER(COALESCE(name, '')) LIKE ?
          OR LOWER(COALESCE(description, '')) LIKE ?
        )`;
        params.push(normalizedSearch, normalizedSearch, normalizedSearch);
      }

      if (category && category.toLowerCase() !== 'todas') {
        query += ` AND LOWER(COALESCE(category, '')) = ?`;
        params.push(category.toLowerCase());
      }

      query += ` ORDER BY category COLLATE NOCASE ASC, name COLLATE NOCASE ASC`;

      const rows = await db.query(query, params);
      const products = rows.map((product) => ({
        id: product.plu,
        name: product.name,
        description: product.description,
        price: Number(product.price || 0),
        stock: Number(product.stock || 0),
        category: product.category || 'Sem categoria',
        unit: product.unit || 'UN'
      }));

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="catalogo-produtos.pdf"');

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      doc.pipe(res);
      renderProductCatalogPDF(doc, { products, searchTerm, category });
      doc.end();
    } catch (e) {
      console.error('[PRODUCT_CATALOG_PDF_ERROR]', e);
      res.status(500).json({ message: 'Falha ao gerar catálogo em PDF.' });
    }
  });

  return router;
}
