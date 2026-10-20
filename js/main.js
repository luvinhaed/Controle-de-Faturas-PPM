import { definirAoExpirar, get, post, qs } from "./api.js";
import { el, limpar, mensagemErro, toast } from "./ui.js";
import { icone } from "./icones.js";
import { telaFaturas } from "./telas/faturas.js";
import { telaRegua } from "./telas/regua.js";
import { telaSemMunicipio } from "./telas/sem_municipio.js";
import { telaImportar } from "./telas/admin_importar.js";
import { telaRegistros } from "./telas/admin_registros.js";
import { telaMunicipios } from "./telas/admin_municipios.js";

export const estado = {
  usuario: null, carteiras: [], hoje: "", catalogo: [], logo: null,
  carteiraSel: "",           // admin: carteira escolhida nos filtros ("" = todas)
  pendentes: 0,
  filtros: {},               // filtros lembrados por tela
};

const ROTAS = {
  "faturas": { titulo: "Faturas", tela: telaFaturas },
  "regua": { titulo: "Régua de cobrança", tela: telaRegua },
  "sem-municipio": { titulo: "Contas sem município", tela: telaSemMunicipio },
  "importar": { titulo: "Importar planilha", tela: telaImportar, admin: true },
  "registros": { titulo: "Gerenciar registros", tela: (c, e) => telaRegistros(c, e, false), admin: true },
  "arquivadas": { titulo: "Arquivadas", tela: (c, e) => telaRegistros(c, e, true), admin: true },
  "municipios": { titulo: "Gerenciar municípios e contas", tela: telaMunicipios, admin: true },
};

const raiz = () => document.getElementById("app");

function logo(classe = "") {
  if (estado.logo) return el("img", { src: estado.logo, alt: "Equatorial", class: `logo ${classe}` });
  // Ponto de substituição: coloque o arquivo oficial em marca/logo.svg (ou logo.png) no site publicado.
  return el("span", { class: `logo-texto ${classe}`, title: "Logo oficial não instalada (ver marca/LEIA-ME.txt)", text: "Equatorial" });
}

// ------------------------------------------------------------ login
async function telaLogin(mensagem) {
  const r = raiz(); limpar(r);
  document.title = "Controle de Faturas do Poder Público";
  let acessos = [];
  try {
    const d = await get("/api/publico/acessos");
    acessos = d.acessos; estado.logo = d.logo;
  } catch (e) {
    r.append(el("div", { class: "login-erro", text: mensagemErro(e) }));
    return;
  }
  let escolhido = null;
  const senha = el("input", { type: "password", id: "senha", autocomplete: "current-password", disabled: true, placeholder: "Escolha um acesso acima" });
  const ver = el("button", { type: "button", class: "btn-olho", title: "Mostrar senha", "aria-label": "Mostrar senha", onclick: () => { senha.type = senha.type === "password" ? "text" : "password"; } }, icone("olho"));
  const entrar = el("button", { type: "submit", class: "btn btn-primario btn-largo", disabled: true }, "Entrar");
  const aviso = el("div", { class: "login-aviso", role: "alert" }, mensagem || "");
  const botoesCarteira = el("div", { class: "login-carteiras" });
  const botaoAdmin = el("div", { class: "login-admin" });

  const marcar = (a, botao) => {
    escolhido = a;
    r.querySelectorAll(".btn-acesso").forEach((b) => b.classList.remove("selecionado"));
    botao.classList.add("selecionado");
    senha.disabled = false; entrar.disabled = false;
    senha.placeholder = `Senha de ${a.rotulo}`;
    aviso.textContent = a.senha_configurada ? "" : "Este acesso ainda não foi configurado no Supabase. Peça ao administrador (tutorial, etapa de usuários).";
    senha.value = ""; senha.focus();
  };
  for (const a of acessos) {
    const b = el("button", { type: "button", class: a.perfil === "admin" ? "btn btn-acesso btn-acesso-admin" : "btn btn-acesso" },
      icone(a.perfil === "admin" ? "engrenagem" : "pasta", "icone icone-acesso"), el("span", { text: a.rotulo }));
    b.addEventListener("click", () => marcar(a, b));
    (a.perfil === "admin" ? botaoAdmin : botoesCarteira).append(b);
  }
  const form = el("form", { class: "login-form" },
    el("label", { for: "senha", class: "campo-rotulo", text: "Senha" }),
    el("div", { class: "senha-linha" }, senha, ver),
    entrar,
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!escolhido) return;
    entrar.disabled = true; entrar.textContent = "Entrando...";
    try {
      await post("/api/login", { login: escolhido.login, senha: senha.value });
      location.hash = "#/faturas";
      await iniciar();
    } catch (e) {
      aviso.textContent = mensagemErro(e);
      entrar.disabled = false; entrar.textContent = "Entrar";
      senha.select();
    }
  });
  r.append(el("div", { class: "login-pagina" },
    el("header", { class: "topo" }, el("div", { class: "marca" }, logo()), el("div", { class: "sistema", text: "Controle de Faturas do Poder Público" })),
    el("main", { class: "login-caixa" },
      el("h1", { text: "Acesse sua carteira" }),
      el("p", { class: "sub", text: "Selecione a carteira para continuar" }),
      botoesCarteira,
      el("hr"),
      botaoAdmin,
      form,
      aviso,
    ),
    el("footer", { class: "login-rodape", text: "Servidor local" }),
  ));
}

