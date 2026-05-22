/**
 * Journalistic Reaction Simulator — app.js
 * Supports OpenAI, Google Gemini, and Anthropic (via CORS proxy)
 */

// ——— Utils ———————————————————————————————————————————————
const escHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// ——— Provider config —————————————————————————————————————
const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    placeholder: 'sk-...',
    hint: 'Salva só no seu navegador. Nunca enviada a nenhum servidor.',
    models: [
      { value: 'gpt-4o-mini',  label: 'gpt-4o-mini — mais econômico ⭐' },
      { value: 'gpt-4o',       label: 'gpt-4o — mais preciso' },
      { value: 'gpt-4-turbo',  label: 'gpt-4-turbo' },
    ],
    modelHint: 'gpt-4o-mini custa ~$0,01 por simulação completa.',
  },
  gemini: {
    label: 'Google Gemini',
    placeholder: 'AIza...',
    hint: 'Chave do Google AI Studio (aistudio.google.com). Salva só no seu navegador.',
    models: [
      { value: 'gemini-2.5-flash',      label: 'gemini-2.5-flash — equilíbrio custo/qualidade ⭐' },
      { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite — mais rápido e econômico' },
      { value: 'gemini-2.5-pro',        label: 'gemini-2.5-pro — mais preciso e potente' },
    ],
    modelHint: 'Obtenha sua chave gratuita em aistudio.google.com. O modelo 2.5 Flash é o padrão.',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-...',
    hint: 'A API da Anthropic bloqueia chamadas diretas do navegador. Você precisa de um proxy CORS.',
    models: [
      { value: 'claude-haiku-3-5',  label: 'claude-3-5-haiku — mais econômico ⭐' },
      { value: 'claude-sonnet-3-7', label: 'claude-3-7-sonnet — mais preciso' },
    ],
    modelHint: 'Requer um servidor proxy por limitações CORS da Anthropic.',
  },
};

