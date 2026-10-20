// Leitura da base MUNICIPIO x CONTA CONTRATO no navegador (CSV ; ou ,,
// tabela Markdown, texto com TAB ou XLSX). A limpeza dos nomes
// ("FLORIANO Fundo Prev ..." -> "FLORIANO") é feita no banco.
import { abrirPlanilha, chaveCabecalho, limparEspacos, valorCelula } from "./leitura.js";

const CAB_MUNICIPIO = ["municipio"];
const CAB_CONTA = ["conta contrato", "conta de contrato", "conta"];

function celulasCsv(linha, delim) {
  const out = []; let atual = ""; let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (ch === '"') aspas = false;
      else atual += ch;
    } else if (ch === '"' && atual === "") aspas = true;
    else if (ch === delim) { out.push(atual); atual = ""; }
    else atual += ch;
  }
  out.push(atual);
  return out;
}

function linhasDeTexto(texto) {
  return texto.split(/\r?\n/).map((bruta) => {
    if (!bruta.trim()) return [];
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(bruta)) return null;
    const s = bruta.trim();
    if (s.startsWith("|")) return s.replace(/^\|/, "").replace(/\|$/, "").split("|").map((p) => p.trim());
    if (bruta.includes("\t")) return bruta.split("\t");
    return celulasCsv(bruta, bruta.includes(";") ? ";" : ",");
  });
}

export async function lerBase(arquivo) {
  const buffer = await arquivo.arrayBuffer();
  const ini = new Uint8Array(buffer.slice(0, 2));
  let linhas;
  if (ini[0] === 0x50 && ini[1] === 0x4b) {
    const wb = await abrirPlanilha(buffer);
    const ws = wb.worksheets[0];
    linhas = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r); const cel = [];
      for (let c = 1; c <= Math.max(ws.columnCount, 2); c++) {
        const v = valorCelula(row.getCell(c));
        cel.push(v === null ? "" : (typeof v === "number" && Number.isInteger(v) ? String(v) : String(v)));
      }
      linhas.push(cel);
    }
  } else {
    let texto;
    try { texto = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch { texto = new TextDecoder("windows-1252").decode(buffer); }
    linhas = linhasDeTexto(texto.replace(/^﻿/, ""));
  }
  let colMun = 0; let colConta = 1; let inicio = 0;
  for (let i = 0; i < Math.min(30, linhas.length); i++) {
    const cel = linhas[i];
    if (!cel || !cel.length) continue;
    const chaves = cel.map(chaveCabecalho);
    if (chaves.some((c) => CAB_MUNICIPIO.includes(c)) && chaves.some((c) => CAB_CONTA.includes(c))) {
      colMun = chaves.findIndex((c) => CAB_MUNICIPIO.includes(c));
      colConta = chaves.findIndex((c) => CAB_CONTA.includes(c));
      inicio = i + 1;
      break;
    }
  }
  const entradas = []; let lidas = 0;
  for (let i = inicio; i < linhas.length; i++) {
    const cel = linhas[i];
    if (!cel || cel.every((c) => !limparEspacos(c))) continue;
    lidas++;
    entradas.push({ linha: i + 1, municipio: String(cel[colMun] ?? ""), conta: limparEspacos(cel[colConta] ?? "") });
  }
  return { entradas, linhas_lidas: lidas };
}
