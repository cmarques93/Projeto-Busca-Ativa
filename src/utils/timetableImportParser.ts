import * as XLSX from 'xlsx';
import {
  AnnualTimetableCriteria,
  CurriculumMatrixCategory,
  SchoolClass,
  TimetablePeriodDef
} from '../types';
import {
  isLikelyDisciplineName,
  normalizeTeacherKey,
  normalizeText,
  WEEKDAYS
} from './timetableEngine';

export interface ParsedTimetableEntry {
  dayOfWeek: number; // 1..5
  periodNumber: number; // 1..9
  rawClassName: string;
  discipline: string;
  teacherName: string;
  fixedLabel?: string;
  sourceSheet?: string;
}

export interface ParsedMatrixRow {
  category: CurriculumMatrixCategory;
  rawClassName: string;
  discipline: string;
  teacherName: string;
  weeklyLessons: number;
}

export interface ParsedTeacherRow {
  name: string;
  area: string;
  multiplicaDay?: number;
  multiplicaPeriods?: number[];
  dailyLimit?: number;
}

export interface ParsedAtpcaRow {
  area: string;
  dayOfWeek: number;
  periods: number[];
  label?: string;
}

export interface TimetableImportResult {
  sourceType: 'excel' | 'pdf';
  fileName: string;
  entries: ParsedTimetableEntry[];
  rawClassNames: string[];
  matrixItems: ParsedMatrixRow[];
  teachers: ParsedTeacherRow[];
  atpcaRules: ParsedAtpcaRow[];
  warnings: string[];
  sheetsDetected: string[];
}

// ---------------------------------------------------------------------------
// DETECÇÃO DE DIAS DA SEMANA, AULAS E TURMAS
// ---------------------------------------------------------------------------

export function parseWeekdayNumber(raw: unknown): number | null {
  const txt = normalizeText(String(raw ?? ''));
  if (!txt) return null;
  if (txt === '1' || txt.startsWith('SEG')) return 1;
  if (txt === '2' || txt.startsWith('TER')) return 2;
  if (txt === '3' || txt.startsWith('QUA')) return 3;
  if (txt === '4' || txt.startsWith('QUI')) return 4;
  if (txt === '5' || txt.startsWith('SEX')) return 5;
  return null;
}

export function parsePeriodNumber(
  raw: unknown,
  periods?: TimetablePeriodDef[]
): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const norm = normalizeText(s);

  // Ignora rótulos explícitos de intervalo/almoço como número de aula
  if (
    norm.includes('INTERVALO') ||
    norm.includes('RECREIO') ||
    norm.includes('ALMOCO') ||
    norm.includes('LANCHE')
  ) {
    return null;
  }

  // Número explícito de aula: "1ª", "1º", "1°", "1ª AULA", "AULA 1", "1"
  const mExplicit = norm.match(/^(?:AULA\s*)?([1-9]|1[0-2])(?:A|O)?(?:\s*AULA)?$/);
  if (mExplicit) {
    const n = Number(mExplicit[1]);
    if (n >= 1 && n <= 12) return n;
  }

  // "1ª AULA (07:00 - 07:50)" ou "1 - 07:00"
  const mLeading = norm.match(/^([1-9]|1[0-2])(?:A|O)?\s*(?:AULA|[-–(:])/);
  if (mLeading) {
    const n = Number(mLeading[1]);
    if (n >= 1 && n <= 12) return n;
  }

  // Correspondência por horário inicial (ex: "07:00" ou "7:00")
  const mTime = s.match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (mTime && periods && periods.length > 0) {
    const hh = mTime[1].padStart(2, '0');
    const mm = mTime[2].padStart(2, '0');
    const hhmm = `${hh}:${mm}`;
    const found = periods.find(
      p => !p.isBreak && p.number > 0 && p.start === hhmm
    );
    if (found) return found.number;
  }

  return null;
}

/**
 * Gera assinatura estrutural da turma: ex "6º Ano A" -> { grade: '6', letter: 'A', isEM: false }
 */