// ------------------------------------------------------------ estrutura logada
export async function atualizarPendentes() {
  try {
    const d = await get(`/api/municipios${qs({ carteira: estado.usuario.perfil === "admin" ? estado.carteiraSel : "" })}`);
    estado.pendentes = d.pendentes;
  } catch { /* contador não é crítico */ }
  const cont = document.getElementById("contador-pendentes");
  if (cont) cont.textContent = ` (${estado.pendentes})`;
}

function montarEstrutura() {
  const r = raiz(); limpar(r);
  const admin = estado.usuario.perfil === "admin";
  const sair = el("button", { class: "btn btn-topo", onclick: async () => { try { await post("/api/logout"); } catch { /* ignora */ } estado.usuario = null; location.hash = ""; telaLogin(); } }, "Sair");
  const nav = el("nav", { class: "abas", "aria-label": "Navegação principal" });
  for (const [rota, cfg] of Object.entries(ROTAS)) {
    if (cfg.admin && !admin) continue;
    const a = el("a", { href: `#/${rota}`, "data-rota": rota }, cfg.titulo);
    if (rota === "sem-municipio") a.append(el("span", { id: "contador-pendentes", text: ` (${estado.pendentes})` }));
    if (rota === "importar") nav.append(el("span", { class: "abas-separador", "aria-hidden": "true" }));
    nav.append(a);
  }
  r.append(
    el("header", { class: "topo" },
      el("div", { class: "marca" }, logo()),
      el("div", { class: "sistema", text: "Controle de Faturas do Poder Público" }),
      el("div", { class: "topo-direita" },
        el("span", { class: "usuario-rotulo", title: "Acesso atual", text: estado.usuario.rotulo }),
        sair),
    ),
    nav,
    el("main", { id: "conteudo", class: "conteudo" }),
  );
}

async function rotear() {
  if (!estado.usuario) return;
  const rota = (location.hash.replace(/^#\/?/, "").split("?")[0]) || "faturas";
  const cfg = ROTAS[rota];
  if (!cfg || (cfg.admin && estado.usuario.perfil !== "admin")) { location.hash = "#/faturas"; return; }
  document.querySelectorAll(".abas a").forEach((a) => a.classList.toggle("ativa", a.dataset.rota === rota));
  document.title = `${cfg.titulo} · Controle de Faturas`;
  const conteudo = document.getElementById("conteudo");
  limpar(conteudo);
  try {
    await cfg.tela(conteudo, estado);
  } catch (e) {
    conteudo.append(el("div", { class: "erro-tela" }, el("p", { text: mensagemErro(e) }),
      el("button", { class: "btn", onclick: rotear }, "Tentar novamente")));
  }
  atualizarPendentes();
}

async function iniciar() {
  try {
    const s = await get("/api/sessao");
    if (!s.usuario) return telaLogin();
    estado.usuario = s.usuario; estado.hoje = s.hoje; estado.carteiras = s.carteiras;
    const cat = await get("/api/acoes/catalogo");
    estado.catalogo = cat.acoes;
    if (!estado.logo) { try { estado.logo = (await get("/api/publico/acessos")).logo; } catch { /* sem logo */ } }
  } catch (e) {
    if (e.status === 401) return telaLogin();
    limpar(raiz()).append(el("div", { class: "erro-tela" }, el("p", { text: mensagemErro(e) }), el("button", { class: "btn", onclick: iniciar }, "Tentar novamente")));
    return;
  }
  montarEstrutura();
  if (!location.hash || location.hash === "#" || location.hash === "#/") location.hash = "#/faturas";
  else await rotear();
}

definirAoExpirar((msg) => {
  if (!estado.usuario) return;
  estado.usuario = null;
  document.querySelectorAll(".modal-fundo, .painel-fundo").forEach((m) => m.remove());
  telaLogin(msg || "Sua sessão expirou. Entre novamente.");
});
window.addEventListener("hashchange", rotear);
window.addEventListener("unhandledrejection", (ev) => { toast(mensagemErro(ev.reason), "erro"); });
iniciar();
