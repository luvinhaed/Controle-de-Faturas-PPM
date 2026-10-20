// Admin: importação de planilha, desfazer última importação, histórico e backup.
import { api, get, post } from "../api.js";
import { icone } from "../icones.js";
import { confirmar, data, dataHora, el, limpar, mensagemErro, moeda, plural, toast } from "../ui.js";

const ROTULOS_RESUMO = [
  ["novas", "Novas"], ["atualizadas", "Atualizadas"], ["sem_alteracoes", "Sem alterações"], ["conflitos", "Conflitos"],
  ["sem_municipio", "Sem município"], ["invalidas", "Inválidas"], ["ignoradas_total", "Ignoradas por carteira"],
];
const ROTULO_MONTANTE = ["ignoradas_montante", "Ignoradas por Montante vazio/traço"];
const rotulosResumo = (tipo) => (tipo === "ip" ? [...ROTULOS_RESUMO, ROTULO_MONTANTE] : ROTULOS_RESUMO);
const TIPOS = { comum: "Planilha de faturas", ip: "Iluminação Pública" };

export async function telaImportar(c, estado) {
  const areaImport = el("section", { class: "secao" });
  const areaReversao = el("section", { class: "secao" });
  const areaHistorico = el("section", { class: "secao" });
  const areaBackup = el("section", { class: "secao" });
  c.append(el("div", { class: "tela-cabecalho" }, el("h1", { text: "Importação de contas" })), areaImport, areaReversao, areaHistorico, areaBackup);

  // ------------------------------------------------------------ passo 1: arquivo
  function inicio() {
    limpar(areaImport);
    areaImport.append(
      el("h2", { text: "1. Escolher arquivo" }),
      el("p", { class: "instrucao", text: "Nada é gravado antes da sua confirmação. Escolha o botão que corresponde ao tipo de planilha." }),
      blocoArquivo({
        titulo: "Planilha de faturas",
        texto: "Planilha mensal (.xlsx). Conserva Conta de contrato, Nome, Vencimento líquido, Montante e Forma de pagamento (e a Carteira, para organizar o acesso).",
        botao: "Analisar arquivo", tipo: "comum",
      }),
      blocoArquivo({
        titulo: "Iluminação Pública (IP)",
        texto: "Planilha de IP (.xlsx). Usa somente a coluna Montante: linhas com Montante vazio ou traço (\"R$ -\") são ignoradas, mesmo que \"Montante real da fatura\" esteja preenchido. A carteira vem da coluna Responsavel e o nome é gravado como \"IP - {Nome}\".",
        botao: "Importar Iluminação Pública", tipo: "ip",
      }),
    );
  }

  function blocoArquivo({ titulo, texto, botao, tipo }) {
    const arquivo = el("input", { type: "file", accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "aria-label": `Arquivo .xlsx — ${titulo}` });
    const analisar = el("button", { class: "btn btn-primario", type: "button" }, icone("enviar"), botao);
    const erro = el("div", { class: "erro", role: "alert" });
    analisar.addEventListener("click", async () => {
      erro.textContent = "";
      if (!arquivo.files.length) { erro.textContent = "Escolha o arquivo .xlsx."; return; }
      const fd = new FormData(); fd.append("arquivo", arquivo.files[0]); fd.append("tipo", tipo);
      analisar.disabled = true; analisar.textContent = "Analisando...";
      try {
        const r = await api("POST", "/api/admin/importacao/arquivo", fd, { formulario: true });
        if (r.aba_sugerida) await mostrarPrevia(r.token, r.aba_sugerida, r.arquivo_nome);
        else escolherAba(r);
      } catch (e) {
        erro.textContent = mensagemErro(e);
        const det = e.dados && e.dados.detalhes;
        if (Array.isArray(det) && det.length && det[0].aba) {
          erro.append(el("ul", {}, ...det.map((d) => el("li", { text: `Aba "${d.aba}": faltam ${d.faltando.join(", ")}` }))));
        }
        analisar.disabled = false; analisar.textContent = botao;
      }
    });
    return el("div", { class: `caixa-form bloco-importacao bloco-${tipo}` },
      el("h3", { text: titulo }), el("p", { class: "nota", text: texto }),
      el("div", { class: "linha-controles" }, arquivo, analisar), erro);
  }

  // ------------------------------------------------------------ passo 2: aba
  function escolherAba(r) {
    limpar(areaImport);
    const validas = r.abas.filter((a) => a.valida);
    const sel = el("select", { "aria-label": "Aba" }, ...validas.map((a) => el("option", { value: a.nome, text: a.nome })));
    const ver = el("button", { class: "btn btn-primario", type: "button" }, "Ver prévia");
    areaImport.append(
      el("h2", { text: `2. Selecionar aba — ${TIPOS[r.tipo] || ""}` }),
      el("p", {}, "O arquivo ", el("strong", { text: r.arquivo_nome }), ` tem ${validas.length} abas com as colunas necessárias. Escolha qual importar.`),
      r.abas.some((a) => !a.valida) ? el("p", { class: "nota", text: `Abas sem as colunas necessárias (não importáveis): ${r.abas.filter((a) => !a.valida).map((a) => a.nome).join(", ")}` }) : null,
      el("div", { class: "linha-controles" }, sel, ver, botaoCancelar(r.token)),
    );
    ver.addEventListener("click", async () => {
      ver.disabled = true; ver.textContent = "Carregando prévia...";
      try { await mostrarPrevia(r.token, sel.value, r.arquivo_nome); }
      catch (e) { toast(mensagemErro(e), "erro", 8000); ver.disabled = false; ver.textContent = "Ver prévia"; }
    });
  }

  function botaoCancelar(token) {
    return el("button", { class: "btn", type: "button", onclick: async () => {
      try { await post("/api/admin/importacao/cancelar", { token }); } catch { /* ignora */ }
      inicio();
    } }, "Cancelar");
  }

  // ------------------------------------------------------------ passos 3 a 5: prévia, conflitos e confirmação
  async function mostrarPrevia(token, aba, nomeArquivo) {
    limpar(areaImport).append(el("p", { class: "carregando", text: `Lendo ${nomeArquivo}...` }));
    let p;
    try { p = await post("/api/admin/importacao/previa", { token, aba }); }
    catch (e) { limpar(areaImport).append(el("p", { class: "erro", text: mensagemErro(e) })); areaImport.append(el("button", { class: "btn", onclick: inicio }, "Escolher outro arquivo")); return; }
    const decisoes = {};
    const confirmarBtn = el("button", { class: "btn btn-primario", type: "button" }, icone("enviar"), "Confirmar importação");
    const aceitarRep = el("input", { type: "checkbox" });
    const situacaoConf = el("span", { class: "nota" });
    const contadores = el("div", { class: "resumo-importacao" });

    function atualizarResumo() {
      const r = { ...p.resumo };
      const escolhas = Object.values(decisoes);
      r.novas += escolhas.filter((x) => x === "nova").length;
      r.atualizadas = escolhas.filter((x) => x === "atualizar").length;
      r.sem_alteracoes += escolhas.filter((x) => x === "ignorar").length;
      limpar(contadores);
      for (const [k, rot] of rotulosResumo(p.tipo)) {
        const v = r[k] || 0;
        const cls = k === "conflitos" && v ? "alerta" : k === "invalidas" && v ? "alerta" : "";
        contadores.append(el("div", { class: `contador-resumo ${cls}` }, el("strong", { text: v.toLocaleString("pt-BR") }), el("span", { text: rot })));
      }
      const faltam = p.conflitos.length - escolhas.length;
      const repetidoOk = !p.repetido.some((x) => x.status === "aplicada") || aceitarRep.checked;
      confirmarBtn.disabled = faltam > 0 || !repetidoOk || p.nenhuma_elegivel;
      situacaoConf.textContent = p.nenhuma_elegivel ? "Nenhuma linha elegível: não há o que importar." : faltam > 0 ? `Resolva ${plural(faltam, "conflito", "conflitos")} para confirmar.` : (!repetidoOk ? "Marque a confirmação de arquivo repetido." : "Pronto para confirmar.");
    }

    limpar(areaImport);
    areaImport.append(
      el("h2", { text: "3. Prévia e resumo" }),
      el("div", { class: "arquivo-info" }, icone("arquivo"), el("strong", { text: p.arquivo_nome }),
        el("span", { class: `tipo-lote tipo-${p.tipo}`, text: p.tipo_rotulo }),
        el("span", { text: ` · aba "${p.aba}" · ${plural(p.resumo.linhas_validas, "linha elegível", "linhas elegíveis")}` })),
      el("p", { class: "nota", text: "Confira os registros afetados antes de confirmar." }),
      contadores,
    );
    if (p.nenhuma_elegivel) {
      areaImport.append(el("div", { class: "faixa-alerta" },
        el("p", {}, el("strong", { text: "Nenhuma linha deste arquivo é elegível para importação." })),
        el("p", { text: p.tipo === "ip"
          ? "Para Iluminação Pública, só entram linhas com Responsavel igual a uma das quatro carteiras e com valor numérico na coluna Montante. Linhas com Montante vazio ou traço (\"R$ -\") são ignoradas, mesmo com \"Montante real da fatura\" preenchido."
          : "Confira as linhas inválidas e as ignoradas por carteira abaixo." }),
        el("p", { text: "Nada será gravado e nenhum lote será criado: a última importação continua disponível para Desfazer." })));
    }
    const repetidosAplicados = p.repetido.filter((x) => x.status === "aplicada");
    if (p.repetido.length) {
      areaImport.append(el("div", { class: repetidosAplicados.length ? "faixa-alerta" : "faixa-info" },
        el("p", {}, el("strong", { text: repetidosAplicados.length ? "Atenção: este arquivo já foi importado." : "Este arquivo já foi importado antes, mas aquela importação foi desfeita." })),
        el("ul", {}, ...p.repetido.map((x) => el("li", { text: `${TIPOS[x.tipo_importacao] || ""}: ${x.arquivo_nome} em ${dataHora(x.criada_em)} por ${x.usuario} (${x.tipo === "arquivo" ? "mesmo arquivo" : "mesmo conteúdo"}, ${x.status})` }))),
        repetidosAplicados.length ? el("label", { class: "opcao" }, aceitarRep, " Entendo e quero importar novamente (registros idênticos não serão duplicados)") : null,
      ));
      aceitarRep.addEventListener("change", atualizarResumo);
    }
    const ignoradas = Object.entries(p.resumo.ignoradas_por_carteira);
    if (ignoradas.length) {
      areaImport.append(el("p", { class: "nota", text: `Ignoradas por carteira (fora das quatro carteiras): ${ignoradas.map(([k, v]) => `${k}: ${v}`).join(" · ")}` }));
    }
    if (p.resumo.ignoradas_montante) {
      areaImport.append(el("p", { class: "nota", text: `Ignoradas por Montante vazio/traço: ${p.resumo.ignoradas_montante} (a coluna "Montante real da fatura" não é usada).` }));
    }
    if (p.colunas_descartadas.length) {
      areaImport.append(el("p", { class: "nota", text: `Colunas descartadas (não são armazenadas): ${p.colunas_descartadas.join(", ")}` }));
    }

    // conflitos
    if (p.conflitos.length) {
      const lista = el("div", { class: "conflitos" });
      areaImport.append(el("h2", { text: `4. Resolver conflitos (${p.conflitos.length})` }),
        el("p", { class: "instrucao", text: "Mesma conta de contrato e mesmo vencimento com dados diferentes. Nada é sobrescrito ou somado sem a sua decisão; a decisão fica registrada para que a mesma reimportação não gere duplicações." }),
        el("div", { class: "linha-controles" },
          el("span", { text: "Aplicar a todos: " }),
          ...["atualizar", "nova", "ignorar"].map((op) => el("button", { class: "btn btn-pequeno", type: "button", onclick: () => {
            lista.querySelectorAll(`input[value="${op}"]`).forEach((r) => { r.checked = true; r.dispatchEvent(new Event("change")); });
          } }, { atualizar: "Atualizar existentes", nova: "Manter como outras faturas", ignorar: "Ignorar linhas" }[op]))),
        lista);
      for (const cf of p.conflitos) lista.append(desenharConflito(cf, decisoes, atualizarResumo));
    }

    // erros
    if (p.erros.length) {
      areaImport.append(el("h3", { text: `Linhas inválidas (${p.resumo.invalidas}) — não serão importadas` }),
        el("div", { class: "tabela-caixa tabela-baixa" }, el("table", { class: "tabela tabela-compacta" },
          el("thead", {}, el("tr", {}, el("th", { text: "Linha" }), el("th", { text: "Campo" }), el("th", { text: "Valor" }), el("th", { text: "Motivo" }))),
          el("tbody", {}, ...p.erros.map((e) => el("tr", {}, el("td", { text: e.linha }), el("td", { text: e.campo }), el("td", { class: "ident", text: e.valor }), el("td", { text: e.motivo })))))),
        p.erros_total > p.erros.length ? el("p", { class: "nota", text: `Mostrando ${p.erros.length} de ${p.erros_total} erros.` }) : null);
    }
    // contas sem município
    if (p.contas_sem_municipio.length) {
      areaImport.append(el("h3", { text: `Contas sem município (${p.contas_sem_municipio.length})` }),
        el("p", { class: "nota", text: `Serão importadas normalmente e aparecerão em "Contas sem município" para associação: ${p.contas_sem_municipio.join(", ")}` }));
    }
    // amostra de novas
    if (p.amostra_novas.length) {
      areaImport.append(el("h3", { text: `Novas faturas (${p.resumo.novas}${p.resumo.novas > p.amostra_novas.length ? `; mostrando ${p.amostra_novas.length}` : ""})` }),
        el("div", { class: "tabela-caixa tabela-baixa" }, el("table", { class: "tabela tabela-compacta" },
          el("thead", {}, el("tr", {}, ...["Linha", "Conta de contrato", "Nome", "Vencimento líquido", "Montante", "Forma de pagamento", "Carteira", ""].map((t) => el("th", { text: t })))),
          el("tbody", {}, ...p.amostra_novas.map((n) => el("tr", {},
            el("td", { text: n.linha }), el("td", { class: "ident", text: n.conta }), el("td", { text: n.nome }),
            el("td", { text: data(n.vencimento) }), el("td", { class: "col-valor", text: moeda(n.montante_centavos) }),
            el("td", { class: "col-forma", text: n.forma_pagamento || "—" }), el("td", { text: n.carteira }), el("td", { class: "pequeno", text: n.sem_municipio ? "sem município" : "" })))))));
    }

    areaImport.append(el("h2", { text: "5. Confirmar" }), el("div", { class: "linha-controles barra-confirmar" }, confirmarBtn, botaoCancelar(token), situacaoConf));
    atualizarResumo();

    confirmarBtn.addEventListener("click", async () => {
      if (confirmarBtn.disabled) return;
      const ok = await confirmar("Confirmar importação", `Gravar a importação de ${p.arquivo_nome}? A operação é feita de uma só vez e pode ser desfeita depois em "Desfazer última importação".`, { textoOk: "Confirmar importação" });
      if (!ok) return;
      confirmarBtn.disabled = true; confirmarBtn.textContent = "Gravando importação...";
      try {
        const r = await post("/api/admin/importacao/confirmar", { token, aba, decisoes, impressao: p.impressao, aceitar_repetido: aceitarRep.checked });
        resultado(r);
        carregarReversao(); carregarHistorico();
      } catch (e) {
        toast(mensagemErro(e), "erro", 10000);
        if (e.status === 409 && /mudaram/.test(e.message)) { await mostrarPrevia(token, aba, nomeArquivo); return; }
        if (e.status === 409 && /já foi confirmada/.test(e.message)) { inicio(); carregarReversao(); carregarHistorico(); return; }
        confirmarBtn.disabled = false; confirmarBtn.textContent = "Confirmar importação";
      }
    });
  }

  function resultado(r) {
    limpar(areaImport).append(
      el("div", { class: "faixa-sucesso" }, el("strong", { text: `Importação concluída (${r.tipo_rotulo}): ${r.arquivo_nome}` })),
      el("div", { class: "resumo-importacao" }, ...rotulosResumo(r.tipo).map(([k, rot]) => el("div", { class: "contador-resumo" }, el("strong", { text: (r[k] || 0).toLocaleString("pt-BR") }), el("span", { text: rot })))),
      r.conflitos ? el("p", { class: "nota", text: `Conflitos: ${r.conflitos_atualizar} atualizadas, ${r.conflitos_nova} mantidas como outras faturas, ${r.conflitos_ignorar} ignoradas.` }) : null,
      r.sem_municipio ? el("p", { class: "nota", text: `${plural(r.sem_municipio, "fatura ficou", "faturas ficaram")} sem município: resolva em "Contas sem município".` }) : null,
      el("button", { class: "btn btn-primario", type: "button", onclick: inicio }, "Importar outro arquivo"),
    );
    toast("Importação concluída.", "sucesso");
  }

  // ------------------------------------------------------------ desfazer última importação
  async function carregarReversao() {
    limpar(areaReversao).append(el("h2", { text: "Desfazer última importação" }), el("p", { class: "carregando", text: "Carregando..." }));
    let info;
    try { info = (await get("/api/admin/importacoes/reversao")).reversao; }
    catch (e) { limpar(areaReversao).append(el("h2", { text: "Desfazer última importação" }), el("p", { class: "erro", text: mensagemErro(e) })); return; }
    limpar(areaReversao).append(el("h2", { text: "Desfazer última importação" }));
    if (!info) { areaReversao.append(el("p", { class: "vazio", text: "Nenhuma importação para desfazer." })); return; }
    const decisoes = {};
    const botao = el("button", { class: "btn btn-perigo", type: "button" }, icone("desfazer"), "Desfazer última importação");
    const caixa = el("div", { class: "caixa-reversao" },
      el("div", { class: "arquivo-info" }, icone("arquivo"), el("strong", { text: info.arquivo_nome }),
        el("span", { class: `tipo-lote tipo-${info.tipo}`, text: info.tipo_rotulo }),
        el("span", { text: ` · ${dataHora(info.criada_em)} · por ${info.usuario} · ${plural(info.criadas, "registro criado", "registros criados")} · ${plural(info.atualizadas, "registro atualizado", "registros atualizados")}` })),
      el("h3", { text: "Consequências da reversão" }),
      el("ul", {}, ...info.consequencias.map((t) => el("li", { text: t }))),
    );
    if (info.conflitos.length) {
      caixa.append(el("div", { class: "faixa-alerta" },
        el("p", {}, el("strong", { text: `${plural(info.conflitos.length, "fatura recebeu", "faturas receberam")} trabalho depois da importação.` }),
          " A reversão automática está bloqueada até você decidir o que fazer com cada uma."),
        el("table", { class: "tabela tabela-compacta" },
          el("thead", {}, el("tr", {}, ...["Linha", "Conta", "Vencimento", "Montante", "O que aconteceu", "Decisão"].map((t) => el("th", { text: t })))),
          el("tbody", {}, ...info.conflitos.map((cf) => {
            const sel = el("select", { "aria-label": "Decisão" }, el("option", { value: "", text: "Escolha..." }),
              ...Object.entries(cf.opcoes).map(([v, t]) => el("option", { value: v, text: t })));
            sel.addEventListener("change", () => { if (sel.value) decisoes[cf.item_id] = sel.value; else delete decisoes[cf.item_id]; atualizar(); });
            return el("tr", {}, el("td", { text: cf.linha }), el("td", { class: "ident", text: cf.fatura.conta }),
              el("td", { text: data(cf.fatura.vencimento) }), el("td", { class: "col-valor", text: moeda(cf.fatura.montante_centavos) }),
              el("td", { text: `${cf.tipo === "criada" ? "Criada por este lote" : "Atualizada por este lote"}: ${cf.motivos.join("; ")}` }), el("td", {}, sel));
          })))));
    }
    const situacao = el("span", { class: "nota" });
    const atualizar = () => {
      const faltam = info.conflitos.filter((cf) => !decisoes[cf.item_id]).length;
      botao.disabled = faltam > 0;
      situacao.textContent = faltam ? `Decida sobre ${plural(faltam, "fatura", "faturas")} para liberar a reversão.` : "";
    };
    caixa.append(el("div", { class: "linha-controles" }, botao, situacao));
    areaReversao.append(caixa);
    atualizar();
    botao.addEventListener("click", async () => {
      const ok = await confirmar("Desfazer última importação", [
        el("p", {}, `Desfazer a importação (${info.tipo_rotulo}) de `, el("strong", { text: info.arquivo_nome }), ` (${dataHora(info.criada_em)})?`),
        el("ul", {}, ...info.consequencias.map((t) => el("li", { text: t }))),
      ], { textoOk: "Desfazer importação", perigo: true });
      if (!ok) return;
      botao.disabled = true; botao.textContent = "Desfazendo (criando backup)...";
      try {
        const r = await post(`/api/admin/importacoes/${info.importacao_id}/desfazer`, { decisoes });
        toast(`Importação desfeita: ${r.removidas} removida(s), ${r.restauradas} restaurada(s), ${r.mantidas} mantida(s). Backup: ${r.backup}`, "sucesso", 10000);
      } catch (e) { toast(mensagemErro(e), "erro", 10000); }
      carregarReversao(); carregarHistorico();
    });
  }

  // ------------------------------------------------------------ histórico
  async function carregarHistorico() {
    limpar(areaHistorico).append(el("h2", { text: "Histórico de importações" }));
    let lista;
    try { lista = (await get("/api/admin/importacoes")).importacoes; }
    catch (e) { areaHistorico.append(el("p", { class: "erro", text: mensagemErro(e) })); return; }
    if (!lista.length) { areaHistorico.append(el("p", { class: "vazio", text: "Nenhuma importação realizada ainda." })); return; }
    areaHistorico.append(el("div", { class: "tabela-caixa tabela-baixa" }, el("table", { class: "tabela tabela-compacta" },
      el("thead", {}, el("tr", {}, ...["#", "Tipo", "Arquivo", "Aba", "Data/hora", "Usuário", "Novas", "Atualizadas", "Sem alt.", "Conflitos", "Sem mun.", "Inválidas", "Ignoradas", "Situação"].map((t) => el("th", { text: t })))),
      el("tbody", {}, ...lista.map((i) => el("tr", {},
        el("td", { text: i.id }), el("td", { text: TIPOS[i.tipo] || i.tipo }), el("td", { text: i.arquivo_nome }), el("td", { text: i.aba }), el("td", { text: dataHora(i.criada_em) }), el("td", { text: i.usuario }),
        ...["novas", "atualizadas", "sem_alteracoes", "conflitos", "sem_municipio", "invalidas", "ignoradas_total"].map((k) => el("td", { class: "col-num", text: i.resumo[k] ?? 0 })),
        el("td", { text: i.status === "revertida" ? `Desfeita em ${dataHora(i.revertida_em)} por ${i.revertida_por}` : "Aplicada" })))))));
  }

  // ------------------------------------------------------------ backup
  async function carregarBackup() {
    limpar(areaBackup).append(el("h2", { text: "Backup" }));
    const baixar = el("button", { class: "btn btn-secundario", type: "button" }, icone("baixar"), "Baixar backup completo (.json)");
    const arquivo = el("input", { type: "file", accept: ".json,application/json", "aria-label": "Arquivo de backup" });
    const restaurar = el("button", { class: "btn btn-perigo", type: "button" }, icone("desfazer"), "Restaurar backup");
    areaBackup.append(
      el("p", { class: "instrucao", text: "Baixa uma cópia completa dos dados (faturas, ações, municípios, vínculos, particularidades, importações e histórico) para o seu computador. Guarde os arquivos em local seguro: eles contêm dados reais. O Supabase também mantém backups próprios, conforme o plano contratado." }),
      baixar,
      el("h3", { text: "Restaurar a partir de um arquivo de backup" }),
      el("p", { class: "nota", text: "Substitui TODOS os dados atuais pelos do arquivo escolhido (usuários e senhas não são alterados). Baixe um backup do estado atual antes de restaurar." }),
      el("div", { class: "linha-controles" }, arquivo, restaurar),
    );
    baixar.addEventListener("click", async () => {
      baixar.disabled = true;
      try { const r = await post("/api/admin/backups"); toast(`Backup baixado: ${r.arquivo}`, "sucesso", 7000); }
      catch (e) { toast(mensagemErro(e), "erro"); }
      baixar.disabled = false;
    });
    restaurar.addEventListener("click", async () => {
      if (!arquivo.files.length) { toast("Escolha o arquivo de backup (.json).", "erro"); return; }
      const conf = el("input", { type: "text", placeholder: "RESTAURAR", "aria-label": "Confirmação" });
      const ok = await confirmar("Restaurar backup", [
        el("p", {}, "Todos os dados atuais serão substituídos pelos do arquivo ", el("strong", { text: arquivo.files[0].name }), "."),
        el("p", { text: "Para confirmar, digite RESTAURAR:" }), conf,
      ], { textoOk: "Restaurar", perigo: true });
      if (!ok) return;
      const fd = new FormData(); fd.append("arquivo", arquivo.files[0]); fd.append("confirmacao", conf.value.trim());
      restaurar.disabled = true; restaurar.textContent = "Restaurando...";
      try {
        const r = await api("POST", "/api/admin/backups/restaurar", fd, { formulario: true });
        toast(`Backup restaurado (${r.registros.faturas} faturas).`, "sucesso", 8000);
        carregarReversao(); carregarHistorico();
      } catch (e) { toast(mensagemErro(e), "erro", 9000); }
      restaurar.disabled = false; restaurar.textContent = "Restaurar backup";
    });
  }

  inicio();
  await Promise.all([carregarReversao(), carregarHistorico(), carregarBackup()]);
}