function extractClassSignature(raw: string): {
  grade: string;
  letter: string;
  isEM: boolean | null;
} | null {
  const norm = normalizeText(raw)
    .replace(/[º°ª]/g, ' ')
    .replace(/[-–_/().]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!norm) return null;

  // Padrões comuns: "6 ANO A", "6 A", "6A", "1 SERIE B", "1 EM B", "1A EM", "2º MEDIO C", "3A"
  const m = norm.match(/\b([1-9])\s*(?:ANO|SERIE|EM|EF|MEDIO|FUNDAMENTAL)?\s*(?:EM|EF|MEDIO|FUND)?\s*([A-Z])\b/);
  const mCompact = !m ? norm.match(/\b([1-9])([A-Z])\b/) : null;
  const match = m || mCompact;
  if (!match) return null;

  const grade = match[1];
  const letter = match[2];

  let isEM: boolean | null = null;
  if (norm.includes('SERIE') || norm.includes('EM') || norm.includes('MEDIO')) {
    isEM = true;
  } else if (norm.includes('ANO') || norm.includes('EF') || norm.includes('FUND')) {
    isEM = false;
  } else if (Number(grade) >= 6) {
    isEM = false;
  } else if (Number(grade) >= 1 && Number(grade) <= 3) {
    isEM = true;
  }

  return { grade, letter, isEM };
}

export function matchClassNameToSchoolClass(
  rawName: string,
  classes: SchoolClass[]
): SchoolClass | null {
  const target = normalizeText(rawName);
  if (!target || classes.length === 0) return null;

  // 1. Correspondência exata normalizada
  const exact = classes.find(c => normalizeText(c.name) === target);
  if (exact) return exact;

  // 2. Compacto sem espaços/símbolos
  const compactTarget = target.replace(/[^A-Z0-9]/g, '');
  const compactExact = classes.find(
    c => normalizeText(c.name).replace(/[^A-Z0-9]/g, '') === compactTarget
  );
  if (compactExact) return compactExact;

  // 3. Assinatura (série/ano + letra + etapa EF/EM)
  const sig = extractClassSignature(rawName);
  if (sig) {
    const candidates = classes.filter(c => {
      const cSig = extractClassSignature(c.name);
      if (!cSig) return false;
      if (cSig.grade !== sig.grade || cSig.letter !== sig.letter) return false;
      if (sig.isEM !== null && cSig.isEM !== null) {
        return sig.isEM === cSig.isEM;
      }
      return true;
    });
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) return candidates[0];
  }

  return null;
}

function looksLikeClassHeader(raw: string, classes: SchoolClass[]): boolean {
  const s = String(raw || '').trim();
  if (!s || s.length > 35) return false;
  if (parseWeekdayNumber(s) !== null) return false;
  if (parsePeriodNumber(s) !== null) return false;
  const norm = normalizeText(s);
  if (
    norm === 'DIA' ||
    norm === 'AULA' ||
    norm === 'HORARIO' ||
    norm === 'TURMA' ||
    norm === 'DISCIPLINA' ||
    norm === 'PROFESSOR' ||
    norm === 'PERIODO'
  ) {
    return false;
  }
  if (matchClassNameToSchoolClass(s, classes)) return true;
  // Heurística estrutural para turmas brasileiras (ex: "6º A", "7B", "1ª Série A", "3º EM C")
  const sig = extractClassSignature(s);
  if (sig && /^[0-9]/.test(norm)) return true;
  return false;
}

function isFixedTermValue(text: string, criteria: AnnualTimetableCriteria): boolean {
  const norm = normalizeText(text);
  if (!norm) return false;
  return (criteria.preservedFixedTerms || []).some(term => {
    const t = normalizeText(term);
    return t && (norm === t || norm.includes(t));
  });
}

function resolvePairAsTeacherAndDiscipline(
  partA: string,
  partB: string,
  preferFirstAsTeacher: boolean,
  criteria: AnnualTimetableCriteria,
  knownTeacherNames?: Set<string>
): { discipline: string; teacherName: string } {
  const aKey = normalizeTeacherKey(partA);
  const bKey = normalizeTeacherKey(partB);

  // 1. Se um dos lados bate com professor já conhecido no DB-PROF / escola
  if (knownTeacherNames && knownTeacherNames.size > 0) {
    const aIsKnownTeacher = knownTeacherNames.has(aKey);
    const bIsKnownTeacher = knownTeacherNames.has(bKey);
    if (aIsKnownTeacher && !bIsKnownTeacher) {
      return { teacherName: partA, discipline: partB };
    }
    if (bIsKnownTeacher && !aIsKnownTeacher) {
      return { discipline: partA, teacherName: partB };
    }
  }

  // 2. Reconhecimento determinístico de disciplina escolar (sem confundir nomes próprios)
  const aIsDisc = isLikelyDisciplineName(partA, criteria);
  const bIsDisc = isLikelyDisciplineName(partB, criteria);

  if (bIsDisc && !aIsDisc) {
    return { teacherName: partA, discipline: partB };
  }
  if (aIsDisc && !bIsDisc) {
    return { discipline: partA, teacherName: partB };
  }

  // 3. Fallback conforme convenção do formato detectado
  return preferFirstAsTeacher
    ? { teacherName: partA, discipline: partB }
    : { discipline: partA, teacherName: partB };
}

