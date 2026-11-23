// Serviço Resiliente de Sincronização Google Sheets / Apps Script / Firestore
// Protege contra páginas HTML inesperadas (como __cookie_check.html, telas de login do Google ou redirecionamentos de iframe/Google Sites)

import ocorrenciasBaseline from '../data/ocorrenciasBaseline.json';
import tabletsBaseline from '../data/tabletsBaseline.json';
import { firestoreService } from './firestoreService';

export const OCORRENCIAS_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxoaLMtXKdq7sn_NB0U1ROENEmtlfaSe6PwCYCyjmMbmNa3gM2tXHBCDL97tD8G61TW/exec';

export const TABLETS_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwV2JJo26LjoraCpo88qOYdna6IO_ornLE1BRXZc86kDcP9QJU_98Ei03i21pTLp1-uZA/exec';

export interface SyncResult<T> {
  success: boolean;
  data: T | null;
  source: 'api' | 'direct' | 'cache' | 'fallback' | 'firestore';
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
 * Converte qualquer formato de data de ocorrência para timestamp numérico
 */
export function parseDataOcorrenciaToTimestamp(dStr: string): number {
  if (!dStr) return 0;
  const str = String(dStr).trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      const ano = y.length === 2 ? `20${y}` : y;
      const ms = new Date(`${ano}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00`).getTime();
      if (!isNaN(ms)) return ms;
    }
  }
  if (str.includes('-')) {
    const parts = str.split('T')[0].split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const ano = y.length === 2 ? `20${y}` : y;
      const ms = new Date(`${ano}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00`).getTime();
      if (!isNaN(ms)) return ms;
    }
  }
  const parsed = new Date(str).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Ordena ocorrências com as mais recentes em primeiro lugar
 */
export function ordenarOcorrenciasPorMaisRecentes(registros: any[]): any[] {
  if (!registros || !Array.isArray(registros)) return [];
  return [...registros].sort((a, b) => {
    const timeA = parseDataOcorrenciaToTimestamp(a.data);
    const timeB = parseDataOcorrenciaToTimestamp(b.data);
    if (timeB !== timeA) return timeB - timeA;

    const extractNum = (idStr: string) => {
      const match = String(idStr || '').match(/\d+/g);
      return match ? Number(match.join('')) : 0;
    };
    const numA = extractNum(a.id);
    const numB = extractNum(b.id);
    if (numB !== numA) return numB - numA;

    const extrairAula = (aulaStr: string) => {
      const match = String(aulaStr || '').match(/\d+/);
      return match ? Number(match[0]) : 0;
    };
    const aulaA = extrairAula(a.aula);
    const aulaB = extrairAula(b.aula);
    if (aulaB !== aulaA) return aulaB - aulaA;

    return (b.id || '').localeCompare(a.id || '', 'pt-BR', { numeric: true });
  });
}

/**
 * Carrega a base de Ocorrências com estratégia de quadrupla redundância:
 * 1. Firestore Cloud (Nativo, direto do Google Firebase, 100% livre de bloqueio de cookies em iframes do Google Sites)
 * 2. API do Backend (/api/sheets-ocorrencias)
 * 3. Base Oficial Integrada (59 ocorrências e 373 estudantes no bundle)
 * 4. Cache local offline (localStorage)
 */
function getCurrentSchoolId(): string {
  try {
    const s = localStorage.getItem('sigaescola_active_school_id');
    return !s || s === 'emeb-cecilia-meireles' ? 'ee-arlindo-silvestre' : s;
  } catch {
    return 'ee-arlindo-silvestre';
  }
}