// ——— Personas ——————————————————————————————————————————————
// Based on: Reuters Institute Digital News Report, Pew Research social media typologies,
// academic studies on online commenting behavior (lurkers, trolls, self-promoters, engagers)
// and Brazilian political media consumption patterns.
const PERSONAS = [
  // ── Political spectrum ─────────────────────────────────
  {
    id: 'leitor_neutro',
    emoji: '🗣️',
    name: 'Leitor neutro',
    category: 'Espectro político',
    role: 'Cidadão sem filiação política clara',
    description: 'Um leitor que busca informações práticas e objetivas. Não costuma assumir lados em disputas ideológicas e foca no impacto direto da notícia no seu dia a dia.',
    sentiment_hint: 'pragmatic, neither strongly supportive nor critical, asks practical questions about what will change in practice',
  },
  {
    id: 'leitor_esq_gov',
    emoji: '🔴',
    name: 'Esquerda governista',
    category: 'Espectro político',
    role: 'Leitor alinhado ao governo de esquerda atual',
    description: 'Costuma apoiar investigações que exponham a oposição, mas pode ser cético ou defensivo se a notícia envolver aliados ou críticas ao governo atual.',
    sentiment_hint: 'supports the investigation if it exposes opposition corruption, suspicious if it involves gov allies; uses social justice framing',
  },
  {
    id: 'leitor_esq_rad',
    emoji: '🚩',
    name: 'Esquerda radical',
    category: 'Espectro político',
    role: 'Leitor de esquerda crítica e radical',
    description: 'Crítico tanto da direita quanto da esquerda institucional. Analisa as notícias sob a ótica da luta de classes e do anti-capitalismo sistêmico.',
    sentiment_hint: 'critical of both establishment right and institutional left; uses class-struggle and systemic anti-capitalist framing',
  },
  {
    id: 'leitor_dir_rad',
    emoji: '🟡',
    name: 'Direita radical',
    category: 'Espectro político',
    role: 'Leitor alinhado à direita conservadora radical',
    description: 'Desconfia da mídia tradicional e defende valores conservadores. Foca em temas como liberdade individual, patriotismo e combate à doutrinação.',
    sentiment_hint: 'accuses media bias, defends traditional values; uses terms like "mídia tradicional", "doutrinação", "conservadorismo"',
  },
  {
    id: 'leitor_dir_lib',
    emoji: '🎩',
    name: 'Direita liberal',
    category: 'Espectro político',
    role: 'Leitor de direita liberal e pró-mercado',
    description: 'Valoriza a responsabilidade fiscal, o estado de direito e a livre iniciativa. Costuma criticar intervenções estatais e o populismo.',
    sentiment_hint: 'focuses on institutional rule of law, fiscal responsibility; critical of state intervention and polarization',
  },
  {
    id: 'leitor_cético_rad',
    emoji: '🕳️',
    name: 'Cético radical',
    category: 'Espectro político',
    role: 'Leitor que desconfia de narrativas oficiais',
    description: 'Enxerga a notícia como uma possível distração ou parte de uma agenda oculta. Usa sarcasmo e questiona as verdadeiras intenções por trás da divulgação.',
    sentiment_hint: 'dismisses the article as a distraction from hidden agendas; references "élites", "ajuste de contas" or "distração planejada"; uses sarcasm',
  },
  // ── Professional voices ────────────────────────────────
  {
    id: 'advogado',
    emoji: '⚖️',
    name: 'Especialista jurídico',
    category: 'Vozes profissionais',
    role: 'Advogado / jurista',
    description: 'Analisa o conteúdo sob o ponto de vista técnico-jurídico, focando em devido processo, constitucionalidade e precisão dos termos legais citados.',
    sentiment_hint: 'analytical, focuses precisely on legal implications, due process, constitutional angles; may point out what the reporting gets legally wrong or right',
  },
  {
    id: 'abordado',
    emoji: '🛡️',
    name: 'Pessoa abordada',
    category: 'Vozes profissionais',
    role: 'Sujeito direto da matéria (nota de defesa)',
    description: 'Representa a voz de quem é citado ou investigado. Tende a negar irregularidades, alegar falta de contexto ou atacar a metodologia da reportagem.',
    sentiment_hint: 'defensive, denying wrongdoing; attacks the journalist\'s methodology or cherry-picking; claims to have been misquoted or that context is missing',
  },
  {
    id: 'ativista',
    emoji: '📢',
    name: 'Ativista / ONG',
    category: 'Vozes profissionais',
    role: 'Ativista de direitos humanos ou meio ambiente',
    description: 'Celebra a exposição de problemas sociais e pede ações concretas. Foca nas falhas sistêmicas e nas causas estruturais do problema relatado.',
    sentiment_hint: 'celebrates the exposure, calls for concrete policy action; references systemic failures and structural causes beyond the individual story',
  },
  {
    id: 'jornalista',
    emoji: '🎙️',
    name: 'Jornalista concorrente',
    category: 'Vozes profissionais',
    role: 'Colega de imprensa',
    description: 'Observa a matéria com o olhar do ofício. Nota o que é novo, o que falta e como o método de apuração se compara ao de outros veículos.',
    sentiment_hint: 'professional tone; notes methodologically what the story confirms or is missing; subtly competitive; may link to their own related coverage',
  },
  {
    id: 'academico',
    emoji: '🎓',
    name: 'Acadêmico / analista',
    category: 'Vozes profissionais',
    role: 'Pesquisador / professor universitário',
    description: 'Contextualiza a notícia dentro de padrões históricos ou dados estatísticos. Evita linguagem emocional e foca na análise de longo prazo.',
    sentiment_hint: 'neutral, measured; contextualizes the story within broader historical patterns in Brazil; may cite data or academic studies; avoids emotional language',
  },
  // ── Social media behavior typologies ──────────────────
  {
    id: 'leitor_duvida',
    emoji: '🧐',
    name: 'Leitor em dúvida',
    category: 'Comportamentos online',
    role: 'Leitor focado em clareza e didatismo',
    description: 'Representa o público que quer realmente entender os fatos. Pede explicações de termos difíceis e aponta lacunas lógicas na narrativa.',
    sentiment_hint: 'asks for clarification on complex terms or logical gaps; wants to truly understand the facts before forming an opinion; polite but demanding of the journalist\'s clarity; points out if something remained confusing',
  },
  {
    id: 'auto_promotor',
    emoji: '📣',
    name: 'Auto-promotor',
    category: 'Comportamentos online',
    role: 'Usuário que usa a notícia para se promover',
    description: 'Engaja pouco com o conteúdo da matéria e foca em direcionar o público para sua própria "thread", newsletter ou rede social.',
    sentiment_hint: 'barely engages with the actual story; pivot to promoting themselves, their newsletter, podcast or "thread" on the topic; ends with a follow/subscribe CTA',
  },
  {
    id: 'especialista_autoproclamado',
    emoji: '🧠',
    name: 'Especialista autoproclamado',
    category: 'Comportamentos online',
    role: 'Usuário que alega saber mais do que o jornalista',
    description: 'Frequentemente condescendente, alega possuir informações de bastidor ou experiências que invalidariam ou completariam o trabalho da imprensa.',
    sentiment_hint: 'condescending, claims insider knowledge or experience; points out things the journalist "missed" or "got wrong"; may be right about some things but overstates their expertise',
  },
  {
    id: 'compartilhador_sem_ler',
    emoji: '🔁',
    name: 'Compartilhador sem ler',
    category: 'Comportamentos online',
    role: 'Usuário que reage só à manchete',
    description: 'Reage impulsivamente a partir do título. Costuma errar fatos explicados no corpo do texto, mas compartilha a notícia para reforçar sua opinião.',
    sentiment_hint: 'very short comment, clearly based only on the headline; gets at least one factual detail visibly wrong or asks something answered in the article body; shares anyway',
  },
  {
    id: 'engajado_emocional',
    emoji: '😢',
    name: 'Leitor emocionalmente engajado',
    category: 'Comportamentos online',
    role: 'Usuário com reação emocional intensa',
    description: 'Identifica-se emocionalmente com as vítimas ou afetados pela história. Traz relatos pessoais e pede empatia da comunidade.',
    sentiment_hint: 'reacts emotionally and empathetically, identifying with victims or affected parties; personal anecdote or family reference; calls for empathy from others; not necessarily political',
  },
  {
    id: 'debatedor',
    emoji: '💬',
    name: 'Debatedor compulsivo',
    category: 'Comportamentos online',
    role: 'Usuário que quer brigar nos comentários',
    description: 'Busca o conflito direto com outros leitores ou com o veículo. Faz perguntas retóricas e provocações para manter o engajamento na briga.',
    sentiment_hint: 'intentionally provocative; challenges other commenters or the journalist directly; asks aggressive or rhetorical questions; wants to start or sustain an argument',
  },
  {
    id: 'gen_z',
    emoji: '📱',
    name: 'Leitor Gen Z / jovem',
    category: 'Comportamentos online',
    role: 'Jovem brasileiro de 18-25 anos, muito online',
    description: 'Usa gírias de internet e linguagem informal. Costuma ser cético em relação às instituições, usando humor ácido ou reações curtas.',
    sentiment_hint: 'very informal language, uses internet slang ("mds", "isso aí", "surreal", "absurdo"), brief reactions, dark humor, may reference internet culture or memes; politically aware but cynical',
  },
  {
    id: 'diaspora',
    emoji: '🌍',
    name: 'Brasileiro da diáspora',
    category: 'Comportamentos online',
    role: 'Brasileiro vivendo no exterior',
    description: 'Observa o Brasil comparando-o com o país onde vive. Traz uma perspectiva de quem está fora, às vezes misturando inglês ou filtrando pela visão estrangeira.',
    sentiment_hint: 'compares Brazil to their host country; frustrated but hopeful; notes how the story resonates or differs from international coverage; may comment in mixed PT/EN',
  },
  {
    id: 'conservador_tradicional',
    emoji: '👴',
    name: 'Conservador tradicional',
    category: 'Comportamentos online',
    role: 'Leitor mais velho, valores tradicionais',
    description: 'Reage a partir de uma ótica moral ou religiosa. Lamenta a "perda de valores" e é cauteloso com mudanças bruscas no status quo.',
    sentiment_hint: 'not explicitly partisan; reacts through a moral/religious lens ("onde foi parar os valores?"); nostalgic about a perceived better past; cautious about conclusions; formal language',
  },
  {
    id: 'lurker_ativado',
    emoji: '👀',
    name: 'Lurker ativado',
    category: 'Comportamentos online',
    role: 'Leitor silencioso que raramente comenta',
    description: 'Geralmente apenas lê, mas foi motivado a comentar por algo chocante ou muito relevante. Costuma ser direto e sério.',
    sentiment_hint: 'explicitly says they rarely comment but this story made them break the silence; brief, direct, earnest; no political posturing; focused on one specific fact that shocked them',
  },
  {
    id: 'critico_veiculo',
    emoji: '🚫',
    name: 'Crítico do veículo',
    category: 'Comportamentos online',
    role: 'Leitor que foca em descredibilizar o veículo',
    description: 'Foca no mensageiro em vez da mensagem. Busca erros passados do veículo ou suposto viés editorial para invalidar a notícia atual, ignorando os fatos apresentados.',
    sentiment_hint: 'attacks the news outlet\'s credibility; ignores the article\'s facts to focus on the "agenda" or past mistakes of the publisher; uses phrases like "vende-se para quem paga mais" or "mídia tendenciosa"',
  },
];