function parseCellContent(
  rawText: string,
  criteria: AnnualTimetableCriteria,
  knownTeacherNames?: Set<string>
): { discipline: string; teacherName: string; fixedLabel?: string } | null {
  const cleaned = String(rawText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!cleaned) return null;

  const norm = normalizeText(cleaned);
  if (
    norm === '-' ||
    norm === '--' ||
    norm === '—' ||
    norm === 'VAGO' ||
    norm === 'LIVRE' ||
    norm === 'SEM AULA' ||
    norm === 'X'
  ) {
    return null;
  }

  // Linhas separadas (ex: "PROFESSOR\nDISCIPLINA" ou "DISCIPLINA\nPROFESSOR")
  const lines = cleaned
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    const first = lines[0];
    const second = lines.slice(1).join(' ');
    return resolvePairAsTeacherAndDiscipline(first, second, false, criteria, knownTeacherNames);
  }

  const single = lines[0];

  // Atividade fixa pura (ex: TUTORIA, ALMOÇO, CLUBES, ELETIVAS) sem parênteses/hífen indicando docente
  if (
    isFixedTermValue(single, criteria) &&
    !single.includes('(') &&
    !single.includes(' - ') &&
    !single.includes(' / ')
  ) {
    return {
      discipline: '',
      teacherName: '',
      fixedLabel: single.toUpperCase(),
    };
  }

  // Formato padrão PEI/SEDUC-SP: "PROFESSOR (DISCIPLINA)" (ex: "MARIA (PORT)", "CARLOS (PROJETO DE VIDA)")
  // Também detecta automaticamente caso esteja invertido como "DISCIPLINA (PROFESSOR)"
  const mParen = single.match(/^(.+?)\s*\(([^()]{1,})\)\s*$/);
  if (mParen) {
    const outside = mParen[1].trim();
    const inside = mParen[2].trim();
    return resolvePairAsTeacherAndDiscipline(outside, inside, true, criteria, knownTeacherNames);
  }

  // Formato "PROFESSOR - DISCIPLINA" / "DISCIPLINA - PROFESSOR" / "/" / "|" / ":" (com ou sem espaço)
  const sepParts = single
    .split(/\s*(?:[-–/|:]|\s[-–/|:]\s)\s*/)
    .map(p => p.trim())
    .filter(Boolean);
  if (sepParts.length >= 2) {
    const p1 = sepParts[0];
    const p2 = sepParts.slice(1).join(' - ');
    return resolvePairAsTeacherAndDiscipline(p1, p2, true, criteria, knownTeacherNames);
  }

  // Texto único sem professor: sempre vai para DISCIPLINA (nunca para professor, evitando falsos choques)
  return {
    discipline: single,
    teacherName: '',
  };
}

// ---------------------------------------------------------------------------
// PARSERS DE ABAS AUXILIARES DA PLANILHA PEI (MATRIZES, DB-PROF, ATPCA)
// ---------------------------------------------------------------------------

function parseMatrixSheet(
  rows: unknown[][],
  category: CurriculumMatrixCategory
): ParsedMatrixRow[] {
  const result: ParsedMatrixRow[] = [];
  if (rows.length < 2) return result;

  // Tenta detectar índices de colunas no cabeçalho (primeiras 3 linhas)
  let headerRowIdx = 0;
  let colClass = 0;
  let colDisc = 1;
  let colTeacher = 2;
  let colLessons = 3;

  for (let r = 0; r < Math.min(3, rows.length); r++) {
    const row = rows[r] || [];
    const norms = row.map(c => normalizeText(String(c ?? '')));
    const idxTurma = norms.findIndex(v => v.includes('TURMA') || v.includes('SERIE') || v.includes('ANO'));
    const idxDisc = norms.findIndex(v => v.includes('DISC') || v.includes('COMPONENTE') || v.includes('MATERIA'));
    const idxProf = norms.findIndex(v => v.includes('PROF') || v.includes('DOCENTE'));
    const idxAulas = norms.findIndex(v => v.includes('AULA') || v.includes('QTD') || v.includes('CARGA') || v.includes('SEMAN'));

    if (idxTurma !== -1 && idxDisc !== -1) {
      headerRowIdx = r;
      colClass = idxTurma;
      colDisc = idxDisc;
      if (idxProf !== -1) colTeacher = idxProf;
      if (idxAulas !== -1) colLessons = idxAulas;
      break;
    }
  }

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rawClassName = String(row[colClass] ?? '').trim();
    const discipline = String(row[colDisc] ?? '').trim();
    const teacherName = String(row[colTeacher] ?? '').trim();
    const lessons = Number(String(row[colLessons] ?? '').replace(/[^\d]/g, ''));

    if (!rawClassName || !discipline || !lessons || lessons <= 0) continue;
    if (normalizeText(rawClassName) === 'TURMA') continue;

    result.push({
      category,
      rawClassName,
      discipline,
      teacherName,
      weeklyLessons: lessons,
    });
  }

  return result;
}