export async function carregarOcorrenciasSeguro(
  classes: any[] = [],
  students: any[] = []
): Promise<SyncResult<any>> {
  const schoolId = getCurrentSchoolId();
  const isDefaultSchool = schoolId === 'ee-arlindo-silvestre';

  // 1. Tenta Firestore Cloud (Ideal e 100% compatível com Google Sites/iframes sem restrição de cookies)
  try {
    const cloudData = await firestoreService.getOcorrencias(schoolId);
    if (cloudData && Array.isArray(cloudData.registros)) {
      const sortedCloudData = {
        ...cloudData,
        registros: ordenarOcorrenciasPorMaisRecentes(cloudData.registros),
      };
      salvarCacheOcorrencias(sortedCloudData, schoolId);
      return {
        success: true,
        data: sortedCloudData,
        source: 'firestore',
        message: 'Base sincronizada diretamente com o Firebase Firestore',
      };
    }
  } catch (err) {
    console.warn('Falha ao consultar Firestore para ocorrências:', err);
  }

  // Para escolas novas (diferentes da EE Professor Arlindo Silvestre), usa apenas cache próprio ou base limpa da própria escola
  if (!isDefaultSchool) {
    const cached = lerCacheOcorrencias(schoolId);
    if (cached && Array.isArray(cached.registros)) {
      return {
        success: true,
        data: {
          ...cached,
          registros: ordenarOcorrenciasPorMaisRecentes(cached.registros),
        },
        source: 'cache',
        message: 'Operando com dados da unidade escolar',
      };
    }
    const cleanFallback = gerarFallbackOcorrencias(classes, students);
    salvarCacheOcorrencias(cleanFallback, schoolId);
    return {
      success: true,
      data: cleanFallback,
      source: 'fallback',
      message: 'Base inicial limpa da unidade escolar carregada',
    };
  }

  // 2. Tenta API do Backend (Exclusivo EE Professor Arlindo Silvestre)
  const apiRes = await safeFetchJson('/api/sheets-ocorrencias');
  if (apiRes.ok && apiRes.data && !apiRes.data.erro) {
    const sortedApiData = {
      ...apiRes.data,
      registros: ordenarOcorrenciasPorMaisRecentes(apiRes.data.registros || []),
    };
    salvarCacheOcorrencias(sortedApiData, schoolId);
    firestoreService.saveOcorrencias(sortedApiData, schoolId).catch(() => {});
    return {
      success: true,
      data: sortedApiData,
      source: 'api',
      message: 'Conectado via servidor do sistema',
    };
  }

  // 3. Base Oficial Embutida Garantida (Exclusivo EE Professor Arlindo Silvestre)
  if (ocorrenciasBaseline && (ocorrenciasBaseline as any).registros && (ocorrenciasBaseline as any).registros.length > 0) {
    const sortedBaseline = {
      ...ocorrenciasBaseline,
      registros: ordenarOcorrenciasPorMaisRecentes((ocorrenciasBaseline as any).registros),
    };
    salvarCacheOcorrencias(sortedBaseline, schoolId);
    firestoreService.saveOcorrencias(sortedBaseline, schoolId).catch(() => {});
    return {
      success: true,
      data: sortedBaseline,
      source: 'fallback',
      message: 'Base oficial de ocorrências carregada com sucesso!',
    };
  }

  // 4. Fallback para Cache Local
  const cached = lerCacheOcorrencias(schoolId);
  if (cached && cached.registros && cached.registros.length > 0) {
    const sortedCached = {
      ...cached,
      registros: ordenarOcorrenciasPorMaisRecentes(cached.registros),
    };
    return {
      success: true,
      data: sortedCached,
      source: 'cache',
      message: 'Operando com dados salvos no navegador',
    };
  }

  // 5. Fallback mínimo com dados escolares da plataforma
  const fallback = gerarFallbackOcorrencias(classes, students);
  return {
    success: true,
    data: fallback,
    source: 'fallback',
    message: 'Base inicial carregada a partir dos dados locais da escola',
  };
}

/**
 * Carrega a base de Agendamento de Tablets com quadrupla redundância:
 * 1. Firestore Cloud (Ideal para Google Sites / iframes sem cookies de terceiros)
 * 2. API do Backend (/api/sheets-tablets)
 * 3. Base Oficial Integrada (81 agendamentos)
 * 4. Cache local offline (localStorage)
 */
