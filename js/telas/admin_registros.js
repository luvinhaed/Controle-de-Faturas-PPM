// Admin: localizar faturas, corrigir, mover, arquivar e restaurar.
import { get, post, put, qs } from "../api.js";
import { icone } from "../icones.js";
import {
  SeletorBusca, abrirModal, cabecalhoOrdenavel, campo, centavosParaTexto, confirmar, data, dataHora, debounce, el, limpar,
  linhaEstado, mensagemErro, moeda, paginacao, seletorSimples, toast,
} from "../ui.js";
import { abrirFatura } from "./acao_modal.js";
import { classeLinha, seletorCarteira } from "./comum.js";

const NOMES_OPERACAO = {
  pagamento: "Pagamento", observacao: "Observação", correcao: "Correção/movimentação", arquivamento: "Arquivamento",
  restauracao: "Restauração", municipio_por_vinculo: "Município pelo vínculo da conta", atualizacao_importacao: "Atualizada por importação",
  restaurada_na_reversao: "Restaurada na reversão de importação", reversao_mantida: "Mantida na reversão de importação",
};

export async function telaRegistros(c, estado, arquivadas) {
  const chave = arquivadas ? "arquivadas" : "registros";
  const f = (estado.filtros[chave] ||= { carteira: "", municipio: "todos", busca: "", ordem: "vencimento", direcao: "desc", pagina: 1 });
  const colunas = [
    { chave: "carteira", titulo: "Carteira" }, { chave: "municipio", titulo: "Município" },
    { chave: "conta", titulo: "Conta de contrato", classe: "col-conta" }, { chave: "nome", titulo: "Nome", classe: "col-nome" },
    { chave: "vencimento", titulo: "Vencimento líquido", classe: "col-data" }, { chave: "montante", titulo: "Montante", classe: "col-valor" },
    { chave: "forma_pagamento", titulo: "Forma de pagamento", classe: "col-forma" },
    arquivadas ? { titulo: "Motivo do arquivamento" } : { chave: "situacao", titulo: "Situação" },
    { titulo: "", classe: "col-controles" },
  ];
  const N = colunas.length;
  let req = 0;

  const munSel = new SeletorBusca({ placeholder: "Buscar município...", rotuloAria: "Município", aoMudar: (v) => { f.municipio = String(v); f.pagina = 1; carregar(); } });
  const busca = el("input", { type: "search", placeholder: "Conta ou nome", value: f.busca, "aria-label": "Buscar" });
  busca.addEventListener("input", debounce(() => { f.busca = busca.value.trim(); f.pagina = 1; carregar(); }));
  const thead = el("thead"); const tbody = el("tbody"); const rodape = el("div", { class: "tabela-rodape" });
  c.append(
    el("div", { class: "tela-cabecalho" }, el("h1", { text: arquivadas ? "Faturas arquivadas" : "Gerenciar registros" })),
    el("p", { class: "instrucao", text: arquivadas
      ? "Faturas retiradas do acompanhamento (fora das telas, totais e exportações). O histórico é preservado. Use Restaurar para devolvê-las."
      : "Localize uma fatura para corrigir seus dados, mudar município ou carteira, ou retirá-la do acompanhamento (Arquivar)." }),
    el("div", { class: "filtros" },
      el("label", { class: "filtro" }, el("span", { text: "Carteira" }), seletorCarteira(estado, (v) => { f.carteira = v; f.pagina = 1; carregar(); }, { valor: f.carteira })),
      el("div", { class: "filtro filtro-municipio" }, el("span", { text: "Município" }), munSel.raiz),
      el("label", { class: "filtro filtro-busca" }, el("span", { text: "Busca" }), busca),
    ),
    el("div", { class: "tabela-caixa" }, el("table", { class: "tabela" }, thead, tbody)),
    rodape,
  );

  const d = await get("/api/admin/municipios");
  munSel.definirOpcoes([{ valor: "todos", rotulo: "Todos os municípios" }, { valor: "sem", rotulo: "Não identificado (sem município)" }]
    .concat(d.municipios.map((m) => ({ valor: String(m.id), rotulo: m.nome }))), f.municipio);

  async function carregar() {
    const minha = ++req;
    limpar(thead).append(cabecalhoOrdenavel(colunas, f.ordem, f.direcao, (o, dd) => { f.ordem = o; f.direcao = dd; f.pagina = 1; carregar(); }));
    limpar(tbody).append(linhaEstado(N, "Carregando...", "carregando")); limpar(rodape);
    let r;
    try {
      r = await get(`/api/faturas${qs({ carteira: f.carteira, municipio: f.municipio, busca: f.busca, ordem: f.ordem, direcao: f.direcao, pagina: f.pagina, arquivadas: arquivadas ? "1" : "", tamanho: 100 })}`);
    } catch (e) {
      if (minha === req) limpar(tbody).append(linhaEstado(N, mensagemErro(e), "erro", el("button", { class: "btn btn-pequeno", onclick: carregar }, "Tentar novamente")));
      return;
    }
    if (minha !== req) return;
    f.pagina = r.pagina;
    limpar(tbody);
    if (!r.itens.length) tbody.append(linhaEstado(N, arquivadas ? "Nenhuma fatura arquivada." : "Nenhuma fatura encontrada.", "vazio"));
    for (const it of r.itens) {
      const controles = el("td", { class: "col-controles" });
      if (arquivadas) {
        controles.append(el("button", { class: "btn btn-pequeno", type: "button", onclick: () => abrirFatura(it.id, estado) }, "Ver"),
          el("button", { class: "btn btn-primario btn-pequeno", type: "button", onclick: () => restaurar(it) }, icone("desfazer"), "Restaurar"));
      } else {
        controles.append(el("button", { class: "btn btn-pequeno", type: "button", onclick: () => abrirAjuste(it.id, estado, carregar) }, icone("editar"), "Ajustar"),
          el("button", { class: "btn btn-pequeno", type: "button", onclick: () => arquivar(it) }, icone("arquivo"), "Arquivar"));
      }
      tbody.append(el("tr", { class: arquivadas ? "" : classeLinha(it) },
        el("td", { text: it.carteira_nome }),
        el("td", { text: it.municipio_nome || "Não identificado" }),
        el("td", { class: "col-conta" }, el("span", { class: "ident", text: it.conta }), it.corrigida ? el("span", { class: "marcador", title: `Ajuste manual (${it.campos_corrigidos || "movimentação"})`, text: "ajustada" }) : null),
        el("td", { class: "col-nome", text: it.nome, title: it.nome }),
        el("td", { class: "col-data", text: data(it.vencimento) }),
        el("td", { class: "col-valor", text: moeda(it.montante_centavos) }),
        el("td", { class: "col-forma", text: it.forma_pagamento || "—", title: it.forma_pagamento ? "" : "Sem informação" }),
        arquivadas
          ? el("td", { class: "pequeno", text: `${it.arquivada_motivo || ""} — ${it.arquivada_por || ""} em ${dataHora(it.arquivada_em)}` })
          : el("td", {}, el("span", { class: `situacao situacao-${it.situacao}`, text: it.situacao_rotulo })),
        controles,
      ));
    }
    rodape.append(paginacao(r.pagina, r.paginas, r.quantidade, r.tamanho, (p) => { f.pagina = p; carregar(); }));
  }

  async function arquivar(it) {
    const motivo = el("textarea", { rows: 3, maxlength: 500, placeholder: "Ex.: tratamento jurídico separado" });
    const ok = await confirmar("Arquivar fatura", [
      el("p", { text: `Conta ${it.conta} — ${it.nome} — vencimento ${data(it.vencimento)} — ${moeda(it.montante_centavos)}` }),
      el("p", { text: "A fatura sai das telas, totais e exportações normais. O histórico é preservado e ela pode ser restaurada em Arquivadas. Novas importações não a reativam." }),
      campo("Motivo (obrigatório)", motivo),
    ], { textoOk: "Arquivar", perigo: true });
    if (!ok) return;
    try { await post(`/api/admin/faturas/${it.id}/arquivar`, { motivo: motivo.value, versao: it.versao }); toast("Fatura arquivada.", "sucesso"); }
    catch (e) { toast(mensagemErro(e), "erro", 7000); }
    carregar();
  }

  async function restaurar(it) {
    const motivo = el("input", { type: "text", maxlength: 500, placeholder: "Opcional" });
    const ok = await confirmar("Restaurar fatura", [
      el("p", { text: `Conta ${it.conta} — ${it.nome} — vencimento ${data(it.vencimento)}. A fatura volta ao acompanhamento normal com pagamento, observação e ações preservados.` }),
      campo("Motivo", motivo),
    ], { textoOk: "Restaurar" });
    if (!ok) return;
    try { await post(`/api/admin/faturas/${it.id}/restaurar`, { motivo: motivo.value, versao: it.versao }); toast("Fatura restaurada.", "sucesso"); }
    catch (e) { toast(mensagemErro(e), "erro", 7000); }
    carregar();
  }

  await carregar();
}