function parseTeachersSheet(rows: unknown[][]): ParsedTeacherRow[] {
  const result: ParsedTeacherRow[] = [];
  if (rows.length < 2) return result;

  let headerIdx = 0;
  let colName = 0;
  let colArea = 1;
  let colMultiDay = 2;
  let colMultiPeriods = 3;
  let colLimit = 4;

  for (let r = 0; r < Math.min(3, rows.length); r++) {
    const norms = (rows[r] || []).map(c => normalizeText(String(c ?? '')));
    const iName = norms.findIndex(v => v.includes('PROF') || v.includes('NOME') || v.includes('DOCENTE'));
    if (iName !== -1) {
      headerIdx = r;
      colName = iName;
      const iArea = norms.findIndex(v => v.includes('AREA'));
      const iMDay = norms.findIndex(v => v.includes('DIA') && v.includes('MULT'));
      const iMPer = norms.findIndex(v => (v.includes('AULA') || v.includes('HORA')) && v.includes('MULT'));
      const iLim = norms.findIndex(v => v.includes('LIMITE') || v.includes('MAX'));
      if (iArea !== -1) colArea = iArea;
      if (iMDay !== -1) colMultiDay = iMDay;
      if (iMPer !== -1) colMultiPeriods = iMPer;
      if (iLim !== -1) colLimit = iLim;
      break;
    }
  }

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = String(row[colName] ?? '').trim();
    if (!name || normalizeText(name) === 'PROFESSOR') continue;
    const area = String(row[colArea] ?? '').trim().toUpperCase() || 'LGG';
    const multiDay = parseWeekdayNumber(row[colMultiDay]) ?? undefined;
    const rawMultiPer = String(row[colMultiPeriods] ?? '');
    const multiPeriods = rawMultiPer
      .split(/[,;\/\s]+/)
      .map(s => Number(s.replace(/[^\d]/g, '')))
      .filter(n => n >= 1 && n <= 9);
    const limNum = Number(String(row[colLimit] ?? '').replace(/[^\d]/g, ''));

    result.push({
      name,
      area,
      multiplicaDay: multiDay,
      multiplicaPeriods: multiPeriods.length > 0 ? multiPeriods : undefined,
      dailyLimit: limNum >= 1 && limNum <= 9 ? limNum : undefined,
    });
  }

  return result;
}

function parseAtpcaSheet(rows: unknown[][]): ParsedAtpcaRow[] {
  const result: ParsedAtpcaRow[] = [];
  if (rows.length < 2) return result;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const area = String(row[0] ?? '').trim().toUpperCase();
    const day = parseWeekdayNumber(row[1]);
    const rawPeriods = String(row[2] ?? '');
    const periods = rawPeriods
      .split(/[,;\/\s]+/)
      .map(s => Number(s.replace(/[^\d]/g, '')))
      .filter(n => n >= 1 && n <= 9);
    const label = String(row[3] ?? '').trim() || undefined;

    if (!area || !day || periods.length === 0) continue;
    result.push({ area, dayOfWeek: day, periods, label });
  }
  return result;
}

// ---------------------------------------------------------------------------
// PARSERS DE GRADE DE HORÁRIO (3 LAYOUTS SUPORTADOS)
// ---------------------------------------------------------------------------