export async function carregarTabletsSeguro(classes: any[] = []): Promise<SyncResult<any>> {
  const schoolId = getCurrentSchoolId();
  const isDefaultSchool = schoolId === 'ee-arlindo-silvestre';

  // 1. Tenta Firestore Cloud (Ideal para Google Sites)
  try {
    const cloudData = await firestoreService.getTablets(schoolId);
    if (cloudData && Array.isArray(cloudData.agendamentos)) {
      salvarCacheTablets(cloudData, schoolId);
      return {
        success: true,
        data: cloudData,
        source: 'firestore',
        message: 'Grade sincronizada diretamente com o Firebase Firestore',
      };
    }
  } catch (err) {
    console.warn('Falha ao consultar Firestore para tablets:', err);
  }

  if (!isDefaultSchool) {
    const cached = lerCacheTablets(schoolId);
    if (cached && Array.isArray(cached.agendamentos)) {
      return {
        success: true,
        data: cached,
        source: 'cache',
        message: 'Operando com a grade da unidade escolar',
      };
    }
    const cleanFallback = gerarFallbackTablets(classes);
    salvarCacheTablets(cleanFallback, schoolId);
    return {
      success: true,
      data: cleanFallback,
      source: 'fallback',
      message: 'Grade inicial limpa da unidade escolar carregada',
    };
  }

  // 2. Tenta API do Backend (Exclusivo EE Professor Arlindo Silvestre)
  const apiRes = await safeFetchJson('/api/sheets-tablets');
  if (apiRes.ok && apiRes.data && !apiRes.data.erro) {
    salvarCacheTablets(apiRes.data, schoolId);
    firestoreService.saveTablets(apiRes.data, schoolId).catch(() => {});
    return {
      success: true,
      data: apiRes.data,
      source: 'api',
      message: 'Grade sincronizada via servidor',
    };
  }

  // 3. Base Oficial Embutida Garantida (Exclusivo EE Professor Arlindo Silvestre)
  if (tabletsBaseline && (tabletsBaseline as any).agendamentos && (tabletsBaseline as any).agendamentos.length > 0) {
    salvarCacheTablets(tabletsBaseline, schoolId);
    firestoreService.saveTablets(tabletsBaseline, schoolId).catch(() => {});
    return {
      success: true,
      data: tabletsBaseline,
      source: 'fallback',
      message: 'Grade oficial de tablets carregada com sucesso!',
    };
  }

  // 4. Fallback para Cache Local
  const cached = lerCacheTablets(schoolId);
  if (cached && cached.agendamentos && cached.agendamentos.length > 0) {
    return {
      success: true,
      data: cached,
      source: 'cache',
      message: 'Operando com a grade salva localmente no navegador',
    };
  }

  // 5. Fallback padrão
  const fallback = gerarFallbackTablets(classes);
  return {
    success: true,
    data: fallback,
    source: 'fallback',
    message: 'Grade inicial padrão da escola carregada',
  };
}

/**
 * Envia dados de ocorrência de forma segura para Firestore e Backend
 */