// ——— DOM refs ————————————————————————————————————————————
const formEl          = document.getElementById('simForm');
const providerSelect  = document.getElementById('providerSelect');
const modelSelect     = document.getElementById('modelSelect');
const modelHint       = document.getElementById('modelHint');
const apiKeyInput     = document.getElementById('apiKey');
const keyHint         = document.getElementById('keyHint');
const keyToggleBtn    = document.getElementById('keyToggle');
const articleInput    = document.getElementById('articleText');
const contextInput    = document.getElementById('contextText');
const outletInput     = document.getElementById('outletName');
const submitBtn       = document.getElementById('submitBtn');
const resultsArea     = document.getElementById('resultsArea');
const resultsContent  = document.getElementById('results-content');
const analysisReport  = document.getElementById('analysis-report');
const socialModeToggle = document.getElementById('socialMode');
const postPreview     = document.getElementById('postPreview');
const previewTitle    = document.getElementById('previewTitle');
const previewBody     = document.getElementById('previewBody');
const previewOutlet   = document.getElementById('previewOutlet');
const corsWarning     = document.getElementById('corsWarning');
const proxyGroup      = document.getElementById('proxyGroup');
const proxyUrlInput   = document.getElementById('proxyUrl');
const personaChipsContainer = document.querySelector('.persona-chips');
const customPersonasContainer = document.getElementById('custom-personas-container');
const addPersonaBtn = document.getElementById('addPersonaBtn');

