// Utilitários de interface. Todo conteúdo vindo do usuário/banco é inserido
// como TEXTO (textContent), nunca como HTML.

// Decisão de projeto: append() ignora null/undefined/false, permitindo
// montar telas com elementos condicionais (cond ? el(...) : null) sem que
// o navegador escreva o texto "null" na página.
const _appendOriginal = Element.prototype.append;
Element.prototype.append = function (...nos) {
  return _appendOriginal.apply(this, nos.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
};

export function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k in e && typeof v !== "string") e[k] = v;
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return e;
}

export function limpar(no) { while (no.firstChild) no.removeChild(no.firstChild); return no; }

const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function moeda(centavos) { return fmtMoeda.format((Number(centavos) || 0) / 100).replace(/ /g, " "); }
export function centavosParaTexto(c) {
  const neg = c < 0; c = Math.abs(c);
  const inteiro = Math.floor(c / 100).toLocaleString("pt-BR");
  return (neg ? "-" : "") + inteiro + "," + String(c % 100).padStart(2, "0");
}
export function data(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
export function dataHora(iso) {
  if (!iso) return "";
  return `${data(iso)} ${String(iso).slice(11, 16)}`;
}
export function mesAno(ym) {
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [a, m] = ym.split("-");
  return `${nomes[Number(m) - 1]}/${a}`;
}
export function plural(n, s, p) { return `${n} ${n === 1 ? s : p}`; }

// ------------------------------------------------------------ avisos
export function toast(msg, tipo = "info", tempo = 4500) {
  const area = document.getElementById("avisos");
  const t = el("div", { class: `aviso aviso-${tipo}`, role: tipo === "erro" ? "alert" : "status" }, msg);
  area.append(t);
  while (area.children.length > 3) area.firstElementChild.remove();
  setTimeout(() => t.classList.add("saindo"), tempo);
  setTimeout(() => t.remove(), tempo + 400);
}

export function mensagemErro(e) {
  if (!e) return "Erro desconhecido.";
  let msg = e.message || String(e);
  const det = e.dados && e.dados.detalhes;
  if (Array.isArray(det) && det.length && typeof det[0] === "string") msg += " " + det.join(" ");
  return msg;
}

// ------------------------------------------------------------ modal
let pilhaModais = [];
export function abrirModal({ titulo, conteudo, botoes = [], largura = "media", aoFechar }) {
  const fundo = el("div", { class: "modal-fundo" });
  const caixa = el("div", { class: `modal modal-${largura}`, role: "dialog", "aria-modal": "true", "aria-label": titulo });
  const fechar = () => {
    fundo.remove();
    pilhaModais = pilhaModais.filter((m) => m !== api);
    document.removeEventListener("keydown", teclas);
    if (aoFechar) aoFechar();
  };
  const teclas = (ev) => { if (ev.key === "Escape" && pilhaModais[pilhaModais.length - 1] === api) fechar(); };
  const rodape = el("div", { class: "modal-rodape" });
  const corpo = el("div", { class: "modal-corpo" }, conteudo);
  caixa.append(
    el("div", { class: "modal-topo" }, el("h2", { text: titulo }), el("button", { class: "btn-fechar", title: "Fechar", "aria-label": "Fechar", onclick: fechar }, "×")),
    corpo, rodape,
  );
  for (const b of botoes) rodape.append(b);
  if (!botoes.length) rodape.remove();
  fundo.append(caixa);
  fundo.addEventListener("mousedown", (ev) => { if (ev.target === fundo) fechar(); });
  document.body.append(fundo);
  document.addEventListener("keydown", teclas);
  const api = { fechar, corpo, rodape, caixa };
  pilhaModais.push(api);
  setTimeout(() => { const f = caixa.querySelector("[autofocus], input, select, textarea, button.btn-primario"); if (f) f.focus(); }, 30);
  return api;
}

export function confirmar(titulo, mensagem, { textoOk = "Confirmar", perigo = false } = {}) {
  return new Promise((resolve) => {
    let resolvido = false;
    const ok = el("button", { class: perigo ? "btn btn-perigo" : "btn btn-primario", onclick: () => { resolvido = true; m.fechar(); resolve(true); } }, textoOk);
    const cancelar = el("button", { class: "btn", onclick: () => m.fechar() }, "Cancelar");
    const conteudo = Array.isArray(mensagem) ? mensagem : [el("p", { text: mensagem })];
    const m = abrirModal({ titulo, conteudo, botoes: [cancelar, ok], largura: "pequena", aoFechar: () => { if (!resolvido) resolve(false); } });
  });
}

// ------------------------------------------------------------ botão com estado de carregamento
export async function comCarregamento(botao, textoCarregando, fn) {
  if (botao.disabled) return;
  const original = botao.textContent;
  botao.disabled = true;
  botao.textContent = textoCarregando;
  botao.setAttribute("aria-busy", "true");
  try { return await fn(); }
  finally { botao.disabled = false; botao.textContent = original; botao.removeAttribute("aria-busy"); }
}

// ------------------------------------------------------------ linhas de estado em tabelas
export function linhaEstado(colunas, texto, tipo = "vazio", acao) {
  return el("tr", { class: `linha-estado estado-${tipo}` },
    el("td", { colspan: colunas }, el("span", { text: texto }), acao ? [" ", acao] : null));
}

// ------------------------------------------------------------ cabeçalho ordenável
export function cabecalhoOrdenavel(colunas, ordem, direcao, aoOrdenar) {
  const tr = el("tr");
  for (const c of colunas) {
    if (!c.chave) { tr.append(el("th", { class: c.classe || "", text: c.titulo })); continue; }
    const ativo = ordem === c.chave;
    const seta = ativo ? (direcao === "asc" ? "▲" : "▼") : "↕";
    const th = el("th", {
      class: `ordenavel ${ativo ? "ativo" : ""} ${c.classe || ""}`,
      "aria-sort": ativo ? (direcao === "asc" ? "ascending" : "descending") : "none",
      title: "Clique para ordenar",
    }, el("button", {
      type: "button",
      onclick: () => aoOrdenar(c.chave, ativo && direcao === "asc" ? "desc" : "asc"),
    }, c.titulo, el("span", { class: "seta", "aria-hidden": "true", text: seta })));
    tr.append(th);
  }
  return tr;
}

// ------------------------------------------------------------ paginação
export function paginacao(pagina, paginas, quantidade, tamanho, irPara) {
  if (!quantidade) return el("div");
  const ini = (pagina - 1) * tamanho + 1;
  const fim = Math.min(pagina * tamanho, quantidade);
  return el("div", { class: "paginacao" },
    el("span", { text: `Mostrando ${ini.toLocaleString("pt-BR")}–${fim.toLocaleString("pt-BR")} de ${quantidade.toLocaleString("pt-BR")}` }),
    paginas > 1 ? el("span", { class: "paginacao-botoes" },
      el("button", { class: "btn btn-pequeno", disabled: pagina <= 1, onclick: () => irPara(pagina - 1) }, "‹ Anterior"),
      el("span", { text: ` Página ${pagina} de ${paginas} ` }),
      el("button", { class: "btn btn-pequeno", disabled: pagina >= paginas, onclick: () => irPara(pagina + 1) }, "Próxima ›"),
    ) : null,
  );
}

// ------------------------------------------------------------ seletor com busca
export class SeletorBusca {
  // opcoes: [{valor, rotulo, extra}]
  constructor({ opcoes = [], valor = "", aoMudar, placeholder = "Buscar...", rotuloAria = "Selecionar" }) {
    this.opcoes = opcoes; this.valor = valor; this.aoMudar = aoMudar; this.destaque = 0;
    this.entrada = el("input", { type: "text", class: "seletor-entrada", placeholder, "aria-label": rotuloAria, autocomplete: "off", role: "combobox", "aria-expanded": "false" });
    this.lista = el("ul", { class: "seletor-lista", role: "listbox" });
    this.raiz = el("div", { class: "seletor" }, this.entrada, el("span", { class: "seletor-seta", "aria-hidden": "true", text: "▾" }), this.lista);
    this.entrada.addEventListener("focus", () => { this.entrada.select(); this.abrir(""); });
    this.entrada.addEventListener("input", () => this.abrir(this.entrada.value));
    this.entrada.addEventListener("keydown", (ev) => this.teclas(ev));
    this.entrada.addEventListener("blur", () => setTimeout(() => this.fechar(), 150));
    this.mostrarValor();
  }
  definirOpcoes(opcoes, valor) { this.opcoes = opcoes; if (valor !== undefined) this.valor = valor; this.mostrarValor(); }
  mostrarValor() { const o = this.opcoes.find((x) => String(x.valor) === String(this.valor)); this.entrada.value = o ? o.rotulo : ""; }
  filtrar(texto) {
    const n = normalizar(texto);
    return this.opcoes.filter((o) => !n || normalizar(o.rotulo).includes(n));
  }
  abrir(texto) {
    this.visiveis = this.filtrar(texto);
    this.destaque = Math.max(0, this.visiveis.findIndex((o) => String(o.valor) === String(this.valor)));
    this.desenhar();
    this.lista.classList.add("aberta");
    this.entrada.setAttribute("aria-expanded", "true");
  }
  fechar() { this.lista.classList.remove("aberta"); this.entrada.setAttribute("aria-expanded", "false"); this.mostrarValor(); }
  desenhar() {
    limpar(this.lista);
    if (!this.visiveis.length) { this.lista.append(el("li", { class: "seletor-vazio", text: "Nenhum resultado" })); return; }
    this.visiveis.forEach((o, i) => {
      const li = el("li", { role: "option", class: i === this.destaque ? "destaque" : "", "aria-selected": String(o.valor) === String(this.valor) ? "true" : "false" },
        el("span", { text: o.rotulo }), o.extra ? el("small", { text: o.extra }) : null);
      li.addEventListener("mousedown", (ev) => { ev.preventDefault(); this.escolher(o); });
      this.lista.append(li);
    });
    const d = this.lista.children[this.destaque]; if (d && d.scrollIntoView) d.scrollIntoView({ block: "nearest" });
  }
  teclas(ev) {
    if (!this.lista.classList.contains("aberta") && (ev.key === "ArrowDown" || ev.key === "Enter")) { this.abrir(""); ev.preventDefault(); return; }
    if (ev.key === "ArrowDown") { this.destaque = Math.min(this.destaque + 1, this.visiveis.length - 1); this.desenhar(); ev.preventDefault(); }
    else if (ev.key === "ArrowUp") { this.destaque = Math.max(this.destaque - 1, 0); this.desenhar(); ev.preventDefault(); }
    else if (ev.key === "Enter") { const o = this.visiveis[this.destaque]; if (o) this.escolher(o); ev.preventDefault(); }
    else if (ev.key === "Escape") { this.fechar(); this.entrada.blur(); }
  }
  escolher(o) { this.valor = o.valor; this.fechar(); this.entrada.blur(); if (this.aoMudar) this.aoMudar(o.valor); }
}

export function normalizar(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }

export function seletorSimples(opcoes, valor, aoMudar, attrs = {}) {
  const s = el("select", attrs);
  for (const o of opcoes) s.append(el("option", { value: o.valor, text: o.rotulo }));
  s.value = valor;
  if (aoMudar) s.addEventListener("change", () => aoMudar(s.value));
  return s;
}

export function campo(rotulo, controle, dica) {
  return el("label", { class: "campo" }, el("span", { class: "campo-rotulo", text: rotulo }), controle, dica ? el("small", { class: "campo-dica", text: dica }) : null);
}

export function debounce(fn, ms = 350) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function hojeISO(estado) { return estado.hoje; }
