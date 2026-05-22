const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = __dirname;
const screensDir = path.join(ROOT, "screens");
const outDir = path.join(ROOT, "slides");

const W = 1080;
const H = 1350;

const C = {
  ink: "#171416",
  wine: "#531827",
  wine2: "#3b101c",
  paper: "#fffaf3",
  cream: "#f7efe2",
  gold: "#bfa984",
  muted: "#6f6760",
  line: "#e3d4bf",
  green: "#1f4038",
};

const slides = [
  {
    kicker: "CARTA VIVA",
    title: "Convierte tu carta de vinos en una herramienta de venta.",
    body: "No es subir un PDF. Es hacer que el cliente entienda, elija y pida mejor.",
    mode: "cover",
  },
  {
    kicker: "DEL QR AL PEDIDO",
    title: "Una carta pensada para decidir, no solo para mirar.",
    body: "Filtros claros, lectura rápida y una experiencia móvil que acompaña al servicio.",
    screen: "carta-carmen.png",
    mode: "phoneRight",
  },
  {
    kicker: "SALA",
    title: "Tu equipo recomienda con más criterio.",
    body: "Acceso privado para camareros: argumentos de venta, maridajes y referencias localizables en segundos.",
    screen: "camarero-carmen.png",
    mode: "phoneLeft",
  },
  {
    kicker: "GESTIÓN",
    title: "Actualiza vinos sin rehacer PDFs.",
    body: "Cambios de precio, stock, añadas y nuevas referencias desde un panel sencillo.",
    mode: "dashboard",
  },
  {
    kicker: "IMPORTACIÓN",
    title: "Partimos de tu carta real.",
    body: "PDF, foto o captura. Se carga una primera base y después se revisa con criterio profesional.",
    mode: "import",
  },
  {
    kicker: "LINK EN BIO",
    title: "Un hub propio para todo lo que hoy vive disperso.",
    body: "Reservas, carta restaurante, vinos, grupos, alérgenos y redes en una sola entrada.",
    screen: "hub-carmen.png",
    mode: "hubRight",
  },
  {
    kicker: "CONSULTORÍA",
    title: "Detecta oportunidades que normalmente pasan desapercibidas.",
    body: "Vino local, copas, postres, perfiles repetidos, DO ausentes y coherencia con ticket medio.",
    mode: "radar",
  },
  {
    kicker: "MÁLAGA",
    title: "Pensado para restaurantes que quieren diferenciarse.",
    body: "Más territorio, más relato y una carta que encaja con el tipo de cliente que quieres atraer.",
    mode: "malaga",
  },
  {
    kicker: "DEMO REAL",
    title: "No enseño una plantilla. Preparo una prueba con tu carta.",
    body: "Ves tu propia oferta funcionando en móvil antes de tomar una decisión.",
    mode: "demo",
  },
  {
    kicker: "CARTA VIVA",
    title: "Escríbeme “Carta Viva” y vemos tu caso en 15 minutos.",
    body: "Para restaurantes, hoteles boutique y espacios gastronómicos que quieren vender mejor el vino.",
    mode: "cta",
  },
];

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function textBlock(text, x, y, maxChars, size, color, weight = 500, lineHeight = 1.18, family = "Georgia, 'Times New Roman', serif") {
  const lines = wrap(text, maxChars);
  const tspans = lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * lineHeight}">${esc(line)}</tspan>`)
    .join("");
  return `<text y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" letter-spacing="0">${tspans}</text>`;
}

function base(slide, theme = "light") {
  const bg = theme === "dark" ? C.ink : C.paper;
  const fg = theme === "dark" ? C.paper : C.ink;
  const muted = theme === "dark" ? "#d6c7b4" : C.muted;
  return `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="${bg}"/>
      <rect x="48" y="48" width="${W - 96}" height="${H - 96}" rx="34" fill="none" stroke="${theme === "dark" ? "#3b342f" : C.line}" stroke-width="2"/>
      <text x="88" y="118" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="5" fill="${C.gold}">${esc(slide.kicker)}</text>
      <text x="88" y="1270" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700" fill="${muted}">cataconjuanjo.com</text>
      <circle cx="962" cy="1262" r="23" fill="${C.gold}"/>
      <text x="949" y="1272" font-family="Georgia, serif" font-size="32" font-weight="700" fill="${bg}">C</text>
      ${titleAndBody(slide, fg, muted)}
  `;
}

