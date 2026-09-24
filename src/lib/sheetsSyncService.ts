// Serviço Resiliente de Sincronização Google Sheets / Apps Script
// Protege contra páginas HTML inesperadas (como __cookie_check.html, telas de login do Google ou redirecionamentos de iframe/Google Docs)

export const OCORRENCIAS_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxoaLMtXKdq7sn_NB0U1ROENEmtlfaSe6PwCYCyjmMbmNa3gM2tXHBCDL97tD8G61TW/exec';

export const TABLETS_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwV2JJo26LjoraCpo88qOYdna6IO_ornLE1BRXZc86kDcP9QJU_98Ei03i21pTLp1-uZA/exec';

export interface SyncResult<T> {
  success: boolean;
  data: T | null;
  source: 'api' | 'direct' | 'cache' | 'fallback';
  message?: string;
  error?: string;
}

/**
 * Valida com segurança se uma string de texto é JSON e não contém tags HTML ou doctype
 */
export function isLikelyHtml(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return (
    trimmed.startsWith('<') ||
    trimmed.toLowerCase().startsWith('<!doctype') ||
    trimmed.toLowerCase().includes('<html') ||
    trimmed.toLowerCase().includes('<head') ||
    trimmed.toLowerCase().includes('<body')
  );
}

/**
 * Faz fetch seguro garantindo que a resposta seja JSON válido
 */
export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; data: T | null; isHtml: boolean; rawText?: string }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
    });

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    if (isLikelyHtml(text) || contentType.includes('text/html')) {
      return { ok: false, data: null, isHtml: true, rawText: text };
    }

    if (!res.ok) {
      return { ok: false, data: null, isHtml: false, rawText: text };
    }

    try {
      const json = JSON.parse(text);
      return { ok: true, data: json as T, isHtml: false };
    } catch {
      return { ok: false, data: null, isHtml: false, rawText: text };
    }
  } catch (err: any) {
    return { ok: false, data: null, isHtml: false, rawText: err.message };
  }
}

/**
 * Carrega a base de Ocorrências com estratégia de tripla redundância:
 * 1. API do Backend (/api/sheets-ocorrencias)
 * 2. Direto no Google Apps Script (quando acessado via Google Docs ou iframe com restrição de cookies)
 * 3. Cache local offline (localStorage)
 */
export async function carregarOcorrenciasSeguro(
  classes: any[] = [],
  students: any[] = []
): Promise<SyncResult<any>> {
  // 1. Tenta API do Backend
  const apiRes = await safeFetchJson('/api/sheets-ocorrencias');
  if (apiRes.ok && apiRes.data && !apiRes.data.erro) {
    salvarCacheOcorrencias(apiRes.data);
    return {
      success: true,
      data: apiRes.data,
      source: 'api',
      message: 'Conectado via servidor do sistema',
    };
  }

  // 2. Se a API falhou ou retornou HTML (redirecionamento de cookie do Cloud Run/Google Docs),
  // tenta direto no Google Apps Script
  console.info('Tentando consulta direta ao Google Apps Script de ocorrências...');
  const directRes = await safeFetchJson(OCORRENCIAS_APPS_SCRIPT_URL);
  if (directRes.ok && directRes.data && !directRes.data.erro) {
    salvarCacheOcorrencias(directRes.data);
    return {
      success: true,
      data: directRes.data,
      source: 'direct',
      message: 'Sincronizado diretamente com a planilha do Google Sheets',
    };
  }

  // 3. Fallback para Cache Local
  const cached = lerCacheOcorrencias();
  if (cached) {
    return {
      success: true,
      data: cached,
      source: 'cache',
      message: 'Operando em modo local/offline com dados salvos no navegador',
    };
  }

  // 4. Fallback mínimo com dados escolares da plataforma
  const fallback = gerarFallbackOcorrencias(classes, students);
  return {
    success: true,
    data: fallback,
    source: 'fallback',
    message: 'Base inicial carregada a partir dos dados locais da escola',
  };
}

/**
 * Carrega a base de Agendamento de Tablets com tripla redundância:
 * 1. API do Backend (/api/sheets-tablets)
 * 2. Direto no Google Apps Script
 * 3. Cache local offline (localStorage)
 */
export async function carregarTabletsSeguro(classes: any[] = []): Promise<SyncResult<any>> {
  // 1. Tenta API do Backend
  const apiRes = await safeFetchJson('/api/sheets-tablets');
  if (apiRes.ok && apiRes.data && !apiRes.data.erro) {
    salvarCacheTablets(apiRes.data);
    return {
      success: true,
      data: apiRes.data,
      source: 'api',
      message: 'Grade sincronizada via servidor',
    };
  }

  // 2. Tenta direto no Apps Script
  console.info('Tentando consulta direta ao Google Apps Script de tablets...');
  const directRes = await safeFetchJson(TABLETS_APPS_SCRIPT_URL);
  if (directRes.ok && directRes.data && !directRes.data.erro) {
    salvarCacheTablets(directRes.data);
    return {
      success: true,
      data: directRes.data,
      source: 'direct',
      message: 'Grade sincronizada diretamente com a planilha Google Sheets',
    };
  }

  // 3. Fallback para Cache Local
  const cached = lerCacheTablets();
  if (cached) {
    return {
      success: true,
      data: cached,
      source: 'cache',
      message: 'Operando com a grade salva localmente no navegador',
    };
  }

  // 4. Fallback padrão
  const fallback = gerarFallbackTablets(classes);
  return {
    success: true,
    data: fallback,
    source: 'fallback',
    message: 'Grade inicial padrão da escola carregada',
  };
}

