(function () {
  const STOPWORDS = new Set([
    "a", "ao", "aos", "aquela", "aquelas", "aquele", "aqueles", "aquilo", "as", "até", "com",
    "como", "da", "das", "de", "dela", "dele", "deles", "depois", "do", "dos", "e", "ela",
    "ele", "eles", "em", "entre", "era", "essa", "essas", "esse", "esses", "esta", "está",
    "estava", "este", "estes", "foi", "há", "isso", "isto", "já", "lhe", "mais", "mas", "me",
    "mesmo", "muito", "na", "não", "nas", "nem", "no", "nos", "o", "os", "ou", "para", "pela",
    "pelas", "pelo", "pelos", "por", "que", "quem", "se", "sem", "seu", "seus", "só", "sua",
    "suas", "também", "tem", "tinha", "um", "uma", "você", "vos", "eu"
  ]);

  const tierColors = {
    principal: "#9d3c2f",
    secundário: "#36546d",
    apoio: "#8b8074",
  };
  const SOUNDTRACK_STORAGE_KEY = "valjian-soundtrack-settings-v1";
  const GEMINI_STORAGE_KEY = "valjian-gemini-settings-v1";
  const DEFAULT_SOUNDTRACK_VOLUME = 0.2;
  const GEMINI_MODEL = "gemini-2.5-flash";
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const VALJEAN_WORLDVIEW_BRIEF = [
    "Jean Valjean fala como um homem contido, humilde e grave.",
    "Ele foi marcado pelas galés, pela vergonha pública, pelo perdão que recebeu do bispo e pelo dever de proteger Cosette.",
    "Sua visão do mundo tende à misericórdia, ao trabalho, à dignidade dos pobres, à desconfiança diante da dureza da lei e à responsabilidade moral."
  ].join(" ");
  const GEMINI_SYSTEM_INSTRUCTION = [
    "Você é Jean Valjean respondendo em português.",
    "Sua fonte única são os trechos do livro Os Miseráveis fornecidos na mensagem do usuário.",
    "Fale em primeira pessoa quando fizer sentido, com fraseado simples e direto, sem tom literário exagerado.",
    "Não use conhecimento externo, adaptação, crítica, resumo geral do romance nem fatos fora dos trechos.",
    "Não cite capítulo, página, trecho, fonte, evidência, passagem nem diga que está usando trechos; use o livro apenas internamente para responder.",
    "Não despeje fragmentos do livro, não cole frases soltas e não responda como uma lista de excertos; responda sempre em prosa contínua.",
    "Só afirme fatos que Jean Valjean viu, soube diretamente ou pode inferir com muita cautela a partir dos trechos.",
    "Se a pergunta pedir um fato específico fora do alcance desses trechos ou do conhecimento de Jean Valjean, diga claramente que você não sabe ou que só pode especular.",
    "Se a pergunta for uma saudação, conversa breve ou pedido de opinião geral, responda naturalmente como Jean Valjean com base em sua visão de mundo no romance, sem inventar fatos concretos.",
    "Se a pergunta for sobre o próprio nome, apelidos, identidades ou nomes sob os quais você viveu, responda de modo direto e completo com base nas informações fornecidas.",
    "Considere o histórico recente da conversa para entender perguntas curtas de continuação, como 'mas quais outros?' ou 'por que não disse antes?'.",
    "Termine sempre a última frase; não pare no meio da resposta.",
    "Nunca invente fatos, intenções, cronologia, relações ou desfechos.",
    "Responda em no máximo 2 parágrafos curtos, sem lista, sem markdown e sem aspas."
  ].join(" ");
  const soundtrackPlaylist = [
    { src: "./assets/audio/music_1.mp3", title: "Look Down" },
    { src: "./assets/audio/music_2.mp3", title: "Look Down" },
  ];
  const valjeanAliases = [
    "jean valjean",
    "valjean",
    "madelaine",
    "madeleine",
    "senhor madelaine",
    "senhor madeleine",
    "monsieur madelaine",
    "monsieur madeleine",
    "senhor leblanc",
  ].map((alias) => normalize(alias));
  const characterDisplayNames = {
    "Mário": "Mário Pontmercy",
  };
  const cityNotes = {
    "Paris": "Capital da França, no norte do país. É o grande centro urbano do romance: concentra Mário, Cosette, os estudantes, a barricada e boa parte da reta final de Jean Valjean.",
    "Waterloo": "Fica na atual Bélgica, ao sul de Bruxelas. Entra no livro pela digressão sobre a batalha e ajuda a ligar história europeia, guerra e destino de personagens como Thenardier.",
    "Montreuil-sur-Mer": "Cidade do norte da França, perto do Canal da Mancha. É onde Jean Valjean vive como senhor Madelaine, monta a fábrica e cruza decisivamente com Fantine e Javert.",
    "Luxemburgo": "Aqui o nome se refere ao Jardim do Luxemburgo, em Paris. É um espaço de passeio, observação e encontro, importante para as cenas de Mário e Cosette.",
    "Digne": "Cidade do sudeste da França, nos Alpes da Alta Provença. É onde o romance começa com o bispo Myriel e a primeira grande virada da vida de Jean Valjean.",
    "Picpus": "Bairro de Paris. É onde fica o convento de Petit-Picpus, um espaço de refúgio e ocultação para Jean Valjean e Cosette.",
    "Austerlitz": "Refere-se à ponte e à área de Austerlitz, em Paris. Aparece ligada a deslocamentos pela cidade e ao eixo leste da narrativa parisiense.",
    "Arras": "Cidade do norte da França. É o lugar do julgamento de Champmathieu, quando Jean Valjean precisa decidir se revela ou não sua identidade.",
    "Toulon": "Porto do sul da França, no Mediterrâneo. É onde ficam as galés que marcam o passado penal de Jean Valjean.",
    "Montfermeil": "Cidade a leste de Paris. É onde Cosette vive com os Thenardier e onde Jean Valjean a encontra criança.",
    "Vernon": "Cidade da Normandia, a oeste de Paris. Surge mais como ponto de referência e deslocamento do que como palco central da ação.",
    "Bruxelas": "Capital da Bélgica. Aparece no contexto europeu do romance, sobretudo ao redor de Waterloo e das referências históricas.",
    "Londres": "Capital do Reino Unido. Entra como referência externa, política e comercial, mais lateral do que os espaços franceses centrais.",
    "Pontarlier": "Cidade do leste da França, perto da fronteira suíça. Aparece no eixo de fuga, fronteira e circulação."
  };
  const characterPortraits = {
    "Jean Valjean": "./assets/os_miseraveis_imagens/jean_valjean.png",
    "Mário": "./assets/os_miseraveis_imagens/mario.png",
    "Cosette": "./assets/os_miseraveis_imagens/cosette.png",
    "Thenardier": "./assets/os_miseraveis_imagens/thenardier.png",
    "Javert": "./assets/os_miseraveis_imagens/javert.png",
    "Gavroche": "./assets/os_miseraveis_imagens/gavroche.png",
    "Fauchelevent": "./assets/os_miseraveis_imagens/fauchelevent.png",
    "Gillenormand": "./assets/os_miseraveis_imagens/gillenormand.png",
    "Enjolras": "./assets/os_miseraveis_imagens/enjolras.png",
    "Fantine": "./assets/os_miseraveis_imagens/fantine.png",
    "Courfeyrac": "./assets/os_miseraveis_imagens/courfeyrac.png",
    "Eponina": "./assets/os_miseraveis_imagens/eponina.png",
  };

  const characterGlossary = {
    "Jean Valjean": "Condenado por roubar pão, sai do presídio, reconstrói a vida sob o nome de senhor Madelaine, socorre Fantine e passa a proteger Cosette enquanto tenta escapar da perseguição de Javert.",
    "Fantine": "Mãe de Cosette. Depois de ser abandonada por Tholomyés, perde trabalho, dinheiro e saúde para sustentar a filha entregue aos Thenardier, até ser acolhida tarde demais por Valjean.",
    "Javert": "Inspetor de polícia moldado por uma ideia rígida de ordem. Persegue Jean Valjean desde Montreuil-sur-Mer e funciona como contraponto entre a lei e a misericórdia.",
    "Cosette": "Filha de Fantine. Surge como criança explorada na estalagem dos Thenardier, é resgatada por Valjean e se torna o centro afetivo da vida dele e do romance amoroso com Mário.",
    "Thenardier": "Estalajadeiro oportunista, depois ladrão e chantagista. Explora Cosette quando ela é criança e reaparece em vários momentos ligados ao crime, ao cálculo e à extorsão.",
    "Mário": "Jovem de origem burguesa criado pelo avô Gillenormand. Aproxima-se dos estudantes revolucionários, apaixona-se por Cosette e entra no núcleo decisivo da barricada. Nesta edição em português, o personagem aparece como Mário ou Mário Pontmercy; no original francês, é Marius Pontmercy.",
    "Gillenormand": "Avô materno de Mário, monarquista e autoritário. Representa o mundo conservador e familiar de que Mário tenta se afastar antes da reconciliação final.",
    "Gavroche": "Menino de rua espirituoso e independente, filho abandonado dos Thenardier. Circula por Paris com autonomia e ganha destaque nas cenas da barricada.",
    "Fauchelevent": "Homem que Valjean salva quando ainda é senhor Madelaine. Mais tarde retribui ajudando Valjean e Cosette a entrar e viver escondidos no convento.",
    "Tholomyés": "Jovem burguês frívolo que seduz Fantine e a abandona. Sua saída do enredo desencadeia a queda social da mãe de Cosette.",
    "Eponina": "Filha dos Thenardier. Cresce na miséria, vive nas ruas de Paris e mantém com Mário uma relação marcada por desejo, lealdade e renúncia.",
    "Enjolras": "Líder estudantil republicano das barricadas. Está ligado menos à vida doméstica do romance e mais ao projeto político e insurrecional do grupo.",
    "Courfeyrac": "Amigo próximo de Mário entre os estudantes. Faz a ponte entre Mário e o círculo revolucionário e aparece com frequência nas cenas coletivas da barricada.",
    "Montparnasse": "Jovem criminoso elegante e violento, ligado ao submundo parisiense e aos esquemas de Thenardier. Surge nas passagens de emboscada, roubo e conspiração.",
    "Combeferre": "Estudante e companheiro de Enjolras, menos inflamado e mais racional. Representa no grupo a face reflexiva e humanista da política.",
    "Mabeuf": "Velho vizinho pobre ligado à memória do pai de Mário. Sua ruína material o aproxima do núcleo trágico da revolta e da barricada.",
    "Grantaire": "Companheiro cético e desordenado dos estudantes revolucionários. Contrasta com Enjolras por duvidar da causa, mas permanece ao lado dele no desfecho.",
    "Bossuet": "Estudante do grupo dos Amigos do ABC, conhecido pelo azar e pelo humor. Aparece sobretudo nas conversas e preparativos que cercam a barricada.",
    "Bispo Myriel": "Bispo de Digne que acolhe Jean Valjean no início do romance. O gesto de perdão com a prata redefine o rumo moral do protagonista.",
    "Toussaint": "Criada simples e leal da casa de Valjean e Cosette em Paris. Marca o cotidiano mais doméstico e recolhido da fase final do romance.",
  };

  let chapterState = { part: "all", book: "all", chapterId: null, query: "" };
  let chapterPayload = [];
  let overviewPayload = null;
  let chatIndex = null;
  let chatTopics = [];
  let chatRuntime = null;
  let soundtrackController = null;
  let activeInteractionKey = null;
  let characterAliasDetails = new Map();

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const [overview, chapters, chatData] = await Promise.all([
      fetchJSON("./data/overview.json"),
      fetchJSON("./data/chapters.json"),
      fetchJSON("./data/valjean-chat.json"),
    ]);

    overviewPayload = overview;
    chapterPayload = chapters;
    characterAliasDetails = buildCharacterAliasDetails(overview.characters);

    renderHero(overview);
    renderPartRibbon(overview.parts);
    renderCharacterBars(overview.characters, overview.meta.chapters);
    renderInteractionSection(overview.characters, overview.interactions);
    renderCities(overview.cities);
    renderSettings(overview.settings);
    renderDescriptorGrid(overview.characters);
    renderCriticalReading(overview);
    renderMethodology(overview.methodology, overview.characters);
    initChapterExplorer(overview.parts, chapters);
    initChat(chatData, overview);
    initSoundtrack();
    bindCharacterNoteDismiss();
  }

  async function fetchJSON(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Falha ao carregar ${url}`);
    }
    return response.json();
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("pt-BR").format(value);
  }

  function normalize(text) {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function tokenize(text) {
    return normalize(text)
      .split(/\s+/)
      .filter((token) => token && !STOPWORDS.has(token));
  }

  function shorten(text, limit = 220) {
    const value = String(text || "").trim();
    if (value.length <= limit) {
      return value;
    }
    return `${value.slice(0, limit - 1).trimEnd().replace(/[ ,;:]+$/, "")}…`;
  }

  function escapeHTML(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeRegExp(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function joinLabels(items) {
    if (!items.length) return "";
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} e ${items[1]}`;
    return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function colorForTier(tier) {
    return tierColors[tier] || tierColors.apoio;
  }

  function buildCharacterAliasDetails(characters) {
    const details = new Map();
    characters.forEach((character) => {
      const seen = new Set();
      const aliases = [];
      (character.aliases || []).forEach((alias) => {
        const key = normalize(alias);
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        aliases.push(alias);
      });
      const canonicalKey = normalize(character.name);
      const extras = aliases.filter((alias) => normalize(alias) !== canonicalKey);
      details.set(character.name, { aliases, extras });
    });
    return details;
  }

  function formatAliasLabel(alias) {
    return String(alias || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function getCharacterAliasNote(name) {
    const extras = characterAliasDetails.get(name)?.extras || [];
    if (!extras.length) {
      return "";
    }
    const labels = extras.map(formatAliasLabel);
    return `Nesta leitura, as contagens também reúnem outras formas desse nome ou identidade: ${joinLabels(labels)}.`;
  }

  function getCharacterNote(name) {
    const baseNote = characterGlossary[name] || "";
    const aliasNote = getCharacterAliasNote(name);
    if (baseNote && aliasNote) {
      return `${baseNote} ${aliasNote}`;
    }
    return baseNote || aliasNote;
  }

  function getCharacterDisplayName(name) {
    return characterDisplayNames[name] || name;
  }

  function buildCharacterPortrait(name, variant = "default") {
    const src = characterPortraits[name];
    if (!src) {
      return null;
    }
    const image = document.createElement("img");
    image.className = `character-portrait character-portrait-${variant}`;
    image.src = src;
    image.alt = `Retrato de ${getCharacterDisplayName(name)}`;
    image.loading = "lazy";
    return image;
  }

  function buildCharacterIdentity(name, variant = "default") {
    const identity = document.createElement("div");
    identity.className = `character-identity character-identity-${variant}`;
    const portrait = buildCharacterPortrait(name, variant);
    if (portrait) {
      identity.appendChild(portrait);
    }
    identity.appendChild(buildCharacterReference(name));
    return identity;
  }

  function highlightInteractionExcerpt(text, names) {
    const sourceText = String(text || "");
    const aliases = [];
    const seen = new Set();

    names.forEach((name) => {
      const details = characterAliasDetails.get(name);
      const values = details?.aliases?.length ? details.aliases : [name];
      values.forEach((alias) => {
        const key = normalize(alias);
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        aliases.push(alias);
      });
    });

    if (!aliases.length) {
      return escapeHTML(text);
    }

    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])(${aliases
        .sort((left, right) => right.length - left.length)
        .map((alias) => escapeRegExp(alias))
        .join("|")})(?![\\p{L}\\p{N}])`,
      "giu"
    );

    let result = "";
    let lastIndex = 0;
    let found = false;

    for (const match of sourceText.matchAll(pattern)) {
      found = true;
      result += escapeHTML(sourceText.slice(lastIndex, match.index));
      result += `<mark class="interaction-name-highlight">${escapeHTML(match[0])}</mark>`;
      lastIndex = match.index + match[0].length;
    }

    if (!found) {
      return escapeHTML(sourceText);
    }

    result += escapeHTML(sourceText.slice(lastIndex));
    return result;
  }

  function highlightDescriptorExcerpt(text, word) {
    const sourceText = String(text || "");
    const target = String(word || "").trim();
    if (!target) {
      return escapeHTML(sourceText);
    }

    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])(${escapeRegExp(target)})(?![\\p{L}\\p{N}])`,
      "giu"
    );

    let result = "";
    let lastIndex = 0;
    let found = false;

    for (const match of sourceText.matchAll(pattern)) {
      found = true;
      result += escapeHTML(sourceText.slice(lastIndex, match.index));
      result += `<mark class="descriptor-term-highlight">${escapeHTML(match[0])}</mark>`;
      lastIndex = match.index + match[0].length;
    }

    if (!found) {
      return escapeHTML(sourceText);
    }

    result += escapeHTML(sourceText.slice(lastIndex));
    return result;
  }

  function buildTierTag(tier) {
    const span = document.createElement("span");
    span.className = `tier-tag tier-${tier}`;
    span.textContent = tier;
    return span;
  }

  function formatShare(value, total) {
    if (!total) return "0%";
    return new Intl.NumberFormat("pt-BR", {
      style: "percent",
      maximumFractionDigits: 0,
    }).format(value / total);
  }

  function buildChapterShare(count, total, options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = `chapter-share${options.compact ? " chapter-share-compact" : ""}`;
    wrapper.style.setProperty("--share-color", options.color || "var(--secondary)");

    const label = document.createElement("div");
    label.className = "chapter-share-label";
    label.innerHTML = `<span>${formatNumber(count)} de ${formatNumber(total)} capítulos</span><strong>${formatShare(count, total)}</strong>`;

    const bar = document.createElement("div");
    bar.className = "chapter-share-bar";

    const fill = document.createElement("span");
    fill.className = "chapter-share-fill";
    fill.style.width = `${Math.max(0, Math.min(100, (count / total) * 100))}%`;

    bar.appendChild(fill);
    wrapper.append(label, bar);
    return wrapper;
  }

  function formatMentionBookCount(mentions, unit) {
    const fullBooks = Math.floor(mentions / unit);
    const remainder = mentions % unit;
    if (!fullBooks && !remainder) {
      return "0 livros";
    }
    if (!remainder) {
      return `${formatNumber(fullBooks)} ${fullBooks === 1 ? "livro" : "livros"}`;
    }
    if (!fullBooks) {
      return `${formatNumber(remainder)}% de 1 livro`;
    }
    return `${formatNumber(fullBooks)} ${fullBooks === 1 ? "livro" : "livros"} e ${formatNumber(remainder)}% do último`;
  }

  function buildMentionBooks(mentions, unit, tier) {
    const wrapper = document.createElement("div");
    wrapper.className = "mention-books";
    wrapper.setAttribute("aria-hidden", "true");

    const fullBooks = Math.floor(mentions / unit);
    const remainder = mentions % unit;
    const count = fullBooks + (remainder > 0 ? 1 : 0);

    Array.from({ length: fullBooks }).forEach(() => {
      const book = document.createElement("span");
      book.className = "mention-book";
      book.style.setProperty("--book-color", colorForTier(tier));
      book.style.setProperty("--book-fill", "1");
      wrapper.appendChild(book);
    });

    if (remainder > 0) {
      const partialBook = document.createElement("span");
      partialBook.className = "mention-book mention-book-partial";
      partialBook.style.setProperty("--book-color", colorForTier(tier));
      partialBook.style.setProperty("--book-fill", String(remainder / unit));
      wrapper.appendChild(partialBook);
    }

    return {
      wrapper,
      count,
      fullBooks,
      remainder,
      description: formatMentionBookCount(mentions, unit),
    };
  }

  function formatPageRange(pageStart, pageEnd) {
    if (pageStart == null) {
      return "";
    }
    if (pageEnd != null && pageEnd > pageStart) {
      return `p. ${pageStart}-${pageEnd}`;
    }
    return `p. ${pageStart}`;
  }

  function buildPassageCitation(source, options = {}) {
    const pageLabel = formatPageRange(source.pageStart, source.pageEnd);
    const bits = [];
    if (options.includeChapter !== false && source.chapterTitle) {
      bits.push(source.chapterTitle);
    }
    if (pageLabel) {
      bits.push(pageLabel);
    }
    if (!bits.length) {
      return null;
    }

    const citation = document.createElement("div");
    citation.className = `excerpt-citation${options.compact ? " excerpt-citation-compact" : ""}`;
    citation.textContent = bits.join(" — ");
    return citation;
  }

  function buildInfoReference(labelText, note, ariaLabel) {
    const reference = document.createElement("span");
    reference.className = "character-ref info-ref";

    const label = document.createElement("span");
    label.className = "character-ref-name";
    label.textContent = labelText;
    reference.appendChild(label);

    if (!note) {
      return reference;
    }

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "character-note-trigger";
    trigger.setAttribute("aria-label", ariaLabel);
    trigger.setAttribute("title", note);
    trigger.textContent = "i";

    const bubble = document.createElement("span");
    bubble.className = "character-note-bubble";
    bubble.setAttribute("role", "tooltip");
    bubble.textContent = note;

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const shouldOpen = !reference.classList.contains("is-open");
      closeInfoNotes(reference);
      reference.classList.toggle("is-open", shouldOpen);
    });

    reference.append(trigger, bubble);
    return reference;
  }

  function buildCharacterReference(name) {
    return buildInfoReference(
      getCharacterDisplayName(name),
      getCharacterNote(name),
      `Quem é ${name}?`
    );
  }

  function getCityNote(name) {
    return cityNotes[name] || "";
  }

  function buildCityReference(name) {
    return buildInfoReference(
      name,
      getCityNote(name),
      `Onde fica ${name} e qual é seu contexto na história?`
    );
  }

  function appendJoinedCharacterReferences(container, names) {
    names.forEach((name, index) => {
      if (index > 0) {
        container.appendChild(document.createTextNode(index === names.length - 1 ? " e " : ", "));
      }
      container.appendChild(buildCharacterReference(name));
    });
  }

  function closeInfoNotes(exception = null) {
    document.querySelectorAll(".info-ref.is-open").forEach((node) => {
      if (node !== exception) {
        node.classList.remove("is-open");
      }
    });
  }

  function bindCharacterNoteDismiss() {
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".info-ref")) {
        closeInfoNotes();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeInfoNotes();
      }
    });
  }

  function interactionKey(source, target) {
    const sourceName = typeof source === "string" ? source : source.id;
    const targetName = typeof target === "string" ? target : target.id;
    return [sourceName, targetName].sort().join("::");
  }

  function getInteractionNetworkConfig(width) {
    if (width >= 980) {
      return { characterLimit: 16, linkLimit: 40, height: 540 };
    }
    if (width >= 760) {
      return { characterLimit: 14, linkLimit: 32, height: 500 };
    }
    return { characterLimit: 10, linkLimit: 20, height: 460 };
  }

  function renderInteractionSection(characters, interactions) {
    const container = document.querySelector("#network-chart");
    const width = container.clientWidth || 760;
    const config = getInteractionNetworkConfig(width);
    const visibleCharacters = characters.slice(0, config.characterLimit).map((character) => ({
      id: character.name,
      mentions: character.mentions,
      tier: character.tier,
    }));
    const nodeIds = new Set(visibleCharacters.map((node) => node.id));
    const visibleInteractions = interactions
      .filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target))
      .slice(0, config.linkLimit);
    const selectorInteractions = visibleInteractions.slice(0, 8);

    if (!selectorInteractions.length) {
      container.innerHTML = '<div class="empty-state">Sem relações suficientes neste recorte.</div>';
      document.querySelector("#interaction-detail").innerHTML = "";
      return;
    }

    if (!activeInteractionKey || !selectorInteractions.some((link) => interactionKey(link.source, link.target) === activeInteractionKey)) {
      activeInteractionKey = interactionKey(selectorInteractions[0].source, selectorInteractions[0].target);
    }

    renderInteractionNetwork(visibleCharacters, visibleInteractions, config, activeInteractionKey);
    renderInteractionDetail(
      selectorInteractions.find((link) => interactionKey(link.source, link.target) === activeInteractionKey) || selectorInteractions[0],
      selectorInteractions
    );
  }

  function renderHero(overview) {
    const stats = [
      { value: overview.meta.chapters, label: "capítulos" },
      { value: overview.meta.books, label: "livros internos" },
      { value: overview.meta.parts, label: "partes" },
      { value: overview.meta.pdfPages, label: "páginas na versão digital do livro" },
    ];

    const structureContainer = document.querySelector("#hero-structure");
    structureContainer.textContent =
      `Estrutura usada nesta leitura: ${formatNumber(overview.meta.parts)} partes, ${formatNumber(overview.meta.books)} livros internos e ${formatNumber(overview.meta.chapters)} capítulos.`;

    const statsContainer = document.querySelector("#hero-stats");
    statsContainer.innerHTML = "";
    stats.forEach((item) => {
      const chip = document.createElement("div");
      chip.className = "stat-chip";
      chip.innerHTML = `<strong>${formatNumber(item.value)}</strong><span>${item.label}</span>`;
      statsContainer.appendChild(chip);
    });
  }

  function loadSoundtrackSettings() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(SOUNDTRACK_STORAGE_KEY) || "{}");
      const volume = typeof parsed.volume === "number" ? clamp(parsed.volume, 0, 1) : DEFAULT_SOUNDTRACK_VOLUME;
      return {
        index: Number.isInteger(parsed.index) ? clamp(parsed.index, 0, soundtrackPlaylist.length - 1) : 0,
        volume: parsed.userAdjustedVolume ? volume : Math.min(DEFAULT_SOUNDTRACK_VOLUME, volume),
        userAdjustedVolume: Boolean(parsed.userAdjustedVolume),
        collapsed: Boolean(parsed.collapsed),
      };
    } catch (_error) {
      return {
        index: 0,
        volume: DEFAULT_SOUNDTRACK_VOLUME,
        userAdjustedVolume: false,
        collapsed: false,
      };
    }
  }

  function saveSoundtrackSettings(state) {
    window.localStorage.setItem(SOUNDTRACK_STORAGE_KEY, JSON.stringify({
      index: state.index,
      volume: state.volume,
      userAdjustedVolume: state.userAdjustedVolume,
      collapsed: Boolean(state.collapsed),
    }));
  }

  function loadChatSettings() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(GEMINI_STORAGE_KEY) || "{}");
      const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";
      return { apiKey };
    } catch (_error) {
      return { apiKey: "" };
    }
  }

  function saveChatSettings(state) {
    window.localStorage.setItem(GEMINI_STORAGE_KEY, JSON.stringify({
      apiKey: state.apiKey,
    }));
  }

  function initSoundtrack() {
    const soundPlayer = document.querySelector("#sound-player");
    const audio = document.querySelector("#soundtrack-audio");
    const title = document.querySelector("#soundtrack-title");
    const status = document.querySelector("#soundtrack-status");
    const toggle = document.querySelector("#soundtrack-toggle");
    const next = document.querySelector("#soundtrack-next");
    const volumeInput = document.querySelector("#soundtrack-volume");
    const minimize = document.querySelector("#soundtrack-minimize");
    const spotifyToggle = document.querySelector("#soundtrack-spotify-toggle");
    const spotifyPanel = document.querySelector("#soundtrack-spotify-panel");
    const spotifyClose = document.querySelector("#soundtrack-spotify-close");

    if (!soundPlayer || !audio || !title || !status || !toggle || !next || !volumeInput || !minimize || !spotifyToggle || !spotifyPanel || !spotifyClose) {
      return;
    }

    const stored = loadSoundtrackSettings();
    soundtrackController = {
      soundPlayer,
      audio,
      title,
      status,
      toggle,
      next,
      volumeInput,
      minimize,
      spotifyToggle,
      spotifyPanel,
      spotifyClose,
      index: stored.index,
      volume: stored.volume,
      userAdjustedVolume: stored.userAdjustedVolume,
      collapsed: stored.collapsed,
      userPaused: false,
      autoplayBlocked: false,
    };

    audio.volume = stored.volume;
    audio.loop = false;
    volumeInput.value = String(Math.round(stored.volume * 100));

    const applyTrack = (index, shouldPlay = false) => {
      soundtrackController.index = index;
      const track = soundtrackPlaylist[index];
      title.textContent = track.title;
      audio.src = track.src;
      audio.load();
      saveSoundtrackSettings(soundtrackController);
      if (shouldPlay) {
        soundtrackController.userPaused = false;
        tryPlay("Tocando.");
      } else {
        setSoundtrackStatus(`Faixa atual: ${track.title}.`);
      }
    };

    const updateToggle = () => {
      const isPlaying = !audio.paused;
      toggle.textContent = isPlaying ? "Pausar" : "Tocar";
      toggle.setAttribute("aria-pressed", String(isPlaying));
    };

    const updateMinimizeControl = () => {
      const collapsed = Boolean(soundtrackController.collapsed);
      soundPlayer.classList.toggle("is-collapsed", collapsed);
      minimize.textContent = collapsed ? "+" : "−";
      minimize.setAttribute("aria-expanded", String(!collapsed));
      minimize.setAttribute("title", collapsed ? "Expandir player (M)" : "Minimizar player (M)");
    };

    const setSpotifyPanelOpen = (isOpen) => {
      spotifyPanel.hidden = !isOpen;
      spotifyToggle.textContent = isOpen ? "Fechar player do Spotify" : "Abrir player do Spotify";
      spotifyToggle.setAttribute("aria-expanded", String(isOpen));
    };

    const setSoundtrackStatus = (message) => {
      status.textContent = message;
    };

    const removeAutoplayFallback = () => {
      document.removeEventListener("pointerdown", handleAutoplayFallback);
      document.removeEventListener("keydown", handleAutoplayFallback);
    };

    const handleAutoplayFallback = () => {
      if (!soundtrackController.autoplayBlocked || soundtrackController.userPaused) {
        removeAutoplayFallback();
        return;
      }
      tryPlay("Trilha iniciada na sua primeira interação.");
    };

    const tryPlay = (successMessage) => {
      const playAttempt = audio.play();
      if (!playAttempt || typeof playAttempt.then !== "function") {
        setSoundtrackStatus(successMessage);
        updateToggle();
        return;
      }
      playAttempt
        .then(() => {
          soundtrackController.autoplayBlocked = false;
          setSoundtrackStatus(successMessage);
          updateToggle();
          removeAutoplayFallback();
        })
        .catch(() => {
          soundtrackController.autoplayBlocked = true;
          updateToggle();
          setSoundtrackStatus("Autoplay bloqueado. Toque para iniciar.");
          document.addEventListener("pointerdown", handleAutoplayFallback, { once: true });
          document.addEventListener("keydown", handleAutoplayFallback, { once: true });
        });
    };

    const setCollapsed = (value) => {
      soundtrackController.collapsed = Boolean(value);
      if (soundtrackController.collapsed) {
        setSpotifyPanelOpen(false);
      }
      updateMinimizeControl();
      saveSoundtrackSettings(soundtrackController);
    };

    const toggleCollapsed = () => {
      setCollapsed(!soundtrackController.collapsed);
    };

    const isEditableTarget = (target) => Boolean(
      target instanceof HTMLElement
      && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))
    );

    audio.addEventListener("play", updateToggle);
    audio.addEventListener("pause", updateToggle);
    audio.addEventListener("ended", () => {
      const nextIndex = (soundtrackController.index + 1) % soundtrackPlaylist.length;
      applyTrack(nextIndex, true);
    });

    toggle.addEventListener("click", () => {
      if (audio.paused) {
        soundtrackController.userPaused = false;
        tryPlay("Trilha retomada.");
        return;
      }
      soundtrackController.userPaused = true;
      audio.pause();
      setSoundtrackStatus("Trilha pausada.");
    });

    next.addEventListener("click", () => {
      const nextIndex = (soundtrackController.index + 1) % soundtrackPlaylist.length;
      applyTrack(nextIndex, true);
    });

    volumeInput.addEventListener("input", () => {
      const value = clamp(Number(volumeInput.value) / 100, 0, 1);
      soundtrackController.volume = value;
      soundtrackController.userAdjustedVolume = true;
      audio.volume = value;
      saveSoundtrackSettings(soundtrackController);
      setSoundtrackStatus(`Volume ajustado para ${Math.round(value * 100)}%.`);
    });

    minimize.addEventListener("click", toggleCollapsed);

    spotifyToggle.addEventListener("click", () => {
      if (soundtrackController.collapsed) {
        setCollapsed(false);
      }
      setSpotifyPanelOpen(spotifyPanel.hidden);
    });

    spotifyClose.addEventListener("click", () => {
      setSpotifyPanelOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }
      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        toggleCollapsed();
        return;
      }
      if (event.key === "Escape" && !spotifyPanel.hidden) {
        setSpotifyPanelOpen(false);
      }
    });

    document.addEventListener("pointerdown", (event) => {
      if (spotifyPanel.hidden || soundPlayer.contains(event.target)) {
        return;
      }
      setSpotifyPanelOpen(false);
    });

    applyTrack(stored.index, false);
    updateMinimizeControl();
    setSpotifyPanelOpen(false);
    tryPlay("Tocando.");
    updateToggle();
  }

  function renderPartRibbon(parts) {
    const container = document.querySelector("#part-ribbon");
    container.innerHTML = "";
    const totalChapters = overviewPayload.meta.chapters;

    parts.forEach((part) => {
      const card = document.createElement("article");
      card.className = "part-card";
      const topCharacters = part.topCharacters.slice(0, 3).map((item) => item.name);
      card.innerHTML = `
        <p class="section-label">${part.title.split("—")[0].trim()}</p>
        <h3>${part.title.split("—")[1]?.trim() || part.title}</h3>
        <p>${formatNumber(part.chapterCount)} capítulos e cerca de ${formatNumber(part.wordCount)} palavras.</p>
        <div class="part-meta">
          <span class="meta-pill"><strong>${part.books.length}</strong> livros internos</span>
        </div>
      `;
      card.appendChild(buildChapterShare(part.chapterCount, totalChapters, {
        compact: true,
        color: "var(--accent)",
      }));
      const characterLine = document.createElement("p");
      characterLine.className = "part-character-line";
      if (topCharacters.length) {
        appendJoinedCharacterReferences(characterLine, topCharacters);
      } else {
        characterLine.textContent = "sem destaque";
      }
      card.appendChild(characterLine);
      container.appendChild(card);
    });
  }

  function renderCharacterBars(characters, chapterCount) {
    const container = document.querySelector("#character-bars");
    container.innerHTML = "";
    const subset = characters.slice(0, 12);
    const topCharacterName = subset[0]?.name || "o personagem mais citado";
    const mentionUnit = 100;
    const topMentionBooks = buildMentionBooks(subset[0]?.mentions || 0, mentionUnit, subset[0]?.tier || "principal");

    const scale = document.createElement("div");
    scale.className = "character-scale-ruler";
    scale.innerHTML = `
      <div class="character-scale-meta">
        <span>Escala visual de menções</span>
        <strong>1 livro = ${formatNumber(mentionUnit)} menções</strong>
      </div>
    `;
    const rulerBooks = document.createElement("div");
    rulerBooks.className = "mention-books mention-books-ruler";
    rulerBooks.setAttribute("aria-hidden", "true");
    const fullExample = document.createElement("span");
    fullExample.className = "mention-book";
    fullExample.style.setProperty("--book-color", colorForTier(subset[0]?.tier || "principal"));
    fullExample.style.setProperty("--book-fill", "1");
    const partialExample = document.createElement("span");
    partialExample.className = "mention-book mention-book-partial";
    partialExample.style.setProperty("--book-color", colorForTier(subset[0]?.tier || "principal"));
    partialExample.style.setProperty("--book-fill", "0.32");
    rulerBooks.append(fullExample, partialExample);
    scale.appendChild(rulerBooks);
    const scaleCopy = document.createElement("p");
    scaleCopy.textContent = `${getCharacterDisplayName(topCharacterName)} lidera o ranking com ${formatNumber(subset[0]?.mentions || 0)} menções: ${topMentionBooks.description}.`;
    scale.appendChild(scaleCopy);
    container.appendChild(scale);

    subset.forEach((character) => {
      const row = document.createElement("div");
      row.className = "character-row";

      const chapterWidth = (character.chapterCoverage / chapterCount) * 100;
      const chapterShare = Math.round((character.chapterCoverage / chapterCount) * 100);
      const mentionBooks = buildMentionBooks(character.mentions, mentionUnit, character.tier);

      const label = document.createElement("div");
      label.className = "character-label";
      const title = document.createElement("div");
      title.className = "character-name";
      title.appendChild(buildCharacterIdentity(character.name, "bar"));
      label.appendChild(title);
      label.appendChild(buildTierTag(character.tier));

      const bars = document.createElement("div");
      bars.className = "character-bars-stack";
      const mentionsGroup = document.createElement("div");
      mentionsGroup.className = "character-bar-group";
      mentionsGroup.innerHTML = `
        <div class="character-bar-meta">
          <span>Menções no texto</span>
          <div class="character-bar-value">
            <strong>${formatNumber(character.mentions)} menções</strong>
            <small>${mentionBooks.description}${character.name === topCharacterName ? " • líder do ranking" : ""}</small>
          </div>
        </div>
      `;
      mentionsGroup.appendChild(mentionBooks.wrapper);

      const chaptersGroup = document.createElement("div");
      chaptersGroup.className = "character-bar-group";
      chaptersGroup.innerHTML = `
        <div class="character-bar-meta">
          <span>Capítulos em que aparece</span>
          <div class="character-bar-value">
            <strong>${formatNumber(character.chapterCoverage)} de ${chapterCount} capítulos</strong>
            <small>${chapterShare}% do romance</small>
          </div>
        </div>
        <div class="bar-track bar-track-secondary">
          <span class="bar-fill bar-fill-secondary" style="width:${chapterWidth}%; background:${colorForTier(character.tier)};"></span>
        </div>
      `;

      bars.append(mentionsGroup, chaptersGroup);

      row.append(label, bars);
      container.appendChild(row);
    });
  }

  function renderInteractionNetwork(characters, interactions, config, selectedKey) {
    const container = document.querySelector("#network-chart");
    container.innerHTML = "";
    const width = container.clientWidth || 760;
    const height = config.height;
    const nodes = characters.map((character) => ({ ...character }));
    const links = interactions.map((link) => ({ ...link }));
    const svg = d3.select(container)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-label", "Rede de personagens");

    const radius = d3.scaleSqrt()
      .domain([0, d3.max(nodes, (node) => node.mentions) || 1])
      .range([11, 30]);

    const weight = d3.scaleLinear()
      .domain([0, d3.max(links, (link) => link.weight) || 1])
      .range([1.2, 7.2]);

    const simulation = d3.forceSimulation(nodes)
      .force("charge", d3.forceManyBody().strength(-210))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((node) => radius(node.mentions) + 18))
      .force("link", d3.forceLink(links).id((node) => node.id).distance(108).strength(0.72));

    for (let step = 0; step < 260; step += 1) {
      simulation.tick();
      nodes.forEach((node) => {
        const labelHalf = Math.max(radius(node.mentions), getCharacterDisplayName(node.id).length * 3.2);
        const xPadding = labelHalf + 18;
        const yPadding = radius(node.mentions) + 18;
        node.x = Math.max(xPadding, Math.min(width - xPadding, node.x));
        node.y = Math.max(yPadding, Math.min(height - yPadding, node.y));
      });
    }
    simulation.stop();

    const activeNodes = new Set(
      links
        .filter((link) => interactionKey(link.source, link.target) === selectedKey)
        .flatMap((link) => [link.source.id, link.target.id])
    );

    svg.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", (link) => `network-link${interactionKey(link.source, link.target) === selectedKey ? " active" : " dimmed"}`)
      .attr("x1", (link) => link.source.x)
      .attr("y1", (link) => link.source.y)
      .attr("x2", (link) => link.target.x)
      .attr("y2", (link) => link.target.y)
      .attr("stroke-width", (link) => weight(link.weight));

    const nodeGroups = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g");

    nodeGroups
      .attr("class", (node) => `network-node${activeNodes.size && activeNodes.has(node.id) ? " active" : activeNodes.size ? " dimmed" : ""}`);

    nodeGroups.append("circle")
      .attr("cx", (node) => node.x)
      .attr("cy", (node) => node.y)
      .attr("r", (node) => radius(node.mentions))
      .attr("fill", (node) => colorForTier(node.tier))
      .attr("opacity", 0.88);

    nodeGroups.append("text")
      .attr("class", "network-label")
      .attr("x", (node) => node.x)
      .attr("y", (node) => node.y)
      .each(function addNodeLabel(node) {
        const text = d3.select(this);
        const words = getCharacterDisplayName(node.id).split(/\s+/);
        const lines = words.length > 2 ? [words[0], words.slice(1).join(" ")] : words;
        const startY = node.y - ((lines.length - 1) * 6);
        lines.forEach((line, index) => {
          text.append("tspan")
            .attr("x", node.x)
            .attr("y", startY + (index * 12))
            .text(line);
        });
      });
  }

  function renderInteractionDetail(interaction, selectorInteractions = []) {
    const container = document.querySelector("#interaction-detail");
    container.innerHTML = "";

    const selectorWrap = document.createElement("div");
    selectorWrap.className = "interaction-selector-wrap";

    const selectorLabel = document.createElement("p");
    selectorLabel.className = "interaction-selector-label";
    selectorLabel.textContent = "Escolha uma relação";
    selectorWrap.appendChild(selectorLabel);

    const selector = document.createElement("div");
    selector.className = "interaction-selector";

    selectorInteractions.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `interaction-button${interactionKey(item.source, item.target) === activeInteractionKey ? " active" : ""}`;
      button.innerHTML = `
        <strong>${getCharacterDisplayName(item.source)} x ${getCharacterDisplayName(item.target)}</strong>
        <span>${formatNumber(item.weight)} frases com os dois nomes</span>
      `;
      button.addEventListener("click", () => {
        activeInteractionKey = interactionKey(item.source, item.target);
        renderInteractionSection(overviewPayload.characters, overviewPayload.interactions);
      });
      selector.appendChild(button);
    });

    selectorWrap.appendChild(selector);
    container.appendChild(selectorWrap);

    if (!interaction) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Sem trecho disponível para esta relação.";
      container.appendChild(empty);
      return;
    }

    const summary = document.createElement("div");
    summary.innerHTML = `
      <h4>${getCharacterDisplayName(interaction.source)} x ${getCharacterDisplayName(interaction.target)}</h4>
      <p>${formatNumber(interaction.weight)} frases do livro em que os dois nomes aparecem juntos. Os exemplos abaixo mostram algumas dessas passagens, com os dois nomes destacados.</p>
      <div class="interaction-selected-names">
        <span>${getCharacterDisplayName(interaction.source)}</span>
        <span>${getCharacterDisplayName(interaction.target)}</span>
      </div>
    `;
    container.appendChild(summary);

    const examplesWrap = document.createElement("div");
    examplesWrap.className = "interaction-examples";

    (interaction.examples || []).slice(0, 3).forEach((example) => {
      const card = document.createElement("article");
      card.className = "interaction-example";
      card.innerHTML = `
        <div class="chapter-meta">
          <span>${example.partTitle}</span>
          <span>${example.chapterTitle}</span>
        </div>
      `;
      const quote = document.createElement("blockquote");
      quote.innerHTML = highlightInteractionExcerpt(example.excerpt, [interaction.source, interaction.target]);
      card.appendChild(quote);
      const citation = buildPassageCitation(example, { includeChapter: false });
      if (citation) {
        card.appendChild(citation);
      }
      examplesWrap.appendChild(card);
    });

    if (!examplesWrap.childElementCount) {
      examplesWrap.innerHTML = '<div class="empty-state">Sem trecho disponível para esta relação.</div>';
    }

    container.appendChild(examplesWrap);
  }

  function renderCities(cities) {
    const container = document.querySelector("#city-board");
    container.innerHTML = "";
    const totalChapters = overviewPayload.meta.chapters;
    const totalParts = overviewPayload.meta.parts;

    const explainer = document.createElement("div");
    explainer.className = "city-explainer";
    explainer.innerHTML = `
      <article class="city-explainer-card">
        <strong>Menções</strong>
        <p>Número de vezes que o nome da cidade aparece nesta edição do texto.</p>
      </article>
      <article class="city-explainer-card">
        <strong>Capítulos</strong>
        <p>Quantidade de capítulos em que a cidade é citada ao menos uma vez.</p>
      </article>
      <article class="city-explainer-card">
        <strong>Partes</strong>
        <p>Em quantas das ${formatNumber(totalParts)} partes do romance a cidade entra em cena.</p>
      </article>
    `;
    container.appendChild(explainer);

    const grid = document.createElement("div");
    grid.className = "city-grid";

    cities.slice(0, 10).forEach((city, index) => {
      const card = document.createElement("article");
      card.className = "city-card";
      const head = document.createElement("div");
      head.className = "city-card-head";

      const rank = document.createElement("span");
      rank.className = "city-rank";
      rank.textContent = `#${index + 1}`;

      const titleWrap = document.createElement("div");
      const title = document.createElement("h4");
      title.appendChild(buildCityReference(city.name));

      const subtitle = document.createElement("p");
      subtitle.textContent = `${formatNumber(city.mentions)} menções do nome da cidade`;

      titleWrap.append(title, subtitle);
      head.append(rank, titleWrap);
      card.appendChild(head);

      const meta = document.createElement("div");
      meta.className = "chapter-meta";
      meta.innerHTML = `
        <span>${formatNumber(city.mentions)} menções</span>
        <span>${formatNumber(city.chapterCoverage)} capítulos</span>
        <span>${formatNumber(city.partCoverage || 0)} partes</span>
      `;
      card.appendChild(meta);

      card.appendChild(buildChapterShare(city.chapterCoverage, totalChapters, {
        color: "var(--secondary)",
      }));

      const summary = document.createElement("p");
      summary.className = "city-note";
      summary.textContent = `${city.name} aparece em ${formatShare(city.chapterCoverage, totalChapters)} do romance e atravessa ${formatNumber(city.partCoverage || 0)} das ${formatNumber(totalParts)} partes.`;
      card.appendChild(summary);

      if (city.topParts && city.topParts.length) {
        const partsWrap = document.createElement("div");
        partsWrap.className = "city-parts";
        city.topParts.forEach((part) => {
          const chip = document.createElement("span");
          chip.textContent = `${part.title.split("—")[1]?.trim() || part.title}: ${formatNumber(part.mentions)} menções`;
          partsWrap.appendChild(chip);
        });
        card.appendChild(partsWrap);
      }

      if (city.peakChapter) {
        const peak = document.createElement("p");
        peak.className = "city-peak";
        peak.innerHTML = `<strong>Pico de presença:</strong> ${city.peakChapter.chapterTitle} (${formatNumber(city.peakChapter.mentions)} menções neste capítulo).`;
        card.appendChild(peak);
      }

      const example = city.examples && city.examples.length ? city.examples[0] : null;
      if (example) {
        const exampleCard = document.createElement("div");
        exampleCard.className = "city-example";
        exampleCard.innerHTML = `
          <div class="chapter-meta">
            <span>${example.partTitle}</span>
            <span>${example.chapterTitle}</span>
          </div>
        `;
        const quote = document.createElement("blockquote");
        quote.textContent = example.excerpt;
        exampleCard.appendChild(quote);
        const citation = buildPassageCitation(example, { includeChapter: false });
        if (citation) {
          exampleCard.appendChild(citation);
        }
        card.appendChild(exampleCard);
      } else if (city.excerpt) {
        const fallback = document.createElement("blockquote");
        fallback.className = "city-fallback";
        fallback.textContent = city.excerpt;
        card.appendChild(fallback);
        const citation = buildPassageCitation(city.peakChapter || {}, { includeChapter: true });
        if (citation) {
          card.appendChild(citation);
        }
      }

      grid.appendChild(card);
    });

    container.appendChild(grid);

    if (cities.length > 10) {
      const others = document.createElement("div");
      others.className = "city-others";
      const hidden = cities.slice(10).map((city) => `${city.name} (${formatNumber(city.mentions)})`);
      others.innerHTML = `
        <strong>Outras cidades citadas</strong>
        <p>${hidden.join(" • ")}</p>
      `;
      container.appendChild(others);
    }
  }

  function renderSettings(settings) {
    const container = document.querySelector("#settings-list");
    container.innerHTML = "";
    const maxMentions = settings[0]?.mentions || 1;
    const totalChapters = overviewPayload.meta.chapters;

    settings.slice(0, 8).forEach((setting) => {
      const card = document.createElement("article");
      card.className = "setting-row";
      card.innerHTML = `
        <strong>${setting.name}</strong>
        <div class="setting-bar"><span style="width:${(setting.mentions / maxMentions) * 100}%"></span></div>
        <div class="chapter-meta">
          <span>${formatNumber(setting.mentions)} referências</span>
          <span>${formatNumber(setting.chapterCoverage)} capítulos</span>
          <span>${setting.type}</span>
        </div>
      `;
      const share = buildChapterShare(setting.chapterCoverage, totalChapters, {
        compact: true,
        color: "var(--accent)",
      });
      card.appendChild(share);

      const example = setting.examples && setting.examples.length ? setting.examples[0] : setting;
      const excerpt = document.createElement("p");
      excerpt.textContent = example.excerpt || setting.excerpt;
      card.appendChild(excerpt);
      const citation = buildPassageCitation(example, { includeChapter: true, compact: true });
      if (citation) {
        card.appendChild(citation);
      }
      container.appendChild(card);
    });
  }

  function renderCriticalReading(overview) {
    const container = document.querySelector("#critical-grid");
    if (!container) {
      return;
    }

    container.innerHTML = "";

    const characterByName = new Map(overview.characters.map((item) => [item.name, item]));
    const settingByName = new Map(overview.settings.map((item) => [item.name, item]));
    const interactionByKey = new Map(
      overview.interactions.map((item) => [interactionKey(item.source, item.target), item])
    );

    const getCharacter = (name) => characterByName.get(name);
    const getSetting = (name) => settingByName.get(name);
    const getInteraction = (source, target) =>
      interactionByKey.get(interactionKey(source, target));

    const createSourceLine = (label, items) => {
      const paragraph = document.createElement("p");
      paragraph.className = "critical-source";

      const heading = document.createElement("span");
      heading.textContent = `${label}:`;
      paragraph.appendChild(heading);
      paragraph.appendChild(document.createTextNode(" "));

      items.forEach((item, index) => {
        if (index > 0) {
          paragraph.appendChild(document.createTextNode(" · "));
        }
        const link = document.createElement("a");
        link.href = item.href;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = item.label;
        paragraph.appendChild(link);
      });

      return paragraph;
    };

    const cards = [
      {
        title: "Lei, misericórdia e sistema penal",
        body:
          "Parte da crítica lê Valjean e Javert como dois polos de uma disputa entre punição e misericórdia, e também trata a vigilância legal como motor estrutural do romance.",
        reading:
          "No romance, essa leitura aparece em três movimentos: Valjean entra em cena marcado pela pena, Javert o observa como suspeito permanente e, no fim, a própria lei perde estabilidade diante da misericórdia.",
        terms: [
          "galés",
          "passaporte amarelo",
          "Javert",
          "polícia",
          "misericórdia",
          "indulgência",
          "justiça segundo Deus",
        ],
        passages: [
          {
            context: "A pena define a entrada de Valjean",
            excerpt:
              "Ao chegar à casa do bispo, ele se apresenta antes de tudo como \"forçado das galés\", ligando identidade e sistema penal.",
            pageStart: 67,
          },
          {
            context: "Javert funciona como vigilância",
            excerpt:
              "Em Montreuil-sur-Mer, Javert vira um \"olho sempre fito\" em Madelaine, fazendo da suspeita uma forma contínua de controle.",
            pageStart: 139,
          },
          {
            context: "O romance opõe lei e misericórdia",
            excerpt:
              "Perto do fim, a narração junta \"misericórdia\", \"indulgência\" e \"justiça segundo Deus\" contra o automatismo da lei.",
            pageStart: 989,
          },
        ],
        metrics: [
          {
            label: "Jean Valjean x Javert",
            value: `${formatNumber(getInteraction("Jean Valjean", "Javert")?.weight || 0)} frases`,
            note: "nomes na mesma frase",
          },
          {
            label: "Galés de Toulon",
            value: `${formatNumber(getSetting("Galés de Toulon")?.mentions || 0)} referências`,
            note: `${formatNumber(getSetting("Galés de Toulon")?.chapterCoverage || 0)} capítulos`,
          },
          {
            label: "Tribunal de Arras",
            value: `${formatNumber(getSetting("Tribunal de Arras")?.mentions || 0)} referências`,
            note: `${formatNumber(getSetting("Tribunal de Arras")?.chapterCoverage || 0)} capítulos`,
          },
        ],
        sources: [
          {
            href: "https://repositori.ukwms.ac.id/id/eprint/9047/",
            label:
              "A study on law versus mercy in Victor Hugo's novel \"Les Miserables\" — Maria Theresia, Widya Mandala Catholic University Surabaya",
          },
          {
            href: "https://digitalcommons.law.mercer.edu/jour_mlr/vol75/iss3/6/",
            label:
              "Victor Hugo was Right All Along: Les Misérables, the Tragedy of a Punitive Parole System, and a Modern Path Forward — Brendan Matthews, Mercer Law Review",
          },
        ],
      },
      {
        title: "Paris como máquina social",
        body:
          "Estudos sobre Fantine, a prostituição e os esgotos mostram que fábrica, rua, cárcere e esgoto funcionam como partes de um mesmo sistema de exclusão.",
        reading:
          "No livro, esse sistema liga disciplina de trabalho, exploração feminina e infraestrutura urbana. Os espaços retornam como peças da mesma engrenagem social.",
        terms: [
          "fábrica",
          "operárias",
          "trabalho",
          "prostituição",
          "miséria",
          "esgoto",
          "Paris",
        ],
        passages: [
          {
            context: "A fábrica organiza trabalho e conduta",
            excerpt:
              "A indústria de Madelaine promete \"trabalho e pão\", mas já separa oficinas e disciplina homens e mulheres.",
            pageStart: 130,
          },
          {
            context: "Fantine torna explícito o custo do sistema",
            excerpt:
              "Num dos trechos mais diretos do romance, a exclusão feminina é nomeada sem rodeios: \"chama-se prostituição\".",
            pageStart: 150,
          },
          {
            context: "Paris transforma miséria em infraestrutura",
            excerpt:
              "No livro dos esgotos, Paris aparece como corpo que desperdiça riqueza e agrava \"o problema da miséria\".",
            pageStart: 941,
          },
        ],
        metrics: [
          {
            label: "Paris",
            value: `${formatNumber(overview.cities.find((item) => item.name === "Paris")?.mentions || 0)} menções`,
            note: `${formatNumber(overview.cities.find((item) => item.name === "Paris")?.chapterCoverage || 0)} capítulos`,
          },
          {
            label: "Montreuil-sur-Mer e a fábrica",
            value: `${formatNumber(getSetting("Montreuil-sur-Mer e a fábrica")?.mentions || 0)} referências`,
            note: `${formatNumber(getSetting("Montreuil-sur-Mer e a fábrica")?.chapterCoverage || 0)} capítulos`,
          },
          {
            label: "Esgotos de Paris",
            value: `${formatNumber(getSetting("Esgotos de Paris")?.mentions || 0)} referências`,
            note: `${formatNumber(getSetting("Esgotos de Paris")?.chapterCoverage || 0)} capítulos`,
          },
        ],
        sources: [
          {
            href: "https://ncfs-journal.org/briana-lewis/sewer-and-prostitute-les-miserables-regulation-redemption",
            label:
              "The Sewer and the Prostitute in Les Misérables: From Regulation to Redemption — Briana Lewis, Nineteenth-Century French Studies",
          },
        ],
      },
      {
        title: "Barricada e conflito de classe",
        body:
          "A crítica sobre a luta de classes lê a barricada menos como episódio isolado e mais como ponto de condensação dos conflitos sociais do romance.",
        reading:
          "No romance, a barricada só funciona porque antes dela o texto organiza um coletivo político, dá linguagem própria à revolução e discute abertamente a legitimidade da revolta.",
        terms: [
          "revolução",
          "civilização",
          "pátria",
          "república",
          "operários",
          "barricada",
          "revolta",
        ],
        passages: [
          {
            context: "O grupo revolucionário vira corpo coletivo",
            excerpt:
              "Antes da barricada, Enjolras, Combeferre e os demais são apresentados como uma \"espécie de família\".",
            pageStart: 487,
          },
          {
            context: "O livro distingue modos de revolução",
            excerpt:
              "Combeferre corrige Enjolras com a fórmula \"Revolução, mas Civilização\", separando guerra e transformação social.",
            pageStart: 488,
          },
          {
            context: "A revolta é debatida em voz alta",
            excerpt:
              "Ao comentar 1832, o narrador pergunta se a guerra é mesmo menos flagelo do que a revolta.",
            pageStart: 791,
          },
        ],
        metrics: [
          {
            label: "Barricada do Corinto",
            value: `${formatNumber(getSetting("Barricada do Corinto")?.mentions || 0)} referências`,
            note: `${formatNumber(getSetting("Barricada do Corinto")?.chapterCoverage || 0)} capítulos`,
          },
          {
            label: "Enjolras",
            value: `${formatNumber(getCharacter("Enjolras")?.mentions || 0)} menções`,
            note: `${formatNumber(getCharacter("Enjolras")?.chapterCoverage || 0)} capítulos`,
          },
          {
            label: "Combeferre x Enjolras",
            value: `${formatNumber(getInteraction("Combeferre", "Enjolras")?.weight || 0)} frases`,
            note: "nomes na mesma frase",
          },
        ],
        sources: [
          {
            href: "https://www.ncfs-journal.org/maxime-goergen/fonctions-de-la-lutte-des-classes-dans-les-miserables",
            label:
              "Fonctions de la lutte des classes dans Les Misérables — Maxime Goergen, Nineteenth-Century French Studies",
          },
        ],
      },
      {
        title: "Comentário histórico também move a trama",
        body:
          "O artigo usado aqui lê blocos como Waterloo, a revolta de 1832 e outras pausas explicativas como parte da forma do romance. Eles não estão ali só para informar: ajudam a ligar história maior, destino dos personagens e avanço da narrativa.",
        reading:
          "No livro, o narrador para a ação para dar contexto histórico e depois volta à cena com outro peso. Essas passagens ampliam o que está em jogo para os personagens, em vez de simplesmente interromper a história.",
        terms: [
          "história",
          "enredo",
          "Waterloo",
          "revoltas",
          "Paris",
          "narrador",
          "contexto",
        ],
        passages: [
          {
            context: "Abertura programática do narrador",
            excerpt:
              "Logo no começo, o texto admite: \"Embora seja estranho ao enredo desta história\", e mesmo assim insiste em abrir o contexto.",
            pageStart: 14,
          },
          {
            context: "A revolta ganha comentário histórico",
            excerpt:
              "No bloco sobre 1832, o romance compara revolta e batalha para discutir causa, custo e legitimidade.",
            pageStart: 790,
          },
          {
            context: "Waterloo volta como memória política",
            excerpt:
              "Na morte de Lamarque, a \"tristeza de Waterloo\" reaparece para reler 1815 dentro de 1832.",
            pageStart: 796,
          },
        ],
        metrics: [
          {
            label: "Waterloo",
            value: `${formatNumber(getSetting("Waterloo")?.mentions || 0)} referências`,
            note: `${formatNumber(getSetting("Waterloo")?.chapterCoverage || 0)} capítulos`,
          },
          {
            label: "Digne e a casa do bispo",
            value: `${formatNumber(getSetting("Digne e a casa do bispo")?.mentions || 0)} referências`,
            note: `${formatNumber(getSetting("Digne e a casa do bispo")?.chapterCoverage || 0)} capítulos`,
          },
          {
            label: "Paris",
            value: `${formatNumber(overview.cities.find((item) => item.name === "Paris")?.mentions || 0)} menções`,
            note: `${formatNumber(overview.cities.find((item) => item.name === "Paris")?.chapterCoverage || 0)} capítulos`,
          },
        ],
        sources: [
          {
            href: "https://chr.ewapub.com/article/view/22836",
            label:
              "Symbol, History, and Destiny: Narrative Coherence in Victor Hugo's Les Misérables Through Segmented Discourse Representation Theory — Hao Zheng, Communications in Humanities Research",
          },
        ],
      },
      {
        title: "Infância, cuidado e refúgio",
        body:
          "Textos sobre Cosette, Gavroche, o convento e o olhar infantil mostram que crianças e espaços de abrigo medem a violência e a reparação possíveis naquele mundo.",
        reading:
          "Esse eixo fica claro quando o romance mede a violência pelo corpo infantil e opõe dois extremos materiais: trabalho e rua de um lado, abrigo e cuidado de outro.",
        terms: [
          "criança",
          "Cosette",
          "gaiato",
          "Gavroche",
          "convento",
          "Petit-Picpus",
          "abrigo",
        ],
        passages: [
          {
            context: "Cosette vira mão de obra infantil",
            excerpt:
              "Em Montfermeil, a narração insiste na \"pobre criança\" útil aos Thenardier pelo dinheiro da mãe e pelo trabalho da filha.",
            pageStart: 289,
          },
          {
            context: "Paris produz o gaiato",
            excerpt:
              "Ao desenhar Gavroche, o livro afirma que Paris tem um filho próprio: o \"gaiato\".",
            pageStart: 436,
          },
          {
            context: "O abrigo ganha forma concreta",
            excerpt:
              "No Petit-Picpus, Jean Valjean encontra refúgio e Cosette volta a dormir em segurança.",
            pageStart: 359,
          },
        ],
        metrics: [
          {
            label: "Cosette",
            value: `${formatNumber(getCharacter("Cosette")?.mentions || 0)} menções`,
            note: `${formatNumber(getCharacter("Cosette")?.chapterCoverage || 0)} capítulos`,
          },
          {
            label: "Gavroche",
            value: `${formatNumber(getCharacter("Gavroche")?.mentions || 0)} menções`,
            note: `${formatNumber(getCharacter("Gavroche")?.chapterCoverage || 0)} capítulos`,
          },
          {
            label: "Convento de Petit-Picpus",
            value: `${formatNumber(getSetting("Convento de Petit-Picpus")?.mentions || 0)} referências`,
            note: `${formatNumber(getSetting("Convento de Petit-Picpus")?.chapterCoverage || 0)} capítulos`,
          },
          {
            label: "Montfermeil e a estalagem",
            value: `${formatNumber(getSetting("Montfermeil e a estalagem dos Thenardier")?.mentions || 0)} referências`,
            note: `${formatNumber(getSetting("Montfermeil e a estalagem dos Thenardier")?.chapterCoverage || 0)} capítulos`,
          },
        ],
        sources: [
          {
            href: "https://vtechworks.lib.vt.edu/items/92aebceb-ea57-45ef-904a-cb4a880f4e08",
            label:
              "The Convent: A Place of Refuge in Les Misérables and Histoire de ma vie — Teresa Apple Fleming, Virginia Tech",
          },
          {
            href: "https://kclpure.kcl.ac.uk/portal/en/publications/war-and-the-childs-gaze-in-revolutionary-and-napoleonic-literatur/",
            label:
              "War and the child's gaze in revolutionary and Napoleonic literature and culture — Emma Butcher, Critical Military Studies",
          },
        ],
      },
    ];

    cards.forEach((card) => {
      const article = document.createElement("article");
      article.className = "critical-card";

      const title = document.createElement("strong");
      title.textContent = card.title;
      article.appendChild(title);

      const body = document.createElement("p");
      body.textContent = card.body;
      article.appendChild(body);

      const reading = document.createElement("p");
      reading.className = "critical-reading";
      reading.innerHTML = `<span>No livro:</span> ${card.reading}`;
      article.appendChild(reading);

      const terms = document.createElement("div");
      terms.className = "critical-terms";

      const termsLabel = document.createElement("span");
      termsLabel.className = "critical-subhead";
      termsLabel.textContent = "Termos que puxam essa leitura";
      terms.appendChild(termsLabel);

      const termsList = document.createElement("div");
      termsList.className = "critical-terms-list";
      card.terms.forEach((term) => {
        const item = document.createElement("span");
        item.textContent = term;
        termsList.appendChild(item);
      });
      terms.appendChild(termsList);
      article.appendChild(terms);

      const passages = document.createElement("div");
      passages.className = "critical-passages";

      const passagesLabel = document.createElement("span");
      passagesLabel.className = "critical-subhead";
      passagesLabel.textContent = "Passagens que sustentam a leitura";
      passages.appendChild(passagesLabel);

      card.passages.forEach((passage) => {
        const item = document.createElement("div");
        item.className = "critical-passage";

        const context = document.createElement("strong");
        context.className = "critical-passage-title";
        context.textContent = passage.context;
        item.appendChild(context);

        const excerpt = document.createElement("blockquote");
        excerpt.textContent = passage.excerpt;
        item.appendChild(excerpt);

        const citation = buildPassageCitation(
          { chapterTitle: passage.context, pageStart: passage.pageStart, pageEnd: passage.pageEnd },
          { compact: true }
        );
        if (citation) {
          item.appendChild(citation);
        }

        passages.appendChild(item);
      });
      article.appendChild(passages);

      const metricsLabel = document.createElement("span");
      metricsLabel.className = "critical-subhead";
      metricsLabel.textContent = "Sinais nos dados do site";
      article.appendChild(metricsLabel);

      const metrics = document.createElement("div");
      metrics.className = "critical-metrics";
      card.metrics.forEach((metric) => {
        const item = document.createElement("div");
        item.className = "critical-metric";
        item.innerHTML = `
          <span>${metric.label}</span>
          <strong>${metric.value}</strong>
          <small>${metric.note}</small>
        `;
        metrics.appendChild(item);
      });
      article.appendChild(metrics);

      article.appendChild(
        createSourceLine(card.sources.length > 1 ? "Pesquisas acadêmicas" : "Pesquisa acadêmica", card.sources)
      );

      container.appendChild(article);
    });
  }

  function renderMethodology(methodology, characters) {
    const container = document.querySelector("#methodology");
    if (!container) {
      return;
    }

    container.innerHTML = "";

    const head = document.createElement("div");
    head.className = "footer-methodology-head";
    head.innerHTML = `
      <p class="section-label">Metodologia</p>
      <h3>Como os nomes foram reunidos</h3>
    `;
    container.appendChild(head);

    const edition = document.createElement("p");
    edition.className = "methodology-source";
    edition.innerHTML = `Versão utilizada nesta leitura: <a href="https://professor.pucgoias.edu.br/SiteDocente/admin/arquivosUpload/17637/material/Victor-Hugo-Os-Miseraveis.pdf" target="_blank" rel="noreferrer">edição digital em PDF disponível no site da PUC Goiás</a>.`;
    container.appendChild(edition);

    const textBlock = document.createElement("div");
    textBlock.className = "methodology-text";
    (methodology || []).forEach((item) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = item;
      textBlock.appendChild(paragraph);
    });
    container.appendChild(textBlock);

    const aliasCharacters = characters
      .map((character) => ({
        name: character.name,
        extras: characterAliasDetails.get(character.name)?.extras || [],
      }))
      .filter((item) => item.extras.length);

    if (!aliasCharacters.length) {
      return;
    }

    const aliasCard = document.createElement("div");
    aliasCard.className = "methodology-alias-card";

    const title = document.createElement("strong");
    title.textContent = "Personagens com mais de um nome nesta edição";
    aliasCard.appendChild(title);

    const list = document.createElement("ul");
    list.className = "methodology-alias-list";

    aliasCharacters.forEach((item) => {
      const row = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = `${getCharacterDisplayName(item.name)}:`;
      const text = document.createElement("span");
      text.textContent = item.extras.map(formatAliasLabel).join(", ");
      row.append(label, text);
      list.appendChild(row);
    });

    aliasCard.appendChild(list);
    container.appendChild(aliasCard);
  }

  function renderDescriptorGrid(characters) {
    const container = document.querySelector("#descriptor-grid");
    container.innerHTML = "";
    const totalChapters = overviewPayload.meta.chapters;

    characters
      .filter((character) => character.descriptors && character.descriptors.length)
      .slice(0, 12)
      .forEach((character) => {
        const card = document.createElement("article");
        card.className = "descriptor-card";

        const tags = document.createElement("div");
        tags.className = "descriptor-tags";
        const excerpt = document.createElement("blockquote");
        excerpt.className = "descriptor-excerpt";
        const citationSlot = document.createElement("div");
        const descriptorIndexes = new Map();
        let activeDescriptorWord = character.descriptors[0]?.key || character.descriptors[0]?.word || "";

        const applyDescriptor = (descriptor, chip, forceNext = false) => {
          const examples = descriptor.examples && descriptor.examples.length ? descriptor.examples : [descriptor];
          const descriptorKey = descriptor.key || descriptor.word;
          const isSameDescriptor = activeDescriptorWord === descriptorKey;
          const currentIndex = descriptorIndexes.get(descriptorKey) || 0;
          const nextIndex = forceNext && isSameDescriptor
            ? (currentIndex + 1) % examples.length
            : currentIndex % examples.length;
          descriptorIndexes.set(descriptorKey, nextIndex);
          activeDescriptorWord = descriptorKey;

          tags.querySelectorAll(".descriptor-chip").forEach((node) => node.classList.remove("active"));
          chip.classList.add("active");
          const example = examples[nextIndex];
          excerpt.innerHTML = highlightDescriptorExcerpt(
            example.excerpt || descriptor.excerpt || "",
            example.surface || descriptor.word
          );
          citationSlot.innerHTML = "";
          const citation = buildPassageCitation(example.chapterId ? example : descriptor, {
            includeChapter: true,
            compact: true,
          });
          if (citation) {
            citationSlot.appendChild(citation);
          }
        };

        character.descriptors.forEach((descriptor, index) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = `descriptor-chip${index === 0 ? " active" : ""}`;
          chip.textContent = `${descriptor.word} (${descriptor.count})`;
          chip.addEventListener("click", () => {
            applyDescriptor(descriptor, chip, true);
          });
          tags.appendChild(chip);
        });

        const meta = document.createElement("div");
        meta.className = "chapter-meta";
        meta.innerHTML = `
          <span>${formatNumber(character.mentions)} menções</span>
          <span>${formatNumber(character.chapterCoverage)} capítulos</span>
        `;

        card.appendChild(buildTierTag(character.tier));
        const title = document.createElement("div");
        title.className = "panel-title";
        title.appendChild(buildCharacterIdentity(character.name, "panel"));
        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(buildChapterShare(character.chapterCoverage, totalChapters, {
          compact: true,
          color: colorForTier(character.tier),
        }));
        card.appendChild(tags);
        card.appendChild(excerpt);
        card.appendChild(citationSlot);
        applyDescriptor(character.descriptors[0], tags.querySelector(".descriptor-chip"));
        container.appendChild(card);
      });
  }

  function initChapterExplorer(parts, chapters) {
    const partFilter = document.querySelector("#part-filter");
    const bookFilter = document.querySelector("#book-filter");
    const searchInput = document.querySelector("#chapter-search");
    const prevButton = document.querySelector("#chapter-prev");
    const nextButton = document.querySelector("#chapter-next");

    parts.forEach((part) => {
      const option = document.createElement("option");
      option.value = part.id;
      option.textContent = part.title;
      partFilter.appendChild(option);
    });

    partFilter.addEventListener("change", () => {
      chapterState.part = partFilter.value;
      chapterState.book = "all";
      chapterState.chapterId = null;
      renderChapterExplorer(parts, chapters);
    });

    bookFilter.addEventListener("change", () => {
      chapterState.book = bookFilter.value;
      chapterState.chapterId = null;
      renderChapterExplorer(parts, chapters);
    });

    searchInput.addEventListener("input", () => {
      chapterState.query = searchInput.value.trim();
      chapterState.chapterId = null;
      renderChapterExplorer(parts, chapters);
    });

    prevButton.addEventListener("click", () => {
      const filtered = getFilteredChapters(chapters);
      const index = filtered.findIndex((chapter) => chapter.id === chapterState.chapterId);
      if (index > 0) {
        chapterState.chapterId = filtered[index - 1].id;
        renderChapterExplorer(parts, chapters);
      }
    });

    nextButton.addEventListener("click", () => {
      const filtered = getFilteredChapters(chapters);
      const index = filtered.findIndex((chapter) => chapter.id === chapterState.chapterId);
      if (index >= 0 && index < filtered.length - 1) {
        chapterState.chapterId = filtered[index + 1].id;
        renderChapterExplorer(parts, chapters);
      }
    });

    renderChapterExplorer(parts, chapters);
  }

  function renderChapterSummary(parts, chapters, filtered, selectedIndex, selectedChapter) {
    const container = document.querySelector("#chapter-summary");
    const selectionText = filtered.length
      ? `${formatNumber(filtered.length)} capítulos neste recorte. Você está vendo o capítulo ${selectedIndex + 1}.`
      : "Nenhum capítulo corresponde ao recorte atual.";
    const selectedContext = selectedChapter
      ? `${selectedChapter.partTitle} · ${selectedChapter.bookTitle}`
      : "Escolha uma parte, um livro interno ou busque um tema para montar a linha do tempo.";
    container.innerHTML = `
      <p><strong>${formatNumber(chapters.length)}</strong> capítulos no romance, distribuídos em ${formatNumber(parts.length)} partes e ${formatNumber(overviewPayload.meta.books)} livros internos.</p>
      <p>${selectionText}</p>
      <p>${selectedContext}</p>
    `;
  }

  function getFilteredChapters(chapters) {
    const query = normalize(chapterState.query);
    const filteredByPart = chapters.filter((chapter) => (
      chapterState.part === "all" || chapter.partId === chapterState.part
    ));
    const availableBookIds = new Set(filteredByPart.map((chapter) => chapter.bookId));
    if (chapterState.book !== "all" && !availableBookIds.has(chapterState.book)) {
      chapterState.book = "all";
    }

    const filteredByBook = filteredByPart.filter((chapter) => (
      chapterState.book === "all" || chapter.bookId === chapterState.book
    ));

    return filteredByBook.filter((chapter) => {
      return !query || normalize([
        chapter.fullTitle,
        chapter.focus,
        chapter.leadExcerpt,
        chapter.evidenceExcerpt,
        (chapter.topTerms || []).join(" "),
        chapter.topCharacters.map((item) => item.name).join(" "),
        chapter.topPlaces.map((item) => item.name).join(" "),
      ].join(" ")).includes(query);
    });
  }

  function populateBookFilter(chapters) {
    const bookFilter = document.querySelector("#book-filter");
    const groups = new Map();
    chapters.forEach((chapter) => {
      if (!groups.has(chapter.bookId)) {
        groups.set(chapter.bookId, { title: chapter.bookTitle, count: 0 });
      }
      groups.get(chapter.bookId).count += 1;
    });

    bookFilter.innerHTML = '<option value="all">Todos</option>';
    Array.from(groups.entries()).forEach(([bookId, group]) => {
      const option = document.createElement("option");
      option.value = bookId;
      option.textContent = `${group.title} (${group.count})`;
      bookFilter.appendChild(option);
    });
    bookFilter.value = chapterState.book;
  }

  function buildTimelineCharacterChip(item) {
    const chip = document.createElement("div");
    chip.className = "timeline-character-chip";
    const portrait = buildCharacterPortrait(item.name, "timeline");
    if (portrait) {
      chip.appendChild(portrait);
    }

    const copy = document.createElement("div");
    copy.className = "timeline-character-copy";
    const name = document.createElement("strong");
    name.textContent = getCharacterDisplayName(item.name);
    const meta = document.createElement("span");
    meta.textContent = `${formatNumber(item.mentions)} menções`;
    copy.append(name, meta);
    chip.appendChild(copy);
    return chip;
  }

  function buildTimelineCharacterMini(item) {
    const chip = document.createElement("div");
    chip.className = "timeline-character-mini";
    const portrait = buildCharacterPortrait(item.name, "mini");
    if (portrait) {
      chip.appendChild(portrait);
    }
    const label = document.createElement("span");
    label.textContent = getCharacterDisplayName(item.name);
    chip.appendChild(label);
    return chip;
  }

  function renderChapterTimeline(filtered) {
    const container = document.querySelector("#chapter-timeline");
    container.innerHTML = "";

    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state">Nenhum capítulo corresponde a esse filtro.</div>';
      return;
    }

    filtered.forEach((chapter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `timeline-chapter${chapter.id === chapterState.chapterId ? " active" : ""}`;
      button.setAttribute("aria-pressed", String(chapter.id === chapterState.chapterId));

      const seq = document.createElement("span");
      seq.className = "timeline-chapter-seq";
      seq.textContent = String(chapter.seq);

      const title = document.createElement("strong");
      title.textContent = chapter.fullTitle;

      const meta = document.createElement("span");
      meta.className = "timeline-chapter-meta";
      meta.textContent = `${chapter.roman} · ${formatNumber(chapter.wordCount)} palavras`;

      const termRow = document.createElement("div");
      termRow.className = "timeline-term-row";
      (chapter.topTerms || []).slice(0, 3).forEach((term) => {
        const pill = document.createElement("span");
        pill.className = "timeline-term-pill";
        pill.textContent = term;
        termRow.appendChild(pill);
      });

      const portraitRow = document.createElement("div");
      portraitRow.className = "timeline-cast-mini";
      chapter.topCharacters.slice(0, 3).forEach((item) => {
        portraitRow.appendChild(buildTimelineCharacterMini(item));
      });

      button.append(seq, title, meta, termRow, portraitRow);
      button.addEventListener("click", () => {
        chapterState.chapterId = chapter.id;
        renderChapterExplorer(overviewPayload.parts, chapterPayload);
      });
      container.appendChild(button);
    });

    const active = container.querySelector(".timeline-chapter.active");
    if (active) {
      active.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }

  function renderChapterDetail(selectedChapter) {
    const container = document.querySelector("#chapter-explorer");
    container.innerHTML = "";

    if (!selectedChapter) {
      container.innerHTML = '<div class="empty-state">Nenhum capítulo corresponde a esse filtro.</div>';
      return;
    }

    const article = document.createElement("article");
    article.className = "chapter-card chapter-card-featured chapter-timeline-detail";
    article.id = selectedChapter.id;
    article.innerHTML = `
      <div class="chapter-context">
        <span>${selectedChapter.partTitle}</span>
        <span>${selectedChapter.bookTitle}</span>
      </div>
      <div class="chapter-title-row">
        <span class="chapter-number">${selectedChapter.seq}</span>
        <div>
          <strong>${selectedChapter.fullTitle}</strong>
          <div class="chapter-meta">
            <span>${formatPageRange(selectedChapter.pageStart, selectedChapter.pageEnd)}</span>
            <span>${formatNumber(selectedChapter.wordCount)} palavras</span>
          </div>
        </div>
      </div>
    `;

    const overview = document.createElement("div");
    overview.className = "chapter-detail-overview";

    const terms = document.createElement("section");
    terms.className = "chapter-detail-block";
    terms.innerHTML = "<h3>Palavras mais fortes neste capítulo</h3>";
    const termWrap = document.createElement("div");
    termWrap.className = "chapter-term-cloud";
    (selectedChapter.topTerms || []).slice(0, 6).forEach((term) => {
      const pill = document.createElement("span");
      pill.className = "chapter-term-pill";
      pill.textContent = term;
      termWrap.appendChild(pill);
    });
    terms.appendChild(termWrap);

    const cast = document.createElement("section");
    cast.className = "chapter-detail-block";
    cast.innerHTML = "<h3>Quem domina o capítulo</h3>";
    const castGrid = document.createElement("div");
    castGrid.className = "chapter-cast-grid";
    selectedChapter.topCharacters.forEach((item) => {
      castGrid.appendChild(buildTimelineCharacterChip(item));
    });
    if (!selectedChapter.topCharacters.length) {
      const fallback = document.createElement("p");
      fallback.className = "chapter-detail-fallback";
      fallback.textContent = "Sem personagem dominante claro neste recorte.";
      cast.appendChild(fallback);
    } else {
      cast.appendChild(castGrid);
    }

    const places = document.createElement("section");
    places.className = "chapter-detail-block";
    places.innerHTML = "<h3>Lugares em destaque</h3>";
    const placeWrap = document.createElement("div");
    placeWrap.className = "chapter-place-row";
    selectedChapter.topPlaces.forEach((item) => {
      const pill = document.createElement("span");
      pill.className = "chapter-place-pill";
      pill.textContent = `${item.name} (${formatNumber(item.mentions)})`;
      placeWrap.appendChild(pill);
    });
    if (!selectedChapter.topPlaces.length) {
      const fallback = document.createElement("p");
      fallback.className = "chapter-detail-fallback";
      fallback.textContent = "Sem lugar dominante claro neste recorte.";
      places.appendChild(fallback);
    } else {
      places.appendChild(placeWrap);
    }

    overview.append(terms, cast, places);
    article.appendChild(overview);

    const summary = document.createElement("p");
    summary.innerHTML = `<strong>O que acontece aqui:</strong> ${selectedChapter.focus}`;
    article.appendChild(summary);

    const passages = document.createElement("div");
    passages.className = "chapter-passage-grid";

    const leadCard = document.createElement("div");
    leadCard.className = "chapter-passage-card";
    leadCard.innerHTML = `
      <span class="chapter-passage-label">Abertura</span>
      <blockquote>${escapeHTML(selectedChapter.leadExcerpt)}</blockquote>
      <p>${formatPageRange(selectedChapter.pageStart, selectedChapter.pageEnd)}</p>
    `;

    const evidenceCard = document.createElement("div");
    evidenceCard.className = "chapter-passage-card";
    evidenceCard.innerHTML = `
      <span class="chapter-passage-label">Trecho em destaque</span>
      <blockquote>${escapeHTML(selectedChapter.evidenceExcerpt)}</blockquote>
      <p>${formatPageRange(selectedChapter.pageStart, selectedChapter.pageEnd)}</p>
    `;

    passages.append(leadCard, evidenceCard);
    article.appendChild(passages);
    container.appendChild(article);
  }

  function renderChapterExplorer(parts, chapters) {
    document.querySelector("#part-filter").value = chapterState.part;
    const partFiltered = chapters.filter((chapter) => (
      chapterState.part === "all" || chapter.partId === chapterState.part
    ));
    populateBookFilter(partFiltered);

    const filtered = getFilteredChapters(chapters);
    document.querySelector("#book-filter").value = chapterState.book;
    if (!filtered.some((chapter) => chapter.id === chapterState.chapterId)) {
      chapterState.chapterId = filtered[0]?.id || null;
    }

    const selectedIndex = filtered.findIndex((chapter) => chapter.id === chapterState.chapterId);
    const selectedChapter = selectedIndex >= 0 ? filtered[selectedIndex] : null;
    renderChapterSummary(parts, chapters, filtered, Math.max(selectedIndex, 0), selectedChapter);

    const prevButton = document.querySelector("#chapter-prev");
    const nextButton = document.querySelector("#chapter-next");
    const position = document.querySelector("#chapter-position");
    position.textContent = filtered.length ? `${selectedIndex + 1} de ${formatNumber(filtered.length)}` : "0 de 0";
    prevButton.disabled = selectedIndex <= 0;
    nextButton.disabled = selectedIndex < 0 || selectedIndex >= filtered.length - 1;
    renderChapterTimeline(filtered);
    renderChapterDetail(selectedChapter);
  }

  function initChat(chatData, overview) {
    chatTopics = buildChatTopics(overview);
    chatIndex = buildChatIndex(chatData.chunks);
    const log = document.querySelector("#chat-log");
    const form = document.querySelector("#chat-form");
    const input = document.querySelector("#chat-input");
    const keyInput = document.querySelector("#gemini-api-key");
    const saveKeyButton = document.querySelector("#chat-save-key");
    const clearKeyButton = document.querySelector("#chat-clear-key");
    const submitButton = document.querySelector("#chat-submit");
    const stored = loadChatSettings();

    chatRuntime = {
      log,
      form,
      input,
      keyInput,
      saveKeyButton,
      clearKeyButton,
      submitButton,
      apiKey: stored.apiKey,
      pending: false,
      history: [],
    };

    keyInput.value = chatRuntime.apiKey;
    syncChatModeUI();

    appendAssistantMessage(log, {
      paragraphs: [
        "Este chat responde só com Gemini.",
        "Eu falo como Jean Valjean e devo responder apenas dentro do que vivi, soube ou posso apenas supor com cautela."
      ],
      evidence: [],
    });

    saveKeyButton.addEventListener("click", () => {
      chatRuntime.apiKey = keyInput.value.trim();
      saveChatSettings(chatRuntime);
      syncChatModeUI("Chave Gemini salva neste navegador.");
    });

    clearKeyButton.addEventListener("click", () => {
      chatRuntime.apiKey = "";
      keyInput.value = "";
      saveChatSettings(chatRuntime);
      syncChatModeUI("Chave removida. O chat precisa de uma chave Gemini válida para responder.");
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value || chatRuntime.pending) return;

      chatRuntime.apiKey = keyInput.value.trim();
      saveChatSettings(chatRuntime);
      syncChatModeUI();
      if (!chatRuntime.apiKey) {
        appendAssistantMessage(log, {
          paragraphs: [
            "Para eu responder, preciso que você cole uma chave Gemini válida do Google AI Studio.",
            "Sem ela, este chat não faz nenhuma resposta local nem improvisa fora do livro."
          ],
          evidence: [],
        });
        return;
      }

      chatRuntime.pending = true;
      submitButton.disabled = true;
      submitButton.textContent = "Consultando Gemini...";
      appendUserMessage(log, value);
      try {
        const reply = await composeChatReply(value);
        appendAssistantMessage(log, reply);
        chatRuntime.history.push({
          role: "user",
          text: value,
          intent: reply.intent,
          topicName: reply.topicName,
        });
        chatRuntime.history.push({
          role: "assistant",
          text: reply.paragraphs.join(" "),
          intent: reply.intent,
          topicName: reply.topicName,
        });
        chatRuntime.history = chatRuntime.history.slice(-8);
        input.value = "";
        input.focus();
      } catch (_error) {
        appendAssistantMessage(log, {
          paragraphs: [
            "Houve uma falha ao consultar o Gemini nesta rodada.",
            "Confira a chave da API e tente de novo."
          ],
          evidence: [],
        });
      } finally {
        chatRuntime.pending = false;
        submitButton.disabled = false;
        submitButton.textContent = "Perguntar";
      }
    });
  }

  function splitChatSentences(text) {
    return String(text || "")
      .split(/(?<=[.!?…»])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ«—])/u)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 35);
  }

  function cleanChatSentence(text) {
    const value = String(text || "")
      .replace(/^[—-]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    return shorten(value, 280);
  }

  function buildChatTopics(overview) {
    return [
      ...overview.characters.map((item) => ({
        type: "character",
        name: item.name,
        aliases: item.aliases && item.aliases.length ? item.aliases : [item.name],
      })),
      ...overview.cities.map((item) => ({
        type: "city",
        name: item.name,
        aliases: item.aliases && item.aliases.length ? item.aliases : [item.name],
      })),
      ...overview.settings.map((item) => ({
        type: "setting",
        name: item.name,
        aliases: item.aliases && item.aliases.length ? item.aliases : [item.name],
      })),
    ];
  }

  function buildChatIndex(chunks) {
    const docs = chunks.flatMap((chunk) => {
      const sentences = splitChatSentences(chunk.text);
      const source = sentences.length ? sentences : [chunk.text];
      return source.map((sentence, sentenceIndex) => {
        const tokens = tokenize(sentence);
        const counts = new Map();
        tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
        return {
          id: `${chunk.id}:${sentenceIndex}`,
          chunk,
          sentence: cleanChatSentence(sentence),
          tokens,
          counts,
          normText: normalize(sentence),
        };
      });
    });

    const documentFrequency = new Map();
    docs.forEach((doc) => {
      Array.from(new Set(doc.tokens)).forEach((token) => {
        documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
      });
    });

    const totalDocs = docs.length;
    const idf = new Map();
    documentFrequency.forEach((count, token) => {
      idf.set(token, Math.log((totalDocs + 1) / (count + 1)) + 1);
    });

    return { docs, idf };
  }

  function syncChatModeUI(message = "") {
    if (!chatRuntime) {
      return;
    }
    const status = document.querySelector("#chat-mode-status");
    if (message) {
      status.textContent = message;
      return;
    }

    if (chatRuntime.apiKey) {
      status.textContent = "Gemini pronto. O modelo usa o livro internamente para orientar a resposta como Jean Valjean.";
      return;
    }

    status.textContent = "Cole uma chave Gemini do Google AI Studio para ativar o chat.";
  }

  function detectTopic(query) {
    const normalizedQuery = normalize(query);
    let best = null;

    chatTopics.forEach((topic) => {
      topic.aliases.forEach((alias) => {
        const normalizedAlias = normalize(alias);
        if (!normalizedAlias || !normalizedQuery.includes(normalizedAlias)) {
          return;
        }
        const score = normalizedAlias.split(" ").length;
        if (!best || score > best.score) {
          best = { ...topic, score };
        }
      });
    });

    return best;
  }

  function detectChatIntent(query) {
    const normalizedQuery = normalize(query).replace(/\s+/g, " ").trim();
    if (!normalizedQuery) {
      return "factual";
    }

    const greetingPatterns = [
      /\boi\b/,
      /\bola\b/,
      /\bbom dia\b/,
      /\bboa tarde\b/,
      /\bboa noite\b/,
      /\btudo bem\b/,
      /\bcomo vai\b/,
      /\bcomo esta\b/,
      /\be ai\b/,
      /\bsaudacoes\b/,
    ];

    if (greetingPatterns.some((pattern) => pattern.test(normalizedQuery)) && normalizedQuery.split(" ").length <= 10) {
      return "greeting";
    }

    const identityPatterns = [
      "qual seu nome",
      "quais nomes",
      "que nomes",
      "outros nomes",
      "apelido",
      "apelidos",
      "como te chamam",
      "como o chamam",
      "como lhe chamam",
      "identidade",
      "nome verdadeiro",
      "madeleine",
      "madelaine",
      "senhor leblanc",
      "24601",
    ];

    if (identityPatterns.some((pattern) => normalizedQuery.includes(pattern))) {
      return "identity";
    }

    const worldviewPatterns = [
      "o que voce acha",
      "o que pensa",
      "qual sua opiniao",
      "como voce ve",
      "como o senhor ve",
      "voce acredita",
      "o senhor acredita",
      "como se sente",
      "o que aprendeu",
      "do que tem medo",
      "o que importa",
      "o que e justo",
      "o que e misericordia",
    ];

    if (worldviewPatterns.some((pattern) => normalizedQuery.includes(pattern))) {
      return "worldview";
    }

    return "factual";
  }

  function isLikelyFollowUp(query) {
    const normalizedQuery = normalize(query).replace(/\s+/g, " ").trim();
    if (!normalizedQuery || normalizedQuery.split(" ").length > 8) {
      return false;
    }
    return [
      "mas ",
      "e ",
      "entao",
      "por que",
      "porque",
      "pq ",
      "antes",
      "outros",
      "outro",
      "como assim",
    ].some((pattern) => normalizedQuery.startsWith(pattern) || normalizedQuery.includes(` ${pattern}`));
  }

  function buildRecentChatContext() {
    if (!chatRuntime?.history?.length) {
      return "";
    }
    return chatRuntime.history
      .slice(-4)
      .map((entry) => `${entry.role === "user" ? "Leitor" : "Jean Valjean"}: ${entry.text}`)
      .join("\n");
  }

  function buildValjeanIdentityContext() {
    const aliasDetails = characterAliasDetails.get("Jean Valjean");
    const aliases = aliasDetails?.extras?.length
      ? aliasDetails.extras.map(formatAliasLabel)
      : [];
    const aliasLine = aliases.length
      ? `Outras formas ligadas à sua identidade nesta leitura: ${joinLabels(aliases)}.`
      : "";
    return [
      "Seu nome principal é Jean Valjean.",
      "Senhor Madelaine ou Madeleine é um dos nomes sob os quais você viveu.",
      aliasLine,
    ].filter(Boolean).join(" ");
  }

  function searchChatChunks(query, topic) {
    const tokens = tokenize(query);
    const topicAliases = topic ? topic.aliases.map((alias) => normalize(alias)) : [];
    if (!tokens.length && !topicAliases.length) {
      return [];
    }

    const normalizedQuery = normalize(query);
    return chatIndex.docs
      .map((doc) => {
        let score = 0;
        tokens.forEach((token) => {
          score += (doc.counts.get(token) || 0) * (chatIndex.idf.get(token) || 0);
        });
        if (tokens.length > 1 && doc.normText.includes(normalizedQuery)) {
          score += 2.8;
        }
        topicAliases.forEach((alias) => {
          if (doc.normText.includes(alias)) {
            score += 4.2;
          }
        });
        if (topic && topic.type === "character" && topic.name !== "Jean Valjean") {
          const hasTopic = topicAliases.some((alias) => doc.normText.includes(alias));
          const hasValjean = valjeanAliases.some((alias) => doc.normText.includes(alias));
          if (hasTopic && hasValjean) {
            score += 2.4;
          }
        }
        tokens.forEach((token) => {
          if (normalize(doc.chunk.chapterTitle).includes(token)) {
            score += 0.5;
          }
        });
        if (doc.sentence.length > 260) {
          score -= 0.4;
        }
        return { ...doc, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .reduce((accumulator, item) => {
        if (!accumulator.some((entry) => entry.sentence === item.sentence)) {
          accumulator.push(item);
        }
        return accumulator;
      }, [])
      .slice(0, 6);
  }

  function isDirectWitnessMatch(item, topic) {
    if (!topic || topic.type !== "character" || topic.name === "Jean Valjean") {
      return false;
    }
    const topicAliases = topic.aliases.map((alias) => normalize(alias));
    const hasTopic = topicAliases.some((alias) => item.normText.includes(alias));
    const hasValjean = valjeanAliases.some((alias) => item.normText.includes(alias));
    return hasTopic && hasValjean;
  }

  function buildChatEvidence(topic, matches) {
    if (!matches.length) {
      return {
        strong: false,
        primaryMatch: null,
        evidence: [],
        evidenceSource: [],
      };
    }

    const strong = matches[0].score >= 5.5;
    const primaryMatch = matches.find((item) => isDirectWitnessMatch(item, topic)) || matches[0];
    const remaining = matches.filter((item) => item.id !== primaryMatch.id);
    const evidenceSource = [primaryMatch, ...remaining.slice(0, strong ? 4 : 3)];
    const evidence = evidenceSource.map((item) => ({
      text: item.sentence,
      citation: `${item.chunk.chapterTitle} — ${formatPageRange(item.chunk.pageStart, item.chunk.pageEnd)}`,
    }));

    return {
      strong,
      primaryMatch,
      evidence,
      evidenceSource,
    };
  }

  function buildGeminiUserPrompt(query, topic, matchBundle, intent) {
    const evidenceText = matchBundle.evidence.length
      ? matchBundle.evidence.map((item, index) => `${index + 1}. ${item.text}`).join("\n\n")
      : "Nenhuma passagem específica foi recuperada para esta pergunta.";
    const recentContext = buildRecentChatContext();

    const intentGuidance = intent === "greeting"
      ? "Trate isso como uma saudação ou abertura de conversa. Responda com naturalidade, de modo breve e humano, sem dizer que faltam evidências."
      : intent === "identity"
        ? "Trate isso como uma pergunta sobre seu próprio nome, apelidos ou identidades. Responda de modo direto, completo e sem fingir desconhecimento do que já foi informado sobre você."
      : intent === "worldview"
        ? "Trate isso como uma pergunta de visão de mundo. Responda a partir dos valores e experiências de Jean Valjean, sem inventar cenas novas."
        : matchBundle.strong
          ? "Há base textual relativamente direta para responder."
          : "A base textual é parcial. Se a pergunta pedir mais do que Jean Valjean pode saber, diga que não sabe ou que só pode supor.";

    return [
      `Pergunta do leitor: ${query}`,
      `Tipo de pergunta: ${intent}.`,
      topic ? `Tema detectado: ${topic.name}.` : "Tema detectado: sem nome claro.",
      `Panorama interno de Jean Valjean: ${VALJEAN_WORLDVIEW_BRIEF}`,
      `Nota de identidade: ${buildValjeanIdentityContext()}`,
      recentContext ? `Histórico recente da conversa:\n${recentContext}` : "",
      intentGuidance,
      `Trechos internos do livro para orientar sua resposta:\n${evidenceText}`,
      "Responda agora como Jean Valjean.",
      "Não mencione fonte, página, capítulo ou trechos. Não copie os trechos literalmente; transforme-os numa resposta direta."
    ].filter(Boolean).join("\n\n");
  }

  async function requestGeminiChatReply(query, topic, matchBundle, intent) {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": chatRuntime.apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildGeminiUserPrompt(query, topic, matchBundle, intent) }],
          },
        ],
        generationConfig: {
          temperature: intent === "greeting" ? 0.35 : 0.22,
          topP: 0.8,
          maxOutputTokens: 480,
          responseMimeType: "text/plain",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Gemini retornou ${response.status}`);
    }

    const data = await response.json();
    const text = (data.candidates || [])
      .flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text || "")
      .join("\n")
      .trim();

    if (!text) {
      throw new Error("Gemini não devolveu texto.");
    }

    const paragraphs = text
      .split(/\n{2,}/)
      .map((item) => item.replace(/^Jean Valjean:\s*/i, "").trim())
      .filter(Boolean)
      .slice(0, 2);

    return {
      paragraphs: paragraphs.length ? paragraphs : [text],
      evidence: [],
      intent,
      topicName: topic?.name || null,
    };
  }

  async function composeChatReply(query) {
    const lastTurn = chatRuntime?.history?.at(-1) || null;
    let intent = detectChatIntent(query);
    if (intent === "factual" && lastTurn && isLikelyFollowUp(query) && lastTurn.intent) {
      intent = lastTurn.intent;
    }

    let topic = detectTopic(query);
    if (!topic && intent === "identity") {
      topic = chatTopics.find((item) => item.name === "Jean Valjean") || null;
    }
    if (!topic && lastTurn && isLikelyFollowUp(query) && lastTurn.topicName) {
      topic = chatTopics.find((item) => item.name === lastTurn.topicName) || null;
    }

    const matches = intent === "greeting" ? [] : searchChatChunks(query, topic);
    const matchBundle = buildChatEvidence(topic, matches);
    return requestGeminiChatReply(query, topic, matchBundle, intent);
  }

  function appendUserMessage(log, text) {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-message user";
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    wrapper.appendChild(paragraph);
    log.appendChild(wrapper);
    log.scrollTop = log.scrollHeight;
  }

  function appendAssistantMessage(log, payload) {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-message assistant";

    payload.paragraphs.forEach((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      wrapper.appendChild(paragraph);
    });

    log.appendChild(wrapper);
    log.scrollTop = log.scrollHeight;
  }
})();