/** Layout 3: Lista tabular (colunas: Turma | Dia | Aula | Disciplina | Professor) */
function tryParseTabularScheduleSheet(
  rows: unknown[][],
  sheetName: string,
  criteria: AnnualTimetableCriteria
): ParsedTimetableEntry[] {
  const entries: ParsedTimetableEntry[] = [];
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const norms = (rows[r] || []).map(c => normalizeText(String(c ?? '')));
    const iTurma = norms.findIndex(v => v === 'TURMA' || v.includes('TURMA'));
    const iDia = norms.findIndex(v => v === 'DIA' || v.includes('DIA DA SEMANA') || v === 'SEMANA');
    const iAula = norms.findIndex(v => v === 'AULA' || v.includes('PERIODO') || v === 'HORARIO' || v === 'TEMPO');
    const iDisc = norms.findIndex(v => v.includes('DISCIPLINA') || v.includes('MATERIA') || v.includes('COMPONENTE'));
    const iProf = norms.findIndex(v => v.includes('PROFESSOR') || v.includes('DOCENTE'));

    if (iTurma !== -1 && iDia !== -1 && iAula !== -1 && iDisc !== -1) {
      for (let i = r + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const rawClassName = String(row[iTurma] ?? '').trim();
        const day = parseWeekdayNumber(row[iDia]);
        const period = parsePeriodNumber(row[iAula]);
        const disc = String(row[iDisc] ?? '').trim();
        const prof = iProf !== -1 ? String(row[iProf] ?? '').trim() : '';

        if (!rawClassName || !day || !period || !disc) continue;

        if (!prof && isFixedTermValue(disc, criteria)) {
          entries.push({
            dayOfWeek: day,
            periodNumber: period,
            rawClassName,
            discipline: '',
            teacherName: '',
            fixedLabel: disc.toUpperCase(),
            sourceSheet: sheetName,
          });
        } else {
          entries.push({
            dayOfWeek: day,
            periodNumber: period,
            rawClassName,
            discipline: disc,
            teacherName: prof,
            sourceSheet: sheetName,
          });
        }
      }
      return entries;
    }
  }
  return entries;
}

/** Layout 1: GRADE COMPLETA (colunas = Turmas; linhas = Dia + Aula) */
function tryParseGradeCompletaSheet(
  rows: unknown[][],
  sheetName: string,
  classes: SchoolClass[],
  periods: TimetablePeriodDef[],
  criteria: AnnualTimetableCriteria,
  knownTeachers: Set<string>
): ParsedTimetableEntry[] {
  const entries: ParsedTimetableEntry[] = [];
  if (rows.length < 3) return entries;

  // Encontra a linha de cabeçalho que tem mais nomes de turmas (mínimo 2 colunas de turmas)
  let bestHeaderRow = -1;
  let bestClassCols: Array<{ colIdx: number; rawClassName: string }> = [];

  for (let r = 0; r < Math.min(12, rows.length); r++) {
    const row = rows[r] || [];
    const foundCols: Array<{ colIdx: number; rawClassName: string }> = [];
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] ?? '').trim();
      if (val && looksLikeClassHeader(val, classes)) {
        foundCols.push({ colIdx: c, rawClassName: val });
      }
    }
    if (foundCols.length >= 2 && foundCols.length > bestClassCols.length) {
      bestClassCols = foundCols;
      bestHeaderRow = r;
    }
  }

  if (bestHeaderRow === -1 || bestClassCols.length < 2) return entries;

  const firstClassCol = bestClassCols[0].colIdx;
  let currentDay: number | null = null;

  for (let r = bestHeaderRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];

    // Verifica nas colunas anteriores à primeira turma (ou em toda a linha se for banner de dia) se há dia da semana
    let rowDay: number | null = null;
    let rowPeriod: number | null = null;

    for (let c = 0; c < Math.max(firstClassCol, 3); c++) {
      const val = row[c];
      if (val === undefined || val === null || String(val).trim() === '') continue;
      if (rowDay === null) {
        const d = parseWeekdayNumber(val);
        if (d !== null) {
          rowDay = d;
          continue;
        }
      }
      if (rowPeriod === null) {
        const p = parsePeriodNumber(val, periods);
        if (p !== null) {
          rowPeriod = p;
        }
      }
    }

    // Banner de dia (ex: "SEGUNDA-FEIRA" mesclado na linha)
    if (rowDay !== null) {
      currentDay = rowDay;
      if (rowPeriod === null) continue;
    }

    if (currentDay === null || rowPeriod === null) continue;

    // Verifica se a linha seguinte é uma sub-linha de professor (sem dia nem aula nas colunas iniciais)
    const nextRow = rows[r + 1] || [];
    let nextRowIsSubTeacherRow = false;
    if (r + 1 < rows.length) {
      let nextHasHeader = false;
      for (let c = 0; c < Math.max(firstClassCol, 2); c++) {
        const v = String(nextRow[c] ?? '').trim();
        if (v && (parseWeekdayNumber(v) !== null || parsePeriodNumber(v, periods) !== null || normalizeText(v).includes('INTERVALO') || normalizeText(v).includes('ALMOCO'))) {
          nextHasHeader = true;
          break;
        }
      }
      if (!nextHasHeader) {
        // Verifica se há texto nas colunas das turmas na linha de baixo e se a linha atual tem células sem quebra de linha
        let currentSingleLineCount = 0;
        let nextFilledCount = 0;
        for (const { colIdx } of bestClassCols) {
          const curVal = String(row[colIdx] ?? '').trim();
          const nxtVal = String(nextRow[colIdx] ?? '').trim();
          if (curVal && !curVal.includes('\n')) currentSingleLineCount++;
          if (nxtVal) nextFilledCount++;
        }
        if (currentSingleLineCount >= 2 && nextFilledCount >= 2) {
          nextRowIsSubTeacherRow = true;
        }
      }
    }

    for (const { colIdx, rawClassName } of bestClassCols) {
      const rawCell = String(row[colIdx] ?? '').trim();
      const subCell = nextRowIsSubTeacherRow ? String(nextRow[colIdx] ?? '').trim() : '';
      const combined = rawCell && subCell && !rawCell.includes('\n') ? `${rawCell}\n${subCell}` : rawCell;

      const parsed = parseCellContent(combined, criteria, knownTeachers);
      if (!parsed) continue;

      entries.push({
        dayOfWeek: currentDay,
        periodNumber: rowPeriod,
        rawClassName,
        discipline: parsed.discipline,
        teacherName: parsed.teacherName,
        fixedLabel: parsed.fixedLabel,
        sourceSheet: sheetName,
      });
    }

    if (nextRowIsSubTeacherRow) {
      r++; // pula a sub-linha já consumida
    }
  }

  return entries;
}

