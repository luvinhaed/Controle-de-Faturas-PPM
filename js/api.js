// Camada de comunicação da versão on-line (GitHub Pages + Supabase).
//
// As telas continuam chamando os mesmos caminhos da versão local
// ("/api/faturas", "/api/admin/importacao/previa"...). Aqui cada caminho é
// traduzido para uma função do banco (RPC) no Supabase. A leitura do .xlsx e
// a geração do Excel acontecem no navegador. Toda regra de permissão é
// verificada no banco: o navegador não tem acesso direto às tabelas.
import { abrirPlanilha, lerAba, listarAbas, PlanilhaInvalida, ROTULO_TIPO, sha256Hex } from "./dominio/leitura.js";
import { lerBase } from "./dominio/base.js";
import { gerarExcel } from "./dominio/exportacao.js";

const CONFIG = window.CF_CONFIG || {};
let cliente = null;
function sb() {
  if (cliente) return cliente;
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_URL.includes("SEU-PROJETO")) {
    throw new ErroApi("Sistema não configurado: preencha SUPABASE_URL e SUPABASE_ANON_KEY no arquivo config.js.", 0);
  }
  cliente = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "cf-sessao" },
  });
  return cliente;
}

export class ErroApi extends Error {
  constructor(mensagem, status, dados) { super(mensagem); this.status = status; this.dados = dados || {}; }
}

let aoExpirar = null;
export function definirAoExpirar(fn) { aoExpirar = fn; }

function converterErro(error) {
  const hint = String(error.hint || "");
  let status = /^cf:\d{3}$/.test(hint) ? Number(hint.slice(3)) : 500;
  let detalhes = null;
  if (error.details) { try { detalhes = JSON.parse(error.details); } catch { detalhes = error.details; } }
  let msg = error.message || "Erro inesperado.";
  if (status === 500) {
    if (error.code === "PGRST301" || /jwt/i.test(msg)) { status = 401; msg = "Sessão expirada. Entre novamente."; }
    else if (error.code === "42501") { status = 401; msg = "Sessão expirada ou sem permissão. Entre novamente."; }
    else if (/fetch|network|failed/i.test(msg)) { status = 0; msg = "Não foi possível falar com o servidor (Supabase). Verifique a internet."; }
    else if (error.code === "57014") { msg = "A operação demorou demais e foi cancelada. Tente novamente ou divida a planilha em partes menores."; }
    else if (error.code === "PGRST202") { msg = "Função do banco não encontrada. Confira se o INSTALAR_TUDO.sql foi executado no Supabase."; }
  }
  return new ErroApi(msg, status, { erro: msg, detalhes });
}

async function rpc(nome, params = {}) {
  let resp;
  try { resp = await sb().rpc(nome, params); }
  catch (e) {
    if (e instanceof ErroApi) throw e;
    throw new ErroApi("Não foi possível falar com o servidor (Supabase). Verifique a internet.", 0);
  }
  if (resp.error) {
    const erro = converterErro(resp.error);
    if (erro.status === 401 && aoExpirar) aoExpirar(erro.message);
    throw erro;
  }
  return resp.data;
}

// ---------------------------------------------------------------- arquivos em análise (somente nesta aba do navegador)
const emAnalise = new Map();   // token -> { wb, nome, sha, tipo, previas: {aba: {linhas, meta}} }

async function receberArquivo(fd) {
  const arquivo = fd.get("arquivo");
  const tipo = fd.get("tipo") || "comum";
  if (!arquivo || !arquivo.name) throw new ErroApi("Escolha o arquivo .xlsx.", 400);
  if (!arquivo.name.toLowerCase().endsWith(".xlsx")) {
    throw new ErroApi("Envie um arquivo .xlsx (Excel). Arquivos .xls antigos ou .csv devem ser salvos como .xlsx.", 400);
  }
  const buffer = await arquivo.arrayBuffer();
  if (!buffer.byteLength) throw new ErroApi("O arquivo está vazio.", 400);
  let wb;
  try { wb = await abrirPlanilha(buffer); }
  catch (e) { throw new ErroApi(e.message, 400); }
  const abas = listarAbas(wb, tipo);
  const validas = abas.filter((a) => a.valida);
  if (!validas.length) {
    const cols = tipo === "ip" ? "Conta de contrato, Nome, Vencimento líquido, Montante e Responsavel"
      : "Conta de contrato, Nome, Vencimento líquido, Montante, Forma de pagamento e Carteira";
    throw new ErroApi(`Nenhuma aba do arquivo tem as colunas necessárias para ${ROTULO_TIPO[tipo]} (${cols}).`, 400,
      { detalhes: abas.map((a) => ({ aba: a.nome, faltando: a.colunas_faltantes })) });
  }
  const token = crypto.randomUUID();
  emAnalise.set(token, { wb, nome: arquivo.name, sha: await sha256Hex(buffer), tipo, previas: {} });
  return { token, tipo, tipo_rotulo: ROTULO_TIPO[tipo], arquivo_nome: arquivo.name, abas,
    aba_sugerida: validas.length === 1 ? validas[0].nome : null };
}