// ——— Init ————————————————————————————————————————————————
window.addEventListener('DOMContentLoaded', () => {
  const savedProvider = localStorage.getItem('sim_provider') || 'gemini';
  providerSelect.value = savedProvider;
  updateProviderUI(savedProvider);

  const savedKey = localStorage.getItem(`sim_key_${savedProvider}`) || '';
  if (savedKey) apiKeyInput.value = savedKey;

  const savedProxy = localStorage.getItem('sim_proxy') || '';
  if (proxyUrlInput && savedProxy) proxyUrlInput.value = savedProxy;

  renderPersonaChips();

  // Custom persona logic
  if (addPersonaBtn) {
    addPersonaBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'custom-persona-row';
      row.innerHTML = `
        <button type="button" class="btn-remove-persona" title="Remover"><i class="fas fa-times"></i></button>
        <div class="form-group">
          <label class="form-label">Nome do perfil</label>
          <input type="text" class="form-input custom-persona-name" placeholder="Ex: Engenheiro civil / Crítico de arte">
        </div>
        <div class="form-group">
          <label class="form-label">Comportamento (Personalidade)</label>
          <textarea class="form-textarea short custom-persona-role" placeholder="Ex: Analisa a viabilidade técnica / Foca no impacto estético..."></textarea>
        </div>
      `;
      customPersonasContainer.appendChild(row);
      
      row.querySelector('.btn-remove-persona').addEventListener('click', () => {
        row.remove();
      });
    });
  }
});

// ——— Provider change ————————————————————————————————————
providerSelect.addEventListener('change', () => {
  const provider = providerSelect.value;
  localStorage.setItem('sim_provider', provider);
  updateProviderUI(provider);
  // Restore saved key for this provider
  apiKeyInput.value = localStorage.getItem(`sim_key_${provider}`) || '';
});

function updateProviderUI(provider) {
  const cfg = PROVIDERS[provider];

  // Update model list
  modelSelect.innerHTML = cfg.models
    .map(m => `<option value="${m.value}">${m.label}</option>`)
    .join('');

  // Restore saved model
  const savedModel = localStorage.getItem(`sim_model_${provider}`);
  if (savedModel) modelSelect.value = savedModel;

  // Update hints and placeholder
  modelHint.textContent  = cfg.modelHint;
  keyHint.textContent    = cfg.hint;
  apiKeyInput.placeholder = cfg.placeholder;

  // Show/hide Anthropic proxy warning
  const isAnthropic = provider === 'anthropic';
  corsWarning.classList.toggle('hidden', !isAnthropic);
  proxyGroup.classList.toggle('hidden', !isAnthropic);
}


