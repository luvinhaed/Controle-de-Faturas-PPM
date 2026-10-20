// Modal "Registrar ação": dados da fatura, nova ação e histórico.
// Editar pela régua ou pelo histórico altera o MESMO evento.
import { del, get, post, put } from "../api.js";
import { abrirModal, confirmar, data, dataHora, el, limpar, mensagemErro, moeda, toast } from "../ui.js";

function opcoesAcao(estado, incluirId) {
  return estado.catalogo
    .filter((a) => a.ativo || a.id === incluirId)
    .map((a) => el("option", { value: String(a.id), text: `${a.etapa}. ${a.nome}${a.ativo ? "" : " (inativa)"}` }));
}

export async function abrirFatura(faturaId, estado, { editarEventoId = null, aoAlterar } = {}) {
  let fatura;
  try {
    fatura = await get(`/api/faturas/${faturaId}`);
  } catch (e) { toast(mensagemErro(e), "erro"); return; }

  const corpo = el("div", { class: "fatura-modal" });
  const modal = abrirModal({ titulo: "Registrar ação", conteudo: corpo, largura: "grande" });
  let editando = null;

  const acaoSel = el("select", { "aria-label": "Ação", required: true });
  const dataInp = el("input", { type: "date", "aria-label": "Data da ação", required: true, max: "2100-12-31", min: "1990-01-01" });
  const salvar = el("button", { class: "btn btn-primario", type: "submit" }, "Salvar");
  const cancelarEd = el("button", { class: "btn", type: "button", hidden: true }, "Cancelar edição");
  const modoTexto = el("div", { class: "modo-edicao", hidden: true });
  const form = el("form", { class: "form-acao" },
    modoTexto,
    el("label", { class: "campo" }, el("span", { class: "campo-rotulo", text: "Ação" }), acaoSel),
    el("label", { class: "campo campo-data" }, el("span", { class: "campo-rotulo", text: "Data da ação" }), dataInp),
    el("div", { class: "form-acao-botoes" }, cancelarEd, salvar),
  );
  const historico = el("div", { class: "historico" });

  function prepararNovo() {
    editando = null;
    limpar(acaoSel).append(el("option", { value: "", text: "Escolha a ação..." }), ...opcoesAcao(estado));
    dataInp.value = estado.hoje;
    modoTexto.hidden = true; cancelarEd.hidden = true; salvar.textContent = "Salvar";
  }
  function prepararEdicao(ev) {
    editando = ev;
    limpar(acaoSel).append(...opcoesAcao(estado, ev.acao_id));
    acaoSel.value = String(ev.acao_id);
    dataInp.value = ev.data_acao;
    modoTexto.textContent = `Editando a ação "${ev.acao_etapa}. ${ev.acao_nome}" de ${data(ev.data_acao)}. Esta correção altera o mesmo registro (não cria outro).`;
    modoTexto.hidden = false; cancelarEd.hidden = false; salvar.textContent = "Salvar correção";
    acaoSel.focus();
  }
  cancelarEd.addEventListener("click", prepararNovo);

  form.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    if (!acaoSel.value) { toast("Escolha a ação.", "erro"); acaoSel.focus(); return; }
    if (!dataInp.value) { toast("Informe a data da ação.", "erro"); dataInp.focus(); return; }
    salvar.disabled = true; const t = salvar.textContent; salvar.textContent = "Salvando...";
    try {
      if (editando) {
        await put(`/api/acoes/${editando.id}`, { acao_id: Number(acaoSel.value), data_acao: dataInp.value, versao: editando.versao });
        toast("Ação corrigida.", "sucesso");
      } else {
        await post(`/api/faturas/${fatura.id}/acoes`, { acao_id: Number(acaoSel.value), data_acao: dataInp.value });
        toast("Ação registrada.", "sucesso");
      }
      await recarregar();
      prepararNovo();
      if (aoAlterar) aoAlterar();
    } catch (e) {
      toast(mensagemErro(e), "erro", 7000);
      if (e.status === 409) { await recarregar(); prepararNovo(); }
    } finally { salvar.disabled = false; if (salvar.textContent === "Salvando...") salvar.textContent = t; }
  });

  async function recarregar() {
    try { fatura = await get(`/api/faturas/${faturaId}`); desenhar(); }
    catch (e) { toast(mensagemErro(e), "erro"); }
  }

  function desenhar() {
    limpar(corpo);
    const info = el("dl", { class: "fatura-info" },
      ...[
        ["Município", fatura.municipio_nome || "Não identificado"],
        ["Conta de contrato", fatura.conta],
        ["Nome", fatura.nome],
        ["Vencimento líquido", data(fatura.vencimento)],
        ["Montante", moeda(fatura.montante_centavos)],
        ["Forma de pagamento", fatura.forma_pagamento || "—"],
        ["Situação", fatura.situacao_rotulo + (fatura.arquivada ? " (arquivada)" : "")],
      ].map(([k, v]) => el("div", {}, el("dt", { text: k }), el("dd", { class: k === "Conta de contrato" ? "ident" : "", text: v }))),
    );
    corpo.append(info);
    if (fatura.arquivada) corpo.append(el("p", { class: "alerta", text: "Fatura arquivada: consulta somente leitura. Restaure-a em Arquivadas para registrar ações." }));
    else corpo.append(el("h3", { text: "Nova ação" }), form);

    limpar(historico);
    historico.append(el("h3", { text: `Histórico das ações (${fatura.acoes.length})` }));
    if (!fatura.acoes.length) historico.append(el("p", { class: "vazio", text: "Nenhuma ação registrada para esta fatura." }));
    else {
      const tb = el("tbody");
      for (const ev of fatura.acoes) {
        const linha = el("tr", { class: editando && editando.id === ev.id ? "em-edicao" : "" },
          el("td", { text: data(ev.data_acao) }),
          el("td", {}, el("span", { class: "etapa", text: ev.acao_etapa }), ` ${ev.acao_nome}`),
          el("td", { class: "pequeno", text: `${ev.criado_por} em ${dataHora(ev.criado_em)}` + (ev.versao > 1 ? ` · corrigida por ${ev.atualizado_por} em ${dataHora(ev.atualizado_em)}` : "") }),
          el("td", { class: "col-controles" }, fatura.arquivada ? null : [
            el("button", { class: "btn btn-pequeno", type: "button", onclick: () => prepararEdicao(ev) }, "Editar"),
            el("button", { class: "btn btn-pequeno btn-perigo-texto", type: "button", onclick: () => excluir(ev) }, "Excluir"),
          ]),
        );
        tb.append(linha);
      }
      historico.append(el("table", { class: "tabela tabela-compacta" },
        el("thead", {}, el("tr", {}, el("th", { text: "Data da ação" }), el("th", { text: "Ação" }), el("th", { text: "Registro" }), el("th", { text: "" }))), tb));
    }
    corpo.append(historico);
  }

  async function excluir(ev) {
    const ok = await confirmar("Excluir ação", `Excluir a ação "${ev.acao_etapa}. ${ev.acao_nome}" de ${data(ev.data_acao)}? As demais ações não são afetadas.`, { textoOk: "Excluir", perigo: true });
    if (!ok) return;
    try {
      await del(`/api/acoes/${ev.id}?versao=${ev.versao}`);
      toast("Ação excluída.", "sucesso");
      if (editando && editando.id === ev.id) prepararNovo();
      await recarregar();
      if (aoAlterar) aoAlterar();
    } catch (e) { toast(mensagemErro(e), "erro"); if (e.status === 409) recarregar(); }
  }

  prepararNovo();
  desenhar();
  if (editarEventoId) {
    const ev = fatura.acoes.find((a) => a.id === editarEventoId);
    if (ev) { prepararEdicao(ev); desenhar(); }
  }
  return modal;
}