function analise(token) {
  const a = emAnalise.get(token);
  if (!a) throw new ErroApi("A prévia expirou ou já foi concluída. Escolha o arquivo novamente.", 404);
  return a;
}

async function previa({ token, aba }) {
  const a = analise(token);
  let leitura;
  try { leitura = lerAba(a.wb, aba, a.tipo); }
  catch (e) { if (e instanceof PlanilhaInvalida) throw new ErroApi(e.message, 400); throw e; }
  const meta = { arquivo_nome: a.nome, arquivo_sha256: a.sha, aba, invalidas: leitura.linhas_invalidas,
    ignoradas_montante: leitura.ignoradas_por_montante, ignoradas_por_carteira: leitura.ignoradas_por_carteira };
  const p = await rpc("cf_importacao_previa", { p_linhas: leitura.validas, p_meta: meta, p_tipo: a.tipo });
  a.previas[aba] = { linhas: leitura.validas, meta };
  return { ...p, token, arquivo_nome: a.nome, aba, erros: leitura.erros.slice(0, 2000), erros_total: leitura.erros.length,
    colunas_descartadas: leitura.colunas_descartadas };
}

async function confirmar({ token, aba, decisoes, impressao, aceitar_repetido: aceitar }) {
  const a = analise(token);
  const pv = a.previas[aba];
  if (!pv) throw new ErroApi("Gere a prévia antes de confirmar.", 400);
  const r = await rpc("cf_importacao_confirmar", { p_linhas: pv.linhas, p_meta: pv.meta, p_tipo: a.tipo, p_decisoes: decisoes || {},
    p_impressao: impressao, p_token: token, p_aceitar_repetido: !!aceitar });
  emAnalise.delete(token);
  return r;
}

function baixar(blob, nome) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nome;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

// ---------------------------------------------------------------- exportação Excel (usada por telas/exportar.js)
export async function exportarCarteira({ carteira, de, ate, incluirPagas }) {
  const dados = await rpc("cf_exportacao_dados", { p_carteira: carteira || null, p_de: de || "", p_ate: ate || "", p_incluir_pagas: incluirPagas });
  const blob = await gerarExcel(dados);
  const nome = `FATURAS_${dados.carteira.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${dados.hoje}.xlsx`;
  baixar(blob, nome);
  return nome;
}

// ---------------------------------------------------------------- backup (JSON)
async function backupBaixar() {
  const dados = await rpc("cf_admin_backup");
  const agora = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const nome = `backup_controle_faturas_${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}_${p(agora.getHours())}${p(agora.getMinutes())}.json`;
  baixar(new Blob([JSON.stringify(dados)], { type: "application/json" }), nome);
  return { arquivo: nome };
}
async function backupRestaurar(fd) {
  const arquivo = fd.get("arquivo");
  if (!arquivo || !arquivo.name) throw new ErroApi("Escolha o arquivo de backup (.json).", 400);
  let dados;
  try { dados = JSON.parse(await arquivo.text()); }
  catch { throw new ErroApi("O arquivo escolhido não é um backup válido (.json).", 400); }
  return rpc("cf_admin_backup_restaurar", { p_dados: dados, p_confirmacao: fd.get("confirmacao") || "" });
}

// ---------------------------------------------------------------- logo (opcional: config.js -> LOGO)
async function detectarLogo() {
  return CONFIG.LOGO ? String(CONFIG.LOGO) : null;
}
let acessosCache = null;

