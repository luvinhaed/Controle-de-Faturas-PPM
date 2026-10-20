// Peças compartilhadas entre telas.
import { el, seletorSimples } from "../ui.js";

export function ehAdmin(estado) { return estado.usuario && estado.usuario.perfil === "admin"; }

export function seletorCarteira(estado, aoMudar, { permitirTodas = true, valor } = {}) {
  const opcoes = (permitirTodas ? [{ valor: "", rotulo: "Todas as carteiras" }] : [])
    .concat(estado.carteiras.map((c) => ({ valor: String(c.id), rotulo: c.nome })));
  return seletorSimples(opcoes, valor ?? estado.carteiraSel, aoMudar, { "aria-label": "Carteira" });
}

export function carteiraParam(estado) { return ehAdmin(estado) ? estado.carteiraSel : ""; }

export function cabecalhoTela(titulo, ...extras) {
  return el("div", { class: "tela-cabecalho" }, el("h1", { text: titulo }), ...extras);
}

export function rotuloSituacao(item) {
  return el("span", { class: `situacao situacao-${item.situacao}`, text: item.situacao_rotulo });
}

export function classeLinha(item) {
  return item.situacao === "paga" ? "linha-paga" : item.situacao === "vencida" ? "linha-vencida" : "";
}
