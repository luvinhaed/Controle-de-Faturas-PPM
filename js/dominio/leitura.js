// Leitura da planilha .xlsx no navegador (tradução fiel das regras da versão
// local: app/dominio/valores.py e app/dominio/planilha.py).
// Usa a biblioteca ExcelJS embarcada em js/vendor/exceljs.min.js.
//
// Somente os campos conservados saem daqui; as demais colunas são descartadas.

export const CARTEIRAS_VALIDAS = ["PPM_FLORIA", "HIB_PICOS", "S R NONATO", "BOM JESUS"];
export class ValorInvalido extends Error {}
export class PlanilhaInvalida extends Error {}

const ESPACOS = { " ": " ", " ": " ", " ": " ", " ": " ", "​": "", "﻿": "", "\t": " ", "\r": " ", "\n": " " };
const TRACOS = new Set(["-", "–", "—"]);

function paraTexto(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return formatarData(v);
  return String(v);
}
export function limparEspacos(valor) {
  let t = paraTexto(valor);
  for (const [o, d] of Object.entries(ESPACOS)) t = t.split(o).join(d);
  return t.replace(/ {2,}/g, " ").trim();
}
export function semAcentos(t) { return t.normalize("NFKD").replace(/[̀-ͯ]/g, ""); }
export function normalizarBusca(t) { return semAcentos(limparEspacos(t)).toLowerCase(); }
export function chaveCabecalho(t) { return normalizarBusca(t).replace(/:+$/, "").trim(); }

