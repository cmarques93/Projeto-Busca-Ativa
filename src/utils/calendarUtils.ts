import {
  SchoolBimester,
  SchoolCalendarConfig,
  SchoolCalendarEvent,
  SchoolCalendarEventType,
} from '../types';

export function normalizeCalendarDate(dateStr?: string): string {
  if (!dateStr) return '';
  const trimmed = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/');
    return `${y}-${m}-${d}`;
  }
  return trimmed;
}

export function getLocalTodayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createDefaultSchoolCalendar(
  year: number = new Date().getFullYear() || 2026,
  schoolId?: string
): SchoolCalendarConfig {
  const y = year >= 2020 ? year : 2026;
  return {
    schoolId,
    year: y,
    bimesters: [
      { id: '1B', name: '1º Bimestre', startDate: `${y}-02-02`, endDate: `${y}-04-17` },
      { id: '2B', name: '2º Bimestre', startDate: `${y}-04-20`, endDate: `${y}-07-03` },
      { id: '3B', name: '3º Bimestre', startDate: `${y}-07-27`, endDate: `${y}-10-02` },
      { id: '4B', name: '4º Bimestre', startDate: `${y}-10-05`, endDate: `${y}-12-18` },
    ],
    events: [
      { id: `evt-${y}-carnaval`, date: `${y}-02-16`, endDate: `${y}-02-18`, title: 'Recesso de Carnaval', type: 'recesso', countsAsSchoolDay: false },
      { id: `evt-${y}-paixao`, date: `${y}-04-03`, title: 'Sexta-feira Santa', type: 'feriado', countsAsSchoolDay: false },
      { id: `evt-${y}-tiradentes`, date: `${y}-04-21`, title: 'Dia de Tiradentes', type: 'feriado', countsAsSchoolDay: false },
      { id: `evt-${y}-trabalho`, date: `${y}-05-01`, title: 'Dia do Trabalho', type: 'feriado', countsAsSchoolDay: false },
      { id: `evt-${y}-corpus`, date: `${y}-06-04`, title: 'Corpus Christi', type: 'feriado', countsAsSchoolDay: false },
      { id: `evt-${y}-ferias-jul`, date: `${y}-07-06`, endDate: `${y}-07-24`, title: 'Férias Escolares de Julho', type: 'ferias', countsAsSchoolDay: false },
      { id: `evt-${y}-indep`, date: `${y}-09-07`, title: 'Independência do Brasil', type: 'feriado', countsAsSchoolDay: false },
      { id: `evt-${y}-aparecida`, date: `${y}-10-12`, title: 'Nossa Senhora Aparecida', type: 'feriado', countsAsSchoolDay: false },
      { id: `evt-${y}-prof`, date: `${y}-10-15`, title: 'Dia do Professor / Recesso Escolar', type: 'recesso', countsAsSchoolDay: false },
      { id: `evt-${y}-finados`, date: `${y}-11-02`, title: 'Finados', type: 'feriado', countsAsSchoolDay: false },
      { id: `evt-${y}-consciencia`, date: `${y}-11-20`, title: 'Consciência Negra', type: 'feriado', countsAsSchoolDay: false },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function readCalendarFromLocalStorage(schoolId?: string): SchoolCalendarConfig {
  try {
    if (typeof window !== 'undefined') {
      const sId = schoolId || localStorage.getItem('sigaescola_active_school_id') || 'ee-arlindo-silvestre';
      const raw = localStorage.getItem(`sigaescola_${sId}_calendar`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.bimesters)) {
          return parsed;
        }
      }
    }
  } catch {
    // fallback silencioso
  }
  return createDefaultSchoolCalendar(2026, schoolId);
}

export function eventCoversDate(event: SchoolCalendarEvent, dateStr: string): boolean {
  const d = normalizeCalendarDate(dateStr);
  const start = normalizeCalendarDate(event.date);
  const end = normalizeCalendarDate(event.endDate || event.date);
  if (!d || !start) return false;
  return d >= start && d <= (end >= start ? end : start);
}

export function getBimesterForDate(
  dateStr: string,
  calendar?: SchoolCalendarConfig | null
): SchoolBimester | undefined {
  if (!calendar || !calendar.bimesters || calendar.bimesters.length === 0) return undefined;
  const d = normalizeCalendarDate(dateStr);
  return calendar.bimesters.find(b => {
    const start = normalizeCalendarDate(b.startDate);
    const end = normalizeCalendarDate(b.endDate);
    return start && end && d >= start && d <= end;
  });
}

export interface CalendarDayStatus {
  isSchoolDay: boolean;
  reason: string;
  bimester?: SchoolBimester;
  event?: SchoolCalendarEvent;
}

const NON_SCHOOL_EVENT_TYPES: Set<SchoolCalendarEventType> = new Set([
  'feriado',
  'recesso',
  'ferias',
]);

export function getCalendarDayStatus(
  dateStr: string,
  calendar?: SchoolCalendarConfig | null
): CalendarDayStatus {
  const clean = normalizeCalendarDate(dateStr);
  if (!clean) return { isSchoolDay: false, reason: 'Data inválida' };

  const parts = clean.split('-').map(Number);
  if (parts.length !== 3) return { isSchoolDay: false, reason: 'Data inválida' };

  const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  const dow = d.getDay(); // 0=Dom, 6=Sáb
  const cal = calendar || readCalendarFromLocalStorage();
  const bimester = getBimesterForDate(clean, cal);

  // 1. Verifica eventos específicos na data
  const matchingEvents = (cal.events || []).filter(ev => eventCoversDate(ev, clean));
  if (matchingEvents.length > 0) {
    // Sábado letivo / reposição tem prioridade explícita para contar como dia letivo
    const positiveEvent = matchingEvents.find(
      ev => ev.type === 'sabado_letivo' || ev.type === 'reposicao' || ev.countsAsSchoolDay === true
    );
    if (positiveEvent) {
      return {
        isSchoolDay: true,
        reason: positiveEvent.title || 'Dia Letivo Extraordinário / Sábado Letivo',
        bimester,
        event: positiveEvent,
      };
    }

    const blockingEvent = matchingEvents.find(
      ev => NON_SCHOOL_EVENT_TYPES.has(ev.type) || ev.countsAsSchoolDay === false
    );
    if (blockingEvent) {
      return {
        isSchoolDay: false,
        reason: blockingEvent.title || 'Feriado / Recesso / Férias',
        bimester,
        event: blockingEvent,
      };
    }
  }

  // 2. Fim de semana sem evento letivo extraordinário
  if (dow === 0 || dow === 6) {
    return {
      isSchoolDay: false,
      reason: dow === 0 ? 'Domingo' : 'Sábado não letivo',
      bimester,
    };
  }

  // 3. Se há bimestres configurados para o ano letivo, garante que está dentro de um período letivo
  const validBimesters = (cal.bimesters || []).filter(b => b.startDate && b.endDate);
  if (validBimesters.length > 0) {
    if (bimester) {
      return {
        isSchoolDay: true,
        reason: `Dia Letivo (${bimester.name})`,
        bimester,
        event: matchingEvents[0],
      };
    }

    // Verifica se a data está no mesmo ano do calendário configurado
    const minYearStart = validBimesters.reduce(
      (min, b) => (b.startDate < min ? b.startDate : min),
      validBimesters[0].startDate
    );
    const maxYearEnd = validBimesters.reduce(
      (max, b) => (b.endDate > max ? b.endDate : max),
      validBimesters[0].endDate
    );

    if (clean < minYearStart || clean > maxYearEnd) {
      return {
        isSchoolDay: false,
        reason: 'Fora do período letivo anual cadastrado',
      };
    }

    return {
      isSchoolDay: false,
      reason: 'Período de férias/recesso entre bimestres',
    };
  }

  return {
    isSchoolDay: true,
    reason: 'Dia Letivo (Seg-Sex)',
  };
}

export function countSchoolDaysInRange(
  startDate: string,
  endDate: string,
  calendar?: SchoolCalendarConfig | null,
  minOneFallback: boolean = false
): number {
  const s = normalizeCalendarDate(startDate);
  const e = normalizeCalendarDate(endDate) || s;
  if (!s || !e) return minOneFallback ? 1 : 0;

  const minD = s <= e ? s : e;
  const maxD = s <= e ? e : s;

  const minParts = minD.split('-').map(Number);
  const maxParts = maxD.split('-').map(Number);
  if (minParts.length !== 3 || maxParts.length !== 3) return minOneFallback ? 1 : 0;

  const cal = calendar || readCalendarFromLocalStorage();
  const current = new Date(minParts[0], minParts[1] - 1, minParts[2], 12, 0, 0);
  const finish = new Date(maxParts[0], maxParts[1] - 1, maxParts[2], 12, 0, 0);

  let count = 0;
  let guard = 0;
  while (current <= finish && guard < 400) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${day}`;
    if (getCalendarDayStatus(iso, cal).isSchoolDay) {
      count++;
    }
    current.setDate(current.getDate() + 1);
    guard++;
  }

  return minOneFallback ? Math.max(1, count) : count;
}

export interface BimesterMetricsSummary {
  id: SchoolBimester['id'];
  name: string;
  startDate: string;
  endDate: string;
  totalSchoolDays: number;
  elapsedSchoolDays: number;
  isCurrent: boolean;
}

export interface CalendarMetricsSummary {
  year: number;
  totalPlannedSchoolDays: number;
  elapsedSchoolDays: number;
  currentBimester: SchoolBimester | null;
  bimestersSummary: BimesterMetricsSummary[];
  holidaysAndRecessesCount: number;
  saturdaySchoolDaysCount: number;
  todayStatus: CalendarDayStatus;
}

export function getCalendarMetricsSummary(
  calendar?: SchoolCalendarConfig | null,
  referenceDateStr: string = getLocalTodayISO()
): CalendarMetricsSummary {
  const cal = calendar || readCalendarFromLocalStorage();
  const today = normalizeCalendarDate(referenceDateStr) || getLocalTodayISO();
  const validBimesters = (cal.bimesters || []).filter(b => b.startDate && b.endDate);

  let totalPlannedSchoolDays = 0;
  let elapsedSchoolDays = 0;

  const bimestersSummary: BimesterMetricsSummary[] = validBimesters.map(b => {
    const totalBimDays = countSchoolDaysInRange(b.startDate, b.endDate, cal, false);
    let elapsedBimDays = 0;
    if (today >= b.startDate) {
      const capDate = today <= b.endDate ? today : b.endDate;
      elapsedBimDays = countSchoolDaysInRange(b.startDate, capDate, cal, false);
    }
    const isCurrent = today >= b.startDate && today <= b.endDate;
    totalPlannedSchoolDays += totalBimDays;
    elapsedSchoolDays += elapsedBimDays;

    return {
      id: b.id,
      name: b.name,
      startDate: b.startDate,
      endDate: b.endDate,
      totalSchoolDays: totalBimDays,
      elapsedSchoolDays: elapsedBimDays,
      isCurrent,
    };
  });

  const currentBimesterObj = getBimesterForDate(today, cal) || null;
  const events = cal.events || [];
  const holidaysAndRecessesCount = events.filter(
    e => e.type === 'feriado' || e.type === 'recesso' || e.type === 'ferias'
  ).length;
  const saturdaySchoolDaysCount = events.filter(
    e => e.type === 'sabado_letivo' || e.type === 'reposicao'
  ).length;

  return {
    year: cal.year || 2026,
    totalPlannedSchoolDays,
    elapsedSchoolDays: Math.max(1, elapsedSchoolDays),
    currentBimester: currentBimesterObj,
    bimestersSummary,
    holidaysAndRecessesCount,
    saturdaySchoolDaysCount,
    todayStatus: getCalendarDayStatus(today, cal),
  };
}

export function calculateCalendarAttendanceRate(
  totalAbsences: number,
  calendar?: SchoolCalendarConfig | null,
  fallbackSchoolDays?: number
): { attendanceRate: number; effectiveSchoolDays: number } {
  const summary = getCalendarMetricsSummary(calendar);
  const effectiveSchoolDays =
    summary.totalPlannedSchoolDays > 0
      ? Math.max(1, summary.elapsedSchoolDays)
      : Math.max(1, fallbackSchoolDays || 45);

  const abs = Math.max(0, totalAbsences || 0);
  const rate = Math.max(0, Math.min(100, Math.round(((effectiveSchoolDays - abs) / effectiveSchoolDays) * 100)));
  return {
    attendanceRate: rate,
    effectiveSchoolDays,
  };
}
