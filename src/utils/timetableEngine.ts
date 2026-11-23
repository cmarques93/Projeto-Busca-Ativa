import {
  AnnualTimetableCriteria,
  AtpcaBlockRule,
  CurriculumMatrixCategory,
  CurriculumMatrixItem,
  ExclusiveGroupCriteria,
  GradeCurriculumEntry,
  MultiplicaSlot,
  SchoolClass,
  TeacherScheduleSlot,
  TeacherSubstitutionRecord,
  TimetableGridCell,
  TimetablePeriodDef,
  TimetableTeacherProfile,
  TimetableWorkspace,
  UserAccount,
} from '../types';
import {
  DEFAULT_SCHOOL_PERIODS,
  getSchoolSchedulePeriods,
  timeToMinutes,
} from './scheduleUtils';

export const WEEKDAYS = [
  { id: 1, short: 'SEG', label: 'Segunda-feira' },
  { id: 2, short: 'TER', label: 'Terça-feira' },
  { id: 3, short: 'QUA', label: 'Quarta-feira' },
  { id: 4, short: 'QUI', label: 'Quinta-feira' },
  { id: 5, short: 'SEX', label: 'Sexta-feira' },
];

export const DEFAULT_AREA_OPTIONS = [
  { code: 'LGG', label: 'Linguagens (LGG)' },
  { code: 'MAT', label: 'Matemática / Exatas (MAT)' },
  { code: 'CHS', label: 'Ciências Humanas (CHS)' },
  { code: 'CNT', label: 'Ciências da Natureza (CNT)' },
  { code: 'INOVA', label: 'Inova / Parte Diversificada' },
  { code: 'OUTROS', label: 'Outros' },
];