function renderPersonaChips() {
  if (!personaChipsContainer) return;

  const categories = ['Espectro político', 'Vozes profissionais', 'Comportamentos online'];
  let html = '';

  categories.forEach(cat => {
    html += `<span class="chip chip-section">${cat}</span>`;
    const filtered = PERSONAS.filter(p => p.category === cat);
    filtered.forEach(p => {
      const chipClass = p.id.includes('esq') ? 'chip-red' : 
                        p.id.includes('dir_rad') ? 'chip-yellow' :
                        p.id.includes('dir_lib') ? 'chip-blue' :
                        p.id.includes('cético') ? 'chip-dark' : '';
      
      html += `
        <span class="chip ${chipClass}">
          ${escHtml(p.emoji)} ${escHtml(p.name)}
          <span class="info-icon">?
            <span class="tooltip">${escHtml(p.description)}</span>
          </span>
        </span>`;
    });
  });

  personaChipsContainer.innerHTML = html;
}

// ——— Persist settings ———————————————————————————————————
apiKeyInput.addEventListener('change', () => {
  const provider = providerSelect.value;
  localStorage.setItem(`sim_key_${provider}`, apiKeyInput.value.trim());
});
modelSelect.addEventListener('change', () => {
  const provider = providerSelect.value;
  localStorage.setItem(`sim_model_${provider}`, modelSelect.value);
});
if (proxyUrlInput) {
  proxyUrlInput.addEventListener('change', () => {
    localStorage.setItem('sim_proxy', proxyUrlInput.value.trim());
  });
}

// ——— API key toggle ——————————————————————————————————————
keyToggleBtn.addEventListener('click', () => {
  const isPwd = apiKeyInput.type === 'password';
  apiKeyInput.type = isPwd ? 'text' : 'password';
  keyToggleBtn.innerHTML = isPwd ? '🙈' : '👁️';
});

// ——— Form submit ——————————————————————————————————————————
formEl.addEventListener('submit', async (e) => {
  e.preventDefault();

  const provider = providerSelect.value;
  const model    = modelSelect.value;
  const apiKey   = apiKeyInput.value.trim();
  const article  = articleInput.value.trim();
  const context  = contextInput.value.trim();
  const outlet   = outletInput.value.trim() || 'Veículo jornalístico';
  const proxyUrl = proxyUrlInput ? proxyUrlInput.value.trim() : '';

  if (!apiKey)                       return showError('Insira sua chave de API para continuar.');
  if (!article || article.length < 40) return showError('Insira o texto jornalístico completo (ao menos 40 caracteres).');
  if (provider === 'anthropic' && !proxyUrl) return showError('Informe a URL do proxy CORS para usar a API da Anthropic.');

  localStorage.setItem(`sim_key_${provider}`, apiKey);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Simulando reações…';

  // Collect custom personas
  const customPersonaRows = document.querySelectorAll('.custom-persona-row');
  const customPersonas = [];
  customPersonaRows.forEach(row => {
    const name = row.querySelector('.custom-persona-name').value.trim();
    const role = row.querySelector('.custom-persona-role').value.trim();
    if (name && role) {
      customPersonas.push({ name, role });
    }
  });

  renderPostPreview(article, outlet);
  showSkeleton();

  try {
    let result;
    if (provider === 'openai')      result = await callOpenAI(apiKey, model, article, context, outlet, customPersonas);
    else if (provider === 'gemini') result = await callGemini(apiKey, model, article, context, outlet, customPersonas);
    else                            result = await callAnthropic(apiKey, model, proxyUrl, article, context, outlet, customPersonas);
    const { reactions, threads, analysis } = result;
    renderComments(reactions, threads, analysis);
  } catch (err) {
    showError(humanizeError(err, provider));
  } finally {
    clearLoader();
    submitBtn.disabled = false;
    submitBtn.textContent = 'Simular reações';
  }
});

