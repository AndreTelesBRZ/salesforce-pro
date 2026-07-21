import React, { useMemo } from 'react';
import { AlertCircle, Package, Search } from 'lucide-react';
import type { SalesHistoryItem, SalesHistoryReportGroup, SalesHistoryReportRow, SalesHistoryReportView as SalesHistoryReportViewData } from '../types';

interface SalesHistoryReportViewProps {
  reportView?: SalesHistoryReportViewData | null;
  reportTruncated?: boolean;
  fallbackItems?: SalesHistoryItem[];
  loading?: boolean;
  onSelectRow?: (item: SalesHistoryItem) => void;
  onDetailRow?: (payload: { row: SalesHistoryReportRow; item?: SalesHistoryItem }) => void;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatCurrency = (value?: number): string => {
  return currencyFormatter.format(Number(value) || 0);
};

const formatDate = (value?: string | null): string => {
  if (!value) return "-";
  const trimmed = value.trim();
  if (!trimmed) return "-";
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  
  try {
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch {}
  
  return trimmed;
};

const formatNfeLabel = (row: SalesHistoryReportRow): string => {
  const nota = String(row.notaNumero || "").trim();
  const serie = String(row.notaSerie || "").trim();
  if (nota) {
    return serie ? `${nota}/${serie}` : nota;
  }
  const saida = String(row.saidaCodigo || "").trim();
  if (saida) {
    return `Saída ${saida}`;
  }
  const ped = String(row.pedido || "").trim();
  if (ped) {
    return `Ped. ${ped}`;
  }
  return "-";
};

const buildSaleRowKey = (row: SalesHistoryReportRow, index: number): string => {
  const pedido = String(row.pedido || '').trim();
  if (pedido) return `pedido:${pedido}`;

  const nota = String(row.notaNumero || '').trim();
  const serie = String(row.notaSerie || '').trim();
  const saida = String(row.saidaCodigo || '').trim();
  if (nota || saida) return `nota:${nota}|serie:${serie}|saida:${saida}`;

  // Without a document identity, keeping the row is safer than merging
  // unrelated sales that happen to share customer, date and value.
  return `sem-documento:${index}`;
};

const consolidateReportGroups = (groups: SalesHistoryReportGroup[]): SalesHistoryReportGroup[] => (
  groups.map((group) => {
    const seen = new Set<string>();
    const rows = group.rows.filter((row, index) => {
      const key = buildSaleRowKey(row, index);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      ...group,
      rows,
      totalDataEmissao: rows.reduce(
        (totals, row) => ({
          valorBruto: totals.valorBruto + (Number(row.valorBruto) || 0),
          valorTotal: totals.valorTotal + (Number(row.valorTotal) || 0),
        }),
        { valorBruto: 0, valorTotal: 0 },
      ),
    };
  })
);

const buildFallbackRows = (items: SalesHistoryItem[]): SalesHistoryReportGroup[] => {
  const grouped = new Map<string, SalesHistoryReportGroup>();

  items.forEach((item, index) => {
    const sourceDate = item.notaData || item.dataMovimento || item.pedidoData || item.prevendaData || null;
    const parsedDate = sourceDate ? new Date(sourceDate) : null;
    const groupKey = parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toISOString().slice(0, 10)
      : 'sem-data-' + index;
    const groupLabel = parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleDateString('pt-BR')
      : 'Sem data';

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        dataEmissao: sourceDate,
        dataEmissaoDisplay: groupLabel,
        rows: [],
        totalDataEmissao: {
          valorBruto: 0,
          valorTotal: 0,
        },
      });
    }

    const valorBruto = Number(item.itemValorTotal || item.notaValorTotal || item.pedidoValorTotal || item.prevendaValorTotal || 0);
    const valorTotal = Number(item.itemValorLiquido || item.itemValorTotal || item.notaValorTotal || item.pedidoValorTotal || item.prevendaValorTotal || 0);

    const row: SalesHistoryReportRow = {
      pedido: item.pedidoCodigo || item.prevendaCodigo || null,
      status: item.documentoStatus || item.pedidoStatus || item.prevendaStatus || null,
      statusCodigo: item.documentoStatus || item.pedidoStatus || item.prevendaStatus || null,
      cliente: item.clienteRazaoSocial || item.clienteFantasia || item.clienteCodigo || '-',
      clienteCodigo: item.clienteCodigo || null,
      clienteNome: item.clienteRazaoSocial || item.clienteFantasia || null,
      pedidoCliente: null,
      emissao: sourceDate,
      emissaoDisplay: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toLocaleDateString('pt-BR') : null,
      vendedor: item.vendedorCodigo ? item.vendedorCodigo + '-' + (item.vendedorNome || '') : (item.vendedorNome || '-'),
      valorBruto,
      valorTotal,
      notaNumero: item.notaNumero || null,
      notaSerie: item.notaSerie || null,
      saidaCodigo: item.saidaCodigo || null,
      produtoCodigo: item.produtoCodigo || null,
      produtoDescricao: item.produtoDescricao || null,
      documentoTipo: item.documentoTipo || null,
    };

    const group = grouped.get(groupKey);
    if (!group) return;
    group.rows.push(row);
    group.totalDataEmissao.valorBruto += valorBruto;
    group.totalDataEmissao.valorTotal += valorTotal;
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([, group]) => group);
};

const resolveSourceItem = (row: SalesHistoryReportRow, fallbackItems: SalesHistoryItem[]): SalesHistoryItem | undefined => {
  const customerCode = String(row.clienteCodigo || '').trim();
  const noteNumber = String(row.notaNumero || '').trim();
  const noteSerie = String(row.notaSerie || '').trim();
  const orderCode = String(row.pedido || '').trim();

  if (!noteNumber) return undefined;

  const exactMatch = fallbackItems.find((item) => (
    String(item.clienteCodigo || '').trim() === customerCode
    && String(item.notaNumero || '').trim() === noteNumber
    && String(item.notaSerie || '').trim() === noteSerie
    && String(item.pedidoCodigo || item.prevendaCodigo || '').trim() === orderCode
  ));
  if (exactMatch) return exactMatch;

  const noteMatch = fallbackItems.find((item) => (
    String(item.clienteCodigo || '').trim() === customerCode
    && String(item.notaNumero || '').trim() === noteNumber
    && String(item.notaSerie || '').trim() === noteSerie
  ));
  if (noteMatch) return noteMatch;

  return fallbackItems.find((item) => (
    String(item.notaNumero || '').trim() === noteNumber
    && String(item.notaSerie || '').trim() === noteSerie
  ));
};

const renderEmptyState = () => {
  return (
    <div className="p-10 text-center">
      <Package className="w-12 h-12 mx-auto text-slate-400 mb-3" />
      <p className="font-medium text-slate-800 dark:text-slate-100">Nenhum resultado encontrado</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">Refine os filtros para visualizar o relatório.</p>
    </div>
  );
};

export const SalesHistoryReportView: React.FC<SalesHistoryReportViewProps> = ({
  reportView,
  reportTruncated,
  fallbackItems = [],
  loading,
  onSelectRow,
  onDetailRow,
}) => {
  const fallbackGroups = useMemo(() => buildFallbackRows(fallbackItems), [fallbackItems]);
  const groups = useMemo(
    () => consolidateReportGroups(reportView?.groups?.length ? reportView.groups : fallbackGroups),
    [reportView, fallbackGroups],
  );
  const totalGeral = groups.reduce((sum, group) => sum + group.totalDataEmissao.valorTotal, 0);

  if (loading) {
    return (
      <div className="p-10 text-center text-sm text-slate-600 dark:text-slate-300">
        Carregando relatório...
      </div>
    );
  }

  if (groups.length === 0) {
    return renderEmptyState();
  }

  return (
    <div className="space-y-4">
      {reportTruncated ? (
        <div className="mx-4 mt-4 inline-flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          Relatório parcial. Refine os filtros para visualizar todos os registros.
        </div>
      ) : null}

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {groups.map((group) => (
          <section key={group.dataEmissaoDisplay + '-' + (group.dataEmissao || 'sem-data')} className="overflow-x-auto">
            <div className="bg-yellow-100 dark:bg-yellow-500/20 px-4 py-2 font-semibold text-slate-900 dark:text-white">
              {formatDate(group.dataEmissaoDisplay)}
            </div>

            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950/60">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Cliente</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Nf-e</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Emissão</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Vendedor</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">Valor Bruto</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, index) => {
                  const sourceItem = resolveSourceItem(row, fallbackItems);
                  const isSelectable = !!sourceItem && !!row.notaNumero;
                  return (
                  <tr
                    key={group.dataEmissaoDisplay + '-' + index}
                    className={"border-t border-slate-100 dark:border-slate-800" + (isSelectable ? " cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40" : "")}
                    onClick={() => {
                      if (sourceItem && onSelectRow) onSelectRow(sourceItem);
                    }}
                  >
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{row.status || '-'}</td>
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{row.cliente}</td>
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <span>{formatNfeLabel(row)}</span>
                        {row.notaNumero && onDetailRow ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDetailRow({ row, item: sourceItem });
                            }}
                            className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
                          >
                            <Search className="h-3 w-3" /> Detalhar
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{formatDate(row.emissaoDisplay || row.emissao)}</td>
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{row.vendedor}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(row.valorBruto)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(row.valorTotal)}</td>
                  </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40">
                  <td colSpan={6} className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">Total por data de emissão</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-900 dark:text-white">{formatCurrency(group.totalDataEmissao.valorTotal)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <div className="border-t border-slate-200 px-4 py-3 text-right dark:border-slate-800">
        <span className="mr-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Total geral</span>
        <span className="text-base font-bold text-slate-900 dark:text-white">{formatCurrency(totalGeral)}</span>
      </div>
    </div>
  );
};