/**
 * Envia dados de ocorrência de forma segura com fallback direto
 */
export async function salvarOcorrenciaSeguro(payload: any): Promise<boolean> {
  // Tenta backend
  const apiRes = await safeFetchJson('/api/sheets-ocorrencias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (apiRes.ok) return true;

  // Se falhou ou retornou HTML, tenta direto no Apps Script
  try {
    await fetch(OCORRENCIAS_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      mode: 'no-cors', // Evita bloqueio CORS em caso de resposta direta
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Envia reserva de tablets com fallback direto
 */
export async function salvarReservaTabletsSeguro(payload: any): Promise<{ ok: boolean; msg?: string }> {
  // Tenta backend
  const apiRes = await safeFetchJson<{ status: string; mensagem?: string; msg?: string }>('/api/sheets-tablets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (apiRes.ok && apiRes.data) {
    if (apiRes.data.status === 'erro') {
      return { ok: false, msg: apiRes.data.msg || apiRes.data.mensagem };
    }
    return { ok: true };
  }

  // Se o backend retornou HTML ou erro de conexão, tenta direto no Apps Script
  try {
    const res = await fetch(TABLETS_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!isLikelyHtml(text)) {
      try {
        const json = JSON.parse(text);
        if (json.status === 'erro') {
          return { ok: false, msg: json.msg || json.mensagem };
        }
      } catch {
        // Ignora
      }
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, msg: err.message };
  }
}

// Helpers de Cache Local
function salvarCacheOcorrencias(data: any) {
  try {
    localStorage.setItem('CACHE_OCORRENCIAS_APP', JSON.stringify(data));
  } catch (e) {
    console.warn('Erro ao salvar cache de ocorrências:', e);
  }
}

function lerCacheOcorrencias(): any | null {
  try {
    const raw = localStorage.getItem('CACHE_OCORRENCIAS_APP');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function salvarCacheTablets(data: any) {
  try {
    localStorage.setItem('CACHE_TABLET_APP', JSON.stringify(data));
  } catch (e) {
    console.warn('Erro ao salvar cache de tablets:', e);
  }
}

function lerCacheTablets(): any | null {
  try {
    const raw = localStorage.getItem('CACHE_TABLET_APP');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function gerarFallbackOcorrencias(classes: any[] = [], students: any[] = []) {
  const listaEstudantes = students.map(s => {
    const cls = classes.find(c => c.id === s.classId);
    return {
      nome: s.name,
      turma: cls ? cls.name : 'Turma Geral',
      tutor: s.tutor || 'Equipe Pedagógica',
    };
  });

  return {
    estudantes: listaEstudantes,
    professores: [],
    ocorrencias: [
      'Indisciplina Leve: Conversas paralelas, uso indevido de celular, não realização de atividades.',
      'Desrespeito: Com colegas, com o professor ou com funcionários.',
      'Agressão verbal: Ofensas, xingamentos, ameaças ou humilhações.',
      'Agressão física: Ação intencional que cause dano corporal, dor ou lesão física.',
      'Dano ao patrimônio: Depredação voluntária de materiais, móveis ou instalações da escola.',
      'Uso inadequado de dispositivos eletrônicos: Celulares ou aparelhos sem autorização pedagógica.',
    ],
    medidas: [
      'Advertência Verbal: Conversa individual com o estudante.',
      'Advertência Escrita: Notificação formal anexada ao prontuário do estudante.',
      'Suspensão das Aulas: Afastamento temporário com atividades pedagógicas domiciliares.',
      'Termo de Ajustamento de Conduta Escolar (TAC): Pacto formal com responsáveis.',
      'Encaminhamento à Gestão: Avaliação pela direção ou coordenação pedagógica.',
    ],
    aulas: [
      '1ª AULA', '2ª AULA', '3ª AULA', '4ª AULA', '5ª AULA',
      '6ª AULA', '7ª AULA', '8ª AULA', '9ª AULA', 'INTERVALO', 'ALMOÇO', 'TUTORIA',
    ],
    auxilio: ['NENHUM AUXÍLIO', 'GESTÃO', 'COORDENAÇÃO', 'GESTÃO E COORDENAÇÃO'],
    registros: [],
    tratativasFamilia: [],
  };
}

function gerarFallbackTablets(classes: any[] = []) {
  const turmasNomes = classes.map(c => c.name);
  return {
    agendamentos: [],
    horarios: [
      '1ª Aula - (07h as 7h50)',
      '2ª Aula - (07h50 as 8h40)',
      '3ª Aula - (08h40 as 9h30)',
      'Intervalo - 09h30 as 9h45',
      '4ª Aula - (09h45 as 10h35)',
      '5ª Aula - (10h35 as 11h25)',
      '6ª Aula - (11h25 as 12h15)',
      'Almoço - 12h15 as 13h15',
      '7ª Aula - (13h15 as 14h05)',
      '8ª Aula - (14h05 as 14h55)',
      'Intervalo - 14h55 as 15h10',
      '9ª Aula - (15h10 as 16h)',
    ],
    professores: [],
    turmas: turmasNomes.length > 0 ? turmasNomes : [
      '6º Ano A', '6º Ano B', '6º Ano C',
      '7º Ano A', '8º Ano A', '8º Ano B',
      '9º Ano A', '9º Ano B', '1ª Série A',
      '1ª Série B', '2ª Série A', '3ª Série A',
    ],
    feriados: [
      { data: '2026-09-07', motivo: 'Independência do Brasil' },
      { data: '2026-09-15', motivo: 'Aniversário de Limeira' },
      { data: '2026-10-12', motivo: 'Nossa Senhora Aparecida' },
    ],
  };
}