function titleAndBody(slide, fg, muted, x = 88, y = 250, titleChars = 24, bodyChars = 43) {
  return `
    ${textBlock(slide.title, x, y, titleChars, 66, fg, 600, 1.08)}
    ${textBlock(slide.body, x, y + 300, bodyChars, 34, muted, 500, 1.28, "Inter, Arial, sans-serif")}
  `;
}

function bullets(items, x, y, color = C.ink) {
  return items
    .map((item, i) => {
      const yy = y + i * 94;
      return `
        <circle cx="${x}" cy="${yy - 10}" r="9" fill="${C.gold}"/>
        ${textBlock(item, x + 34, yy, 34, 30, color, 650, 1.2, "Inter, Arial, sans-serif")}
      `;
    })
    .join("");
}

function closeSvg(svg) {
  return `${svg}</svg>`;
}

async function phoneComposite(screenName, x, y, width, height) {
  const screenPath = path.join(screensDir, screenName);
  const innerX = x + 22;
  const innerY = y + 28;
  const innerW = width - 44;
  const innerH = height - 56;
  const roundedMask = Buffer.from(`
    <svg width="${innerW}" height="${innerH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${innerW}" height="${innerH}" rx="34" fill="#fff"/>
    </svg>
  `);
  const resized = await sharp(screenPath)
    .resize(innerW, innerH, { fit: "cover", position: "top" })
    .composite([{ input: roundedMask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const frame = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <filter id="s" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="28" stdDeviation="26" flood-color="#171416" flood-opacity="0.20"/>
      </filter>
      <rect x="0" y="0" width="${width}" height="${height}" rx="54" fill="#101010" filter="url(#s)"/>
      <rect x="18" y="24" width="${width - 36}" height="${height - 48}" rx="40" fill="#fffaf3"/>
      <rect x="${width / 2 - 52}" y="14" width="104" height="12" rx="6" fill="#252525"/>
    </svg>
  `);
  return [
    { input: frame, left: x, top: y },
    { input: resized, left: innerX, top: innerY },
  ];
}

function dashboardSvg(slide) {
  let svg = base(slide);
  svg += `
    <rect x="88" y="760" width="904" height="348" rx="26" fill="#ffffff" stroke="${C.line}" stroke-width="2"/>
    <rect x="128" y="810" width="270" height="74" rx="16" fill="${C.cream}"/>
    <rect x="430" y="810" width="230" height="74" rx="16" fill="${C.cream}"/>
    <rect x="692" y="810" width="260" height="74" rx="16" fill="${C.cream}"/>
    <text x="154" y="857" font-family="Inter, Arial" font-size="28" font-weight="800" fill="${C.wine}">124 vinos</text>
    <text x="456" y="857" font-family="Inter, Arial" font-size="28" font-weight="800" fill="${C.green}">18 DO</text>
    <text x="718" y="857" font-family="Inter, Arial" font-size="28" font-weight="800" fill="${C.ink}">Stock vivo</text>
    <rect x="128" y="940" width="824" height="2" fill="${C.line}"/>
    <text x="128" y="994" font-family="Inter, Arial" font-size="27" font-weight="700" fill="${C.ink}">Referencia</text>
    <text x="520" y="994" font-family="Inter, Arial" font-size="27" font-weight="700" fill="${C.ink}">Precio</text>
    <text x="720" y="994" font-family="Inter, Arial" font-size="27" font-weight="700" fill="${C.ink}">Estado</text>
    <rect x="128" y="1030" width="824" height="2" fill="${C.line}"/>
    <text x="128" y="1078" font-family="Inter, Arial" font-size="25" fill="${C.muted}">Tinto local · 2022</text>
    <text x="520" y="1078" font-family="Inter, Arial" font-size="25" fill="${C.muted}">34 €</text>
    <rect x="720" y="1046" width="132" height="44" rx="22" fill="${C.green}"/>
    <text x="750" y="1076" font-family="Inter, Arial" font-size="20" font-weight="800" fill="#fff">Activo</text>
  `;
  return closeSvg(svg);
}

function importSvg(slide) {
  let svg = base(slide);
  svg += `
    <rect x="166" y="760" width="748" height="346" rx="30" fill="#ffffff" stroke="${C.line}" stroke-width="2"/>
    <rect x="214" y="814" width="186" height="238" rx="12" fill="${C.cream}" stroke="${C.line}"/>
    <rect x="246" y="858" width="122" height="12" rx="6" fill="${C.wine}"/>
    <rect x="246" y="898" width="98" height="10" rx="5" fill="${C.gold}"/>
    <rect x="246" y="932" width="112" height="10" rx="5" fill="${C.line}"/>
    <rect x="246" y="966" width="90" height="10" rx="5" fill="${C.line}"/>
    <path d="M445 935 H610" stroke="${C.gold}" stroke-width="8" stroke-linecap="round"/>
    <path d="M592 905 L632 935 L592 965" fill="none" stroke="${C.gold}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="680" y="820" width="176" height="56" rx="14" fill="${C.wine}"/>
    <rect x="680" y="908" width="176" height="56" rx="14" fill="${C.green}"/>
    <rect x="680" y="996" width="176" height="56" rx="14" fill="${C.ink}"/>
    <text x="706" y="856" font-family="Inter, Arial" font-size="22" font-weight="800" fill="#fff">PDF</text>
    <text x="706" y="944" font-family="Inter, Arial" font-size="22" font-weight="800" fill="#fff">Foto</text>
    <text x="706" y="1032" font-family="Inter, Arial" font-size="22" font-weight="800" fill="#fff">Captura</text>
  `;
  return closeSvg(svg);
}

function radarSvg(slide) {
  let svg = base(slide, "dark");
  svg += `
    <rect x="88" y="744" width="904" height="440" rx="30" fill="#221b1a" stroke="#4c3d35"/>
    <text x="132" y="812" font-family="Inter, Arial" font-size="28" font-weight="800" fill="${C.paper}">Radar de oportunidades</text>
    <rect x="132" y="860" width="690" height="18" rx="9" fill="#44342d"/>
    <rect x="132" y="860" width="508" height="18" rx="9" fill="${C.gold}"/>
    ${bullets(["Poca presencia de vino local", "Faltan vinos por copa estratégicos", "Demasiado Rioja/Ribera del mismo perfil"], 144, 946, C.paper)}
    <rect x="740" y="778" width="180" height="180" rx="90" fill="${C.wine}"/>
    <text x="786" y="888" font-family="Inter, Arial" font-size="58" font-weight="900" fill="${C.paper}">72</text>
  `;
  return closeSvg(svg);
}

function simpleSvg(slide, theme = "light", extra = "") {
  return closeSvg(base(slide, theme) + extra);
}

async function renderSlide(slide, index) {
  let svg;
  let composites = [];
  if (slide.mode === "cover") {
    svg = simpleSvg(
      slide,
      "dark",
      `
        <path d="M88 805 C260 732 365 880 526 812 C690 744 787 710 992 812" fill="none" stroke="${C.gold}" stroke-width="5" opacity=".9"/>
        <rect x="88" y="882" width="390" height="88" rx="44" fill="${C.paper}"/>
        <text x="132" y="937" font-family="Inter, Arial" font-size="27" font-weight="900" fill="${C.ink}">Para restaurantes</text>
        <rect x="506" y="882" width="280" height="88" rx="44" fill="${C.wine}"/>
        <text x="548" y="937" font-family="Inter, Arial" font-size="27" font-weight="900" fill="${C.paper}">y hoteles</text>
      `
    );
  } else if (slide.mode === "phoneRight") {
    svg = closeSvg(base(slide) + `<rect x="88" y="790" width="378" height="190" rx="28" fill="${C.wine}"/><text x="126" y="860" font-family="Inter, Arial" font-size="30" font-weight="900" fill="#fff">Menos fricción.</text><text x="126" y="910" font-family="Inter, Arial" font-size="30" font-weight="900" fill="#fff">Más pedidos.</text>`);
    composites = await phoneComposite(slide.screen, 590, 610, 342, 650);
  } else if (slide.mode === "hubRight") {
    svg = closeSvg(base(slide) + `<rect x="88" y="790" width="378" height="190" rx="28" fill="${C.wine}"/><text x="126" y="860" font-family="Inter, Arial" font-size="30" font-weight="900" fill="#fff">Un enlace.</text><text x="126" y="910" font-family="Inter, Arial" font-size="30" font-weight="900" fill="#fff">Todo claro.</text>`);
    composites = await phoneComposite(slide.screen, 590, 610, 342, 650);
  } else if (slide.mode === "phoneLeft") {
    svg = closeSvg(base(slide) + `<rect x="556" y="790" width="420" height="230" rx="28" fill="${C.green}"/><text x="596" y="858" font-family="Inter, Arial" font-size="29" font-weight="900" fill="#fff">Servicio privado</text><text x="596" y="910" font-family="Inter, Arial" font-size="26" fill="#efe7d8">para recomendar mejor en mesa.</text>`);
    composites = await phoneComposite(slide.screen, 118, 700, 342, 530);
  } else if (slide.mode === "dashboard") {
    svg = dashboardSvg(slide);
  } else if (slide.mode === "import") {
    svg = importSvg(slide);
  } else if (slide.mode === "radar") {
    svg = radarSvg(slide);
  } else if (slide.mode === "malaga") {
    svg = simpleSvg(
      slide,
      "light",
      `
        <rect x="88" y="780" width="904" height="300" rx="30" fill="${C.green}"/>
        <text x="132" y="862" font-family="Georgia, serif" font-size="58" font-weight="700" fill="${C.paper}">Territorio</text>
        <text x="132" y="928" font-family="Georgia, serif" font-size="58" font-weight="700" fill="${C.gold}">+ criterio</text>
        <text x="132" y="1012" font-family="Inter, Arial" font-size="29" fill="${C.paper}">Una carta con identidad vende mejor que una lista genérica.</text>
      `
    );
  } else if (slide.mode === "demo") {
    svg = simpleSvg(
      slide,
      "light",
      `
        <rect x="104" y="752" width="872" height="330" rx="28" fill="#fff" stroke="${C.line}" stroke-width="2"/>
        <text x="148" y="828" font-family="Inter, Arial" font-size="28" font-weight="900" fill="${C.wine}">Prueba con tus referencias</text>
        ${bullets(["Tu logo y colores", "Tus vinos y precios", "Tu enlace listo para enseñar"], 160, 906)}
      `
    );
  } else {
    svg = simpleSvg(
      slide,
      "dark",
      `
        <rect x="88" y="785" width="904" height="132" rx="66" fill="${C.paper}"/>
        <text x="180" y="867" font-family="Inter, Arial" font-size="38" font-weight="950" fill="${C.ink}">DM: Carta Viva</text>
        ${textBlock("Diagnóstico inicial gratuito para detectar si tu carta puede vender más y mejor.", 88, 1015, 50, 31, "#d6c7b4", 500, 1.25, "Inter, Arial, sans-serif")}
      `
    );
  }

  const output = path.join(outDir, `slide-${String(index + 1).padStart(2, "0")}.png`);
  await sharp(Buffer.from(svg)).composite(composites).png().toFile(output);
  return output;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < slides.length; i += 1) {
    const file = await renderSlide(slides[i], i);
    console.log(file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