// ---------------------------------------------------------------- rotas (mesmos caminhos da versão local)
const ROTAS = [
  ["GET", /^\/api\/publico\/acessos$/, async () => {
    const r = await rpc("cf_publico_acessos");
    acessosCache = r.acessos;
    return { acessos: r.acessos, logo: await detectarLogo() };
  }],
  ["POST", /^\/api\/login$/, async (m, q, c) => {
    if (!acessosCache) acessosCache = (await rpc("cf_publico_acessos")).acessos;
    const acesso = acessosCache.find((a) => a.login === c.login);
    if (!acesso) throw new ErroApi("Acesso não encontrado.", 401);
    if (!acesso.email) throw new ErroApi("Este acesso ainda não foi configurado no Supabase (veja o tutorial, etapa de usuários).", 401);
    const { error } = await sb().auth.signInWithPassword({ email: acesso.email, password: c.senha || "" });
    if (error) {
      const msg = /invalid login|invalid credentials/i.test(error.message) ? "Senha incorreta."
        : /rate|too many/i.test(error.message) ? "Muitas tentativas incorretas. Aguarde um pouco e tente novamente." : error.message;
      throw new ErroApi(msg, 401);
    }
    const s = await rpc("cf_sessao");
    if (!s.usuario) { await sb().auth.signOut(); throw new ErroApi("Usuário sem perfil configurado. Peça ao administrador para executar cf.configurar_acesso.", 403); }
    return { usuario: s.usuario };
  }],
  ["POST", /^\/api\/logout$/, async () => { await sb().auth.signOut(); return { ok: true }; }],
  ["GET", /^\/api\/sessao$/, async () => {
    const { data } = await sb().auth.getSession();
    if (!data.session) return { usuario: null };
    try { return await rpc("cf_sessao"); }
    catch (e) { if (e.status === 401) return { usuario: null }; throw e; }
  }],
  ["GET", /^\/api\/municipios$/, (m, q) => rpc("cf_municipios", { p_carteira: q.carteira || null })],
  ["GET", /^\/api\/faturas$/, (m, q) => rpc("cf_faturas_listar", { p: q })],
  ["GET", /^\/api\/faturas\/meses$/, (m, q) => rpc("cf_faturas_meses", { p_carteira: q.carteira || null })],
  ["GET", /^\/api\/faturas\/(\d+)$/, (m) => rpc("cf_fatura_detalhe", { p_id: Number(m[1]) })],
  ["GET", /^\/api\/faturas\/(\d+)\/historico$/, (m) => rpc("cf_fatura_historico", { p_id: Number(m[1]) })],
  ["POST", /^\/api\/faturas\/(\d+)\/pagamento$/, (m, q, c) => rpc("cf_fatura_pagamento", { p_id: Number(m[1]), p_paga: !!c.paga, p_versao: c.versao })],
  ["POST", /^\/api\/faturas\/(\d+)\/observacao$/, (m, q, c) => rpc("cf_fatura_observacao", { p_id: Number(m[1]), p_observacao: c.observacao || "", p_versao: c.versao })],
  ["GET", /^\/api\/acoes\/catalogo$/, () => rpc("cf_acoes_catalogo")],
  ["POST", /^\/api\/faturas\/(\d+)\/acoes$/, (m, q, c) => rpc("cf_acao_registrar", { p_fatura_id: Number(m[1]), p_acao_id: Number(c.acao_id), p_data: c.data_acao })],
  ["PUT", /^\/api\/acoes\/(\d+)$/, (m, q, c) => rpc("cf_acao_editar", { p_evento_id: Number(m[1]), p_acao_id: Number(c.acao_id), p_data: c.data_acao, p_versao: c.versao })],
  ["DELETE", /^\/api\/acoes\/(\d+)$/, (m, q) => rpc("cf_acao_excluir", { p_evento_id: Number(m[1]), p_versao: Number(q.versao) })],
  ["GET", /^\/api\/regua$/, (m, q) => rpc("cf_regua", { p: q })],
  ["GET", /^\/api\/particularidades\/(\d+)$/, (m) => rpc("cf_particularidades", { p_municipio_id: Number(m[1]) })],
  ["PUT", /^\/api\/particularidades\/(\d+)$/, (m, q, c) => rpc("cf_particularidades_salvar", { p_municipio_id: Number(m[1]), p_conteudo: c.conteudo, p_versao: c.versao })],
  ["GET", /^\/api\/sem-municipio$/, (m, q) => rpc("cf_sem_municipio", { p_carteira: q.carteira || null })],
  ["POST", /^\/api\/sem-municipio\/associar$/, (m, q, c) => rpc("cf_sem_municipio_associar", { p_conta: String(c.conta), p_municipio_id: c.municipio_id })],
  ["POST", /^\/api\/sem-municipio\/municipios$/, (m, q, c) => rpc("cf_sem_municipio_cadastrar", { p_nome: c.nome || "", p_carteira: c.carteira || null })],
  // ---- admin: importação
  ["POST", /^\/api\/admin\/importacao\/arquivo$/, (m, q, c) => receberArquivo(c)],
  ["POST", /^\/api\/admin\/importacao\/previa$/, (m, q, c) => previa(c)],
  ["POST", /^\/api\/admin\/importacao\/confirmar$/, (m, q, c) => confirmar(c)],
  ["POST", /^\/api\/admin\/importacao\/cancelar$/, (m, q, c) => { emAnalise.delete(c.token); return { ok: true }; }],
  ["GET", /^\/api\/admin\/importacoes$/, () => rpc("cf_importacoes")],
  ["GET", /^\/api\/admin\/importacoes\/reversao$/, () => rpc("cf_reversao_info")],
  ["POST", /^\/api\/admin\/importacoes\/(\d+)\/desfazer$/, (m, q, c) => rpc("cf_desfazer_importacao", { p_importacao_id: Number(m[1]), p_decisoes: c.decisoes || {} })],
  // ---- admin: registros
  ["PUT", /^\/api\/admin\/faturas\/(\d+)$/, (m, q, c) => rpc("cf_admin_corrigir", { p_id: Number(m[1]), p: c })],
  ["POST", /^\/api\/admin\/faturas\/(\d+)\/arquivar$/, (m, q, c) => rpc("cf_admin_arquivar", { p_id: Number(m[1]), p_motivo: c.motivo || "", p_versao: c.versao })],
  ["POST", /^\/api\/admin\/faturas\/(\d+)\/restaurar$/, (m, q, c) => rpc("cf_admin_restaurar", { p_id: Number(m[1]), p_motivo: c.motivo || "", p_versao: c.versao })],
  // ---- admin: municípios e contas
  ["GET", /^\/api\/admin\/municipios$/, () => rpc("cf_admin_municipios")],
  ["POST", /^\/api\/admin\/municipios$/, (m, q, c) => rpc("cf_admin_municipio_criar", { p_nome: c.nome || "", p_carteiras: c.carteiras || [] })],
  ["PUT", /^\/api\/admin\/municipios\/(\d+)$/, (m, q, c) => rpc("cf_admin_municipio_renomear", { p_id: Number(m[1]), p_nome: c.nome || "" })],
  ["DELETE", /^\/api\/admin\/municipios\/(\d+)$/, (m) => rpc("cf_admin_municipio_excluir", { p_id: Number(m[1]) })],
  ["POST", /^\/api\/admin\/carteira-municipio$/, (m, q, c) => rpc("cf_admin_relacao", { p_carteira_id: Number(c.carteira_id), p_municipio_id: Number(c.municipio_id), p_incluir: !!c.incluir })],
  ["GET", /^\/api\/admin\/vinculos$/, (m, q) => rpc("cf_admin_vinculos", { p_busca: q.busca || "", p_pagina: Number(q.pagina || 1) })],
  ["PUT", /^\/api\/admin\/vinculos\/([^/]+)$/, (m, q, c) => rpc("cf_admin_vinculo_definir", { p_conta: decodeURIComponent(m[1]), p_municipio_id: c.municipio_id, p_aplicar_existentes: !!c.aplicar_existentes, p_motivo: c.motivo || null })],
  ["DELETE", /^\/api\/admin\/vinculos\/([^/]+)$/, (m) => rpc("cf_admin_vinculo_remover", { p_conta: decodeURIComponent(m[1]) })],
  ["POST", /^\/api\/admin\/base-inicial$/, async (m, q, c) => {
    const arquivo = c.get("arquivo");
    if (!arquivo || !arquivo.name) throw new ErroApi("Escolha o arquivo da base (CSV, Markdown, TXT ou XLSX).", 400);
    const { entradas, linhas_lidas: lidas } = await lerBase(arquivo);
    if (!entradas.length) throw new ErroApi("Nenhuma linha encontrada. O arquivo deve ter as colunas MUNICIPIO e CONTA CONTRATO.", 400);
    return rpc("cf_admin_base_carregar", { p_entradas: entradas, p_arquivo: arquivo.name, p_invalidas: [], p_linhas_lidas: lidas });
  }],
  ["GET", /^\/api\/admin\/base-inicial\/revisoes$/, () => rpc("cf_admin_revisoes")],
  ["POST", /^\/api\/admin\/base-inicial\/revisoes\/(\d+)$/, (m, q, c) => rpc("cf_admin_revisao_resolver", { p_id: Number(m[1]), p_aplicar: !!c.aplicar })],
  // ---- admin: backup
  ["POST", /^\/api\/admin\/backups$/, () => backupBaixar()],
  ["POST", /^\/api\/admin\/backups\/restaurar$/, (m, q, c) => backupRestaurar(c)],
];

export async function api(metodo, url, corpo) {
  const [caminho, consulta] = url.split("?");
  const q = Object.fromEntries(new URLSearchParams(consulta || ""));
  for (const [met, re, fn] of ROTAS) {
    if (met !== metodo) continue;
    const m = re.exec(caminho);
    if (m) {
      try { return await fn(m, q, corpo ?? {}); }
      catch (e) {
        if (e instanceof ErroApi) throw e;
        console.error(e);
        throw new ErroApi(e && e.message ? e.message : "Erro inesperado.", 500);
      }
    }
  }
  throw new ErroApi(`Operação não disponível: ${metodo} ${caminho}`, 404);
}

export const get = (url) => api("GET", url);
export const post = (url, corpo) => api("POST", url, corpo ?? {});
export const put = (url, corpo) => api("PUT", url, corpo ?? {});
export const del = (url) => api("DELETE", url);

export function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : "";
}