function desenharConflito(cf, decisoes, aoMudar) {
  const nomeGrupo = `conf-${cf.linha}`;
  const p = cf.planilha;
  const corpo = el("div", { class: "conflito" },
    el("div", { class: "conflito-topo" }, el("strong", { text: `Linha ${cf.linha}` }), el("span", { class: "ident", text: ` · Conta ${p.conta}` }), el("span", { text: ` · Vencimento ${data(p.vencimento)}` })),
    el("p", { class: "nota", text: cf.descricao }),
  );
  if (cf.tipo === "divergente") {
    const ex = cf.existente;
    const avisos = [];
    if (ex.campos_corrigidos || ex.municipio_manual || ex.carteira_manual) avisos.push("possui ajuste manual do admin");
    if (ex.paga) avisos.push("está marcada como paga");
    if (ex.qtd_acoes) avisos.push(`tem ${ex.qtd_acoes} ação(ões) registrada(s)`);
    if (ex.arquivada) avisos.push("está arquivada");
    const fmt = (campo, v) => campo === "Montante" ? moeda(v) : (v || "—");
    corpo.append(el("table", { class: "tabela tabela-compacta comparacao" },
      el("thead", {}, el("tr", {}, el("th", { text: "Campo" }), el("th", { text: "Recebido anteriormente" }), el("th", { text: "Nesta planilha" }))),
      el("tbody", {}, ...cf.diferencas.map((d) => el("tr", {}, el("td", { text: d.campo }), el("td", { text: fmt(d.campo, d.atual) }), el("td", { class: "destaque", text: fmt(d.campo, d.planilha) })))),
    ));
    corpo.append(el("p", { class: "pequeno", text: `Fatura atual no sistema: ${ex.nome} · ${moeda(ex.montante_centavos)} · ${ex.forma_pagamento || "—"} · ${ex.carteira_nome} · ${ex.municipio_nome || "Não identificado"}` }));
    if (avisos.length) corpo.append(el("p", { class: "alerta", text: `Atenção: a fatura existente ${avisos.join(", ")}. Pagamento, observação e ações são preservados em qualquer opção.` }));
  } else {
    corpo.append(el("p", { class: "pequeno", text: `Dados desta linha: ${p.nome} · ${moeda(p.montante_centavos)} · ${p.forma_pagamento || "—"} · ${p.carteira}` }));
  }
  const opcoes = el("div", { class: "opcoes-conflito", role: "radiogroup" });
  for (const op of cf.opcoes) {
    const r = el("input", { type: "radio", name: nomeGrupo, value: op });
    r.addEventListener("change", () => { if (r.checked) { decisoes[String(cf.linha)] = op; corpo.classList.add("decidido"); aoMudar(); } });
    opcoes.append(el("label", { class: "opcao" }, r, ` ${cf.rotulos[op]}`));
  }
  corpo.append(opcoes);
  return corpo;
}