function formatarData(d) {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}
function iso(ano, mes, dia) { return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`; }
function dataValida(ano, mes, dia) {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

// ---------------------------------------------------------------- conta
export function lerConta(valor) {
  if (valor === null || valor === undefined || (typeof valor === "string" && limparEspacos(valor) === "")) throw new ValorInvalido("conta de contrato vazia");
  if (typeof valor === "boolean") throw new ValorInvalido("conta de contrato inválida");
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) throw new ValorInvalido("conta de contrato inválida");
    if (!Number.isInteger(valor)) throw new ValorInvalido("conta de contrato com casas decimais");
    if (Math.abs(valor) >= 2 ** 53) throw new ValorInvalido("número grande demais para garantir todos os dígitos; formate a coluna como texto");
    if (valor < 0) throw new ValorInvalido("conta de contrato negativa");
    return String(valor);
  }
  const t = limparEspacos(valor);
  if (/^\d+$/.test(t)) return t;
  if (/^\d+([.,]\d+)?[eE][+-]?\d+$/.test(t)) throw new ValorInvalido("conta em notação científica (dígitos perdidos); corrija a coluna na planilha de origem");
  throw new ValorInvalido("conta de contrato deve conter somente dígitos");
}

// ---------------------------------------------------------------- data
const RE_BR = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/;
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/;
export function lerData(valor) {
  if (valor === null || valor === undefined || (typeof valor === "string" && limparEspacos(valor) === "")) throw new ValorInvalido("data vazia");
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new ValorInvalido("data inválida");
    return verificarFaixa(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate(), false);
  }
  if (typeof valor === "boolean") throw new ValorInvalido("data inválida");
  if (typeof valor === "number") {
    if (Number.isInteger(valor) && valor >= 25569 && valor <= 73050) {
      const d = new Date(Date.UTC(1899, 11, 30) + valor * 86400000);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    throw new ValorInvalido("data inválida (número que não corresponde a uma data)");
  }
  const t = limparEspacos(valor);
  let ano, mes, dia;
  let m = RE_BR.exec(t);
  if (m) { dia = +m[1]; mes = +m[2]; ano = +m[3]; }
  else {
    m = RE_ISO.exec(t);
    if (!m) throw new ValorInvalido("data inválida (use dd/mm/aaaa)");
    ano = +m[1]; mes = +m[2]; dia = +m[3];
  }
  return verificarFaixa(ano, mes, dia, true);
}
function verificarFaixa(ano, mes, dia, conferir) {
  if (conferir && !dataValida(ano, mes, dia)) throw new ValorInvalido("data inexistente no calendário");
  if (ano < 1990 || ano > 2100) throw new ValorInvalido("ano fora da faixa aceita (1990–2100)");
  return iso(ano, mes, dia);
}

// ---------------------------------------------------------------- dinheiro (centavos inteiros)
function textoParaCentavos(numero) {
  const [inteiro, decimais = ""] = numero.split(".");
  if (decimais.replace(/0+$/, "").length > 2) throw new ValorInvalido("valor com mais de duas casas decimais");
  if (inteiro.length > 15) throw new ValorInvalido("montante inválido");
  return Number(inteiro) * 100 + Number((decimais + "00").slice(0, 2));
}
export function lerMontante(valor) {
  if (valor === null || valor === undefined || (typeof valor === "string" && limparEspacos(valor) === "")) throw new ValorInvalido("montante vazio");
  if (typeof valor === "boolean") throw new ValorInvalido("montante inválido");
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) throw new ValorInvalido("montante inválido");
    if (Number.isInteger(valor)) return valor * 100;
    const c = valor * 100;
    const r = Math.round(c);
    if (Math.abs(c - r) < 1e-4) return r;      // resíduo de ponto flutuante do Excel
    throw new ValorInvalido("valor com mais de duas casas decimais");
  }
  let t = limparEspacos(valor).replace(/r\$/gi, "").replace(/ /g, "");
  let negativo = false;
  if (t.startsWith("(") && t.endsWith(")")) { negativo = true; t = t.slice(1, -1); }
  if (t.startsWith("-")) { negativo = true; t = t.slice(1); }
  else if (t.endsWith("-")) { negativo = true; t = t.slice(0, -1); }
  else if (t.startsWith("+")) t = t.slice(1);
  let numero;
  if (t.includes(",")) {
    if (!(/^\d{1,3}(\.\d{3})+,\d+$/.test(t) || /^\d+,\d+$/.test(t))) throw new ValorInvalido("montante em formato não reconhecido");
    numero = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) numero = t.replace(/\./g, "");
  else if (/^\d+(\.\d{1,2})?$/.test(t)) numero = t;
  else throw new ValorInvalido("montante em formato não reconhecido");
  const c = textoParaCentavos(numero);
  return negativo ? -c : c;
}

// ---------------------------------------------------------------- Montante ausente (Iluminação Pública)
function secoesFormato(formato) {
  const secoes = []; let atual = ""; let aspas = false;
  for (let i = 0; i < formato.length; i++) {
    const ch = formato[i];
    if (ch === '"') aspas = !aspas;
    else if (ch === "\\" && !aspas && i + 1 < formato.length) { atual += ch + formato[i + 1]; i++; continue; }
    else if (ch === ";" && !aspas) { secoes.push(atual); atual = ""; continue; }
    atual += ch;
  }
  secoes.push(atual);
  return secoes;
}
export function formatoExibeZeroComoTraco(formato) {
  if (!formato) return false;
  const secoes = secoesFormato(formato);
  if (secoes.length < 3) return false;
  const zero = secoes[2];
  let traco = false; let digito = false;
  for (let i = 0; i < zero.length;) {
    const ch = zero[i];
    if (ch === '"') {
      let fim = zero.indexOf('"', i + 1); if (fim === -1) fim = zero.length;
      if ([...zero.slice(i + 1, fim)].some((c) => TRACOS.has(c))) traco = true;
      i = fim + 1; continue;
    }
    if (ch === "\\") { if (i + 1 < zero.length && TRACOS.has(zero[i + 1])) traco = true; i += 2; continue; }
    if (ch === "_" || ch === "*") { i += 2; continue; }
    if (ch === "[") { const fim = zero.indexOf("]", i); i = fim === -1 ? zero.length : fim + 1; continue; }
    if (ch === "0" || ch === "#") digito = true;
    else if (TRACOS.has(ch)) traco = true;
    i++;
  }
  return traco && !digito;
}
export function montanteAusente(valor, formato) {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === "boolean") return false;
  if (typeof valor === "string") {
    const t = limparEspacos(valor).replace(/r\$/gi, "").replace(/ /g, "");
    return t === "" || TRACOS.has(t);
  }
  if (typeof valor === "number" && valor === 0) return formatoExibeZeroComoTraco(formato);
  return false;
}

// ---------------------------------------------------------------- textos
function textoCelula(v) {
  if (v === null || v === undefined) return "";
  return limparEspacos(v);
}
export function lerTextoObrigatorio(v, campo) { const t = textoCelula(v); if (!t) throw new ValorInvalido(`${campo} vazio`); return t; }
export function carteiraValida(v) { const n = limparEspacos(v).toUpperCase(); return CARTEIRAS_VALIDAS.includes(n) ? n : null; }
export function nomeComPrefixoIp(nome) {
  const sem = nome.replace(/^(?:\s*IP\s*-\s*)+/i, "").trim();
  return sem ? `IP - ${sem}` : "";
}

// ---------------------------------------------------------------- formatos de planilha
const CONTA = ["Conta de contrato", ["conta de contrato", "conta contrato", "conta do contrato"]];
const NOME = ["Nome", ["nome"]];
const VENC = ["Vencimento líquido", ["vencimento liquido", "venc. liquido", "venc liquido", "vencimento liq."]];
const MONT = ["Montante", ["montante"]];
export const FORMATOS = {
  comum: { conta: CONTA, nome: NOME, vencimento: VENC, montante: MONT,
    forma_pagamento: ["Forma de pagamento", ["forma de pagamento", "forma pagamento", "forma de pgto", "forma de pagto"]],
    carteira: ["Carteira", ["carteira"]] },
  ip: { conta: CONTA, nome: NOME, vencimento: VENC, montante: MONT,
    carteira: ["Responsavel", ["responsavel", "responsavel pela carteira"]] },
};
export const ROTULO_TIPO = { comum: "Planilha de faturas", ip: "Iluminação Pública" };

// Valor "simples" de uma célula do ExcelJS (fórmulas -> resultado; rich text -> texto).
export function valorCelula(cell) {
  if (!cell) return null;
  let v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v || "result" in v) v = v.result ?? null;
    else if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text).join("");
    else if ("text" in v) v = v.text;
    else if ("error" in v) v = String(v.error);
    if (v instanceof Date) return v;
    if (v && typeof v === "object") v = JSON.stringify(v);
  }
  return v === undefined ? null : v;
}

function mapearCabecalho(valores, colunas) {
  const mapa = {};
  valores.forEach((v, i) => {
    if (v === null || v === undefined) return;
    const chave = chaveCabecalho(v);
    for (const [interno, [, aceitos]] of Object.entries(colunas)) {
      if (aceitos.includes(chave) && !(interno in mapa)) mapa[interno] = i;
    }
  });
  return mapa;
}
function linhaValores(ws, r, largura) {
  const row = ws.getRow(r);
  const vals = [];
  for (let c = 1; c <= largura; c++) vals.push(valorCelula(row.getCell(c)));
  return vals;
}
function localizarCabecalho(ws, colunas) {
  const largura = Math.max(ws.columnCount || 0, ws.actualColumnCount || 0, 1);
  let melhor = {};
  for (let r = 1; r <= Math.min(30, ws.rowCount || 0); r++) {
    const vals = linhaValores(ws, r, largura);
    const mapa = mapearCabecalho(vals, colunas);
    if (Object.keys(mapa).length === Object.keys(colunas).length) return { numero: r, mapa, valores: vals, largura };
    if (Object.keys(mapa).length > Object.keys(melhor).length) melhor = mapa;
  }
  return { numero: null, mapa: melhor, valores: [], largura };
}
function faltantes(mapa, colunas) { return Object.keys(colunas).filter((c) => !(c in mapa)).map((c) => colunas[c][0]); }

export async function abrirPlanilha(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    throw new PlanilhaInvalida("O arquivo não é um .xlsx válido. Salve a planilha no formato Excel (.xlsx) e tente novamente.");
  }
  const wb = new globalThis.ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); }
  catch (e) { throw new PlanilhaInvalida(`Não foi possível abrir a planilha: ${e.message || e}`); }
  return wb;
}

export function listarAbas(wb, formato = "comum") {
  const colunas = FORMATOS[formato];
  return wb.worksheets.map((ws) => {
    const { numero, mapa } = localizarCabecalho(ws, colunas);
    return { nome: ws.name, valida: numero !== null, colunas_faltantes: numero ? [] : faltantes(mapa, colunas) };
  });
}

function exibirBruto(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return formatarData(v);
  return limparEspacos(v).slice(0, 200);
}

export function lerAba(wb, nomeAba, formato = "comum") {
  const colunas = FORMATOS[formato];
  const ip = formato === "ip";
  const ws = wb.worksheets.find((w) => w.name === nomeAba);
  if (!ws) throw new PlanilhaInvalida(`A aba '${nomeAba}' não existe no arquivo.`);
  const cab = localizarCabecalho(ws, colunas);
  if (cab.numero === null) throw new PlanilhaInvalida(`A aba '${nomeAba}' não tem as colunas obrigatórias: ${faltantes(cab.mapa, colunas).join(", ")}.`);
  const usados = new Set(Object.values(cab.mapa));
  const resultado = {
    aba: nomeAba, formato, validas: [], erros: [], linhas_invalidas: 0, ignoradas_por_carteira: {}, ignoradas_por_montante: 0,
    colunas_descartadas: cab.valores.map((v, i) => (usados.has(i) ? "" : limparEspacos(v))).filter((t) => t),
  };
  const leitores = { conta: lerConta, nome: (v) => lerTextoObrigatorio(v, "nome"), vencimento: lerData, montante: lerMontante };
  if (!ip) leitores.forma_pagamento = (v) => textoCelula(v);
  for (let r = cab.numero + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const celulas = {}; const brutos = {};
    for (const [nome, i] of Object.entries(cab.mapa)) { celulas[nome] = row.getCell(i + 1); brutos[nome] = valorCelula(celulas[nome]); }
    if (Object.values(brutos).every((v) => limparEspacos(v) === "")) continue;
    const carteira = carteiraValida(brutos.carteira);
    if (carteira === null) {
      const rot = limparEspacos(brutos.carteira).toUpperCase() || "(vazia)";
      resultado.ignoradas_por_carteira[rot] = (resultado.ignoradas_por_carteira[rot] || 0) + 1;
      continue;
    }
    if (ip && montanteAusente(brutos.montante, celulas.montante.numFmt || "General")) { resultado.ignoradas_por_montante++; continue; }
    const erros = []; const conv = {};
    for (const [nome, leitor] of Object.entries(leitores)) {
      try { conv[nome] = leitor(brutos[nome]); }
      catch (e) {
        if (!(e instanceof ValorInvalido)) throw e;
        erros.push({ linha: r, campo: colunas[nome][0], valor: exibirBruto(brutos[nome]), motivo: e.message });
      }
    }
    if (ip && "nome" in conv) {
      conv.nome = nomeComPrefixoIp(conv.nome);
      if (!conv.nome) erros.push({ linha: r, campo: "Nome", valor: exibirBruto(brutos.nome), motivo: "nome vazio" });
    }
    if (erros.length) { resultado.erros.push(...erros); resultado.linhas_invalidas++; continue; }
    resultado.validas.push({
      linha: r, conta: conv.conta, nome: conv.nome, vencimento: conv.vencimento, montante_centavos: conv.montante,
      forma_pagamento: conv.forma_pagamento ?? "", carteira, origem_tipo: formato,
    });
  }
  return resultado;
}

export async function sha256Hex(buffer) {
  const h = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