export function normalizeText(str?: string): string {
  return (str || '')
    .toString()
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function normalizeTeacherKey(name?: string): string {
  return normalizeText(name).replace(/^PROF[Aª]?\.?\s+/, '').trim();
}

const KNOWN_DISCIPLINE_EXACT = new Set([
  'LP',
  'PORT',
  'PORTUGUES',
  'LINGUA PORTUGUESA',
  'MAT',
  'MATEMATICA',
  'HIST',
  'HISTORIA',
  'GEO',
  'GEOGRAFIA',
  'CIEN',
  'CIENC',
  'CIENCIAS',
  'BIO',
  'BIOLOGIA',
  'FIS',
  'FISICA',
  'QUI',
  'QUIMICA',
  'ING',
  'INGLES',
  'LEM',
  'LINGUA INGLESA',
  'ART',
  'ARTE',
  'ARTES',
  'EF',
  'ED FIS',
  'ED. FIS',
  'ED.FIS',
  'ED FISICA',
  'ED. FISICA',
  'EDUCACAO FISICA',
  'FILO',
  'FILOSOFIA',
  'SOC',
  'SOCIO',
  'SOCIOLOGIA',
  'RED',
  'REDACAO',
  'REDACAO E LEITURA',
  'OE',
  'OE MAT',
  'OE PORT',
  'OE LP',
  'ORIENTACAO DE ESTUDOS',
  'ORIENTACAO ESTUDOS',
  'TECH',
  'TEC',
  'TECNOLOGIA',
  'TECNOLOGIA E INOVACAO',
  'ROBOTICA',
  'SPEAK',
  'SPK',
  'KHAN',
  'KHAN ACADEMY',
  'EMA',
  'PV',
  'P.V',
  'P.V.',
  'PROJETO DE VIDA',
  'PRATICAS',
  'PRATICAS EXPERIMENTAIS',
  'ED FIN',
  'ED. FIN',
  'EDUCACAO FINANCEIRA',
  'FINANCEIRA',
  'EMPREENDEDORISMO',
  'ORATORIA',
  'PROGRAMACAO',
  'ELETIVA',
  'ELETIVAS',
  'TUTORIA',
  'CLUBE',
  'CLUBES',
  'RECOMPOSICAO',
  'EDU PROF',
  'EDU PROFISSIONAL',
  'EDUCACAO PROFISSIONAL',
  'GEOPOLITICA',
  'ATUALIDADES',
  'ESTATISTICA',
  'LEITURA',
  'PRODUCAO DE TEXTO',
  'MATIFIC',
  'ALURA',
  'TAREFA SP',
  'LITERATURA',
  'ESPANHOL',
  'ENSINO RELIGIOSO',
  'ITINERARIO',
  'PROTAGONISMO',
  'APROFUNDAMENTO',
  'LIDERANCA',
  'MIDIAS',
  'INOVACAO',
]);

const KNOWN_DISCIPLINE_PHRASES = [
  'PORTUGUES',
  'MATEMATICA',
  'HISTORIA',
  'GEOGRAFIA',
  'CIENCIAS',
  'BIOLOGIA',
  'FISICA',
  'QUIMICA',
  'INGLES',
  'EDUCACAO FISICA',
  'ED. FISICA',
  'ED FISICA',
  'FILOSOFIA',
  'SOCIOLOGIA',
  'REDACAO',
  'ORIENTACAO DE ESTUDOS',
  'TECNOLOGIA',
  'ROBOTICA',
  'PROJETO DE VIDA',
  'PRATICAS EXPERIMENTAIS',
  'EDUCACAO FINANCEIRA',
  'EMPREENDEDORISMO',
  'PROGRAMACAO',
  'EDU PROFISSIONAL',
  'EDUCACAO PROFISSIONAL',
  'RECOMPOSICAO',
  'ELETIVA',
  'TUTORIA',
  'CLUBE',
  'KHAN',
  'SPEAK',
  'ALURA',
  'MATIFIC',
];

const PLACEHOLDER_TEACHER_NAMES = new Set([
  '',
  '-',
  '--',
  '---',
  '—',
  'A DEFINIR',
  'SEM PROFESSOR',
  'SEM DOCENTE',
  'PENDENTE',
  'VAGO',
  'LIVRE',
  'N/A',
  'NAO INFORMADO',
  'PROFESSOR',
  'DOCENTE',
]);

export function isPlaceholderTeacherName(name?: string): boolean {
  const norm = normalizeTeacherKey(name);
  return PLACEHOLDER_TEACHER_NAMES.has(norm);
}

/**
 * Reconhece deterministicamente se um texto corresponde a uma disciplina escolar
 * (usando correspondência exata ou por palavra inteira para nunca confundir nomes de pessoas como "Artur" ou "Mateus").
 */
export function isLikelyDisciplineName(
  text?: string,
  criteria?: AnnualTimetableCriteria
): boolean {
  const norm = normalizeText(text);
  if (!norm) return false;

  const cleanPunct = norm.replace(/[./]/g, ' ').replace(/\s+/g, ' ').trim();
  if (KNOWN_DISCIPLINE_EXACT.has(norm) || KNOWN_DISCIPLINE_EXACT.has(cleanPunct)) {
    return true;
  }

  for (const phrase of KNOWN_DISCIPLINE_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(cleanPunct)) {
      return true;
    }
  }

  if (criteria) {
    const dynamicTerms = [
      ...(criteria.noteDisciplines || []),
      ...(criteria.platformKeywords || []),
      ...(criteria.preservedFixedTerms || []),
      ...(criteria.exclusiveGroups || []).map(g => g.keyword),
    ];
    for (const term of dynamicTerms) {
      const t = normalizeText(term).replace(/[./]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t || t.length < 2) continue;
      if (cleanPunct === t) return true;
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(cleanPunct)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detecta se a grade atual possui os campos de Professor e Disciplina invertidos
 * (ex.: nome da disciplina salvo no campo de professor).
 */
export function hasInvertedTeacherDiscipline(workspace: TimetableWorkspace): boolean {
  const criteria = getActiveCriteria(workspace);
  const regularCells = (workspace.cells || []).filter(
    c => !c.fixedLabel && Boolean(c.teacherName?.trim()) && Boolean(c.discipline?.trim())
  );
  if (regularCells.length === 0) return false;

  let invertedCount = 0;
  let normalCount = 0;
  for (const c of regularCells) {
    const tIsDisc = isLikelyDisciplineName(c.teacherName, criteria);
    const dIsDisc = isLikelyDisciplineName(c.discipline, criteria);
    if (tIsDisc && !dIsDisc) invertedCount++;
    else if (dIsDisc && !tIsDisc) normalCount++;
  }

  return invertedCount >= 2 && invertedCount > normalCount;
}

/**
 * Inverte Professor ↔ Disciplina em todas as células regulares da grade,
 * recalculando categorias/plataformas e corrigindo também a matriz e o banco de docentes.
 */
export function swapTeacherAndDisciplineInWorkspace(
  workspace: TimetableWorkspace
): TimetableWorkspace {
  const criteria = getActiveCriteria(workspace);

  const nextCells: TimetableGridCell[] = (workspace.cells || []).map(cell => {
    if (cell.fixedLabel) return cell;
    const newTeacher = (cell.discipline || '').trim();
    const newDiscipline = (cell.teacherName || '').trim();

    let category: TimetableGridCell['category'] = 'rest';
    if (isNoteDiscipline(newDiscipline, criteria)) {
      category = 'note';
    } else if (isExclusiveGroupDiscipline(newDiscipline, criteria)) {
      category = 'ema';
    }
    const hasPlat = category === 'note' || hasPlatformKeyword(newDiscipline, criteria);

    return {
      ...cell,
      teacherName: newTeacher,
      discipline: newDiscipline,
      category,
      hasPlatform: hasPlat,
      platformName: hasPlat ? newDiscipline : undefined,
    };
  });

  // Corrige matriz caso itens também estejam invertidos
  const nextMatrix: CurriculumMatrixItem[] = (workspace.matrix || []).map(item => {
    const tIsDisc = isLikelyDisciplineName(item.teacherName, criteria);
    const dIsDisc = isLikelyDisciplineName(item.discipline, criteria);
    if (tIsDisc && !dIsDisc) {
      const newDisc = item.teacherName.trim();
      const newProf = item.discipline.trim();
      const cat: CurriculumMatrixCategory = isNoteDiscipline(newDisc, criteria)
        ? 'note'
        : isExclusiveGroupDiscipline(newDisc, criteria)
        ? 'ema'
        : 'rest';
      return {
        ...item,
        discipline: newDisc,
        teacherName: newProf,
        category: cat,
        hasPlatform: cat === 'note' || hasPlatformKeyword(newDisc, criteria),
      };
    }
    return item;
  });

  // Remove disciplinas cadastradas indevidamente como professores e inclui os professores reais
  const cleanedTeachers = (workspace.teachers || []).filter(
    t => !isLikelyDisciplineName(t.name, criteria)
  );
  const existingKeys = new Set(cleanedTeachers.map(t => normalizeTeacherKey(t.name)));
  for (const c of nextCells) {
    if (c.fixedLabel || !c.teacherName || isPlaceholderTeacherName(c.teacherName)) continue;
    const k = normalizeTeacherKey(c.teacherName);
    if (k && !existingKeys.has(k) && !isLikelyDisciplineName(c.teacherName, criteria)) {
      existingKeys.add(k);
      cleanedTeachers.push({
        id: `prof_fix_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: c.teacherName,
        area: 'LGG',
        multiplicaPeriods: [],
        dailyLimit: criteria.defaultTeacherDailyLimit || 7,
      });
    }
  }

  return {
    ...workspace,
    cells: nextCells,
    matrix: nextMatrix,
    teachers: cleanedTeachers,
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultPeriods(): TimetablePeriodDef[] {
  const source = getSchoolSchedulePeriods();
  const list = source && source.length > 0 ? source : DEFAULT_SCHOOL_PERIODS;
  let aulaCounter = 0;
  return list.map(p => {
    const isBreak = p.tipo === 'intervalo';
    if (!isBreak) aulaCounter += 1;
    return {
      id: p.id,
      number: isBreak ? 0 : aulaCounter,
      label: p.nome,
      start: p.inicio,
      end: p.fim,
      isBreak,
    };
  });
}

/**
 * Retorna os períodos efetivos da escola (sincronizados com os horários reais das aulas configurados).
 */
export function getEffectiveSchoolPeriods(workspace?: TimetableWorkspace): TimetablePeriodDef[] {
  if (workspace?.periods && workspace.periods.length > 0) {
    return workspace.periods;
  }
  return createDefaultPeriods();
}

/**
 * Extrai o Ano/Série padronizado a partir de uma turma cadastrada.
 * Ex: "6º Ano A", "6º Ano B", "6º Ano C" -> "6º Ano"
 *     "1ª Série A", "1ª Série Médio B", "1EM A" -> "1ª Série do EM"
 */
export function extractGradeSeriesFromClass(
  cls: Pick<SchoolClass, 'name' | 'id' | 'grade'>
): string {
  const rawName = (cls.name || cls.id || '').trim();
  const norm = normalizeText(rawName);
  const gradeNorm = normalizeText(cls.grade);

  // Ensino Médio: "1ª Série...", "1º EM...", "1EM A", "2ª Série B", "3ª Série C"
  const emSerieMatch = norm.match(/^([1-3])\s*[ªº°]?\s*(?:SERIE|EM|ENSINO MEDIO|MEDIO)\b/);
  if (emSerieMatch) {
    return `${emSerieMatch[1]}ª Série do EM`;
  }
  const emCompactMatch = norm.match(/^([1-3])\s*EM[\s_-]?[A-Z0-9]*$/);
  if (emCompactMatch) {
    return `${emCompactMatch[1]}ª Série do EM`;
  }
  if (gradeNorm.includes('MEDIO')) {
    const numOnly = norm.match(/^([1-3])\s*[ªº°]?\b/);
    if (numOnly) return `${numOnly[1]}ª Série do EM`;
  }

  // Ensino Fundamental: "6º Ano A", "7º B", "9A", "5º Ano C"
  const fundMatch = norm.match(/^([1-9])\s*[ªº°]?\s*(?:ANO)?\s*[A-Z]?$/);
  if (fundMatch) {
    return `${fundMatch[1]}º Ano`;
  }
  const fundPrefixMatch = norm.match(/^([1-9])\s*[ªº°]\s*ANO\b/);
  if (fundPrefixMatch) {
    return `${fundPrefixMatch[1]}º Ano`;
  }

  // Fallback genérico: remove letra de turma isolada no final (ex: "EJA 1 A" -> "EJA 1")
  const stripped = rawName
    .replace(/\s*[-–]\s*[A-Za-z]$/, '')
    .replace(/\s+[A-Za-z]$/, '')
    .trim();
  return stripped || rawName || 'Turmas Gerais';
}

export interface GradeSeriesGroup {
  gradeSeries: string;
  classes: SchoolClass[];
}

/**
 * Agrupa automaticamente todas as turmas cadastradas da escola por Ano/Série.
 */
export function groupClassesByGradeSeries(classes: SchoolClass[]): GradeSeriesGroup[] {
  const map = new Map<string, SchoolClass[]>();
  for (const cls of classes || []) {
    const series = extractGradeSeriesFromClass(cls);
    if (!map.has(series)) map.set(series, []);
    map.get(series)!.push(cls);
  }
  return Array.from(map.entries())
    .map(([gradeSeries, list]) => ({
      gradeSeries,
      classes: [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    }))
    .sort((a, b) => a.gradeSeries.localeCompare(b.gradeSeries, 'pt-BR', { numeric: true }));
}

/**
 * Retorna a lista única e ordenada de todas as disciplinas cadastradas na Matriz Curricular / Grade da escola.
 */
export function getAllCatalogDisciplines(workspace: TimetableWorkspace): string[] {
  const byNorm = new Map<string, string>();
  const register = (raw?: string) => {
    const clean = (raw || '').trim();
    if (!clean) return;
    const norm = normalizeText(clean);
    if (!norm || norm === '---') return;
    if (!byNorm.has(norm)) {
      byNorm.set(norm, clean);
    }
  };

  for (const g of workspace.gradeCurriculum || []) register(g.discipline);
  for (const m of workspace.matrix || []) register(m.discipline);
  for (const c of workspace.cells || []) {
    if (!c.fixedLabel && c.discipline) register(c.discipline);
  }

  return Array.from(byNorm.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Assimila automaticamente um intervalo de horário de relógio (HH:MM - HH:MM)
 * aos horários de aula da escola (sobreposição de faixas).
 */
export function resolveMultiplicaPeriodsFromClock(
  startTime: string | undefined,
  endTime: string | undefined,
  periods: TimetablePeriodDef[]
): TimetablePeriodDef[] {
  const mStart = timeToMinutes(startTime || '');
  const mEnd = timeToMinutes(endTime || '');
  if (mStart < 0 || mEnd < 0 || mEnd <= mStart) return [];

  return (periods || [])
    .filter(p => !p.isBreak && p.number > 0)
    .filter(p => {
      const pStart = timeToMinutes(p.start);
      const pEnd = timeToMinutes(p.end);
      if (pStart < 0 || pEnd < 0) return false;
      // Há sobreposição entre [mStart, mEnd) e [pStart, pEnd)
      return mStart < pEnd && mEnd > pStart;
    })
    .sort((a, b) => a.number - b.number);
}

/**
 * Retorna os blocos de Horário Multiplica (dia + horário de relógio) normalizados de um docente.
 */
export function getTeacherMultiplicaSlots(
  profile?: TimetableTeacherProfile | null,
  periods?: TimetablePeriodDef[]
): MultiplicaSlot[] {
  if (!profile) return [];
  if (Array.isArray(profile.multiplicaSlots) && profile.multiplicaSlots.length > 0) {
    return profile.multiplicaSlots.filter(
      s => s.dayOfWeek >= 1 && s.dayOfWeek <= 5 && Boolean(s.startTime) && Boolean(s.endTime)
    );
  }
  if (profile.multiplicaDay && profile.multiplicaStartTime && profile.multiplicaEndTime) {
    return [
      {
        id: `legacy-${profile.id}`,
        dayOfWeek: profile.multiplicaDay,
        startTime: profile.multiplicaStartTime,
        endTime: profile.multiplicaEndTime,
      },
    ];
  }
  // Converte período legado (números de aula) para horário de relógio aproximado para exibição/edição
  if (
    profile.multiplicaDay &&
    Array.isArray(profile.multiplicaPeriods) &&
    profile.multiplicaPeriods.length > 0
  ) {
    const teaching = (periods || createDefaultPeriods()).filter(p => !p.isBreak && p.number > 0);
    const matched = teaching
      .filter(p => profile.multiplicaPeriods.includes(p.number))
      .sort((a, b) => a.number - b.number);
    if (matched.length > 0) {
      return [
        {
          id: `legacy-num-${profile.id}`,
          dayOfWeek: profile.multiplicaDay,
          startTime: matched[0].start,
          endTime: matched[matched.length - 1].end,
        },
      ];
    }
  }
  return [];
}

export function formatMultiplicaSummary(
  profile: TimetableTeacherProfile | undefined | null,
  periods: TimetablePeriodDef[]
): string {
  const slots = getTeacherMultiplicaSlots(profile, periods);
  if (slots.length === 0) return 'Não informado';
  return slots
    .map(slot => {
      const day = WEEKDAYS.find(w => w.id === slot.dayOfWeek)?.short || `D${slot.dayOfWeek}`;
      const matched = resolveMultiplicaPeriodsFromClock(slot.startTime, slot.endTime, periods);
      const aulasTxt =
        matched.length > 0
          ? ` (${matched.map(p => `${p.number}ª`).join(', ')})`
          : '';
      return `${day} ${slot.startTime}–${slot.endTime}${aulasTxt}`;
    })
    .join(' · ');
}

/**
 * Deriva automaticamente a Matriz Curricular por Ano/Série a partir de cargas legadas por turma,
 * caso a escola ainda não tenha cadastrado a nova tabela padronizada por Ano/Série.
 */
export function deriveInitialGradeCurriculumFromMatrix(
  workspace: TimetableWorkspace,
  classes: SchoolClass[]
): GradeCurriculumEntry[] {
  if (workspace.gradeCurriculum && workspace.gradeCurriculum.length > 0) {
    return workspace.gradeCurriculum;
  }
  const classById = new Map(classes.map(c => [c.id, c]));
  const seen = new Map<string, GradeCurriculumEntry>();

  for (const item of workspace.matrix || []) {
    const cls = classById.get(item.classId) || {
      id: item.classId,
      name: item.className,
      grade: '',
    };
    const gradeSeries = item.gradeSeries || extractGradeSeriesFromClass(cls);
    const key = `${normalizeText(gradeSeries)}|${normalizeText(item.discipline)}`;
    if (!seen.has(key)) {
      seen.set(key, {
        id: `gc-${Date.now()}-${seen.size}`,
        gradeSeries,
        discipline: item.discipline.trim(),
        weeklyLessons: Math.max(1, item.weeklyLessons || 1),
      });
    }
  }
  return Array.from(seen.values());
}

/**
 * Determina a categoria operacional da disciplina exclusivamente a partir dos Critérios Anuais vigentes.
 */
export function resolveDisciplineCategoryFromCriteria(
  discipline: string,
  criteria: AnnualTimetableCriteria
): CurriculumMatrixCategory {
  if (isNoteDiscipline(discipline, criteria)) return 'note';
  if (
    isExclusiveGroupDiscipline(discipline, criteria) ||
    isTogetherGroupDiscipline(discipline, criteria)
  ) {
    return 'ema';
  }
  return 'rest';
}

/**
 * Expande automaticamente a Matriz Curricular por Ano/Série (`gradeCurriculum`)
 * para todas as turmas reais da escola naquele Ano/Série, preservando vínculos docentes
 * já escolhidos e sugerindo automaticamente docentes da Equipe habilitados na disciplina.
 */
export function syncGradeCurriculumToMatrix(
  workspace: TimetableWorkspace,
  classes: SchoolClass[],
  overrideGradeCurriculum?: GradeCurriculumEntry[],
  overrideCriteria?: AnnualTimetableCriteria
): CurriculumMatrixItem[] {
  const criteria = overrideCriteria || getActiveCriteria(workspace);
  const curriculum = overrideGradeCurriculum ?? workspace.gradeCurriculum;

  // Se ainda não existe gradeCurriculum, mantém o matrix legado com categorias atualizadas
  if (!curriculum || curriculum.length === 0) {
    return (workspace.matrix || []).map(item => {
      const cat = resolveDisciplineCategoryFromCriteria(item.discipline, criteria);
      const hasPlat = cat === 'note' || hasPlatformKeyword(item.discipline, criteria);
      return {
        ...item,
        category: cat,
        hasPlatform: hasPlat,
        platformName: hasPlat ? item.platformName || item.discipline : undefined,
      };
    });
  }

  // Preserva professores já atribuídos por (classId | discipline) no workspace.matrix ou cells
  const existingTeacherByKey = new Map<string, string>();
  for (const m of workspace.matrix || []) {
    if (m.teacherName?.trim()) {
      existingTeacherByKey.set(`${m.classId}|${normalizeText(m.discipline)}`, m.teacherName.trim());
    }
  }
  for (const c of workspace.cells || []) {
    if (!c.fixedLabel && c.teacherName?.trim() && c.discipline?.trim()) {
      const k = `${c.classId}|${normalizeText(c.discipline)}`;
      if (!existingTeacherByKey.has(k)) {
        existingTeacherByKey.set(k, c.teacherName.trim());
      }
    }
  }

  // Mapeia docentes da Equipe habilitados por disciplina
  const teachersByDiscipline = new Map<string, TimetableTeacherProfile[]>();
  for (const prof of workspace.teachers || []) {
    for (const d of prof.disciplines || []) {
      const dn = normalizeText(d);
      if (!dn) continue;
      if (!teachersByDiscipline.has(dn)) teachersByDiscipline.set(dn, []);
      teachersByDiscipline.get(dn)!.push(prof);
    }
  }

  const classesBySeries = new Map<string, SchoolClass[]>();
  for (const cls of classes || []) {
    const sKey = normalizeText(extractGradeSeriesFromClass(cls));
    if (!classesBySeries.has(sKey)) classesBySeries.set(sKey, []);
    classesBySeries.get(sKey)!.push(cls);
  }

  const nextMatrix: CurriculumMatrixItem[] = [];
  const usedKey = new Set<string>();

  for (const entry of curriculum) {
    if (!entry.discipline?.trim() || entry.weeklyLessons <= 0) continue;
    const sKey = normalizeText(entry.gradeSeries);
    const matchingClasses = classesBySeries.get(sKey) || [];
    const discClean = entry.discipline.trim();
    const discNorm = normalizeText(discClean);
    const cat = resolveDisciplineCategoryFromCriteria(discClean, criteria);
    const hasPlat = cat === 'note' || hasPlatformKeyword(discClean, criteria);
    const eligibleTeachers = teachersByDiscipline.get(discNorm) || [];

    matchingClasses.forEach((cls, idx) => {
      const itemKey = `${cls.id}|${discNorm}`;
      if (usedKey.has(itemKey)) return;
      usedKey.add(itemKey);

      let teacherName = existingTeacherByKey.get(itemKey) || '';
      if (!teacherName && eligibleTeachers.length > 0) {
        // Distribui de forma equilibrada entre os professores habilitados da Equipe (round-robin)
        teacherName = eligibleTeachers[idx % eligibleTeachers.length].name;
      }

      nextMatrix.push({
        id: `mat-${cls.id}-${discNorm.replace(/[^A-Z0-9]/g, '').slice(0, 14)}-${idx}`,
        category: cat,
        classId: cls.id,
        className: cls.name,
        gradeSeries: entry.gradeSeries,
        discipline: discClean,
        teacherName,
        weeklyLessons: Math.max(1, entry.weeklyLessons),
        hasPlatform: hasPlat,
        platformName: hasPlat ? discClean : undefined,
      });
    });
  }

  return nextMatrix;
}

export function createDefaultAnnualCriteria(year: number = new Date().getFullYear() || 2026): AnnualTimetableCriteria {
  return {
    year,
    legislationRef: `Diretrizes Curriculares ${year}`,
    notes: 'Critérios anuais flexíveis configuráveis conforme a realidade e legislação da unidade escolar.',
    preservedFixedTerms: [
      'INTERVALO',
      'ALMOÇO',
      'TUTORIA',
      'ELETIVA',
      'CLUBE',
    ],
    conflictExceptionTerms: [
      'INTERVALO',
      'ALMOÇO',
      'ALMOCO',
      'TUTORIA',
      'ELETIVA',
      'CLUBE',
    ],
    noteDisciplines: [],
    platformKeywords: [],
    maxCartsSimultaneous: 2,
    khanThirdCartWhenEduProfFree: false,
    exclusiveGroups: [],
    maxSameSubjectPerDay: 2,
    defaultTeacherDailyLimit: 7,
    preferDoubleLessonsNote: true,
    preferDoubleLessonsEma: true,
    enablePreBlockContinuityLock: true,
    availableAoeAgents: 2,
    areaColors: {
      LGG: '#fff2cc',
      MAT: '#f4cccc',
      CHS: '#fce5cd',
      CNT: '#d1eaf0',
      INOVA: '#e8eaf6',
      PROJETO_DE_VIDA: '#674ea7',
      NOTE: '#45818e',
      EMA: '#6aa84f',
      FIXED: '#e2e8f0',
      OUTROS: '#ffffff',
    },
    areaCompatibility: {
      CHS: ['HIST', 'GEO', 'SOCI', 'FILO', 'HUMANAS', 'GEOPOLITICA', 'ATUALIDADES'],
      CNT: ['BIO', 'FIS', 'QUI', 'CIENC', 'NATUREZA', 'PRATICAS'],
      MAT: ['MAT', 'EXATAS', 'KHAN', 'OE MAT', 'FINANCEIRA', 'ESTATISTICA'],
      LGG: ['PORT', 'ING', 'ART', 'ARTE', 'ED.FIS', 'ED FIS', 'EDUCACAO FISICA', 'EF', 'RED', 'SPEAK', 'OE PORT', 'LINGUAGENS', 'LEITURA', 'LITERATURA'],
      INOVA: ['PROJETO DE VIDA', 'PV', 'P.V', 'TECNOLOGIA', 'ROBOTICA', 'PROGRAMACAO', 'EMPREENDEDORISMO', 'ORATORIA', 'PROTAGONISMO', 'INOVACAO', 'EMA'],
    },
    updatedAt: new Date().toISOString(),
  };
}

export function getActiveCriteria(workspace: TimetableWorkspace): AnnualTimetableCriteria {
  const existing = workspace.criteriaByYear?.[workspace.activeYear];
  if (existing) return existing;
  return createDefaultAnnualCriteria(workspace.activeYear || 2026);
}

export function getCellKey(dayOfWeek: number, periodId: string, classId: string): string {
  return `${dayOfWeek}|${periodId}|${classId}`;
}

export function createDefaultTimetableWorkspace(
  schoolId: string,
  classes: SchoolClass[],
  users: UserAccount[],
  existingSlots: TeacherScheduleSlot[] = []
): TimetableWorkspace {
  const activeYear = new Date().getFullYear() || 2026;
  const criteria = createDefaultAnnualCriteria(activeYear);
  const periods = createDefaultPeriods();

  // Popula equipe inicial somente com usuários cadastrados com perfil Professor ou PAAC
  const schoolTeachers = (users || [])
    .filter(u => u.active !== false && (u.role === 'professor' || u.role === 'gestao_paac'))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map<TimetableTeacherProfile>(u => ({
      id: u.id,
      userId: u.id,
      name: u.name,
      role: u.role,
      area: 'OUTROS',
      areas: [],
      disciplines: [],
      multiplicaDay: undefined,
      multiplicaPeriods: [],
      multiplicaSlots: [],
      dailyLimit: criteria.defaultTeacherDailyLimit,
    }));

  // Converte eventuais slots já salvos em TeacherScheduleSlot para células da grade
  const cells: TimetableGridCell[] = [];
  const seenKeys = new Set<string>();

  for (const slot of existingSlots || []) {
    if (slot.dayOfWeek < 1 || slot.dayOfWeek > 5) continue;
    const matchedPeriod =
      periods.find(p => p.id === slot.periodId) ||
      periods.find(p => normalizeText(p.label) === normalizeText(slot.periodName));
    if (!matchedPeriod || matchedPeriod.isBreak) continue;

    const matchedClass =
      classes.find(c => c.id === slot.classId) ||
      classes.find(c => normalizeText(c.name) === normalizeText(slot.className));
    const classId = matchedClass?.id || slot.classId;
    const className = matchedClass?.name || slot.className || slot.classId;
    const key = getCellKey(slot.dayOfWeek, matchedPeriod.id, classId);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const disc = slot.subject || 'Aula';
    const isNote = isNoteDiscipline(disc, criteria);
    const isEma = isExclusiveGroupDiscipline(disc, criteria) !== null;

    cells.push({
      id: key,
      dayOfWeek: slot.dayOfWeek,
      periodId: matchedPeriod.id,
      periodNumber: matchedPeriod.number,
      periodLabel: matchedPeriod.label,
      classId,
      className,
      teacherName: slot.teacherName,
      discipline: disc,
      category: isNote ? 'note' : isEma ? 'ema' : 'rest',
      hasPlatform: slot.hasPlatform ?? hasPlatformKeyword(disc, criteria),
      platformName: slot.platformName || (slot.hasPlatform ? disc : undefined),
    });
  }

  return {
    schoolId,
    activeYear,
    criteriaByYear: {
      [activeYear]: criteria,
    },
    atpcaRules: [
      { id: 'atpca-lgg', area: 'LGG', dayOfWeek: 2, periodNumbers: [1, 2], label: 'ATPCA Linguagens' },
      { id: 'atpca-mat', area: 'MAT', dayOfWeek: 3, periodNumbers: [1, 2], label: 'ATPCA Matemática' },
      { id: 'atpca-chs', area: 'CHS', dayOfWeek: 4, periodNumbers: [1, 2], label: 'ATPCA Humanas' },
      { id: 'atpca-cnt', area: 'CNT', dayOfWeek: 5, periodNumbers: [1, 2], label: 'ATPCA Natureza' },
    ],
    teachers: schoolTeachers,
    matrix: [],
    periods,
    cells,
    updatedAt: new Date().toISOString(),
  };
}

export function formatCellDisplay(cell?: TimetableGridCell | null): string {
  if (!cell) return '';
  if (cell.fixedLabel) return cell.fixedLabel;
  if (cell.teacherName && cell.discipline) return `${cell.teacherName} (${cell.discipline})`;
  if (cell.teacherName) return cell.teacherName;
  if (cell.discipline) return cell.discipline;
  return '';
}

export function isPreservedFixedCell(
  cell: TimetableGridCell | undefined | null,
  criteria: AnnualTimetableCriteria
): boolean {
  if (!cell) return false;
  if (cell.locked) return true;
  if (cell.category === 'fixed' || Boolean(cell.fixedLabel)) return true;
  const text = normalizeText(formatCellDisplay(cell));
  if (!text) return false;
  return (criteria.preservedFixedTerms || []).some(term => {
    const t = normalizeText(term);
    return t && text.includes(t);
  });
}

export function isConflictExceptionCell(
  cell: TimetableGridCell | undefined | null,
  criteria: AnnualTimetableCriteria
): boolean {
  if (!cell) return true;
  if (cell.fixedLabel) {
    const fixedNorm = normalizeText(cell.fixedLabel);
    if ((criteria.conflictExceptionTerms || []).some(t => fixedNorm.includes(normalizeText(t)))) {
      return true;
    }
  }
  const text = normalizeText(formatCellDisplay(cell));
  if (!text) return true;
  return (criteria.conflictExceptionTerms || []).some(term => {
    const t = normalizeText(term);
    return t && text.includes(t);
  });
}

export function isNoteDiscipline(discipline: string | undefined, criteria: AnnualTimetableCriteria): boolean {
  const norm = normalizeText(discipline);
  if (!norm) return false;
  return (criteria.noteDisciplines || []).some(d => {
    const dn = normalizeText(d);
    return dn && norm.includes(dn);
  });
}

export function hasPlatformKeyword(discipline: string | undefined, criteria: AnnualTimetableCriteria): boolean {
  const norm = normalizeText(discipline);
  if (!norm) return false;
  return (criteria.platformKeywords || []).some(k => {
    const kn = normalizeText(k);
    return kn && norm.includes(kn);
  });
}

function matchesGroupDiscipline(disciplineNorm: string, grp: ExclusiveGroupCriteria): boolean {
  if (!disciplineNorm) return false;
  if (Array.isArray(grp.disciplines) && grp.disciplines.length > 0) {
    return grp.disciplines.some(d => {
      const dn = normalizeText(d);
      return dn && (disciplineNorm === dn || disciplineNorm.includes(dn));
    });
  }
  const kw = normalizeText(grp.keyword);
  return Boolean(kw && disciplineNorm.includes(kw));
}

export function isExclusiveGroupDiscipline(
  discipline: string | undefined,
  criteria: AnnualTimetableCriteria
): ExclusiveGroupCriteria | null {
  const norm = normalizeText(discipline);
  if (!norm) return null;
  for (const grp of criteria.exclusiveGroups || []) {
    if (grp.mode === 'together') continue;
    if (matchesGroupDiscipline(norm, grp)) return grp;
  }
  return null;
}

export function isTogetherGroupDiscipline(
  discipline: string | undefined,
  criteria: AnnualTimetableCriteria
): ExclusiveGroupCriteria | null {
  const norm = normalizeText(discipline);
  if (!norm) return null;
  for (const grp of criteria.exclusiveGroups || []) {
    if (grp.mode !== 'together') continue;
    if (matchesGroupDiscipline(norm, grp)) return grp;
  }
  return null;
}

export function getCellColorHex(
  cell: TimetableGridCell | undefined | null,
  teachers: TimetableTeacherProfile[],
  criteria: AnnualTimetableCriteria
): { bg: string; text: string } {
  if (!cell) return { bg: '#ffffff', text: '#0f172a' };
  if (cell.colorHex) {
    const dark = isDarkColor(cell.colorHex);
    return { bg: cell.colorHex, text: dark ? '#ffffff' : '#0f172a' };
  }
  if (cell.fixedLabel || cell.category === 'fixed') {
    return { bg: criteria.areaColors?.FIXED || '#e2e8f0', text: '#334155' };
  }
  const discNorm = normalizeText(cell.discipline);
  if (discNorm.includes('PROJETO DE VIDA') || discNorm === 'PV') {
    const bg = criteria.areaColors?.PROJETO_DE_VIDA || '#674ea7';
    return { bg, text: '#ffffff' };
  }
  if (cell.category === 'note' || isNoteDiscipline(cell.discipline, criteria)) {
    const bg = criteria.areaColors?.NOTE || '#45818e';
    return { bg, text: '#ffffff' };
  }
  const exGrp = isExclusiveGroupDiscipline(cell.discipline, criteria);
  if (cell.category === 'ema' || exGrp) {
    const bg = exGrp?.colorHex || criteria.areaColors?.EMA || '#6aa84f';
    return { bg, text: '#ffffff' };
  }
  const tKey = normalizeTeacherKey(cell.teacherName);
  const teacher = teachers.find(t => normalizeTeacherKey(t.name) === tKey);
  if (teacher && teacher.area && criteria.areaColors?.[teacher.area]) {
    const bg = criteria.areaColors[teacher.area];
    return { bg, text: isDarkColor(bg) ? '#ffffff' : '#0f172a' };
  }
  return { bg: criteria.areaColors?.OUTROS || '#ffffff', text: '#0f172a' };
}

function isDarkColor(hex: string): boolean {
  const clean = (hex || '').replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.55;
}

/**
 * Constrói mapa de bloqueios por professor (ATPCA da Área + Horários Multiplica assimilados pelo relógio)
 * Formato da chave do slot: `${dayOfWeek}|${periodNumber}`
 */
export function buildTeacherBlocksMap(
  teachers: TimetableTeacherProfile[],
  atpcaRules: AtpcaBlockRule[],
  periods?: TimetablePeriodDef[]
): Map<string, { slots: Set<string>; reasons: Map<string, string> }> {
  const effectivePeriods = periods && periods.length > 0 ? periods : createDefaultPeriods();
  const areaBlocks = new Map<string, { slots: Set<string>; reasons: Map<string, string> }>();

  for (const rule of atpcaRules || []) {
    const areaKey = normalizeText(rule.area);
    if (!areaKey) continue;
    if (!areaBlocks.has(areaKey)) {
      areaBlocks.set(areaKey, { slots: new Set(), reasons: new Map() });
    }
    const entry = areaBlocks.get(areaKey)!;
    for (const pNum of rule.periodNumbers || []) {
      if (pNum > 0) {
        const k = `${rule.dayOfWeek}|${pNum}`;
        entry.slots.add(k);
        entry.reasons.set(k, rule.label || `ATPCA ${rule.area}`);
      }
    }
  }

  const teacherBlocks = new Map<string, { slots: Set<string>; reasons: Map<string, string> }>();
  for (const prof of teachers || []) {
    const tKey = normalizeTeacherKey(prof.name);
    if (!tKey) continue;

    // Aplica bloqueios de ATPCA para todas as áreas configuradas do professor
    const profAreaKeys = Array.from(
      new Set(
        [
          ...(prof.areas || []),
          prof.area || '',
        ]
          .map(a => normalizeText(a))
          .filter(Boolean)
      )
    );
    const slots = new Set<string>();
    const reasons = new Map<string, string>();

    for (const areaKey of profAreaKeys) {
      const areaEntry = areaBlocks.get(areaKey);
      if (areaEntry) {
        areaEntry.slots.forEach(s => {
          slots.add(s);
          reasons.set(s, areaEntry.reasons.get(s) || `ATPCA ${areaKey}`);
        });
      }
    }

    // 1. Horários Multiplica por relógio (multiplicaSlots ou multiplicaStartTime/EndTime) -> assimila com as aulas da escola
    const clockSlots = getTeacherMultiplicaSlots(prof, effectivePeriods);
    if (clockSlots.length > 0) {
      for (const mSlot of clockSlots) {
        const matchedPeriods = resolveMultiplicaPeriodsFromClock(
          mSlot.startTime,
          mSlot.endTime,
          effectivePeriods
        );
        for (const p of matchedPeriods) {
          const k = `${mSlot.dayOfWeek}|${p.number}`;
          slots.add(k);
          reasons.set(k, `Multiplica (${mSlot.startTime}–${mSlot.endTime})`);
        }
      }
    } else if (prof.multiplicaDay && prof.multiplicaDay >= 1 && prof.multiplicaDay <= 5) {
      // 2. Fallback legado por número de aula
      for (const pNum of prof.multiplicaPeriods || []) {
        if (pNum > 0) {
          const k = `${prof.multiplicaDay}|${pNum}`;
          slots.add(k);
          reasons.set(k, 'Multiplica');
        }
      }
    }

    teacherBlocks.set(tKey, { slots, reasons });
  }

  return teacherBlocks;
}

function getTeachingPeriods(workspace: TimetableWorkspace): TimetablePeriodDef[] {
  return getEffectiveSchoolPeriods(workspace).filter(p => !p.isBreak && p.number > 0);
}

function buildCellMap(cells: TimetableGridCell[]): Map<string, TimetableGridCell> {
  const map = new Map<string, TimetableGridCell>();
  for (const c of cells || []) {
    map.set(getCellKey(c.dayOfWeek, c.periodId, c.classId), c);
  }
  return map;
}

function hasTeacherClashAt(
  cellMap: Map<string, TimetableGridCell>,
  classes: SchoolClass[],
  dayOfWeek: number,
  periodId: string,
  teacherName: string,
  ignoreClassId?: string
): boolean {
  const targetKey = normalizeTeacherKey(teacherName);
  if (!targetKey) return false;
  for (const cls of classes) {
    if (ignoreClassId && cls.id === ignoreClassId) continue;
    const cell = cellMap.get(getCellKey(dayOfWeek, periodId, cls.id));
    if (!cell || cell.fixedLabel) continue;
    if (normalizeTeacherKey(cell.teacherName) === targetKey) {
      return true;
    }
  }
  return false;
}

function countTeacherLessonsOnDay(
  cellMap: Map<string, TimetableGridCell>,
  classes: SchoolClass[],
  teachingPeriods: TimetablePeriodDef[],
  dayOfWeek: number,
  teacherName: string
): number {
  const targetKey = normalizeTeacherKey(teacherName);
  if (!targetKey) return 0;
  let count = 0;
  for (const p of teachingPeriods) {
    for (const cls of classes) {
      const cell = cellMap.get(getCellKey(dayOfWeek, p.id, cls.id));
      if (cell && !cell.fixedLabel && normalizeTeacherKey(cell.teacherName) === targetKey) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

function countSameDisciplineOnDayExact(
  cellMap: Map<string, TimetableGridCell>,
  teachingPeriods: TimetablePeriodDef[],
  dayOfWeek: number,
  classId: string,
  discipline: string
): number {
  const targetDisc = normalizeText(discipline);
  if (!targetDisc) return 0;
  let count = 0;
  for (const p of teachingPeriods) {
    const cell = cellMap.get(getCellKey(dayOfWeek, p.id, classId));
    if (cell && !cell.fixedLabel && normalizeText(cell.discipline) === targetDisc) {
      count += 1;
    }
  }
  return count;
}

/**
 * Validação global de carrinhos de notebooks (fiel a `validarUsoCarrinhosGlobal` / `validarUsoCarrinhos`)
 */
function canUseCartAtSlot(
  cellMap: Map<string, TimetableGridCell>,
  classes: SchoolClass[],
  dayOfWeek: number,
  periodId: string,
  discipline: string,
  criteria: AnnualTimetableCriteria
): boolean {
  let cartsInUse = 0;
  let hasEduProf = false;

  for (const cls of classes) {
    const cell = cellMap.get(getCellKey(dayOfWeek, periodId, cls.id));
    if (!cell) continue;
    const displayNorm = normalizeText(formatCellDisplay(cell));
    if (displayNorm.includes('EDU PROFISSIONAL')) {
      hasEduProf = true;
    }
    if (!cell.fixedLabel && (cell.category === 'note' || isNoteDiscipline(cell.discipline, criteria))) {
      cartsInUse += 1;
    }
  }

  const maxCarts = Math.max(1, criteria.maxCartsSimultaneous || 2);
  if (cartsInUse < maxCarts) return true;

  // Regra especial do script: 3º carrinho liberado para KHAN se EDU PROFISSIONAL estiver livre neste horário
  if (
    criteria.khanThirdCartWhenEduProfFree &&
    normalizeText(discipline).includes('KHAN') &&
    !hasEduProf &&
    cartsInUse < maxCarts + 1
  ) {
    return true;
  }

  return false;
}

/**
 * Validação de simultaneidade de grupos exclusivos (ex: EMA -> máx 1 turma na escola inteira por horário)
 */
function canPlaceExclusiveGroupAtSlot(
  cellMap: Map<string, TimetableGridCell>,
  classes: SchoolClass[],
  dayOfWeek: number,
  periodId: string,
  discipline: string,
  criteria: AnnualTimetableCriteria
): boolean {
  const grp = isExclusiveGroupDiscipline(discipline, criteria);
  const maxAllowed = grp ? Math.max(1, grp.maxSimultaneous) : 1;

  let currentInSchool = 0;
  for (const cls of classes) {
    const cell = cellMap.get(getCellKey(dayOfWeek, periodId, cls.id));
    if (!cell || cell.fixedLabel) continue;
    if (grp) {
      if (matchesGroupDiscipline(normalizeText(cell.discipline), grp)) {
        currentInSchool += 1;
      }
    } else if (cell.category === 'ema') {
      currentInSchool += 1;
    }
  }
  return currentInSchool < maxAllowed;
}

function isPreBlockContinuityViolated(
  teacherBlocks: Map<string, { slots: Set<string>; reasons: Map<string, string> }>,
  teacherName: string,
  dayOfWeek: number,
  periodNumber: number,
  criteria: AnnualTimetableCriteria
): boolean {
  if (!criteria.enablePreBlockContinuityLock) return false;
  const entry = teacherBlocks.get(normalizeTeacherKey(teacherName));
  if (!entry) return false;
  return entry.slots.has(`${dayOfWeek}|${periodNumber + 1}`);
}

function getTeacherDailyLimit(
  teachers: TimetableTeacherProfile[],
  teacherName: string,
  criteria: AnnualTimetableCriteria
): number {
  const found = teachers.find(t => normalizeTeacherKey(t.name) === normalizeTeacherKey(teacherName));
  return found?.dailyLimit || criteria.defaultTeacherDailyLimit || 7;
}

/**
 * 1. LIMPEZA SELETIVA DA GRADE (preserva fixas PEI e células travadas)
 */
export function clearAttributableGrid(
  workspace: TimetableWorkspace
): { cells: TimetableGridCell[]; removedCount: number } {
  const criteria = getActiveCriteria(workspace);
  const kept: TimetableGridCell[] = [];
  let removedCount = 0;

  for (const cell of workspace.cells || []) {
    if (isPreservedFixedCell(cell, criteria)) {
      kept.push(cell);
    } else {
      removedCount += 1;
    }
  }

  return { cells: kept, removedCount };
}

/**
 * 2. LIMPEZA SELETIVA POR DISCIPLINA (match exato, preserva todo o restante)
 */
export function clearDisciplineFromGrid(
  workspace: TimetableWorkspace,
  targetDiscipline: string
): { cells: TimetableGridCell[]; removedCount: number } {
  const targetNorm = normalizeText(targetDiscipline);
  if (!targetNorm) return { cells: workspace.cells, removedCount: 0 };

  const kept: TimetableGridCell[] = [];
  let removedCount = 0;

  for (const cell of workspace.cells || []) {
    if (!cell.fixedLabel && !cell.locked && normalizeText(cell.discipline) === targetNorm) {
      removedCount += 1;
    } else {
      kept.push(cell);
    }
  }

  return { cells: kept, removedCount };
}

export interface DistributionResult {
  cells: TimetableGridCell[];
  placedCount: number;
  remainingPendingCount: number;
  alreadyComplete: boolean;
  summaryMessage: string;
}

function countPlacedForMatrixItem(
  cellMap: Map<string, TimetableGridCell>,
  item: CurriculumMatrixItem
): number {
  const targetDisc = normalizeText(item.discipline);
  const targetTeacher = normalizeTeacherKey(item.teacherName);
  let count = 0;
  cellMap.forEach(cell => {
    if (cell.fixedLabel) return;
    if (cell.classId !== item.classId || normalizeText(cell.discipline) !== targetDisc) return;
    // Se a carga tiver professor definido, confere também o professor; se estiver sem professor, conta pela turma+disciplina
    if (!targetTeacher || normalizeTeacherKey(cell.teacherName) === targetTeacher) {
      count += 1;
    }
  });
  return count;
}

/**
 * 3. ATRIBUIR DISCIPLINAS COM USO DE NOTEBOOKS / CARRINHOS DE EQUIPAMENTOS
 */
export function distributeMatrixNote(
  workspace: TimetableWorkspace,
  classes: SchoolClass[]
): DistributionResult {
  const criteria = getActiveCriteria(workspace);
  const effectivePeriods = getEffectiveSchoolPeriods(workspace);
  const teachingPeriods = getTeachingPeriods(workspace);
  const teacherBlocks = buildTeacherBlocksMap(workspace.teachers, workspace.atpcaRules, effectivePeriods);
  const cellMap = buildCellMap(workspace.cells);

  const effectiveMatrix = syncGradeCurriculumToMatrix(workspace, classes);
  const noteItems = effectiveMatrix.filter(m => m.category === 'note' && m.weeklyLessons > 0);
  if (noteItems.length === 0) {
    return {
      cells: Array.from(cellMap.values()),
      placedCount: 0,
      remainingPendingCount: 0,
      alreadyComplete: true,
      summaryMessage:
        'Nenhuma disciplina com uso de Notebook/Equipamentos selecionada nos Critérios Anuais.',
    };
  }

  const pendingItems = noteItems
    .map(item => ({
      item,
      remaining: Math.max(0, item.weeklyLessons - countPlacedForMatrixItem(cellMap, item)),
    }))
    .filter(p => p.remaining > 0);

  if (pendingItems.length === 0) {
    return {
      cells: Array.from(cellMap.values()),
      placedCount: 0,
      remainingPendingCount: 0,
      alreadyComplete: true,
      summaryMessage: 'Todas as aulas com uso de Notebooks/Equipamentos já estão 100% alocadas na grade!',
    };
  }

  let placedCount = 0;
  pendingItems.sort((a, b) => b.remaining - a.remaining);

  for (const entry of pendingItems) {
    const { item } = entry;
    let remaining = entry.remaining;
    const tKey = normalizeTeacherKey(item.teacherName);
    const tBlocks = teacherBlocks.get(tKey)?.slots;
    const dailyLimit = getTeacherDailyLimit(workspace.teachers, item.teacherName, criteria);

    const canPlaceAt = (day: number, p: TimetablePeriodDef): boolean => {
      const k = getCellKey(day, p.id, item.classId);
      if (cellMap.has(k)) return false;
      if (tKey && tBlocks?.has(`${day}|${p.number}`)) return false;
      if (tKey && hasTeacherClashAt(cellMap, classes, day, p.id, item.teacherName)) return false;
      if (!canUseCartAtSlot(cellMap, classes, day, p.id, item.discipline, criteria)) return false;
      if (tKey && countTeacherLessonsOnDay(cellMap, classes, teachingPeriods, day, item.teacherName) >= dailyLimit) return false;
      return true;
    };

    const placeCell = (day: number, p: TimetablePeriodDef) => {
      const k = getCellKey(day, p.id, item.classId);
      cellMap.set(k, {
        id: k,
        dayOfWeek: day,
        periodId: p.id,
        periodNumber: p.number,
        periodLabel: p.label,
        classId: item.classId,
        className: item.className,
        teacherName: item.teacherName,
        discipline: item.discipline,
        category: 'note',
        colorHex: criteria.areaColors?.NOTE || '#45818e',
        hasPlatform: item.hasPlatform !== false,
        platformName: item.platformName || item.discipline,
      });
      remaining -= 1;
      placedCount += 1;
    };

    if (criteria.preferDoubleLessonsNote && remaining >= 2) {
      for (const wd of WEEKDAYS) {
        if (remaining < 2) break;
        const alreadyInDay = countSameDisciplineOnDayExact(cellMap, teachingPeriods, wd.id, item.classId, item.discipline);
        if (alreadyInDay > 0) continue;

        for (let i = 0; i < teachingPeriods.length - 1; i++) {
          if (remaining < 2) break;
          const p1 = teachingPeriods[i];
          const p2 = teachingPeriods[i + 1];
          if (p2.number !== p1.number + 1) continue;
          if (
            tKey &&
            countTeacherLessonsOnDay(cellMap, classes, teachingPeriods, wd.id, item.teacherName) + 2 > dailyLimit
          ) {
            continue;
          }
          if (canPlaceAt(wd.id, p1) && canPlaceAt(wd.id, p2)) {
            placeCell(wd.id, p1);
            placeCell(wd.id, p2);
            break;
          }
        }
      }
    }

    if (remaining > 0) {
      for (const wd of WEEKDAYS) {
        if (remaining <= 0) break;
        const alreadyInDay = countSameDisciplineOnDayExact(cellMap, teachingPeriods, wd.id, item.classId, item.discipline);
        if (alreadyInDay >= criteria.maxSameSubjectPerDay) continue;

        for (const p of teachingPeriods) {
          if (remaining <= 0) break;
          if (!canPlaceAt(wd.id, p)) continue;
          if (tKey && remaining === 1 && isPreBlockContinuityViolated(teacherBlocks, item.teacherName, wd.id, p.number, criteria)) {
            continue;
          }
          placeCell(wd.id, p);
          if (countSameDisciplineOnDayExact(cellMap, teachingPeriods, wd.id, item.classId, item.discipline) >= criteria.maxSameSubjectPerDay) {
            break;
          }
        }
      }
    }
  }

  const remainingPendingCount = noteItems.reduce(
    (acc, item) => acc + Math.max(0, item.weeklyLessons - countPlacedForMatrixItem(cellMap, item)),
    0
  );

  return {
    cells: Array.from(cellMap.values()),
    placedCount,
    remainingPendingCount,
    alreadyComplete: false,
    summaryMessage:
      remainingPendingCount === 0
        ? `Distribuição de Notebooks/Equipamentos concluída! ${placedCount} aula(s) alocada(s) respeitando o limite de ${criteria.maxCartsSimultaneous} carrinho(s) simultâneo(s).`
        : `${placedCount} aula(s) com Notebook alocada(s). Ainda restam ${remainingPendingCount} aula(s) pendente(s) — consulte Conferências & Dominó.`,
  };
}

/**
 * 4. ATRIBUIR GRUPOS DE SIMULTANEIDADE (Exclusividade E Aulas Conjuntas com múltiplos professores)
 */
export function distributeMatrixEma(
  workspace: TimetableWorkspace,
  classes: SchoolClass[]
): DistributionResult {
  const criteria = getActiveCriteria(workspace);
  const effectivePeriods = getEffectiveSchoolPeriods(workspace);
  const teachingPeriods = getTeachingPeriods(workspace);
  const teacherBlocks = buildTeacherBlocksMap(workspace.teachers, workspace.atpcaRules, effectivePeriods);
  const cellMap = buildCellMap(workspace.cells);

  const effectiveMatrix = syncGradeCurriculumToMatrix(workspace, classes);
  const groupItems = effectiveMatrix.filter(m => m.category === 'ema' && m.weeklyLessons > 0);
  if (groupItems.length === 0) {
    return {
      cells: Array.from(cellMap.values()),
      placedCount: 0,
      remainingPendingCount: 0,
      alreadyComplete: true,
      summaryMessage:
        'Nenhuma disciplina vinculada a Grupos de Simultaneidade (Exclusivos ou Aulas Conjuntas) nos Critérios Anuais.',
    };
  }

  const pendingItems = groupItems
    .map(item => ({
      item,
      remaining: Math.max(0, item.weeklyLessons - countPlacedForMatrixItem(cellMap, item)),
    }))
    .filter(p => p.remaining > 0);

  if (pendingItems.length === 0) {
    return {
      cells: Array.from(cellMap.values()),
      placedCount: 0,
      remainingPendingCount: 0,
      alreadyComplete: true,
      summaryMessage: 'Todas as aulas dos Grupos de Simultaneidade já estão 100% alocadas na grade!',
    };
  }

  let placedCount = 0;

  // Parte A: Grupos que precisam ACONTECER JUNTOS (mode === 'together', vários professores no mesmo horário)
  const handledItemIds = new Set<string>();
  const togetherGroups = (criteria.exclusiveGroups || []).filter(g => g.mode === 'together');
  for (const grp of togetherGroups) {
    const targetSeriesSet = new Set((grp.targetGradeSeries || []).map(s => normalizeText(s)));
    const matchingPending = pendingItems.filter(p => {
      if (!matchesGroupDiscipline(normalizeText(p.item.discipline), grp)) return false;
      if (targetSeriesSet.size > 0) {
        const clsObj = classes.find(c => c.id === p.item.classId);
        const series = normalizeText(
          p.item.gradeSeries || (clsObj ? extractGradeSeriesFromClass(clsObj) : p.item.className)
        );
        return targetSeriesSet.has(series);
      }
      return true;
    });

    if (matchingPending.length === 0) continue;
    matchingPending.forEach(p => handledItemIds.add(p.item.id));

    // Agrupa por disciplina para sincronizar todas as turmas daquela disciplina no mesmo dia e horário
    const byDisc = new Map<string, typeof matchingPending>();
    for (const p of matchingPending) {
      const dn = normalizeText(p.item.discipline);
      if (!byDisc.has(dn)) byDisc.set(dn, []);
      byDisc.get(dn)!.push(p);
    }

    for (const [, cohort] of byDisc.entries()) {
      let maxRemaining = Math.max(...cohort.map(c => c.remaining));
      const colorHex = grp.colorHex || '#7c3aed';

      const canCohortPlaceAt = (day: number, p: TimetablePeriodDef): boolean => {
        const teachersUsedInSlot = new Set<string>();
        for (const member of cohort) {
          if (member.remaining <= 0) continue;
          const k = getCellKey(day, p.id, member.item.classId);
          if (cellMap.has(k)) return false;
          const tKey = normalizeTeacherKey(member.item.teacherName);
          if (tKey) {
            // Cada turma precisa ter seu próprio professor livre neste horário
            if (teachersUsedInSlot.has(tKey)) return false;
            teachersUsedInSlot.add(tKey);
            const tBlocks = teacherBlocks.get(tKey)?.slots;
            if (tBlocks?.has(`${day}|${p.number}`)) return false;
            if (hasTeacherClashAt(cellMap, classes, day, p.id, member.item.teacherName)) return false;
            const dailyLimit = getTeacherDailyLimit(workspace.teachers, member.item.teacherName, criteria);
            if (countTeacherLessonsOnDay(cellMap, classes, teachingPeriods, day, member.item.teacherName) >= dailyLimit) return false;
          }
          if (
            countSameDisciplineOnDayExact(cellMap, teachingPeriods, day, member.item.classId, member.item.discipline) >=
            criteria.maxSameSubjectPerDay
          ) {
            return false;
          }
        }
        return true;
      };

      const placeCohortAt = (day: number, p: TimetablePeriodDef) => {
        for (const member of cohort) {
          if (member.remaining <= 0) continue;
          const k = getCellKey(day, p.id, member.item.classId);
          cellMap.set(k, {
            id: k,
            dayOfWeek: day,
            periodId: p.id,
            periodNumber: p.number,
            periodLabel: p.label,
            classId: member.item.classId,
            className: member.item.className,
            teacherName: member.item.teacherName,
            discipline: member.item.discipline,
            category: 'ema',
            colorHex,
            hasPlatform: member.item.hasPlatform ?? hasPlatformKeyword(member.item.discipline, criteria),
            platformName: member.item.platformName,
          });
          member.remaining -= 1;
          placedCount += 1;
        }
        maxRemaining = Math.max(...cohort.map(c => c.remaining));
      };

      // Tenta geminadas conjuntas primeiro
      if (criteria.preferDoubleLessonsEma && maxRemaining >= 2) {
        for (const wd of WEEKDAYS) {
          if (maxRemaining < 2) break;
          for (let i = 0; i < teachingPeriods.length - 1; i++) {
            if (maxRemaining < 2) break;
            const p1 = teachingPeriods[i];
            const p2 = teachingPeriods[i + 1];
            if (p2.number !== p1.number + 1) continue;
            if (canCohortPlaceAt(wd.id, p1) && canCohortPlaceAt(wd.id, p2)) {
              placeCohortAt(wd.id, p1);
              placeCohortAt(wd.id, p2);
              break;
            }
          }
        }
      }

      // Aulas conjuntas restantes
      if (maxRemaining > 0) {
        for (const wd of WEEKDAYS) {
          if (maxRemaining <= 0) break;
          for (const p of teachingPeriods) {
            if (maxRemaining <= 0) break;
            if (!canCohortPlaceAt(wd.id, p)) continue;
            placeCohortAt(wd.id, p);
          }
        }
      }
    }
  }

  // Parte B: Grupos EXCLUSIVOS (limite de turmas simultâneas na escola)
  const exclusivePending = pendingItems.filter(p => !handledItemIds.has(p.item.id));
  exclusivePending.sort((a, b) => b.remaining - a.remaining);

  for (const entry of exclusivePending) {
    const { item } = entry;
    let remaining = entry.remaining;
    const tKey = normalizeTeacherKey(item.teacherName);
    const tBlocks = teacherBlocks.get(tKey)?.slots;
    const dailyLimit = getTeacherDailyLimit(workspace.teachers, item.teacherName, criteria);
    const exGrp = isExclusiveGroupDiscipline(item.discipline, criteria);
    const colorHex = exGrp?.colorHex || criteria.areaColors?.EMA || '#6aa84f';

    const canPlaceAt = (day: number, p: TimetablePeriodDef): boolean => {
      const k = getCellKey(day, p.id, item.classId);
      if (cellMap.has(k)) return false;
      if (tKey && tBlocks?.has(`${day}|${p.number}`)) return false;
      if (tKey && hasTeacherClashAt(cellMap, classes, day, p.id, item.teacherName)) return false;
      if (!canPlaceExclusiveGroupAtSlot(cellMap, classes, day, p.id, item.discipline, criteria)) return false;
      if (tKey && countTeacherLessonsOnDay(cellMap, classes, teachingPeriods, day, item.teacherName) >= dailyLimit) return false;
      return true;
    };

    const placeCell = (day: number, p: TimetablePeriodDef) => {
      const k = getCellKey(day, p.id, item.classId);
      cellMap.set(k, {
        id: k,
        dayOfWeek: day,
        periodId: p.id,
        periodNumber: p.number,
        periodLabel: p.label,
        classId: item.classId,
        className: item.className,
        teacherName: item.teacherName,
        discipline: item.discipline,
        category: 'ema',
        colorHex,
        hasPlatform: item.hasPlatform ?? hasPlatformKeyword(item.discipline, criteria),
        platformName: item.platformName,
      });
      remaining -= 1;
      placedCount += 1;
    };

    if (criteria.preferDoubleLessonsEma && remaining >= 2) {
      for (const wd of WEEKDAYS) {
        if (remaining < 2) break;
        if (countSameDisciplineOnDayExact(cellMap, teachingPeriods, wd.id, item.classId, item.discipline) > 0) continue;
        for (let i = 0; i < teachingPeriods.length - 1; i++) {
          if (remaining < 2) break;
          const p1 = teachingPeriods[i];
          const p2 = teachingPeriods[i + 1];
          if (p2.number !== p1.number + 1) continue;
          if (tKey && countTeacherLessonsOnDay(cellMap, classes, teachingPeriods, wd.id, item.teacherName) + 2 > dailyLimit) continue;
          if (canPlaceAt(wd.id, p1) && canPlaceAt(wd.id, p2)) {
            placeCell(wd.id, p1);
            placeCell(wd.id, p2);
            break;
          }
        }
      }
    }

    if (remaining > 0) {
      for (const wd of WEEKDAYS) {
        if (remaining <= 0) break;
        if (countSameDisciplineOnDayExact(cellMap, teachingPeriods, wd.id, item.classId, item.discipline) >= criteria.maxSameSubjectPerDay) continue;
        for (const p of teachingPeriods) {
          if (remaining <= 0) break;
          if (!canPlaceAt(wd.id, p)) continue;
          if (tKey && remaining === 1 && isPreBlockContinuityViolated(teacherBlocks, item.teacherName, wd.id, p.number, criteria)) continue;
          placeCell(wd.id, p);
          if (countSameDisciplineOnDayExact(cellMap, teachingPeriods, wd.id, item.classId, item.discipline) >= criteria.maxSameSubjectPerDay) break;
        }
      }
    }
  }

  const remainingPendingCount = groupItems.reduce(
    (acc, item) => acc + Math.max(0, item.weeklyLessons - countPlacedForMatrixItem(cellMap, item)),
    0
  );

  return {
    cells: Array.from(cellMap.values()),
    placedCount,
    remainingPendingCount,
    alreadyComplete: false,
    summaryMessage:
      remainingPendingCount === 0
        ? `Grupos de Simultaneidade concluídos! ${placedCount} aula(s) alocada(s) respeitando exclusividades e horários conjuntos.`
        : `${placedCount} aula(s) alocada(s) nos Grupos de Simultaneidade. Ainda restam ${remainingPendingCount} pendente(s).`,
  };
}

/**
 * 5. ATRIBUIR DEMAIS DISCIPLINAS DA MATRIZ CURRICULAR (Seletivo por Disciplina exata OU Todas as Pendentes)
 */
export function distributeMatrixRest(
  workspace: TimetableWorkspace,
  classes: SchoolClass[],
  targetDiscipline?: string
): DistributionResult {
  const criteria = getActiveCriteria(workspace);
  const effectivePeriods = getEffectiveSchoolPeriods(workspace);
  const teachingPeriods = getTeachingPeriods(workspace);
  const teacherBlocks = buildTeacherBlocksMap(workspace.teachers, workspace.atpcaRules, effectivePeriods);
  const cellMap = buildCellMap(workspace.cells);

  const effectiveMatrix = syncGradeCurriculumToMatrix(workspace, classes);
  const targetNorm = targetDiscipline ? normalizeText(targetDiscipline) : '';
  const restItems = effectiveMatrix.filter(m => {
    if (m.category !== 'rest' || m.weeklyLessons <= 0) return false;
    if (targetNorm) return normalizeText(m.discipline) === targetNorm;
    return true;
  });

  if (restItems.length === 0) {
    return {
      cells: Array.from(cellMap.values()),
      placedCount: 0,
      remainingPendingCount: 0,
      alreadyComplete: true,
      summaryMessage: targetDiscipline
        ? `Nenhuma carga cadastrada na Matriz Curricular para "${targetDiscipline}".`
        : 'Nenhuma disciplina regular pendente cadastrada na Matriz Curricular.',
    };
  }

  const pendingItems = restItems
    .map(item => ({
      item,
      remaining: Math.max(0, item.weeklyLessons - countPlacedForMatrixItem(cellMap, item)),
    }))
    .filter(p => p.remaining > 0);

  if (pendingItems.length === 0) {
    return {
      cells: Array.from(cellMap.values()),
      placedCount: 0,
      remainingPendingCount: 0,
      alreadyComplete: true,
      summaryMessage: targetDiscipline
        ? `Todas as aulas de "${targetDiscipline}" já estão 100% alocadas!`
        : 'Todas as demais disciplinas da Matriz Curricular já estão 100% alocadas!',
    };
  }

  let placedCount = 0;
  // Ordena por maior carga semanal primeiro (facilita encaixe de Português/Matemática antes de 1-2 aulas)
  pendingItems.sort((a, b) => b.remaining - a.remaining);

  for (const entry of pendingItems) {
    const { item } = entry;
    let remaining = entry.remaining;
    const tKey = normalizeTeacherKey(item.teacherName);
    const tBlocks = teacherBlocks.get(tKey)?.slots;
    const dailyLimit = getTeacherDailyLimit(workspace.teachers, item.teacherName, criteria);
    const maxPerDay = Math.max(1, criteria.maxSameSubjectPerDay || 2);

    const isPlatform = item.hasPlatform ?? hasPlatformKeyword(item.discipline, criteria);

    const canPlaceAt = (day: number, p: TimetablePeriodDef): boolean => {
      const k = getCellKey(day, p.id, item.classId);
      if (cellMap.has(k)) return false;
      if (tKey && tBlocks?.has(`${day}|${p.number}`)) return false;
      if (tKey && hasTeacherClashAt(cellMap, classes, day, p.id, item.teacherName)) return false;
      if (tKey && countTeacherLessonsOnDay(cellMap, classes, teachingPeriods, day, item.teacherName) >= dailyLimit) return false;
      if (countSameDisciplineOnDayExact(cellMap, teachingPeriods, day, item.classId, item.discipline) >= maxPerDay) return false;
      return true;
    };

    const placeCell = (day: number, p: TimetablePeriodDef) => {
      const k = getCellKey(day, p.id, item.classId);
      const cellObj: TimetableGridCell = {
        id: k,
        dayOfWeek: day,
        periodId: p.id,
        periodNumber: p.number,
        periodLabel: p.label,
        classId: item.classId,
        className: item.className,
        teacherName: item.teacherName,
        discipline: item.discipline,
        category: 'rest',
        hasPlatform: isPlatform,
        platformName: item.platformName || (isPlatform ? item.discipline : undefined),
      };
      const color = getCellColorHex(cellObj, workspace.teachers, criteria);
      cellObj.colorHex = color.bg;
      cellMap.set(k, cellObj);
      remaining -= 1;
      placedCount += 1;
    };

    // Passada 1: Distribuição equilibrada (tenta no máximo 1 aula por dia antes de dobrar, ou dobrar geminada quando carga >= 4)
    if (remaining >= 4 && maxPerDay >= 2) {
      for (const wd of WEEKDAYS) {
        if (remaining < 2) break;
        if (countSameDisciplineOnDayExact(cellMap, teachingPeriods, wd.id, item.classId, item.discipline) > 0) continue;
        for (let i = 0; i < teachingPeriods.length - 1; i++) {
          const p1 = teachingPeriods[i];
          const p2 = teachingPeriods[i + 1];
          if (p2.number !== p1.number + 1) continue;
          if (tKey && countTeacherLessonsOnDay(cellMap, classes, teachingPeriods, wd.id, item.teacherName) + 2 > dailyLimit) continue;
          if (canPlaceAt(wd.id, p1) && canPlaceAt(wd.id, p2)) {
            placeCell(wd.id, p1);
            placeCell(wd.id, p2);
            break;
          }
        }
      }
    }

    // Passada 2: Espalha 1 aula em dias que ainda não têm a disciplina
    for (const wd of WEEKDAYS) {
      if (remaining <= 0) break;
      if (countSameDisciplineOnDayExact(cellMap, teachingPeriods, wd.id, item.classId, item.discipline) > 0) continue;
      for (const p of teachingPeriods) {
        if (remaining <= 0) break;
        if (!canPlaceAt(wd.id, p)) continue;
        placeCell(wd.id, p);
        break;
      }
    }

    // Passada 3: Completa até atingir maxPerDay nos dias disponíveis
    if (remaining > 0) {
      for (const wd of WEEKDAYS) {
        if (remaining <= 0) break;
        for (const p of teachingPeriods) {
          if (remaining <= 0) break;
          if (!canPlaceAt(wd.id, p)) continue;
          placeCell(wd.id, p);
        }
      }
    }
  }

  const remainingPendingCount = restItems.reduce(
    (acc, item) => acc + Math.max(0, item.weeklyLessons - countPlacedForMatrixItem(cellMap, item)),
    0
  );

  return {
    cells: Array.from(cellMap.values()),
    placedCount,
    remainingPendingCount,
    alreadyComplete: false,
    summaryMessage: targetDiscipline
      ? `Distribuição de "${targetDiscipline}": ${placedCount} aula(s) alocada(s), ${remainingPendingCount} pendente(s).`
      : `Base Comum distribuída: ${placedCount} aula(s) alocada(s), ${remainingPendingCount} pendente(s).`,
  };
}

/**
 * 6. AUDITORIA / CONFERÊNCIA DAS MATRIZES (`CONF_NOTE`, `CONF_EMA`, `CONF_REST`)
 */
export interface MatrixAuditRow {
  item: CurriculumMatrixItem;
  planned: number;
  placed: number;
  diff: number; // placed - planned
  status: 'concluido' | 'pendente' | 'excesso';
  statusLabel: string;
  extraAlert?: string;
}

export function auditMatrixProgress(
  workspace: TimetableWorkspace,
  classes: SchoolClass[]
): {
  note: MatrixAuditRow[];
  ema: MatrixAuditRow[];
  rest: MatrixAuditRow[];
  emaSimultaneityErrors: string[];
  totalPlanned: number;
  totalPlaced: number;
  totalPending: number;
} {
  const criteria = getActiveCriteria(workspace);
  const teachingPeriods = getTeachingPeriods(workspace);
  const cellMap = buildCellMap(workspace.cells);
  const effectiveMatrix = syncGradeCurriculumToMatrix(workspace, classes);

  // Detecta simultaneidade indevida em grupos exclusivos na escola
  const emaSimultaneityErrors: string[] = [];
  const exclusiveRules = (criteria.exclusiveGroups || []).filter(g => g.mode !== 'together');
  for (const grp of exclusiveRules) {
    const maxAllowed = Math.max(1, grp.maxSimultaneous || 1);
    for (const wd of WEEKDAYS) {
      for (const p of teachingPeriods) {
        const inSlot: string[] = [];
        for (const cls of classes) {
          const cell = cellMap.get(getCellKey(wd.id, p.id, cls.id));
          if (cell && !cell.fixedLabel && matchesGroupDiscipline(normalizeText(cell.discipline), grp)) {
            inSlot.push(`${cls.name} (${cell.discipline})`);
          }
        }
        if (inSlot.length > maxAllowed) {
          emaSimultaneityErrors.push(`${grp.name} · ${wd.short} ${p.label}: ${inSlot.join(' + ')}`);
        }
      }
    }
  }

  const buildRows = (cat: CurriculumMatrixCategory): MatrixAuditRow[] => {
    return effectiveMatrix
      .filter(m => m.category === cat)
      .map(item => {
        const placed = countPlacedForMatrixItem(cellMap, item);
        const planned = item.weeklyLessons;
        const diff = placed - planned;
        let status: MatrixAuditRow['status'] = 'concluido';
        let statusLabel = 'CONCLUÍDO';
        if (diff < 0) {
          status = 'pendente';
          statusLabel = `PENDENTE (Faltam ${Math.abs(diff)})`;
        } else if (diff > 0) {
          status = 'excesso';
          statusLabel = `EXCESSO (+${diff})`;
        }
        return {
          item,
          planned,
          placed,
          diff,
          status,
          statusLabel,
        };
      });
  };

  const note = buildRows('note');
  const ema = buildRows('ema');
  const rest = buildRows('rest');
  const all = [...note, ...ema, ...rest];

  const totalPlanned = all.reduce((s, r) => s + r.planned, 0);
  const totalPlaced = all.reduce((s, r) => s + Math.min(r.placed, r.planned), 0);
  const totalPending = all.reduce((s, r) => s + (r.diff < 0 ? Math.abs(r.diff) : 0), 0);

  return { note, ema, rest, emaSimultaneityErrors, totalPlanned, totalPlaced, totalPending };
}

/**
 * 7. AUDITORIA DE CONFLITOS DE PROFESSORES (`conferirConflitosProfessores` -> `CONFLITOS_LOG`)
 */
export interface TeacherConflictLog {
  id: string;
  dayOfWeek: number;
  dayLabel: string;
  periodId: string;
  periodLabel: string;
  teacherName: string;
  classesInvolved: string[];
  cellIds: string[];
  type: 'choque_turma' | 'violacao_bloqueio';
  detail: string;
}

export function auditTeacherConflicts(
  workspace: TimetableWorkspace,
  classes: SchoolClass[]
): { conflicts: TeacherConflictLog[]; conflictCellIds: Set<string> } {
  const criteria = getActiveCriteria(workspace);
  const effectivePeriods = getEffectiveSchoolPeriods(workspace);
  const teachingPeriods = getTeachingPeriods(workspace);
  const teacherBlocks = buildTeacherBlocksMap(workspace.teachers, workspace.atpcaRules, effectivePeriods);
  const cellMap = buildCellMap(workspace.cells);

  const conflicts: TeacherConflictLog[] = [];
  const conflictCellIds = new Set<string>();

  for (const wd of WEEKDAYS) {
    for (const p of teachingPeriods) {
      const byTeacher = new Map<string, { displayName: string; cells: TimetableGridCell[] }>();

      for (const cls of classes) {
        const cell = cellMap.get(getCellKey(wd.id, p.id, cls.id));
        if (!cell || isConflictExceptionCell(cell, criteria)) continue;
        // Auditoria olha EXCLUSIVAMENTE para o PROFESSOR (nunca para a disciplina)
        if (!cell.teacherName || isPlaceholderTeacherName(cell.teacherName)) continue;
        const tKey = normalizeTeacherKey(cell.teacherName);
        if (!tKey) continue;

        // Verifica violação de ATPCA / Multiplica
        const blockInfo = teacherBlocks.get(tKey);
        const blockKey = `${wd.id}|${p.number}`;
        if (blockInfo?.slots.has(blockKey)) {
          conflictCellIds.add(cell.id);
          conflicts.push({
            id: `blk-${wd.id}-${p.id}-${tKey}-${cls.id}`,
            dayOfWeek: wd.id,
            dayLabel: wd.label,
            periodId: p.id,
            periodLabel: p.label,
            teacherName: cell.teacherName,
            classesInvolved: [cls.name],
            cellIds: [cell.id],
            type: 'violacao_bloqueio',
            detail: `Alocado em ${cls.name} (${cell.discipline || ''}) durante ${blockInfo.reasons.get(blockKey) || 'ATPCA/Multiplica'}`,
          });
        }

        if (!byTeacher.has(tKey)) {
          byTeacher.set(tKey, { displayName: cell.teacherName, cells: [] });
        }
        byTeacher.get(tKey)!.cells.push(cell);
      }

      byTeacher.forEach((info, tKey) => {
        if (info.cells.length > 1) {
          const ids = info.cells.map(c => c.id);
          ids.forEach(id => conflictCellIds.add(id));
          conflicts.push({
            id: `chk-${wd.id}-${p.id}-${tKey}`,
            dayOfWeek: wd.id,
            dayLabel: wd.label,
            periodId: p.id,
            periodLabel: p.label,
            teacherName: info.displayName,
            classesInvolved: info.cells.map(c => `${c.className} (${c.discipline || ''})`),
            cellIds: ids,
            type: 'choque_turma',
            detail: `Choque simultâneo em ${info.cells.length} turmas: ${info.cells.map(c => c.className).join(' e ')}`,
          });
        }
      });
    }
  }

  return { conflicts, conflictCellIds };
}

/**
 * 8. BANCO DE ESTUDOS ESTRATÉGICO (`gerarBancoEstudosEstrategico`)
 */
export interface StudyBankEntry {
  teacherName: string;
  area: string;
  dayOfWeek: number;
  dayLabel: string;
  periodId: string;
  periodNumber: number;
  periodLabel: string;
  status: 'LIVRE (ESTUDOS)';
  pendingOpportunities: string[];
}

export function generateStudyBank(
  workspace: TimetableWorkspace,
  classes: SchoolClass[]
): StudyBankEntry[] {
  const effectivePeriods = getEffectiveSchoolPeriods(workspace);
  const teachingPeriods = getTeachingPeriods(workspace);
  const teacherBlocks = buildTeacherBlocksMap(workspace.teachers, workspace.atpcaRules, effectivePeriods);
  const cellMap = buildCellMap(workspace.cells);

  // Calcula pendências por professor
  const pendingByTeacher = new Map<string, string[]>();
  for (const item of workspace.matrix || []) {
    const placed = countPlacedForMatrixItem(cellMap, item);
    const missing = item.weeklyLessons - placed;
    if (missing > 0) {
      const tKey = normalizeTeacherKey(item.teacherName);
      if (!pendingByTeacher.has(tKey)) pendingByTeacher.set(tKey, []);
      pendingByTeacher.get(tKey)!.push(`${item.className} - ${item.discipline} (${missing})`);
    }
  }

  const entries: StudyBankEntry[] = [];
  for (const prof of workspace.teachers || []) {
    const tKey = normalizeTeacherKey(prof.name);
    const blocks = teacherBlocks.get(tKey)?.slots;
    const pendings = pendingByTeacher.get(tKey) || [];

    for (const wd of WEEKDAYS) {
      for (const p of teachingPeriods) {
        if (blocks?.has(`${wd.id}|${p.number}`)) continue;
        if (hasTeacherClashAt(cellMap, classes, wd.id, p.id, prof.name)) continue;

        entries.push({
          teacherName: prof.name,
          area: prof.area || 'OUTROS',
          dayOfWeek: wd.id,
          dayLabel: wd.label,
          periodId: p.id,
          periodNumber: p.number,
          periodLabel: p.label,
          status: 'LIVRE (ESTUDOS)',
          pendingOpportunities: pendings,
        });
      }
    }
  }

  return entries;
}

/**
 * 9. SIMULADOR DE INTELIGÊNCIA DE GRADE & EFEITO DOMINÓ (`simularInteligenciaGrade` + `simularEfeitoDominoMestre`)
 */
export interface IntelligenceSuggestion {
  id: string;
  targetClassId: string;
  targetClassName: string;
  gapDayOfWeek: number;
  gapDayLabel: string;
  gapPeriodId: string;
  gapPeriodLabel: string;
  pendingTeacher: string;
  pendingDiscipline: string;
  pendingCategory: CurriculumMatrixCategory;
  maneuverType: 'direto' | 'vertical' | 'domino_recuo' | 'substituto_area' | 'travado';
  title: string;
  explanation: string;
  // Dados estruturados para aplicar a manobra em 1 clique!
  actionPayload?:
    | {
        kind: 'direct';
      }
    | {
        kind: 'vertical_slide';
        sourceCellId: string; // célula na mesma turma que desliza para o horário vago
        sourceDayOfWeek: number;
        sourcePeriodId: string;
      }
    | {
        kind: 'domino_swap';
        originClassId: string;
        originCellId: string; // célula onde o professor pendente está no horário vago
        absorberCellId: string; // célula na turma de origem cujo professor está livre no horário vago
      };
}

function isAreaCompatible(
  teacherArea: string,
  discipline: string,
  criteria: AnnualTimetableCriteria
): boolean {
  const areaKey = normalizeText(teacherArea);
  const discNorm = normalizeText(discipline);
  const keywords = criteria.areaCompatibility?.[areaKey] || [];
  return keywords.some(kw => discNorm.includes(normalizeText(kw)));
}

export function simulateGradeIntelligence(
  workspace: TimetableWorkspace,
  classes: SchoolClass[]
): IntelligenceSuggestion[] {
  const criteria = getActiveCriteria(workspace);
  const effectivePeriods = getEffectiveSchoolPeriods(workspace);
  const teachingPeriods = getTeachingPeriods(workspace);
  const teacherBlocks = buildTeacherBlocksMap(workspace.teachers, workspace.atpcaRules, effectivePeriods);
  const cellMap = buildCellMap(workspace.cells);
  const studyBank = generateStudyBank(workspace, classes);

  const freeSet = new Set<string>(
    studyBank.map(e => `${normalizeTeacherKey(e.teacherName)}|${e.dayOfWeek}|${e.periodId}`)
  );

  const isTeacherFree = (teacherName: string, day: number, periodId: string) =>
    freeSet.has(`${normalizeTeacherKey(teacherName)}|${day}|${periodId}`);

  // Mapeia dívidas (pendências) por turma
  const debtsByClass = new Map<string, CurriculumMatrixItem[]>();
  for (const item of workspace.matrix || []) {
    const placed = countPlacedForMatrixItem(cellMap, item);
    if (placed < item.weeklyLessons) {
      if (!debtsByClass.has(item.classId)) debtsByClass.set(item.classId, []);
      debtsByClass.get(item.classId)!.push(item);
    }
  }

  const suggestions: IntelligenceSuggestion[] = [];

  for (const cls of classes) {
    const debts = debtsByClass.get(cls.id);
    if (!debts || debts.length === 0) continue;

    for (const wd of WEEKDAYS) {
      for (const p of teachingPeriods) {
        const gapKey = getCellKey(wd.id, p.id, cls.id);
        if (cellMap.has(gapKey)) continue; // não está vago

        let foundSuggestion = false;

        // 0. Encaixe Direto (se algum professor pendente da turma estiver livre agora)
        for (const pnd of debts) {
          if (isTeacherFree(pnd.teacherName, wd.id, p.id)) {
            const cartOk = pnd.category !== 'note' || canUseCartAtSlot(cellMap, classes, wd.id, p.id, pnd.discipline, criteria);
            const emaOk = pnd.category !== 'ema' || canPlaceExclusiveGroupAtSlot(cellMap, classes, wd.id, p.id, pnd.discipline, criteria);
            if (cartOk && emaOk) {
              suggestions.push({
                id: `sug-dir-${gapKey}-${pnd.id}`,
                targetClassId: cls.id,
                targetClassName: cls.name,
                gapDayOfWeek: wd.id,
                gapDayLabel: wd.short,
                gapPeriodId: p.id,
                gapPeriodLabel: p.label,
                pendingTeacher: pnd.teacherName,
                pendingDiscipline: pnd.discipline,
                pendingCategory: pnd.category,
                maneuverType: 'direto',
                title: 'Encaixe Direto Disponível',
                explanation: `${pnd.teacherName} (${pnd.discipline}) está livre em Estudo neste horário e pode ocupar a vaga diretamente.`,
                actionPayload: { kind: 'direct' },
              });
              foundSuggestion = true;
              break;
            }
          }
        }
        if (foundSuggestion) continue;

        // 1. MANOBRA VERTICAL (Interno na mesma turma)
        for (const pnd of debts) {
          if (foundSuggestion) break;
          for (const wdOrig of WEEKDAYS) {
            if (foundSuggestion) break;
            for (const pOrig of teachingPeriods) {
              const origKey = getCellKey(wdOrig.id, pOrig.id, cls.id);
              const origCell = cellMap.get(origKey);
              if (!origCell || isPreservedFixedCell(origCell, criteria) || !origCell.teacherName) continue;

              // O professor interno está livre no horário vago? E o pendente está livre no horário original?
              if (
                isTeacherFree(origCell.teacherName, wd.id, p.id) &&
                isTeacherFree(pnd.teacherName, wdOrig.id, pOrig.id)
              ) {
                const origTBlocks = teacherBlocks.get(normalizeTeacherKey(origCell.teacherName))?.slots;
                if (origTBlocks?.has(`${wd.id}|${p.number}`)) continue;

                suggestions.push({
                  id: `sug-vert-${gapKey}-${origKey}`,
                  targetClassId: cls.id,
                  targetClassName: cls.name,
                  gapDayOfWeek: wd.id,
                  gapDayLabel: wd.short,
                  gapPeriodId: p.id,
                  gapPeriodLabel: p.label,
                  pendingTeacher: pnd.teacherName,
                  pendingDiscipline: pnd.discipline,
                  pendingCategory: pnd.category,
                  maneuverType: 'vertical',
                  title: 'Manobra Vertical (Troca Interna na Turma)',
                  explanation: `Mover ${origCell.teacherName} (${origCell.discipline}) de ${wdOrig.short} ${pOrig.label} para ${wd.short} ${p.label} e encaixar ${pnd.teacherName} (${pnd.discipline}) em ${wdOrig.short} ${pOrig.label}.`,
                  actionPayload: {
                    kind: 'vertical_slide',
                    sourceCellId: origCell.id,
                    sourceDayOfWeek: wdOrig.id,
                    sourcePeriodId: pOrig.id,
                  },
                });
                foundSuggestion = true;
                break;
              }
            }
          }
        }
        if (foundSuggestion) continue;

        // 2. MANOBRA HORIZONTAL / EFEITO DOMINÓ COM RECUO
        for (const pnd of debts) {
          if (foundSuggestion) break;
          // Onde o professor pendente está dando aula no momento da vaga?
          let originCell: TimetableGridCell | undefined;
          for (const otherCls of classes) {
            if (otherCls.id === cls.id) continue;
            const c = cellMap.get(getCellKey(wd.id, p.id, otherCls.id));
            if (c && !isPreservedFixedCell(c, criteria) && normalizeTeacherKey(c.teacherName) === normalizeTeacherKey(pnd.teacherName)) {
              originCell = c;
              break;
            }
          }
          if (!originCell) continue;

          // 2A. Procura outro professor da turma de origem que esteja livre neste horário vago para absorver a sala
          for (const wdAlt of WEEKDAYS) {
            if (foundSuggestion) break;
            for (const pAlt of teachingPeriods) {
              const absorberKey = getCellKey(wdAlt.id, pAlt.id, originCell.classId);
              const absorberCell = cellMap.get(absorberKey);
              if (!absorberCell || absorberCell.id === originCell.id || isPreservedFixedCell(absorberCell, criteria) || !absorberCell.teacherName) {
                continue;
              }
              if (isTeacherFree(absorberCell.teacherName, wd.id, p.id)) {
                suggestions.push({
                  id: `sug-dom-${gapKey}-${absorberCell.id}`,
                  targetClassId: cls.id,
                  targetClassName: cls.name,
                  gapDayOfWeek: wd.id,
                  gapDayLabel: wd.short,
                  gapPeriodId: p.id,
                  gapPeriodLabel: p.label,
                  pendingTeacher: pnd.teacherName,
                  pendingDiscipline: pnd.discipline,
                  pendingCategory: pnd.category,
                  maneuverType: 'domino_recuo',
                  title: 'Efeito Dominó com Recuo entre Turmas',
                  explanation: `Puxar ${pnd.teacherName} de ${originCell.className} para ${cls.name} (${wd.short} ${p.label}); ${absorberCell.teacherName} (${absorberCell.discipline}) recua de ${wdAlt.short} ${pAlt.label} para cobrir ${originCell.className}.`,
                  actionPayload: {
                    kind: 'domino_swap',
                    originClassId: originCell.classId,
                    originCellId: originCell.id,
                    absorberCellId: absorberCell.id,
                  },
                });
                foundSuggestion = true;
                break;
              }
            }
          }

          // 2B. Caso não encontre recuo, procura substituto livre da mesma área de conhecimento
          if (!foundSuggestion) {
            const sub = (workspace.teachers || []).find(
              t =>
                normalizeTeacherKey(t.name) !== normalizeTeacherKey(pnd.teacherName) &&
                isTeacherFree(t.name, wd.id, p.id) &&
                isAreaCompatible(t.area, originCell!.discipline || '', criteria)
            );
            if (sub) {
              suggestions.push({
                id: `sug-sub-${gapKey}-${sub.id}`,
                targetClassId: cls.id,
                targetClassName: cls.name,
                gapDayOfWeek: wd.id,
                gapDayLabel: wd.short,
                gapPeriodId: p.id,
                gapPeriodLabel: p.label,
                pendingTeacher: pnd.teacherName,
                pendingDiscipline: pnd.discipline,
                pendingCategory: pnd.category,
                maneuverType: 'substituto_area',
                title: `Substituição Compatível (${sub.area})`,
                explanation: `${pnd.teacherName} está em ${originCell.className} (${originCell.discipline}). ${sub.name} (Área ${sub.area}) está livre em Estudos e pode cobrir ${originCell.className} enquanto ${pnd.teacherName} assume ${cls.name}.`,
              });
              foundSuggestion = true;
            }
          }
        }

        if (!foundSuggestion) {
          const firstDebt = debts[0];
          suggestions.push({
            id: `sug-trv-${gapKey}`,
            targetClassId: cls.id,
            targetClassName: cls.name,
            gapDayOfWeek: wd.id,
            gapDayLabel: wd.short,
            gapPeriodId: p.id,
            gapPeriodLabel: p.label,
            pendingTeacher: firstDebt.teacherName,
            pendingDiscipline: firstDebt.discipline,
            pendingCategory: firstDebt.category,
            maneuverType: 'travado',
            title: 'Travado — Análise Manual Necessária',
            explanation: `Horário vago em ${cls.name} (${wd.short} ${p.label}), porém ${debts.map(d => `${d.teacherName} (${d.discipline})`).join(', ')} possuem bloqueio ou choque sem troca imediata.`,
          });
        }
      }
    }
  }

  return suggestions;
}

/**
 * Executa uma sugestão do Simulador de Inteligência em 1 clique
 */
export function applyIntelligenceManeuver(
  workspace: TimetableWorkspace,
  suggestion: IntelligenceSuggestion
): TimetableGridCell[] | null {
  if (!suggestion.actionPayload) return null;
  const criteria = getActiveCriteria(workspace);
  const periods = workspace.periods || [];
  const cellMap = buildCellMap(workspace.cells);

  const gapPeriod = periods.find(p => p.id === suggestion.gapPeriodId);
  if (!gapPeriod) return null;

  const newCellBase = (day: number, p: TimetablePeriodDef, classId: string, className: string): TimetableGridCell => {
    const isPlatform = hasPlatformKeyword(suggestion.pendingDiscipline, criteria) || suggestion.pendingCategory === 'note';
    const c: TimetableGridCell = {
      id: getCellKey(day, p.id, classId),
      dayOfWeek: day,
      periodId: p.id,
      periodNumber: p.number,
      periodLabel: p.label,
      classId,
      className,
      teacherName: suggestion.pendingTeacher,
      discipline: suggestion.pendingDiscipline,
      category: suggestion.pendingCategory,
      hasPlatform: isPlatform,
      platformName: isPlatform ? suggestion.pendingDiscipline : undefined,
    };
    c.colorHex = getCellColorHex(c, workspace.teachers, criteria).bg;
    return c;
  };

  if (suggestion.actionPayload.kind === 'direct') {
    const c = newCellBase(suggestion.gapDayOfWeek, gapPeriod, suggestion.targetClassId, suggestion.targetClassName);
    cellMap.set(c.id, c);
    return Array.from(cellMap.values());
  }

  if (suggestion.actionPayload.kind === 'vertical_slide') {
    const payload = suggestion.actionPayload;
    const sourceCell = cellMap.get(payload.sourceCellId);
    const sourcePeriod = periods.find(p => p.id === payload.sourcePeriodId);
    if (!sourceCell || !sourcePeriod) return null;

    // Move sourceCell para o horário vago
    const movedId = getCellKey(suggestion.gapDayOfWeek, gapPeriod.id, suggestion.targetClassId);
    cellMap.set(movedId, {
      ...sourceCell,
      id: movedId,
      dayOfWeek: suggestion.gapDayOfWeek,
      periodId: gapPeriod.id,
      periodNumber: gapPeriod.number,
      periodLabel: gapPeriod.label,
    });

    // Coloca o pendente no lugar original da sourceCell
    const inserted = newCellBase(sourceCell.dayOfWeek, sourcePeriod, suggestion.targetClassId, suggestion.targetClassName);
    cellMap.set(inserted.id, inserted);

    return Array.from(cellMap.values());
  }

  if (suggestion.actionPayload.kind === 'domino_swap') {
    const originCell = cellMap.get(suggestion.actionPayload.originCellId);
    const absorberCell = cellMap.get(suggestion.actionPayload.absorberCellId);
    if (!originCell || !absorberCell) return null;

    // 1. Pendente assume a vaga na turma alvo
    const placedInTarget = newCellBase(suggestion.gapDayOfWeek, gapPeriod, suggestion.targetClassId, suggestion.targetClassName);
    cellMap.set(placedInTarget.id, placedInTarget);

    // 2. Absorber cobre o lugar que o pendente deixou na turma de origem
    const coveredOriginId = originCell.id;
    cellMap.set(coveredOriginId, {
      ...absorberCell,
      id: coveredOriginId,
      dayOfWeek: originCell.dayOfWeek,
      periodId: originCell.periodId,
      periodNumber: originCell.periodNumber,
      periodLabel: originCell.periodLabel,
      classId: originCell.classId,
      className: originCell.className,
    });

    // 3. Libera o antigo horário do absorber
    cellMap.delete(absorberCell.id);
    return Array.from(cellMap.values());
  }

  return null;
}

/**
 * 10. LOGÍSTICA DE CORREDOR & ROTEIRO DINÂMICO AOE (`mapearMecanismoDeTrocas` + `gerarFluxoEncadeadoAOE`)
 */
export interface CorridorTransitionRow {
  id: string;
  dayOfWeek: number;
  dayLabel: string;
  fromPeriodLabel: string;
  toPeriodLabel: string;
  classId: string;
  className: string;
  leavingTeacher: string;
  enteringTeacher: string;
  enteringOrigin: string; // Ex: "ME (Momento de Estudo)" ou nome da turma anterior
  category: 'mantem_professor' | 'autonoma_me' | 'corredor_mesmo_ano' | 'domino_liberado' | 'requer_aoe';
  statusLabel: string;
}

export interface AoeDominoRoute {
  id: string;
  dayOfWeek: number;
  dayLabel: string;
  transitionLabel: string;
  triggerRoom: string;
  chainDescription: string;
  assignedAgent: string; // "AOE 1", "AOE 2", "ALERTA: GARGALO SEM AGENTE"
  isBottleneck: boolean;
  savedRooms: string[];
}

function extractGradePrefix(className: string): string {
  const m = normalizeText(className).match(/^(\d+[º°ª]?\s*(?:ANO|SERIE|EM|EF)?)/);
  return m ? m[1].trim() : normalizeText(className).slice(0, 3);
}

export function mapCorridorTransitionsAndAoeFlow(
  workspace: TimetableWorkspace,
  classes: SchoolClass[]
): {
  transitions: CorridorTransitionRow[];
  aoeRoutes: AoeDominoRoute[];
  bottleneckCount: number;
} {
  const criteria = getActiveCriteria(workspace);
  const availableAgents = Math.max(1, criteria.availableAoeAgents || 2);
  const periods = workspace.periods || [];
  const cellMap = buildCellMap(workspace.cells);

  const transitions: CorridorTransitionRow[] = [];
  const aoeRoutes: AoeDominoRoute[] = [];
  let bottleneckCount = 0;

  // Analisa apenas pares consecutivos de aulas (ignorando transições através de intervalo/almoço, pois todos saem)
  const consecutivePairs: Array<{ from: TimetablePeriodDef; to: TimetablePeriodDef }> = [];
  for (let i = 0; i < periods.length - 1; i++) {
    const p1 = periods[i];
    const p2 = periods[i + 1];
    if (!p1.isBreak && !p2.isBreak) {
      consecutivePairs.push({ from: p1, to: p2 });
    }
  }

  for (const wd of WEEKDAYS) {
    for (const pair of consecutivePairs) {
      // Mapeia onde cada professor estava em `pair.from` e para onde vai em `pair.to`
      const teacherFromRoom = new Map<string, SchoolClass>();
      const teacherToRoom = new Map<string, SchoolClass>();

      for (const cls of classes) {
        const cFrom = cellMap.get(getCellKey(wd.id, pair.from.id, cls.id));
        const cTo = cellMap.get(getCellKey(wd.id, pair.to.id, cls.id));
        if (cFrom && !cFrom.fixedLabel && cFrom.teacherName) {
          teacherFromRoom.set(normalizeTeacherKey(cFrom.teacherName), cls);
        }
        if (cTo && !cTo.fixedLabel && cTo.teacherName) {
          teacherToRoom.set(normalizeTeacherKey(cTo.teacherName), cls);
        }
      }

      // Grafo de dependência: Sala Destino depende da Sala Origem do professor entrante
      const pendingByRoom = new Map<string, { cls: SchoolClass; leaving: string; entering: string; originCls: SchoolClass }>();

      for (const cls of classes) {
        const cFrom = cellMap.get(getCellKey(wd.id, pair.from.id, cls.id));
        const cTo = cellMap.get(getCellKey(wd.id, pair.to.id, cls.id));
        if (!cFrom || !cTo || cFrom.fixedLabel || cTo.fixedLabel) continue;
        if (!cFrom.teacherName || !cTo.teacherName) continue;

        const leaveKey = normalizeTeacherKey(cFrom.teacherName);
        const enterKey = normalizeTeacherKey(cTo.teacherName);

        if (leaveKey === enterKey) {
          transitions.push({
            id: `tr-${wd.id}-${pair.from.id}-${cls.id}`,
            dayOfWeek: wd.id,
            dayLabel: wd.short,
            fromPeriodLabel: pair.from.label,
            toPeriodLabel: pair.to.label,
            classId: cls.id,
            className: cls.name,
            leavingTeacher: cFrom.teacherName,
            enteringTeacher: cTo.teacherName,
            enteringOrigin: cls.name,
            category: 'mantem_professor',
            statusLabel: 'Mesmo Professor (Geminada)',
          });
          continue;
        }

        const originCls = teacherFromRoom.get(enterKey);
        if (!originCls) {
          transitions.push({
            id: `tr-${wd.id}-${pair.from.id}-${cls.id}`,
            dayOfWeek: wd.id,
            dayLabel: wd.short,
            fromPeriodLabel: pair.from.label,
            toPeriodLabel: pair.to.label,
            classId: cls.id,
            className: cls.name,
            leavingTeacher: cFrom.teacherName,
            enteringTeacher: cTo.teacherName,
            enteringOrigin: 'ME (Momento de Estudo)',
            category: 'autonoma_me',
            statusLabel: 'Autônoma (Entra de ME)',
          });
          continue;
        }

        // Troca de corredor no mesmo ano/série (salas vizinhas)
        if (extractGradePrefix(cls.name) === extractGradePrefix(originCls.name)) {
          transitions.push({
            id: `tr-${wd.id}-${pair.from.id}-${cls.id}`,
            dayOfWeek: wd.id,
            dayLabel: wd.short,
            fromPeriodLabel: pair.from.label,
            toPeriodLabel: pair.to.label,
            classId: cls.id,
            className: cls.name,
            leavingTeacher: cFrom.teacherName,
            enteringTeacher: cTo.teacherName,
            enteringOrigin: originCls.name,
            category: 'corredor_mesmo_ano',
            statusLabel: `Troca de Corredor (${originCls.name} ↔ ${cls.name})`,
          });
          continue;
        }

        // Precisa verificar se a sala de origem recebe alguém de ME ou fica sem aula (Dominó autônomo)
        const originNextCell = cellMap.get(getCellKey(wd.id, pair.to.id, originCls.id));
        const originCoveredByME =
          !originNextCell ||
          Boolean(originNextCell.fixedLabel) ||
          (originNextCell.teacherName && !teacherFromRoom.has(normalizeTeacherKey(originNextCell.teacherName)));

        if (originCoveredByME) {
          transitions.push({
            id: `tr-${wd.id}-${pair.from.id}-${cls.id}`,
            dayOfWeek: wd.id,
            dayLabel: wd.short,
            fromPeriodLabel: pair.from.label,
            toPeriodLabel: pair.to.label,
            classId: cls.id,
            className: cls.name,
            leavingTeacher: cFrom.teacherName,
            enteringTeacher: cTo.teacherName,
            enteringOrigin: originCls.name,
            category: 'domino_liberado',
            statusLabel: `Dominó Autônomo (${originCls.name} coberta por ME)`,
          });
          continue;
        }

        transitions.push({
          id: `tr-${wd.id}-${pair.from.id}-${cls.id}`,
          dayOfWeek: wd.id,
          dayLabel: wd.short,
          fromPeriodLabel: pair.from.label,
          toPeriodLabel: pair.to.label,
          classId: cls.id,
          className: cls.name,
          leavingTeacher: cFrom.teacherName,
          enteringTeacher: cTo.teacherName,
          enteringOrigin: originCls.name,
          category: 'requer_aoe',
          statusLabel: `Requer Apoio AOE (Aguardando saída de ${originCls.name})`,
        });

        pendingByRoom.set(cls.id, {
          cls,
          leaving: cFrom.teacherName,
          entering: cTo.teacherName,
          originCls,
        });
      }

      // Encadeamento de Grafos (Dominó AOE): cada componente conectado que requer AOE consome 1 agente na sala-gatilho
      const visited = new Set<string>();
      let agentCounter = 0;

      pendingByRoom.forEach((node, roomId) => {
        if (visited.has(roomId)) return;

        // Rastreia cadeia de salas ligadas
        const chain: string[] = [];
        const saved: string[] = [];
        let cursorId: string | undefined = roomId;
        let guard = 0;

        while (cursorId && pendingByRoom.has(cursorId) && !visited.has(cursorId) && guard < 12) {
          visited.add(cursorId);
          const curr = pendingByRoom.get(cursorId)!;
          chain.push(`${curr.cls.name} [${curr.entering}]`);
          if (guard > 0) saved.push(curr.cls.name);
          cursorId = curr.originCls.id;
          guard += 1;
        }

        agentCounter += 1;
        const isBottleneck = agentCounter > availableAgents;
        if (isBottleneck) bottleneckCount += 1;

        aoeRoutes.push({
          id: `aoe-${wd.id}-${pair.from.id}-${roomId}`,
          dayOfWeek: wd.id,
          dayLabel: wd.label,
          transitionLabel: `${pair.from.label} → ${pair.to.label}`,
          triggerRoom: node.cls.name,
          chainDescription: chain.join(' → '),
          assignedAgent: isBottleneck ? `ALERTA: GARGALO SEM AGENTE (${agentCounter}/${availableAgents})` : `AOE ${agentCounter}`,
          isBottleneck,
          savedRooms: saved,
        });
      });
    }
  }

  return { transitions, aoeRoutes, bottleneckCount };
}

/**
 * Converte as células ativas da Grade Completa para `TeacherScheduleSlot[]`
 * mantendo 100% de integração com:
 *  - Trava de Plataformas em `TabletsManager.tsx`
 *  - Diário do Professor em `TeacherAbsenceView.tsx`
 */
export function convertTimetableCellsToTeacherSchedules(
  workspace: TimetableWorkspace
): TeacherScheduleSlot[] {
  const criteria = getActiveCriteria(workspace);
  const slots: TeacherScheduleSlot[] = [];

  for (const cell of workspace.cells || []) {
    if (cell.fixedLabel || !cell.teacherName) continue;
    const isPlat =
      cell.hasPlatform === true ||
      cell.category === 'note' ||
      isNoteDiscipline(cell.discipline, criteria) ||
      hasPlatformKeyword(cell.discipline, criteria);

    slots.push({
      id: `tt-${cell.dayOfWeek}-${cell.periodId}-${cell.classId}`,
      schoolId: workspace.schoolId,
      teacherName: cell.teacherName,
      classId: cell.classId,
      className: cell.className,
      dayOfWeek: cell.dayOfWeek,
      periodId: cell.periodId,
      periodName: cell.periodLabel,
      subject: cell.discipline || 'Aula',
      hasPlatform: isPlat,
      platformName: isPlat ? (cell.platformName || cell.discipline || 'Plataforma Digital') : undefined,
    });
  }

  return slots;
}

// ===========================================================================
// 11. CONTROLE DE SUBSTITUIÇÕES PEI (PROFESSORES DA CASA FORA DE SALA)
//     Critério 1: Mesma área do professor ausente
//     Critério 2: Divisão justa das substituições na semana e no mês
// ===========================================================================

export function getWeekdayFromDateStr(dateStr: string): number {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getDay(); // 0=Dom, 1=Seg .. 5=Sex, 6=Sáb
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function getIsoWeekRange(dateStr: string): { start: string; end: string } {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { start: dateStr, end: dateStr };
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: formatLocalYmd(mon), end: formatLocalYmd(sun) };
}

const BUILTIN_AREA_KEYWORDS: Record<string, string[]> = {
  CHS: ['HIST', 'GEO', 'SOCI', 'FILO', 'HUMANAS', 'GEOPOLITICA', 'ATUALIDADES', 'ENSINO RELIGIOSO'],
  CNT: ['BIO', 'FIS', 'QUI', 'CIENC', 'NATUREZA', 'PRATICAS'],
  MAT: ['MAT', 'EXATAS', 'KHAN', 'OE MAT', 'FINANCEIRA', 'ESTATISTICA', 'MATIFIC'],
  LGG: ['PORT', 'ING', 'ART', 'ARTE', 'ED.FIS', 'ED FIS', 'EDUCACAO FISICA', 'EF', 'RED', 'SPEAK', 'OE PORT', 'LINGUAGENS', 'LEITURA', 'LITERATURA', 'ESPANHOL'],
  INOVA: ['PROJETO DE VIDA', 'PV', 'P.V', 'TECNOLOGIA', 'ROBOTICA', 'PROGRAMACAO', 'EMPREENDEDORISMO', 'ORATORIA', 'PROTAGONISMO', 'INOVACAO', 'EMA'],
};

const STRICT_INSTITUTIONAL_FIXED_TERMS = new Set([
  'TUTORIA',
  'ELETIVA',
  'ELETIVAS',
  'CLUBE',
  'CLUBES',
  'EDU PROFISSIONAL',
  'EDUCACAO PROFISSIONAL',
  'INTERVALO',
  'RECREIO',
  'ALMOCO',
  'ALMOÇO',
  'LANCHE',
  '---',
]);

function splitEmbeddedTeacherAndDiscipline(
  rawText: string,
  criteria: AnnualTimetableCriteria,
  knownTeacherKeys: Set<string>
): { teacherName: string; discipline: string } | null {
  const cleaned = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!cleaned) return null;

  const choosePair = (partA: string, partB: string, preferFirstTeacher: boolean) => {
    const a = partA.trim();
    const b = partB.trim();
    if (!a || !b) return null;
    const aKey = normalizeTeacherKey(a);
    const bKey = normalizeTeacherKey(b);
    const aKnown = knownTeacherKeys.has(aKey);
    const bKnown = knownTeacherKeys.has(bKey);
    if (aKnown && !bKnown) return { teacherName: a, discipline: b };
    if (bKnown && !aKnown) return { teacherName: b, discipline: a };

    const aDisc = isLikelyDisciplineName(a, criteria);
    const bDisc = isLikelyDisciplineName(b, criteria);
    if (bDisc && !aDisc) return { teacherName: a, discipline: b };
    if (aDisc && !bDisc) return { teacherName: b, discipline: a };
    if (aDisc && bDisc) return null;

    return preferFirstTeacher
      ? { teacherName: a, discipline: b }
      : { teacherName: b, discipline: a };
  };

  // 1. Quebra de linha
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const res = choosePair(lines[0], lines.slice(1).join(' '), true);
    if (res) return res;
  }

  // 2. Parênteses: "PROFESSOR (DISCIPLINA)" ou "DISCIPLINA (PROFESSOR)"
  const mParen = cleaned.match(/^(.+?)\s*\(([^()]{1,})\)\s*$/);
  if (mParen) {
    const res = choosePair(mParen[1], mParen[2], true);
    if (res) return res;
  }

  // 3. Separadores com ou sem espaços: "-", "–", "/", "|", ":"
  const sepParts = cleaned
    .split(/\s*(?:[-–/|:]|\s[-–/|:]\s)\s*/)
    .map(p => p.trim())
    .filter(Boolean);
  if (sepParts.length >= 2) {
    const res = choosePair(sepParts[0], sepParts.slice(1).join(' - '), true);
    if (res) return res;
  }

  return null;
}

/**
 * Repara deterministicamente células sem nome de professor visível (ex.: Projeto de Vida, Arte)
 * usando EXCLUSIVAMENTE informações já presentes na própria grade ou matriz curricular (zero alucinação):
 *  1) Converte fixedLabel indevido quando for disciplina regular (ex.: PROJETO DE VIDA, ARTE) ou tiver "Prof (Disc)".
 *  2) Separa textos não divididos no campo disciplina (ex.: "MARIA - ARTE", "PROJETO DE VIDA: JOÃO").
 *  3) Preenche teacherName vazio se a MESMA turma + MESMA disciplina já tiver professor definido em outro dia ou na Matriz.
 */
export function normalizeAndEnrichTimetableCells(
  workspace: TimetableWorkspace
): { workspace: TimetableWorkspace; fixedCount: number } {
  const criteria = getActiveCriteria(workspace);
  const knownTeacherKeys = new Set<string>();

  for (const cell of workspace.cells || []) {
    if (!cell.fixedLabel && cell.teacherName && !isPlaceholderTeacherName(cell.teacherName) && !isLikelyDisciplineName(cell.teacherName, criteria)) {
      knownTeacherKeys.add(normalizeTeacherKey(cell.teacherName));
    }
  }
  for (const t of workspace.teachers || []) {
    if (t.name && !isPlaceholderTeacherName(t.name) && !isLikelyDisciplineName(t.name, criteria)) {
      knownTeacherKeys.add(normalizeTeacherKey(t.name));
    }
  }

  let fixedCount = 0;

  // Passo 1: Normaliza células com fixedLabel indevido ou texto combinado em discipline
  const pass1Cells: TimetableGridCell[] = (workspace.cells || []).map(cell => {
    // 1a. fixedLabel que na verdade é disciplina regular (como PROJETO DE VIDA / ARTE) ou contém professor
    if (cell.fixedLabel) {
      const fNorm = normalizeText(cell.fixedLabel);
      const isStrictFixed = Array.from(STRICT_INSTITUTIONAL_FIXED_TERMS).some(
        term => fNorm === normalizeText(term) || fNorm.startsWith(`${normalizeText(term)} `)
      );
      if (!isStrictFixed) {
        const split = splitEmbeddedTeacherAndDiscipline(cell.fixedLabel, criteria, knownTeacherKeys);
        if (split) {
          fixedCount += 1;
          return {
            ...cell,
            fixedLabel: undefined,
            teacherName: split.teacherName,
            discipline: split.discipline,
            category: isNoteDiscipline(split.discipline, criteria)
              ? 'note'
              : isExclusiveGroupDiscipline(split.discipline, criteria)
              ? 'ema'
              : 'rest',
          };
        }
        if (isLikelyDisciplineName(cell.fixedLabel, criteria)) {
          fixedCount += 1;
          return {
            ...cell,
            fixedLabel: undefined,
            teacherName: '',
            discipline: cell.fixedLabel.trim(),
            category: isNoteDiscipline(cell.fixedLabel, criteria)
              ? 'note'
              : isExclusiveGroupDiscipline(cell.fixedLabel, criteria)
              ? 'ema'
              : 'rest',
          };
        }
      }
      return cell;
    }

    // 1b. Célula regular onde teacherName está vazio mas discipline contém "Prof (Disc)" / "Prof - Disc"
    if (isPlaceholderTeacherName(cell.teacherName) && cell.discipline?.trim()) {
      const split = splitEmbeddedTeacherAndDiscipline(cell.discipline, criteria, knownTeacherKeys);
      if (split && !isPlaceholderTeacherName(split.teacherName) && !isLikelyDisciplineName(split.teacherName, criteria)) {
        fixedCount += 1;
        return {
          ...cell,
          teacherName: split.teacherName,
          discipline: split.discipline,
        };
      }
    }

    // 1c. Célula regular onde discipline está vazio mas teacherName contém "Prof (Disc)" ou é uma disciplina isolada
    if (!cell.discipline?.trim() && cell.teacherName?.trim()) {
      const split = splitEmbeddedTeacherAndDiscipline(cell.teacherName, criteria, knownTeacherKeys);
      if (split && !isPlaceholderTeacherName(split.teacherName)) {
        fixedCount += 1;
        return {
          ...cell,
          teacherName: split.teacherName,
          discipline: split.discipline,
        };
      }
      if (isLikelyDisciplineName(cell.teacherName, criteria)) {
        fixedCount += 1;
        return {
          ...cell,
          teacherName: '',
          discipline: cell.teacherName.trim(),
        };
      }
    }

    return cell;
  });

  // Passo 2: Constrói mapa exato (classId + discipline) -> teacherName já conhecido na grade ou na matriz
  const teacherByClassAndDisc = new Map<string, string>();
  for (const item of workspace.matrix || []) {
    if (!item.classId || !item.discipline?.trim() || isPlaceholderTeacherName(item.teacherName)) continue;
    if (isLikelyDisciplineName(item.teacherName, criteria)) continue;
    const key = `${item.classId}__${normalizeText(item.discipline)}`;
    if (!teacherByClassAndDisc.has(key)) {
      teacherByClassAndDisc.set(key, item.teacherName.trim());
    }
  }
  for (const cell of pass1Cells) {
    if (cell.fixedLabel || !cell.discipline?.trim() || isPlaceholderTeacherName(cell.teacherName)) continue;
    if (isLikelyDisciplineName(cell.teacherName, criteria)) continue;
    const key = `${cell.classId}__${normalizeText(cell.discipline)}`;
    if (!teacherByClassAndDisc.has(key)) {
      teacherByClassAndDisc.set(key, cell.teacherName!.trim());
    }
  }

  // Passo 3: Preenche células sem teacherName quando a mesma turma+disciplina já possui docente identificado
  const finalCells = pass1Cells.map(cell => {
    if (cell.fixedLabel || !cell.discipline?.trim()) return cell;
    if (!isPlaceholderTeacherName(cell.teacherName)) return cell;

    const matchKey = `${cell.classId}__${normalizeText(cell.discipline)}`;
    const matchedTeacher = teacherByClassAndDisc.get(matchKey);
    if (matchedTeacher) {
      fixedCount += 1;
      return {
        ...cell,
        teacherName: matchedTeacher,
      };
    }
    return cell;
  });

  if (fixedCount === 0) {
    return { workspace, fixedCount: 0 };
  }

  return {
    workspace: {
      ...workspace,
      cells: finalCells,
    },
    fixedCount,
  };
}

export function inferDisciplineArea(
  discipline: string | undefined,
  criteria: AnnualTimetableCriteria
): string {
  const norm = normalizeText(discipline);
  if (!norm) return 'OUTROS';

  const checkMap = (mapObj: Record<string, string[]>) => {
    for (const [area, keywords] of Object.entries(mapObj)) {
      for (const kw of keywords || []) {
        const k = normalizeText(kw);
        if (!k) continue;
        if (norm === k || norm.includes(k)) {
          return area.toUpperCase();
        }
      }
    }
    return '';
  };

  const fromCriteria = checkMap(criteria.areaCompatibility || {});
  if (fromCriteria) return fromCriteria;

  const fromBuiltin = checkMap(BUILTIN_AREA_KEYWORDS);
  if (fromBuiltin) return fromBuiltin;

  return 'OUTROS';
}

export function inferAreasFromTeacherDisciplines(
  teacherName: string,
  workspace: TimetableWorkspace
): string[] {
  const key = normalizeTeacherKey(teacherName);
  if (!key) return [];
  const criteria = getActiveCriteria(workspace);
  const votes = new Map<string, number>();

  for (const cell of workspace.cells || []) {
    if (cell.fixedLabel || normalizeTeacherKey(cell.teacherName) !== key) continue;
    const area = inferDisciplineArea(cell.discipline, criteria);
    if (area !== 'OUTROS') {
      votes.set(area, (votes.get(area) || 0) + 1);
    }
  }
  for (const item of workspace.matrix || []) {
    if (normalizeTeacherKey(item.teacherName) !== key) continue;
    const area = inferDisciplineArea(item.discipline, criteria);
    if (area !== 'OUTROS') {
      votes.set(area, (votes.get(area) || 0) + 1);
    }
  }

  return Array.from(votes.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([area]) => area);
}

/**
 * Retorna TODAS as áreas de atuação configuradas para o professor (suporta múltiplas áreas para afinidade pedagógica).
 * Respeita integralmente `profile.areas` quando configurado pelo usuário na tela de Substituições / DB-PROF.
 */
export function getTeacherAreas(
  teacherName: string,
  workspace: TimetableWorkspace
): string[] {
  const key = normalizeTeacherKey(teacherName);
  if (!key) return ['OUTROS'];

  const profile = (workspace.teachers || []).find(
    t => normalizeTeacherKey(t.name) === key
  );

  // 1. Configuração explícita de múltiplas áreas salva pelo usuário
  if (profile?.areas && profile.areas.length > 0) {
    const clean = Array.from(
      new Set(profile.areas.map(a => normalizeText(a)).filter(Boolean))
    );
    if (clean.length > 0) return clean;
  }

  const inferred = inferAreasFromTeacherDisciplines(teacherName, workspace);

  // 2. Perfil com área única: se for diferente do fallback legado 'LGG' ou compatível com as disciplinas, usa ela
  if (profile?.area && normalizeText(profile.area) && normalizeText(profile.area) !== 'OUTROS') {
    const profArea = normalizeText(profile.area);
    // Corrige automaticamente perfis auto-importados que receberam 'LGG' padrão mesmo lecionando apenas outra área
    if (profArea === 'LGG' && inferred.length > 0 && !inferred.includes('LGG')) {
      return inferred;
    }
    return [profArea];
  }

  if (inferred.length > 0) return inferred;
  return [profile?.area ? normalizeText(profile.area) : 'OUTROS'];
}

export function inferTeacherArea(
  teacherName: string,
  workspace: TimetableWorkspace
): string {
  return getTeacherAreas(teacherName, workspace)[0] || 'OUTROS';
}

export interface HouseTeacherInfo {
  name: string;
  key: string;
  area: string;
  areas: string[];
}

export function getAllHouseTeachers(workspace: TimetableWorkspace): HouseTeacherInfo[] {
  const criteria = getActiveCriteria(workspace);
  const byKey = new Map<string, HouseTeacherInfo>();

  // Fonte primária: NOMES reais dos professores presentes na Grade por Professor (workspace.cells)
  for (const cell of workspace.cells || []) {
    if (cell.fixedLabel || !cell.teacherName) continue;
    const key = normalizeTeacherKey(cell.teacherName);
    if (!key || isPlaceholderTeacherName(cell.teacherName) || isLikelyDisciplineName(cell.teacherName, criteria)) continue;
    if (!byKey.has(key)) {
      const areas = getTeacherAreas(cell.teacherName, workspace);
      byKey.set(key, {
        name: cell.teacherName.trim(),
        key,
        area: areas[0] || 'OUTROS',
        areas,
      });
    }
  }

  // Fallback apenas se a grade ainda estiver totalmente vazia
  if (byKey.size === 0) {
    for (const t of workspace.teachers || []) {
      const key = normalizeTeacherKey(t.name);
      if (!key || isPlaceholderTeacherName(t.name) || isLikelyDisciplineName(t.name, criteria)) continue;
      if (!byKey.has(key)) {
        const areas = getTeacherAreas(t.name, workspace);
        byKey.set(key, {
          name: t.name.trim(),
          key,
          area: areas[0] || 'OUTROS',
          areas,
        });
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

// ===========================================================================
// 11A. GRADE CURRICULAR SEPARADA POR PROFESSOR (FONTE OFICIAL P/ SUBSTITUIÇÕES)
// ===========================================================================

export interface TeacherTimetableLesson {
  cellId: string;
  classId: string;
  className: string;
  discipline: string;
  hasPlatform?: boolean;
  locked?: boolean;
  colorHex?: string;
}

export interface TeacherTimetableSlot {
  dayOfWeek: number;
  periodId: string;
  periodNumber: number;
  periodLabel: string;
  status: 'em_aula' | 'bloqueado' | 'livre';
  lessons: TeacherTimetableLesson[];
  blockReason?: string;
}

export interface TeacherTimetableRow {
  teacherKey: string;
  teacherName: string;
  area: string;
  areas: string[];
  disciplines: string[];
  dailyLimit: number;
  weeklyLessonsCount: number;
  dailyLessonsCount: Record<number, number>;
  slotsByDay: Record<number, Record<string, TeacherTimetableSlot>>;
}

export interface UnassignedLessonGroup {
  classId: string;
  className: string;
  discipline: string;
  cellIds: string[];
  count: number;
  slotsSummary: string[];
}

export interface TeacherTimetableView {
  teachers: TeacherTimetableRow[];
  byKey: Map<string, TeacherTimetableRow>;
  unassignedGroups: UnassignedLessonGroup[];
  unassignedCellCount: number;
}

/**
 * Constrói a Grade Curricular separada por professor (Seg–Sex × 1ª–9ª aula).
 * Esta é a FONTE ÚNICA usada tanto pela aba "Grade por Professor" quanto pelo
 * motor de "Substituições PEI" para identificar quem está Em Sala, Bloqueado (ATPCA/Multiplica) ou Livre.
 */
export function buildTeacherTimetableView(
  workspace: TimetableWorkspace,
  classes: SchoolClass[]
): TeacherTimetableView {
  const criteria = getActiveCriteria(workspace);
  const effectivePeriods = getEffectiveSchoolPeriods(workspace);
  const teachingPeriods = getTeachingPeriods(workspace);
  const classNameById = new Map(classes.map(c => [c.id, c.name]));
  const houseTeachers = getAllHouseTeachers(workspace);
  const teacherBlocks = buildTeacherBlocksMap(workspace.teachers || [], workspace.atpcaRules || [], effectivePeriods);
  const profileByKey = new Map(
    (workspace.teachers || []).map(t => [normalizeTeacherKey(t.name), t])
  );

  // Agrupa todas as células regulares por docente e coleta aulas sem professor atribuído
  const lessonsByTeacherSlot = new Map<string, TeacherTimetableLesson[]>(); // `${teacherKey}|${day}|${periodId}`
  const disciplinesByTeacher = new Map<string, Set<string>>();
  const unassignedMap = new Map<string, UnassignedLessonGroup>();
  let unassignedCellCount = 0;

  for (const cell of workspace.cells || []) {
    if (cell.fixedLabel) continue;
    const resolvedClassName = classNameById.get(cell.classId) || cell.className;

    if (isPlaceholderTeacherName(cell.teacherName) || isLikelyDisciplineName(cell.teacherName, criteria)) {
      if (cell.discipline?.trim()) {
        unassignedCellCount += 1;
        const gKey = `${cell.classId}__${normalizeText(cell.discipline)}`;
        const dayShort = WEEKDAYS.find(w => w.id === cell.dayOfWeek)?.short || `D${cell.dayOfWeek}`;
        const slotDesc = `${dayShort} ${cell.periodNumber}ª`;
        const existing = unassignedMap.get(gKey);
        if (existing) {
          existing.cellIds.push(cell.id);
          existing.count += 1;
          existing.slotsSummary.push(slotDesc);
        } else {
          unassignedMap.set(gKey, {
            classId: cell.classId,
            className: resolvedClassName,
            discipline: cell.discipline.trim(),
            cellIds: [cell.id],
            count: 1,
            slotsSummary: [slotDesc],
          });
        }
      }
      continue;
    }

    const tKey = normalizeTeacherKey(cell.teacherName);
    if (!tKey) continue;

    if (cell.discipline?.trim()) {
      if (!disciplinesByTeacher.has(tKey)) disciplinesByTeacher.set(tKey, new Set());
      disciplinesByTeacher.get(tKey)!.add(cell.discipline.trim());
    }

    const slotComposite = `${tKey}|${cell.dayOfWeek}|${cell.periodId}`;
    if (!lessonsByTeacherSlot.has(slotComposite)) {
      lessonsByTeacherSlot.set(slotComposite, []);
    }
    lessonsByTeacherSlot.get(slotComposite)!.push({
      cellId: cell.id,
      classId: cell.classId,
      className: resolvedClassName,
      discipline: cell.discipline?.trim() || 'Aula',
      hasPlatform: cell.hasPlatform,
      locked: cell.locked,
      colorHex: getCellColorHex(cell, workspace.teachers || [], criteria).bg,
    });
  }

  const teachers: TeacherTimetableRow[] = [];
  const byKey = new Map<string, TeacherTimetableRow>();

  for (const t of houseTeachers) {
    const profile = profileByKey.get(t.key);
    const blkInfo = teacherBlocks.get(t.key);
    const slotsByDay: Record<number, Record<string, TeacherTimetableSlot>> = {};
    const dailyLessonsCount: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let weeklyLessonsCount = 0;

    for (const wd of WEEKDAYS) {
      slotsByDay[wd.id] = {};
      for (const p of teachingPeriods) {
        const lessons = lessonsByTeacherSlot.get(`${t.key}|${wd.id}|${p.id}`) || [];
        const blkKey = `${wd.id}|${p.number}`;
        const isBlocked = Boolean(blkInfo?.slots.has(blkKey));

        let status: TeacherTimetableSlot['status'] = 'livre';
        if (lessons.length > 0) {
          status = 'em_aula';
          dailyLessonsCount[wd.id] += lessons.length;
          weeklyLessonsCount += lessons.length;
        } else if (isBlocked) {
          status = 'bloqueado';
        }

        slotsByDay[wd.id][p.id] = {
          dayOfWeek: wd.id,
          periodId: p.id,
          periodNumber: p.number,
          periodLabel: p.label,
          status,
          lessons,
          blockReason: isBlocked ? blkInfo?.reasons.get(blkKey) || 'ATPCA / Multiplica' : undefined,
        };
      }
    }

    const row: TeacherTimetableRow = {
      teacherKey: t.key,
      teacherName: t.name,
      area: t.area,
      areas: t.areas,
      disciplines: Array.from(disciplinesByTeacher.get(t.key) || []).sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      ),
      dailyLimit: profile?.dailyLimit || criteria.defaultTeacherDailyLimit || 7,
      weeklyLessonsCount,
      dailyLessonsCount,
      slotsByDay,
    };

    teachers.push(row);
    byKey.set(t.key, row);
  }

  const unassignedGroups = Array.from(unassignedMap.values()).sort((a, b) => {
    const cmp = a.className.localeCompare(b.className, 'pt-BR');
    return cmp !== 0 ? cmp : a.discipline.localeCompare(b.discipline, 'pt-BR');
  });

  return {
    teachers,
    byKey,
    unassignedGroups,
    unassignedCellCount,
  };
}

export interface TeacherSubstitutionFairnessRow {
  teacherName: string;
  teacherKey: string;
  area: string;
  areas: string[];
  weekCount: number;
  monthCount: number;
  dayCount: number;
  totalCount: number;
}

export function computeTeacherSubstitutionFairness(
  workspace: TimetableWorkspace,
  referenceDate: string
): TeacherSubstitutionFairnessRow[] {
  const houseTeachers = getAllHouseTeachers(workspace);
  const { start: weekStart, end: weekEnd } = getIsoWeekRange(referenceDate);
  const monthPrefix = String(referenceDate || '').slice(0, 7);

  const confirmed = (workspace.substitutions || []).filter(s => s.status === 'confirmada');

  return houseTeachers.map(t => {
    let weekCount = 0;
    let monthCount = 0;
    let dayCount = 0;
    let totalCount = 0;

    for (const sub of confirmed) {
      if (normalizeTeacherKey(sub.substituteTeacherName) !== t.key) continue;
      totalCount += 1;
      if (sub.date === referenceDate) dayCount += 1;
      if (sub.date >= weekStart && sub.date <= weekEnd) weekCount += 1;
      if (sub.date.startsWith(monthPrefix)) monthCount += 1;
    }

    return {
      teacherName: t.name,
      teacherKey: t.key,
      area: t.area,
      areas: t.areas,
      weekCount,
      monthCount,
      dayCount,
      totalCount,
    };
  });
}

export interface SubstitutionCandidate {
  teacherName: string;
  teacherKey: string;
  area: string;
  areas: string[];
  matchedAreas: string[];
  sameArea: boolean;
  baseWeekCount: number;
  baseMonthCount: number;
  baseDaySubCount: number;
  weekCount: number;
  monthCount: number;
  daySubCount: number;
  dailyRegularLessons: number;
}

export interface SubstitutionLessonPlan {
  periodId: string;
  periodNumber: number;
  periodLabel: string;
  start: string;
  end: string;
  classId: string;
  className: string;
  discipline: string;
  absentTeacherArea: string;
  targetAreas: string[];
  existingSubstitution?: TeacherSubstitutionRecord;
  recommendedSubstitute?: SubstitutionCandidate;
  candidates: SubstitutionCandidate[];
  teachersInClassroom: string[];
  blockedInAtpcaOrMultiplica: Array<{ teacherName: string; reason: string }>;
}

/**
 * Planeja substituições para todas as aulas de um professor ausente em uma data específica,
 * consultando DIRETAMENTE a Grade Curricular por Professor (`buildTeacherTimetableView`).
 * Critério 1: Professor da casa com status 'livre' na Grade por Professor e afinidade pedagógica (Mesma Área de Atuação).
 * Critério 2: Divisão justa das substituições na SEMANA e no MÊS (balanceamento dinâmico aula a aula).
 */
export function planSubstitutionsForAbsentTeacher(
  workspace: TimetableWorkspace,
  classes: SchoolClass[],
  dateStr: string,
  absentTeacherName: string
): SubstitutionLessonPlan[] {
  const dayOfWeek = getWeekdayFromDateStr(dateStr);
  if (dayOfWeek < 1 || dayOfWeek > 5) return [];

  const absentKey = normalizeTeacherKey(absentTeacherName);
  if (!absentKey) return [];

  const criteria = getActiveCriteria(workspace);
  const teachingPeriods = getTeachingPeriods(workspace);
  const periodById = new Map(teachingPeriods.map(p => [p.id, p]));

  // CONSULTA DIRETA À ABA GRADE POR PROFESSOR
  const teacherGrid = buildTeacherTimetableView(workspace, classes);
  const absentRow = teacherGrid.byKey.get(absentKey);
  if (!absentRow) return [];

  const confirmedSubs = (workspace.substitutions || []).filter(s => s.status === 'confirmada');
  const { start: weekStart, end: weekEnd } = getIsoWeekRange(dateStr);
  const monthPrefix = dateStr.slice(0, 7);

  // Professores já ausentes nesta mesma data (não podem ser escalados para substituir outro colega)
  const absentTeachersOnDate = new Set<string>([absentKey]);
  for (const sub of confirmedSubs) {
    if (sub.date === dateStr) {
      absentTeachersOnDate.add(normalizeTeacherKey(sub.absentTeacherName));
    }
  }

  // Contagem base de substituições já confirmadas por docente (semana, mês, dia)
  const baseWeek = new Map<string, number>();
  const baseMonth = new Map<string, number>();
  const baseDay = new Map<string, number>();

  for (const sub of confirmedSubs) {
    const k = normalizeTeacherKey(sub.substituteTeacherName);
    if (!k) continue;
    if (sub.date >= weekStart && sub.date <= weekEnd) {
      baseWeek.set(k, (baseWeek.get(k) || 0) + 1);
    }
    if (sub.date.startsWith(monthPrefix)) {
      baseMonth.set(k, (baseMonth.get(k) || 0) + 1);
    }
    if (sub.date === dateStr) {
      baseDay.set(k, (baseDay.get(k) || 0) + 1);
    }
  }

  const runningWeek = new Map<string, number>(baseWeek);
  const runningMonth = new Map<string, number>(baseMonth);
  const runningDay = new Map<string, number>(baseDay);

  // Professores já escalados em outra substituição nesta data/período
  const busyInSubstitution = new Map<string, Set<string>>();
  for (const sub of confirmedSubs) {
    if (sub.date !== dateStr) continue;
    if (!busyInSubstitution.has(sub.periodId)) {
      busyInSubstitution.set(sub.periodId, new Set());
    }
    busyInSubstitution.get(sub.periodId)!.add(normalizeTeacherKey(sub.substituteTeacherName));
  }

  // Aulas do professor ausente no dia, lidas diretamente da Grade por Professor
  const daySlots = absentRow.slotsByDay[dayOfWeek] || {};
  const absentSlots: Array<{ period: TimetablePeriodDef; lesson: TeacherTimetableLesson }> = [];
  for (const p of teachingPeriods) {
    const slot = daySlots[p.id];
    if (!slot || slot.status !== 'em_aula' || slot.lessons.length === 0) continue;
    for (const lesson of slot.lessons) {
      absentSlots.push({ period: p, lesson });
    }
  }

  const plans: SubstitutionLessonPlan[] = [];

  for (const { period, lesson } of absentSlots) {
    const pDef = periodById.get(period.id) || period;
    const disciplineArea = inferDisciplineArea(lesson.discipline, criteria);

    // Áreas-alvo para afinidade pedagógica: áreas configuradas do professor ausente + área da disciplina da aula
    const targetAreaSet = new Set<string>(
      absentRow.areas.map(a => normalizeText(a)).filter(a => a && a !== 'OUTROS')
    );
    if (disciplineArea && disciplineArea !== 'OUTROS') {
      targetAreaSet.add(normalizeText(disciplineArea));
    }
    const targetAreas = Array.from(targetAreaSet);
    const primaryLessonArea =
      disciplineArea !== 'OUTROS'
        ? disciplineArea
        : absentRow.area || 'OUTROS';

    const existingSub = confirmedSubs.find(
      s =>
        s.date === dateStr &&
        s.periodId === pDef.id &&
        s.classId === lesson.classId &&
        normalizeTeacherKey(s.absentTeacherName) === absentKey
    );

    const inSubSet = busyInSubstitution.get(pDef.id) || new Set<string>();

    const candidates: SubstitutionCandidate[] = [];
    const teachersInClassroom: string[] = [];
    const blockedInAtpcaOrMultiplica: Array<{ teacherName: string; reason: string }> = [];

    // Percorre cada professor da aba Grade por Professor neste dia/aula
    for (const teacherRow of teacherGrid.teachers) {
      if (teacherRow.teacherKey === absentKey) continue;

      const tSlot = teacherRow.slotsByDay[dayOfWeek]?.[pDef.id];
      if (!tSlot) continue;

      if (tSlot.status === 'em_aula') {
        teachersInClassroom.push(teacherRow.teacherName);
        continue;
      }

      if (absentTeachersOnDate.has(teacherRow.teacherKey)) continue;

      if (tSlot.status === 'bloqueado') {
        blockedInAtpcaOrMultiplica.push({
          teacherName: teacherRow.teacherName,
          reason: tSlot.blockReason || 'ATPCA / Multiplica',
        });
        continue;
      }

      if (
        inSubSet.has(teacherRow.teacherKey) &&
        (!existingSub || normalizeTeacherKey(existingSub.substituteTeacherName) !== teacherRow.teacherKey)
      ) {
        continue; // Já escalado em outra substituição neste horário
      }

      // Afinidade pedagógica: interseção entre as Áreas de Atuação configuradas do candidato e as áreas-alvo
      const matchedAreas = teacherRow.areas.filter(
        a => a !== 'OUTROS' && targetAreaSet.has(normalizeText(a))
      );
      const sameArea = matchedAreas.length > 0;

      candidates.push({
        teacherName: teacherRow.teacherName,
        teacherKey: teacherRow.teacherKey,
        area: teacherRow.area,
        areas: teacherRow.areas,
        matchedAreas,
        sameArea,
        baseWeekCount: baseWeek.get(teacherRow.teacherKey) || 0,
        baseMonthCount: baseMonth.get(teacherRow.teacherKey) || 0,
        baseDaySubCount: baseDay.get(teacherRow.teacherKey) || 0,
        weekCount: runningWeek.get(teacherRow.teacherKey) || 0,
        monthCount: runningMonth.get(teacherRow.teacherKey) || 0,
        daySubCount: runningDay.get(teacherRow.teacherKey) || 0,
        dailyRegularLessons: teacherRow.dailyLessonsCount[dayOfWeek] || 0,
      });
    }

    // Ordenação estrita pelos critérios PEI:
    // 1º Afinidade Pedagógica (Mesma Área de Atuação)
    // 2º Menor quantidade de substituições na SEMANA
    // 3º Menor quantidade de substituições no MÊS
    // 4º Menor quantidade de substituições no DIA
    // 5º Menor carga horária regular no dia -> ordem alfabética
    candidates.sort((a, b) => {
      if (a.sameArea !== b.sameArea) return a.sameArea ? -1 : 1;
      if (a.weekCount !== b.weekCount) return a.weekCount - b.weekCount;
      if (a.monthCount !== b.monthCount) return a.monthCount - b.monthCount;
      if (a.daySubCount !== b.daySubCount) return a.daySubCount - b.daySubCount;
      if (a.dailyRegularLessons !== b.dailyRegularLessons) {
        return a.dailyRegularLessons - b.dailyRegularLessons;
      }
      return a.teacherName.localeCompare(b.teacherName, 'pt-BR');
    });

    const recommended = existingSub
      ? candidates.find(
          c => c.teacherKey === normalizeTeacherKey(existingSub.substituteTeacherName)
        ) || candidates[0]
      : candidates[0];

    if (!existingSub && recommended) {
      runningWeek.set(recommended.teacherKey, (runningWeek.get(recommended.teacherKey) || 0) + 1);
      runningMonth.set(recommended.teacherKey, (runningMonth.get(recommended.teacherKey) || 0) + 1);
      runningDay.set(recommended.teacherKey, (runningDay.get(recommended.teacherKey) || 0) + 1);
    }

    plans.push({
      periodId: pDef.id,
      periodNumber: pDef.number,
      periodLabel: pDef.label,
      start: pDef.start || '',
      end: pDef.end || '',
      classId: lesson.classId,
      className: lesson.className,
      discipline: lesson.discipline || 'Aula',
      absentTeacherArea: primaryLessonArea,
      targetAreas: targetAreas.length > 0 ? targetAreas : [primaryLessonArea],
      existingSubstitution: existingSub,
      recommendedSubstitute: recommended,
      candidates,
      teachersInClassroom: teachersInClassroom.sort((a, b) => a.localeCompare(b, 'pt-BR')),
      blockedInAtpcaOrMultiplica,
    });
  }

  return plans;
}