// ——— Prompt builder ——————————————————————————————————————
function buildPrompt(article, context, outlet, customPersonas = []) {
  const personaDescriptions = PERSONAS.map(p =>
    `{"id":"${p.id}","emoji":"${p.emoji}","name":"${p.name}","role":"${p.role}","sentiment_hint":"${p.sentiment_hint}"}`
  ).join(',\n');

  // Add custom personas to the description list for the AI
  const customDescriptions = customPersonas.map((cp, idx) => 
    `{"id":"custom_${idx}","emoji":"👤","name":"${cp.name}","role":"${cp.role}","sentiment_hint":"comentário baseado estritamente nesta personalidade definida pelo usuário"}`
  ).join(',\n');

  const totalPersonaDescriptions = customDescriptions 
    ? personaDescriptions + ',\n' + customDescriptions
    : personaDescriptions;

  const totalCount = PERSONAS.length + customPersonas.length;

  let system = `You are a social simulation engine for investigative journalism.
Generate realistic, distinct simulated reactions to a journalistic article.
Each reaction must be from a DIFFERENT persona with a unique voice and perspective.
Comments must be in Brazilian Portuguese.
Return ONLY a valid JSON object with this exact structure — no markdown, no explanation:
{
  "reactions": [
    {
      "id": string,
      "emoji": string,
      "name": string,
      "role": string,
      "sentiment": "positive" | "critical" | "neutral" | "mixed",
      "comment": string (2-4 sentences in the persona's authentic voice),
      "likes": integer (realistic number of likes)
    }
  ],
  "threads": {
    "persona_id_X": [
      { "emoji": string, "name": string, "role": string, "comment": string }
    ]
  }
}`;

  if (socialModeToggle?.checked) {
    system += `\n\n### AGENTIC SOCIAL SIMULATION MODE (ACTIVE)
You must simulate a dynamic social environment. 
1. INITIAL REACTIONS: First, determine how personas react independently to the article.
2. SOCIAL FRICTION: Then, simulate the "second wave" where personas see each other's reactions. Some will double down (polarization), others will cave to pressure (echo chamber), and some will start "dog-piling" on controversial comments.
3. CONTAGION: If a critical or emotional comment gets early traction, show how it "infects" the mood of other segments.

Your JSON must also include an "analysis" object with:
- "risks": [3-5 succinct bullet points of political/social/legal risks for the reporter]
- "impact": "Resumo do potencial de repercussão (positiva/negativa)"
- "verdict": "Um relatório final sucinto (máx 1 página) sobre o 'termômetro' da matéria."`;
  }

  const user = `Artigo / texto jornalístico:
"""
${article}
"""

${context ? `Contexto adicional:\n"""\n${context}\n"""\n` : ''}Veículo: ${outlet}

Gere um comentário realista para cada uma das ${totalCount} personas:
[${totalPersonaDescriptions}]

Retorne o JSON com "reactions" (${totalCount} itens com likes) e "threads" (interações ricas nos 5 comentários mais populares).${socialModeToggle?.checked ? ' Inclua o objeto "analysis".' : ''}`;

  return { system, user };
}

function parseResponse(raw) {
  let obj;
  try { obj = JSON.parse(raw); } catch { throw new Error('A IA retornou um formato inválido. Tente novamente.'); }
  
  if (Array.isArray(obj)) return { reactions: obj, threads: {}, analysis: null };
  
  const reactions = obj.reactions ?? Object.values(obj).find(v => Array.isArray(v)) ?? [];
  const threads   = obj.threads || {};
  const analysis  = obj.analysis || null;
  
  return { reactions, threads, analysis };
}


// ——— OpenAI ——————————————————————————————————————————————
async function callOpenAI(apiKey, model, article, context, outlet, customPersonas) {
  const { system, user } = buildPrompt(article, context, outlet, customPersonas);
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.85,
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erro HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return parseResponse(data.choices?.[0]?.message?.content || '');
}

// ——— Google Gemini ———————————————————————————————————————
async function callGemini(apiKey, model, article, context, outlet, customPersonas) {
  const { system, user } = buildPrompt(article, context, outlet, customPersonas);
  const fullPrompt = `${system}\n\n${user}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.85 },
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erro HTTP ${resp.status}`);
  }
  const data = await resp.json();
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseResponse(raw);
}