export async function salvarOcorrenciaSeguro(payload: any, currentDb?: any): Promise<boolean> {
  const schoolId = getCurrentSchoolId();
  const isDefaultSchool = schoolId === 'ee-arlindo-silvestre';

  // 1. Atualiza e persiste no Firestore imediatamente (acessível por todos no Google Sites)
  try {
    let base = currentDb;
    if (!base) {
      base = (await firestoreService.getOcorrencias(schoolId)) || lerCacheOcorrencias(schoolId) || (isDefaultSchool ? ocorrenciasBaseline : gerarFallbackOcorrencias());
    }
    if (base) {
      if (payload.action === 'excluir' || payload.acao === 'excluir') {
        const registros = (base.registros || []).filter((r: any) => r.id !== payload.id);
        base = { ...base, registros };
      } else if (payload.action === 'mediacao') {
        const registros = (base.registros || []).map((r: any) =>
          r.id === payload.id ? { ...r, status: payload.status, mediacao: payload.mediacao, mediador: payload.mediador } : r
        );
        base = { ...base, registros };
      } else if (payload.action === 'editar' || payload.acao === 'editar' || payload.action === 'atualizar') {
        const agora = new Date();
        const diaFmt = String(agora.getDate()).padStart(2, '0') + '/' + String(agora.getMonth() + 1).padStart(2, '0') + '/' + agora.getFullYear();
        const horaFmt = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
        const editadoEmStr = payload.editadoEm || `${diaFmt} às ${horaFmt}`;

        const registros = (base.registros || []).map((r: any) => {
          if (r.id === payload.id) {
            return {
              ...r,
              ...(payload.data !== undefined ? { data: payload.data } : {}),
              ...(payload.aula !== undefined ? { aula: payload.aula } : {}),
              ...(payload.turma !== undefined ? { turma: payload.turma } : {}),
              ...(payload.estudante !== undefined ? { estudante: payload.estudante } : {}),
              ...(payload.tutor !== undefined ? { tutor: payload.tutor } : {}),
              ...(payload.professor !== undefined ? { professor: payload.professor } : {}),
              ...(payload.ocorrencia !== undefined ? { ocorrencia: payload.ocorrencia } : {}),
              ...(payload.medida !== undefined ? { medida: payload.medida } : {}),
              ...(payload.auxilio !== undefined ? { auxilio: payload.auxilio } : {}),
              ...(payload.descricao !== undefined ? { descricao: payload.descricao } : {}),
              ...(payload.status !== undefined ? { status: payload.status } : {}),
              ...(payload.mediacao !== undefined ? { mediacao: payload.mediacao } : {}),
              ...(payload.mediador !== undefined ? { mediador: payload.mediador } : {}),
              editadoEm: editadoEmStr,
              editadoPor: payload.editadoPor || r.editadoPor,
            };
          }
          return r;
        });
        base = { ...base, registros };
      } else if (payload.action === 'tratativa_familia') {
        const tratativas = [...(base.tratativasFamilia || []), payload];
        base = { ...base, tratativasFamilia: tratativas };
      } else {
        // Nova ocorrência com carimbo de auditoria de preenchimento
        const agora = new Date();
        const diaFmt = String(agora.getDate()).padStart(2, '0') + '/' + String(agora.getMonth() + 1).padStart(2, '0') + '/' + agora.getFullYear();
        const horaFmt = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
        const horarioRegistroStr = payload.horarioRegistro || payload.dataPreenchimento || `${diaFmt} às ${horaFmt}`;
        const criadoEmStr = payload.criadoEm || agora.toISOString();
        const tsPreenchimento = payload.timestampPreenchimento || agora.getTime();

        const novaOcorr = {
          id: payload.id || '#OC-' + Math.floor(100000 + Math.random() * 900000),
          data: payload.data,
          aula: payload.aula,
          turma: payload.turma,
          estudante: payload.estudante,
          tutor: payload.tutor || '',
          professor: payload.professor,
          ocorrencia: payload.ocorrencia,
          medida: payload.medida,
          auxilio: payload.auxilio,
          descricao: payload.descricao,
          status: 'Pendente',
          mediacao: '',
          mediador: '',
          criadoEm: criadoEmStr,
          horarioRegistro: horarioRegistroStr,
          dataPreenchimento: horarioRegistroStr,
          timestampPreenchimento: tsPreenchimento,
        };
        const registros = [novaOcorr, ...(base.registros || [])];
        base = { ...base, registros };
      }
      await firestoreService.saveOcorrencias(base, schoolId);
      salvarCacheOcorrencias(base, schoolId);
    }
  } catch (err) {
    console.warn('Erro ao atualizar ocorrência no Firestore:', err);
  }

  // 2. Tenta enviar para o backend se for a escola padrão
  if (isDefaultSchool) {
    safeFetchJson('/api/sheets-ocorrencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  return true;
}

/**
 * Exclui ocorrência no Firestore e no cache local
 */
export async function excluirOcorrenciaSeguro(ocorrenciaId: string, currentDb?: any): Promise<boolean> {
  return salvarOcorrenciaSeguro({ action: 'excluir', id: ocorrenciaId }, currentDb);
}

/**
 * Salva as configurações de turmas, ocorrências principais e medidas pedagógicas (Exclusivo Administrador)
 */
export async function salvarConfigOcorrenciasSeguro(
  config: { turmas?: string[]; ocorrencias?: string[]; medidas?: string[]; aulas?: string[]; gradeHorarios?: any[]; geminiApiKey?: string },
  currentDb?: any
): Promise<boolean> {
  const schoolId = getCurrentSchoolId();
  const isDefaultSchool = schoolId === 'ee-arlindo-silvestre';

  try {
    let base = currentDb;
    if (!base) {
      base = (await firestoreService.getOcorrencias(schoolId)) || lerCacheOcorrencias(schoolId) || (isDefaultSchool ? ocorrenciasBaseline : gerarFallbackOcorrencias());
    }
    if (base) {
      const updatedBase = {
        ...base,
        turmasPersonalizadas: config.turmas !== undefined ? config.turmas : base.turmasPersonalizadas,
        ocorrencias: config.ocorrencias !== undefined ? config.ocorrencias : base.ocorrencias,
        medidas: config.medidas !== undefined ? config.medidas : base.medidas,
        aulas: config.aulas !== undefined ? config.aulas : base.aulas,
        gradeHorarios: config.gradeHorarios !== undefined ? config.gradeHorarios : base.gradeHorarios,
        geminiApiKey: config.geminiApiKey !== undefined ? config.geminiApiKey : base.geminiApiKey,
      };
      await firestoreService.saveOcorrencias(updatedBase, schoolId);
      salvarCacheOcorrencias(updatedBase, schoolId);
    }
  } catch (err) {
    console.warn('Erro ao salvar config no Firestore:', err);
  }

  if (isDefaultSchool) {
    safeFetchJson('/api/sheets-ocorrencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'salvar_config_ocorrencias', ...config }),
    }).catch(() => {});
  }

  return true;
}

/**
 * Envia reserva de tablets para Firestore e Backend
 */
export async function salvarReservaTabletsSeguro(payload: any, currentDb?: any): Promise<{ ok: boolean; msg?: string }> {
  const schoolId = getCurrentSchoolId();
  const isDefaultSchool = schoolId === 'ee-arlindo-silvestre';

  // 1. Atualiza e persiste no Firestore imediatamente
  try {
    let base = currentDb;
    if (!base) {
      base = (await firestoreService.getTablets(schoolId)) || lerCacheTablets(schoolId) || (isDefaultSchool ? tabletsBaseline : gerarFallbackTablets());
    }
    if (base) {
      if (payload.action === 'salvar_config_tablets') {
        base = {
          ...base,
          ...(payload.turmas ? { turmas: payload.turmas } : {}),
          ...(payload.horarios ? { horarios: payload.horarios } : {}),
          ...(payload.feriados ? { feriados: payload.feriados } : {}),
          ...(payload.maxTablets !== undefined ? { maxTablets: payload.maxTablets } : {}),
          ...(payload.equipamentos !== undefined ? { equipamentos: payload.equipamentos } : {}),
          ...(payload.equipmentTypes !== undefined ? { equipmentTypes: payload.equipmentTypes } : {}),
          ...(currentDb || {}),
        };
      } else if (payload.action === 'cancelar') {
        const agendamentos = (base.agendamentos || []).filter((ag: any) => {
          if (payload.id && ag.id) {
            return ag.id !== payload.id;
          }
          const sameDate = (ag.data || '').trim() === (payload.data || '').trim();
          const sameAula = (ag.aula || '').trim() === (payload.aula || '').trim();
          const sameTurma = (ag.turma || '').trim() === (payload.turma || '').trim();
          const sameProf = !payload.professor || (ag.professor || '').trim() === (payload.professor || '').trim();
          const sameType =
            !payload.equipmentType ||
            (ag.equipmentType || 'Tablet').trim().toLowerCase() === String(payload.equipmentType).trim().toLowerCase();
          return !(sameDate && sameAula && sameTurma && sameProf && sameType);
        });
        base = { ...base, agendamentos };
      } else {
        // Novo agendamento de equipamento
        const qty = Number(payload.quantity ?? payload.tablets) || 1;
        const novoAg = {
          id: payload.id || `ag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          data: payload.data,
          aula: payload.aula,
          professor: payload.professor,
          turma: payload.turma,
          tablets: qty,
          quantity: qty,
          equipmentType: payload.equipmentType || 'Tablet',
        };
        const agendamentos = [novoAg, ...(base.agendamentos || [])];
        base = { ...base, agendamentos };
      }
      await firestoreService.saveTablets(base, schoolId);
      salvarCacheTablets(base, schoolId);
    }
  } catch (err) {
    console.warn('Erro ao atualizar tablets no Firestore:', err);
  }

  // 2. Tenta enviar para backend se for a escola padrão
  if (isDefaultSchool) {
    safeFetchJson('/api/sheets-tablets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  return { ok: true };
}

// Helpers de Cache Local (com fallback em memória caso localStorage esteja cheio)
const memoryOcorrenciasCache = new Map<string, any>();
const memoryTabletsCache = new Map<string, any>();

function freeLegacyStorageDuplicates() {
  const keys = [
    'school_attendance',
    'school_gate_records',
    'school_students',
    'school_classes',
    'school_alerts',
    'school_interventions',
    'school_monthly_report',
    'school_calendar',
    'school_teacher_schedules',
  ];
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
}

export function salvarCacheOcorrencias(data: any, schoolId?: string) {
  const sId = schoolId || getCurrentSchoolId();
  const key = sId === 'ee-arlindo-silvestre' ? 'CACHE_OCORRENCIAS_APP' : `CACHE_OCORRENCIAS_APP_${sId}`;
  let payload = data;
  if (data && Array.isArray(data.registros)) {
    payload = {
      ...data,
      registros: ordenarOcorrenciasPorMaisRecentes(data.registros),
    };
  }
  memoryOcorrenciasCache.set(key, payload);
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    freeLegacyStorageDuplicates();
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      if (payload && Array.isArray(payload.registros) && payload.registros.length > 300) {
        try {
          localStorage.setItem(key, JSON.stringify({
            ...payload,
            registros: payload.registros.slice(0, 300),
          }));
        } catch {}
      }
    }
  }
}

export function lerCacheOcorrencias(schoolId?: string): any | null {
  const sId = schoolId || getCurrentSchoolId();
  const key = sId === 'ee-arlindo-silvestre' ? 'CACHE_OCORRENCIAS_APP' : `CACHE_OCORRENCIAS_APP_${sId}`;
  if (memoryOcorrenciasCache.has(key)) {
    return memoryOcorrenciasCache.get(key);
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    memoryOcorrenciasCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function salvarCacheTablets(data: any, schoolId?: string) {
  const sId = schoolId || getCurrentSchoolId();
  const key = sId === 'ee-arlindo-silvestre' ? 'CACHE_TABLET_APP' : `CACHE_TABLET_APP_${sId}`;
  memoryTabletsCache.set(key, data);
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    freeLegacyStorageDuplicates();
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  }
}

export function lerCacheTablets(schoolId?: string): any | null {
  const sId = schoolId || getCurrentSchoolId();
  const key = sId === 'ee-arlindo-silvestre' ? 'CACHE_TABLET_APP' : `CACHE_TABLET_APP_${sId}`;
  if (memoryTabletsCache.has(key)) {
    return memoryTabletsCache.get(key);
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    memoryTabletsCache.set(key, parsed);
    return parsed;
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
    equipamentos: Array.from({ length: 23 }, (_, idx) => ({
      id: `eq-tablet-${String(idx + 1).padStart(2, '0')}`,
      nome: `Tablet ${String(idx + 1).padStart(2, '0')}`,
      tipo: 'Tablet',
      patrimonio: '',
      condicao: 'em_uso',
    })),
  };
}