// ------------------------------------------------------------ ajuste de um registro
export async function abrirAjuste(faturaId, estado, aoSalvar) {
  let fatura, municipios, historico;
  try {
    [fatura, municipios, historico] = await Promise.all([
      get(`/api/faturas/${faturaId}`), get("/api/admin/municipios"), get(`/api/faturas/${faturaId}/historico`),
    ]);
  } catch (e) { toast(mensagemErro(e), "erro"); return; }

  const conta = el("input", { type: "text", value: fatura.conta, inputmode: "numeric", class: "ident" });
  const nome = el("input", { type: "text", value: fatura.nome, maxlength: 300 });
  const venc = el("input", { type: "date", value: fatura.vencimento });
  const montante = el("input", { type: "text", value: centavosParaTexto(fatura.montante_centavos), inputmode: "decimal" });
  const forma = el("input", { type: "text", value: fatura.forma_pagamento, maxlength: 50, placeholder: "Sem informação" });
  const carteira = seletorCarteira(estado, null, { permitirTodas: false, valor: String(fatura.carteira_id) });
  const opMun = (fatura.municipio_id ? [] : [{ valor: "", rotulo: "Não identificado (manter sem município)" }])
    .concat(municipios.municipios.map((m) => ({ valor: String(m.id), rotulo: m.nome })));
  const municipio = seletorSimples(opMun, fatura.municipio_id ? String(fatura.municipio_id) : "", null, { "aria-label": "Município de destino" });
  const vinculo = el("input", { type: "checkbox" });
  const motivo = el("textarea", { rows: 2, maxlength: 500, placeholder: "Por que esta alteração está sendo feita?" });
  const erro = el("div", { class: "erro", role: "alert" });

  const hist = el("div", { class: "historico" }, el("h3", { text: "Histórico de alterações" }));
  if (!historico.historico.length) hist.append(el("p", { class: "vazio", text: "Sem alterações registradas." }));
  else hist.append(el("ul", { class: "lista-historico" }, ...historico.historico.map((h) => el("li", {},
    el("strong", { text: `${dataHora(h.criada_em)} · ${h.usuario} · ${NOMES_OPERACAO[h.operacao] || h.operacao}` }),
    h.motivo ? el("div", { text: `Motivo: ${h.motivo}` }) : null,
    h.antes || h.depois ? el("div", { class: "pequeno", text: `Antes: ${JSON.stringify(h.antes)}  →  Depois: ${JSON.stringify(h.depois)}` }) : null,
  ))));

  const salvar = el("button", { class: "btn btn-primario", type: "button" }, "Salvar alterações");
  const cancelar = el("button", { class: "btn", type: "button" }, "Cancelar");
  const conteudo = el("div", { class: "form-ajuste" },
    el("p", { class: "nota", text: `Fatura #${fatura.id} · ${fatura.carteira_nome} · ${fatura.municipio_nome || "Não identificado"} · ${fatura.situacao_rotulo}` }),
    el("h3", { text: "Dados da fatura" }),
    el("div", { class: "grade-2" },
      campo("Conta de contrato", conta), campo("Nome", nome), campo("Vencimento líquido", venc),
      campo("Montante (R$)", montante, "Ex.: 1.234,56"), campo("Forma de pagamento", forma)),
    el("h3", { text: "Destino" }),
    el("div", { class: "grade-2" }, campo("Carteira", carteira), campo("Município", municipio)),
    el("p", { class: "nota", text: "Mudar o município aqui move SOMENTE esta fatura. As demais faturas da conta não são alteradas." }),
    el("label", { class: "opcao" }, vinculo, " Também definir este município como vínculo padrão da conta (orienta as próximas importações)"),
    campo("Motivo (obrigatório)", motivo),
    erro,
    hist,
  );
  const m = abrirModal({ titulo: "Ajustar registro", conteudo, botoes: [cancelar, salvar], largura: "grande" });
  cancelar.addEventListener("click", m.fechar);
  salvar.addEventListener("click", async () => {
    erro.textContent = "";
    if (motivo.value.trim().length < 3) { erro.textContent = "Informe o motivo da alteração."; motivo.focus(); return; }
    const ok = await confirmar("Confirmar ajuste", "Gravar as alterações nesta fatura? Os valores anteriores ficam registrados no histórico.", { textoOk: "Gravar" });
    if (!ok) return;
    salvar.disabled = true; salvar.textContent = "Salvando...";
    try {
      await put(`/api/admin/faturas/${fatura.id}`, {
        conta: conta.value, nome: nome.value, vencimento: venc.value, montante: montante.value, forma_pagamento: forma.value,
        carteira_id: Number(carteira.value), municipio_id: municipio.value ? Number(municipio.value) : null,
        atualizar_vinculo_padrao: vinculo.checked, motivo: motivo.value, versao: fatura.versao,
      });
      toast("Registro ajustado.", "sucesso");
      m.fechar();
      if (aoSalvar) aoSalvar();
    } catch (e) {
      const det = e.dados && Array.isArray(e.dados.detalhes) ? " " + e.dados.detalhes.join(" ") : "";
      erro.textContent = (e.message || "Erro.") + det;
      if (e.status === 409) erro.textContent = "Esta fatura foi alterada por outro acesso desde que o ajuste foi aberto. Feche e abra o ajuste novamente para ver os dados atuais.";
    } finally { salvar.disabled = false; salvar.textContent = "Salvar alterações"; }
  });
}
