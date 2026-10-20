// Ícones SVG simples (traço), embutidos localmente — sem CDN, sem emojis.
const NS = "http://www.w3.org/2000/svg";
const CAMINHOS = {
  pasta: ["M3 7h18v12H3z", "M8 7V5h8v2", "M3 12h18"],
  engrenagem: ["M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"],
  olho: ["M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  baixar: ["M12 3v12", "M7 10l5 5 5-5", "M4 19h16"],
  enviar: ["M12 15V3", "M7 8l5-5 5 5", "M4 19h16"],
  mais: ["M12 5v14", "M5 12h14"],
  nota: ["M6 3h9l4 4v14H6z", "M14 3v5h5", "M9 13h7", "M9 17h5"],
  lixo: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
  desfazer: ["M9 14L4 9l5-5", "M4 9h11a5 5 0 0 1 0 10h-3"],
  colar: ["M9 4h6v3H9z", "M7 5H5v16h14V5h-2"],
  seta: ["M5 12h14", "M13 6l6 6-6 6"],
  arquivo: ["M3 4h18v4H3z", "M5 8v12h14V8", "M10 12h4"],
  editar: ["M4 20h4L19 9l-4-4L4 16z", "M13 7l4 4"],
};

export function icone(nome, classe = "icone") {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", classe);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of CAMINHOS[nome] || []) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}
