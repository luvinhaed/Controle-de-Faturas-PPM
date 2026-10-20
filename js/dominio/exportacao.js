// Geração do Excel da carteira no navegador (mesmas regras da versão local,
// app/dominio/exportacao.py), com a biblioteca ExcelJS embarcada.
import { normalizarBusca } from "./leitura.js";

export const ABA_SEM_MUNICIPIO = "Não identificado";
const COLUNAS = [["Conta de contrato", 18], ["Nome", 46], ["Vencimento líquido", 14], ["Montante", 17],
  ["Forma de pagamento", 12], ["Situação", 11], ["Observação", 55]];
const FORMATO_MOEDA = '"R$" #,##0.00;-"R$" #,##0.00';
const ROTULOS = { paga: "Paga", vencida: "Vencida", a_vencer: "A vencer" };
const AZUL = "FF1F3A5F";
const preenchimento = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

export function nomeAba(nome, usados) {
  let base = nome.replace(/[[\]:*?/\\]/g, " ").trim().replace(/^'+|'+$/g, "").trim() || "Município";
  base = base.replace(/\s{2,}/g, " ");
  let candidato = base.slice(0, 31).trimEnd();
  let n = 2;
  while (usados.has(candidato.toLowerCase())) {
    const sufixo = ` (${n})`;
    candidato = base.slice(0, 31 - sufixo.length).trimEnd() + sufixo;
    n++;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

export async function gerarExcel(dados) {
  const { carteira, faturas, descricao_periodo: periodo, incluir_pagas: incluirPagas, gerado_em: geradoEm } = dados;
  const grupos = new Map();
  [...new Set(faturas.filter((f) => f.municipio_nome).map((f) => f.municipio_nome))]
    .sort((a, b) => (normalizarBusca(a) < normalizarBusca(b) ? -1 : normalizarBusca(a) > normalizarBusca(b) ? 1 : 0))
    .forEach((m) => grupos.set(m, []));
  const sem = [];
  for (const f of faturas) (f.municipio_nome ? grupos.get(f.municipio_nome) : sem).push(f);
  if (sem.length) grupos.set(ABA_SEM_MUNICIPIO, sem);

  const wb = new globalThis.ExcelJS.Workbook();
  wb.creator = "Controle de Faturas do Poder Público";
  const usados = new Set();
  if (!grupos.size) {
    const ws = wb.addWorksheet("Sem registros");
    ws.getCell("A1").value = `Nenhuma fatura encontrada para a carteira ${carteira} no recorte escolhido.`;
  }
  for (const [municipio, lista] of grupos) {
    const ws = wb.addWorksheet(nomeAba(municipio, usados), {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "3:4" },
    });
    preencherAba(ws, municipio, carteira, lista, periodo, incluirPagas, geradoEm);
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function preencherAba(ws, municipio, carteira, lista, periodo, incluirPagas, geradoEm) {
  ws.columns = COLUNAS.map(([, largura]) => ({ width: largura }));
  ws.mergeCells(1, 1, 1, COLUNAS.length);
  ws.getCell(1, 1).value = municipio;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: AZUL } };
  ws.mergeCells(2, 1, 2, COLUNAS.length);
  ws.getCell(2, 1).value = `Carteira: ${carteira}   |   Período por vencimento: ${periodo}   |   Inclui pagas: ${incluirPagas ? "Sim" : "Não"}   |   Gerado em: ${geradoEm}`;
  ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF555555" } };
  const cab = ws.getRow(3);
  COLUNAS.forEach(([titulo], i) => {
    const c = cab.getCell(i + 1);
    c.value = titulo;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = preenchimento(AZUL);
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  cab.height = 30;
  const total = lista.reduce((s, f) => s + Number(f.montante_centavos), 0);
  const tot = ws.getRow(4);
  tot.getCell(1).value = "TOTAL";
  tot.getCell(2).value = `${lista.length} fatura(s)`;
  tot.getCell(4).value = total / 100;
  tot.getCell(4).numFmt = FORMATO_MOEDA;
  for (let c = 1; c <= COLUNAS.length; c++) { tot.getCell(c).fill = preenchimento("FFDCE6F1"); tot.getCell(c).font = { bold: true }; }
  lista.forEach((f, i) => {
    const row = ws.getRow(5 + i);
    const [a, m, d] = String(f.vencimento).slice(0, 10).split("-").map(Number);
    row.getCell(1).value = String(f.conta);           // identificador sempre como texto
    row.getCell(2).value = String(f.nome);
    row.getCell(3).value = new Date(Date.UTC(a, m - 1, d));
    row.getCell(3).numFmt = "DD/MM/YYYY";
    row.getCell(4).value = Number(f.montante_centavos) / 100;
    row.getCell(4).numFmt = FORMATO_MOEDA;
    row.getCell(5).value = f.forma_pagamento || "";
    row.getCell(6).value = ROTULOS[f.situacao];
    row.getCell(7).value = f.observacao || "";        // texto: nunca vira fórmula
    row.getCell(1).alignment = { horizontal: "left", vertical: "top" };
    for (const c of [2, 4]) row.getCell(c).alignment = { vertical: "top" };
    for (const c of [3, 5, 6]) row.getCell(c).alignment = { horizontal: "center", vertical: "top" };
    row.getCell(7).alignment = { wrapText: true, vertical: "top" };
    const cor = f.situacao === "paga" ? "FFE2F0D9" : f.situacao === "vencida" ? "FFFBE0DE" : null;
    for (let c = 1; c <= COLUNAS.length; c++) {
      row.getCell(c).border = { bottom: { style: "thin", color: { argb: "FFD0D7E2" } } };
      if (cor) row.getCell(c).fill = preenchimento(cor);
    }
  });
}