// ——— Anthropic (via proxy) ———————————————————————————————
async function callAnthropic(apiKey, model, proxyBase, article, context, outlet, customPersonas) {
  const { system, user } = buildPrompt(article, context, outlet, customPersonas);
  const base = proxyBase.replace(/\/$/, '');
  const resp = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erro HTTP ${resp.status}`);
  }
  const data = await resp.json();
  const raw  = data.content?.[0]?.text || '';
  return parseResponse(raw);
}

// ——— Render post preview ————————————————————————————————
function renderPostPreview(article, outlet) {
  const lines = article.split('\n').filter(l => l.trim());
  const title = lines[0].length > 100 ? lines[0].substring(0, 97) + '…' : lines[0];
  const body  = lines.slice(1).join(' ');
  previewOutlet.textContent = outlet;
  previewTitle.textContent  = title;
  previewBody.textContent   = body || '(sem lead adicional)';
  postPreview.classList.remove('hidden');
}

// ——— Animated loading state —————————————————————————————
let _loaderInterval = null;

function showSkeleton() {
  const customCount = document.querySelectorAll('.custom-persona-row').length;
  const total = PERSONAS.length + customCount;

  if (_loaderInterval) clearInterval(_loaderInterval);

  resultsContent.innerHTML = `
    <div class="loader-state">
      <div class="loader-header">
        <span class="loader-label" id="loaderLabel">Consultando a IA…</span>
        <span class="loader-count" id="loaderCount">0 / ${total}</span>
      </div>
      <div class="loader-bar-track">
        <div class="loader-bar-fill" id="loaderBarFill"></div>
      </div>
    </div>
    <div class="skeleton-feed">
      ${Array.from({length: 6}, (_, i) => `
      <div class="skeleton-card" style="animation-delay:${i * 0.12}s">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line s"></div>
          <div class="skeleton-line l"></div>
          <div class="skeleton-line m"></div>
          <div class="skeleton-line f"></div>
        </div>
      </div>`).join('')}
    </div>`;

  // Cycle through persona names in the status label
  const label   = document.getElementById('loaderLabel');
  const counter = document.getElementById('loaderCount');
  const bar     = document.getElementById('loaderBarFill');
  let   idx     = 0;
  
  // Combine native personas and custom ones for the label cycle
  const customPersonaNames = Array.from(document.querySelectorAll('.custom-persona-row'))
    .map(row => ({ 
      emoji: '👤', 
      name: row.querySelector('.custom-persona-name').value.trim() || 'Persona Customizada' 
    }));
  
  const allDisplayPersonas = [
    ...PERSONAS.map(p => ({ emoji: p.emoji, name: p.name })),
    ...customPersonaNames
  ];

  _loaderInterval = setInterval(() => {
    if (!label || !counter || !bar) { clearInterval(_loaderInterval); return; }
    const p = allDisplayPersonas[idx % total];
    label.textContent   = `Gerando reação de ${p.emoji} ${p.name}…`;
    counter.textContent = `${idx + 1} / ${total}`;
    bar.style.width     = `${Math.round(((idx + 1) / total) * 100)}%`;
    idx++;
    if (idx >= total) clearInterval(_loaderInterval);
  }, 900);
}

function clearLoader() {
  if (_loaderInterval) { clearInterval(_loaderInterval); _loaderInterval = null; }
}


function renderAnalysisReport(data) {
  if (!analysisReport) return;
  if (!data) { analysisReport.classList.add('hidden'); return; }

  analysisReport.classList.remove('hidden');
  analysisReport.innerHTML = `
    <div class="report-header">
      <span style="font-size:1.5rem">📊</span>
      <h3 class="report-title">Relatório de Risco Social</h3>
    </div>
    <div class="report-grid">
      <div class="report-card">
        <h4>Principais Riscos</h4>
        <ul>
          ${(data.risks || []).map(r => `<li>${escHtml(r)}</li>`).join('')}
        </ul>
      </div>
      <div class="report-card">
        <h4>Impacto e Repercussão</h4>
        <p style="font-size:0.9rem; color:var(--subdued); line-height:1.5;">${escHtml(data.impact || '')}</p>
      </div>
    </div>
    <div class="report-verdict">
      <h4>Veredito Final</h4>
      <p>${escHtml(data.verdict || '')}</p>
    </div>
  `;
}

// ——— Render comments ————————————————————————————————————
function renderComments(reactions, threads = {}, analysis = null) {
  if (!reactions?.length) { showError('A IA não retornou comentários. Tente novamente.'); return; }

  renderAnalysisReport(analysis);

  // Sort descending by likes
  const sorted = [...reactions].sort((a, b) => (b.likes || 0) - (a.likes || 0));
  const topId  = sorted[0]?.id;

  const legendHtml = `
    <div class="legend">
      <span class="legend-item"><span class="legend-dot" style="background:var(--s-pos)"></span> Positivo</span>
      <span class="legend-item"><span class="legend-dot" style="background:var(--s-crit)"></span> Crítico</span>
      <span class="legend-item"><span class="legend-dot" style="background:var(--s-neu)"></span> Neutro</span>
      <span class="legend-item"><span class="legend-dot" style="background:var(--s-mix)"></span> Misto</span>
    </div>`;

  const likesLabel = (n) => {
    if (!n && n !== 0) return '';
    if (n >= 1000) return `${(n/1000).toFixed(1).replace('.0','')}k`;
    return String(n);
  };

  const renderThread = (thread, isTop) => {
    if (!thread || !thread.length) return '';
    return `
      <div class="thread-block">
        <div class="thread-header">${isTop ? 'Respostas em destaque' : 'Mais respostas'}</div>
        ${thread.map(r => {
          const pData = PERSONAS.find(p => p.name === r.name) || { description: r.role || 'Participante do debate.' };
          return `
          <div class="thread-reply">
            <span class="thread-avatar">${escHtml(r.emoji || '💬')}</span>
            <div class="thread-reply-body">
              <span class="thread-reply-name">
                ${escHtml(r.name || 'Anônimo')}
                <span class="info-icon">?
                  <span class="tooltip">${escHtml(pData.description)}</span>
                </span>
              </span>
              <span class="thread-reply-role">${escHtml(r.role || '')}</span>
              <p class="thread-reply-text">${escHtml(r.comment || '')}</p>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  };

  const cardsHtml = sorted.map((c, i) => {
    const sentiment = ['positive','critical','neutral','mixed'].includes(c.sentiment) ? c.sentiment : 'neutral';
    const isTop     = c.id === topId;
    const likes     = likesLabel(c.likes);
    const pData     = PERSONAS.find(p => p.id === c.id) || { description: c.role || 'Leitor simulado.' };
    
    return `
      <div class="comment-card${isTop ? ' comment-card--top' : ''}" data-sentiment="${escHtml(sentiment)}">
        <div class="comment-avatar">${escHtml(c.emoji || '💬')}</div>
        <div class="comment-body">
          <div class="comment-meta">
            <span class="comment-name">
              ${escHtml(c.name || 'Anônimo')}
              <span class="info-icon">?
                <span class="tooltip">${escHtml(pData.description)}</span>
              </span>
            </span>
            <span class="comment-role">${escHtml(c.role || '')}</span>
            ${isTop ? '<span class="top-badge">🔥 mais curtido</span>' : ''}
          </div>
          <p class="comment-text">${escHtml(c.comment || '')}</p>
          ${likes ? `<div class="comment-likes">♥︎ ${likes} curtidas</div>` : ''}
        </div>
      </div>
      ${renderThread(threads[c.id], isTop)}`;
  }).join('');

  resultsContent.innerHTML = `
    <div class="comments-header">
      <span>reações simuladas</span>
      <span class="comments-count">${reactions.length} personas</span>
    </div>
    ${legendHtml}
    <div class="comments-feed">${cardsHtml}</div>`;
}


// ——— Error ———————————————————————————————————————————————
function showError(msg) {
  resultsContent.innerHTML = `
    <div class="error-state">
      <span class="err-icon">⚠️</span>
      <span class="err-title">Algo deu errado</span>
      <span class="err-desc">${escHtml(msg)}</span>
    </div>`;
}

// ——— Error humanizer ————————————————————————————————————
function humanizeError(err, provider) {
  const msg = err.message || '';
  // Gemini quota / rate limit
  if (msg.includes('free_tier') || msg.includes('Quota exceeded') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Cota gratuita do Gemini atingida. Tente trocar para gemini-1.5-flash no seletor de modelo, ou aguarde alguns minutos e tente novamente.';
  }
  if (msg.includes('retry') && msg.includes('s.')) {
    // extract seconds from message like "retry in 16.9s"
    const match = msg.match(/(\d+\.?\d*)\s*s/);
    const secs  = match ? Math.ceil(parseFloat(match[1])) : 30;
    return `Limite de requisições atingido. Aguarde ${secs} segundo${secs !== 1 ? 's' : ''} e tente novamente.`;
  }
  if (msg.includes('API key') || msg.includes('invalid') || msg.includes('401')) {
    return 'Chave de API inválida. Verifique se você copiou a chave corretamente.';
  }
  if (msg.includes('CORS') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return `Erro de rede ao conectar à API${provider === 'anthropic' ? ' — a Anthropic bloqueia chamadas diretas do navegador (precisa de proxy CORS)' : '. Verifique sua conexão'}.`;
  }
  // Trim long technical messages (e.g. Gemini quota dumps)
  if (msg.length > 200) {
    return msg.substring(0, 197) + '…';
  }
  return msg;
}