/** Layout 2: Painel por Turma (colunas = SEGUNDA..SEXTA; linhas = 1ª..9ª aula; título ou aba = Turma) */
function tryParsePerClassBlocksSheet(
  rows: unknown[][],
  sheetName: string,
  classes: SchoolClass[],
  periods: TimetablePeriodDef[],
  criteria: AnnualTimetableCriteria,
  knownTeachers: Set<string>
): ParsedTimetableEntry[] {
  const entries: ParsedTimetableEntry[] = [];
  if (rows.length < 3) return entries;

  const sheetMatchesClass = looksLikeClassHeader(sheetName, classes) ? sheetName.trim() : null;
  let currentBlockClass: string | null = sheetMatchesClass;
  let dayCols: Array<{ colIdx: number; dayOfWeek: number }> = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];

    // 1. Verifica se esta linha é um cabeçalho de dias (SEGUNDA | TERÇA | QUARTA | QUINTA | SEXTA)
    const foundDays: Array<{ colIdx: number; dayOfWeek: number }> = [];
    for (let c = 0; c < row.length; c++) {
      const d = parseWeekdayNumber(row[c]);
      if (d !== null) {
        foundDays.push({ colIdx: c, dayOfWeek: d });
      }
    }
    if (foundDays.length >= 3) {
      dayCols = foundDays;
      // Verifica se na célula à esquerda dos dias ou na linha imediatamente acima existe o nome da turma
      const leftCell = String(row[0] ?? '').trim();
      if (looksLikeClassHeader(leftCell, classes)) {
        currentBlockClass = leftCell;
      } else if (r > 0) {
        for (const cell of rows[r - 1] || []) {
          const txt = String(cell ?? '').trim();
          if (txt) {
            // Ex: "TURMA: 6º ANO A" ou "6º A"
            const stripped = txt.replace(/^TURMA\s*[:\-–]?\s*/i, '').trim();
            if (looksLikeClassHeader(stripped, classes)) {
              currentBlockClass = stripped;
              break;
            }
          }
        }
      }
      continue;
    }

    // 2. Verifica se a linha isolada anuncia uma nova turma (ex: "TURMA: 7º B" ou "7º Ano B")
    const nonEmptyCells = row
      .map(c => String(c ?? '').trim())
      .filter(Boolean);
    if (nonEmptyCells.length === 1) {
      const candidate = nonEmptyCells[0].replace(/^TURMA\s*[:\-–]?\s*/i, '').trim();
      if (looksLikeClassHeader(candidate, classes)) {
        currentBlockClass = candidate;
        continue;
      }
    }

    // 3. Se temos colunas de dias e uma turma ativa, lê a linha de aula
    if (dayCols.length >= 3 && currentBlockClass) {
      const firstDayCol = dayCols[0].colIdx;
      let periodNum: number | null = null;
      for (let c = 0; c < Math.max(firstDayCol, 2); c++) {
        const p = parsePeriodNumber(row[c], periods);
        if (p !== null) {
          periodNum = p;
          break;
        }
      }
      if (periodNum === null) continue;

      for (const { colIdx, dayOfWeek } of dayCols) {
        const parsed = parseCellContent(String(row[colIdx] ?? ''), criteria, knownTeachers);
        if (!parsed) continue;
        entries.push({
          dayOfWeek,
          periodNumber: periodNum,
          rawClassName: currentBlockClass,
          discipline: parsed.discipline,
          teacherName: parsed.teacherName,
          fixedLabel: parsed.fixedLabel,
          sourceSheet: sheetName,
        });
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// FUNÇÃO PRINCIPAL: IMPORTAÇÃO DE EXCEL / CSV
// ---------------------------------------------------------------------------

export async function parseTimetableExcelFile(
  file: File,
  classes: SchoolClass[],
  periods: TimetablePeriodDef[],
  criteria: AnnualTimetableCriteria,
  existingTeacherNames: string[] = []
): Promise<TimetableImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const warnings: string[] = [];
  const sheetsDetected = workbook.SheetNames.slice();
  const matrixItems: ParsedMatrixRow[] = [];
  const teachers: ParsedTeacherRow[] = [];
  const atpcaRules: ParsedAtpcaRow[] = [];
  const allEntries: ParsedTimetableEntry[] = [];

  // Passo 1: Lê primeiro abas auxiliares (DB-PROF, MATRIZES, ATPCA) para enriquecer detecção de professores
  const auxiliarySheetNames = new Set<string>();

  for (const name of workbook.SheetNames) {
    const normName = normalizeText(name);
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    if (normName.includes('DB-PROF') || normName.includes('DB_PROF') || normName === 'PROFESSORES') {
      auxiliarySheetNames.add(name);
      teachers.push(...parseTeachersSheet(rows));
    } else if (normName === 'ATPCA' || normName.startsWith('ATPCA')) {
      auxiliarySheetNames.add(name);
      atpcaRules.push(...parseAtpcaSheet(rows));
    } else if (normName.includes('MATRIZ_NOTE') || normName === 'NOTE') {
      auxiliarySheetNames.add(name);
      matrixItems.push(...parseMatrixSheet(rows, 'note'));
    } else if (normName.includes('MATRIZ_EMA') || normName === 'EMA') {
      auxiliarySheetNames.add(name);
      matrixItems.push(...parseMatrixSheet(rows, 'ema'));
    } else if (normName.includes('MATRIZ_REST') || normName === 'REST') {
      auxiliarySheetNames.add(name);
      matrixItems.push(...parseMatrixSheet(rows, 'rest'));
    } else if (
      normName.startsWith('CONF_') ||
      normName.includes('CONFLITOS') ||
      normName.includes('BANCO_ESTUDOS') ||
      normName.includes('INTELIGENCIA') ||
      normName.includes('ROTEIRO') ||
      normName.includes('PRANCHETA') ||
      normName.includes('PAINEL_PROF')
    ) {
      // Abas derivadas/relatórios do script não devem ser reimportadas como grade principal
      auxiliarySheetNames.add(name);
    }
  }

  const knownTeacherNames = new Set<string>(
    [
      ...teachers.map(t => normalizeTeacherKey(t.name)),
      ...existingTeacherNames.map(n => normalizeTeacherKey(n)),
    ].filter(Boolean)
  );

  // Passo 2: Ordena abas candidatas priorizando GRADE COMPLETA / HORARIO
  const candidateSheets = workbook.SheetNames.filter(n => !auxiliarySheetNames.has(n)).sort(
    (a, b) => {
      const score = (s: string) => {
        const n = normalizeText(s);
        if (n.includes('GRADE COMPLETA')) return 0;
        if (n.includes('GRADE') || n.includes('HORARIO')) return 1;
        if (n.includes('PAINEL_TURMAS')) return 2;
        return 3;
      };
      return score(a) - score(b);
    }
  );

  // Se houver aba GRADE COMPLETA com entradas válidas, prioriza ela para não duplicar com PAINEL_TURMAS
  let foundPrimaryGrade = false;

  for (const name of candidateSheets) {
    const normName = normalizeText(name);
    if (foundPrimaryGrade && normName.includes('PAINEL_TURMAS')) {
      continue;
    }

    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
    if (rows.length < 2) continue;

    // Tenta Layout 3 (lista tabular) -> Layout 1 (Grade Completa) -> Layout 2 (Painel por Turma)
    let extracted = tryParseTabularScheduleSheet(rows, name, criteria);
    if (extracted.length === 0) {
      extracted = tryParseGradeCompletaSheet(
        rows,
        name,
        classes,
        periods,
        criteria,
        knownTeacherNames
      );
    }
    if (extracted.length === 0) {
      extracted = tryParsePerClassBlocksSheet(
        rows,
        name,
        classes,
        periods,
        criteria,
        knownTeacherNames
      );
    }

    if (extracted.length > 0) {
      allEntries.push(...extracted);
      if (normName.includes('GRADE') || normName.includes('HORARIO')) {
        foundPrimaryGrade = true;
      }
    }
  }

  // Deduplica mantendo a primeira ocorrência de cada slot (dia + aula + turma)
  const dedupMap = new Map<string, ParsedTimetableEntry>();
  for (const entry of allEntries) {
    const key = `${entry.dayOfWeek}__${entry.periodNumber}__${normalizeText(entry.rawClassName)}`;
    if (!dedupMap.has(key)) {
      dedupMap.set(key, entry);
    }
  }

  // Propaga nome do professor para células da MESMA turma + MESMA disciplina onde o docente ficou ausente (ex.: Projeto de Vida, Arte)
  const knownTeacherByClassDisc = new Map<string, string>();
  for (const m of matrixItems) {
    if (m.rawClassName && m.discipline && m.teacherName && !isLikelyDisciplineName(m.teacherName, criteria)) {
      const k = `${normalizeText(m.rawClassName)}__${normalizeText(m.discipline)}`;
      if (!knownTeacherByClassDisc.has(k)) knownTeacherByClassDisc.set(k, m.teacherName.trim());
    }
  }
  dedupMap.forEach(entry => {
    if (!entry.fixedLabel && entry.discipline && entry.teacherName && !isLikelyDisciplineName(entry.teacherName, criteria)) {
      const k = `${normalizeText(entry.rawClassName)}__${normalizeText(entry.discipline)}`;
      if (!knownTeacherByClassDisc.has(k)) knownTeacherByClassDisc.set(k, entry.teacherName.trim());
    }
  });

  const entries = Array.from(dedupMap.values()).map(entry => {
    if (entry.fixedLabel || entry.teacherName.trim() || !entry.discipline.trim()) return entry;
    const k = `${normalizeText(entry.rawClassName)}__${normalizeText(entry.discipline)}`;
    const matched = knownTeacherByClassDisc.get(k);
    return matched ? { ...entry, teacherName: matched } : entry;
  });

  const rawClassNames = Array.from(
    new Set([
      ...entries.map(e => e.rawClassName),
      ...matrixItems.map(m => m.rawClassName),
    ])
  );

  if (entries.length === 0 && matrixItems.length === 0) {
    warnings.push(
      'Nenhuma aula de horário foi identificada automaticamente nesta planilha. Verifique se as colunas contêm os nomes das turmas (ex.: 6º A, 7º B) ou os dias da semana (SEGUNDA a SEXTA) e os números das aulas (1ª a 9ª).'
    );
  }

  return {
    sourceType: 'excel',
    fileName: file.name,
    entries,
    rawClassNames,
    matrixItems,
    teachers,
    atpcaRules,
    warnings,
    sheetsDetected,
  };
}

// ---------------------------------------------------------------------------
// DOWNLOAD DE MODELO EXCEL (.XLSX) COMPATÍVEL COM AS TURMAS DA ESCOLA
// ---------------------------------------------------------------------------

export function downloadTimetableExcelTemplate(
  classes: SchoolClass[],
  periods: TimetablePeriodDef[]
): void {
  const teachingPeriods = (periods || []).filter(p => !p.isBreak && p.number > 0);
  const classNames = classes.length > 0 ? classes.map(c => c.name) : ['6º Ano A', '7º Ano A', '8º Ano A'];

  const header = ['DIA', 'AULA', ...classNames];
  const rows: string[][] = [header];

  for (const day of WEEKDAYS) {
    for (const p of teachingPeriods) {
      const sampleCells = classNames.map((_, idx) => {
        if (day.id === 1 && p.number === 1 && idx === 0) return 'Prof. Exemplo (PORTUGUÊS)';
        if (day.id === 1 && p.number === 9) return 'TUTORIA';
        return '';
      });
      rows.push([day.label.toUpperCase(), `${p.number}ª AULA`, ...sampleCells]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 12 }, ...classNames.map(() => ({ wch: 22 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GRADE COMPLETA');
  XLSX.writeFile(wb, 'Modelo_Grade_Horaria_EduScope360.xlsx');
}
