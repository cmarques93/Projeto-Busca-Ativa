import {
  School,
  UserAccount,
  UserRole,
  AttendanceStatus,
  GateRecord,
  AttendanceRecord,
  SchoolClass,
  Student,
  ParentAlert,
  InterventionCase,
  MonthlyPedagogicalReport,
  SchoolCalendarConfig,
  TeacherScheduleSlot,
  TimetableWorkspace
} from '../types';
import {
  DEFAULT_SCHOOL_ID,
  DEFAULT_SCHOOLS,
  SECOND_SCHOOL_CLASSES,
  SECOND_SCHOOL_STUDENTS,
  DEFAULT_USERS,
  DEFAULT_PINS,
  DEFAULT_CLASSES,
  DEFAULT_STUDENTS,
  DEFAULT_ALERTS,
  DEFAULT_INTERVENTIONS,
  DEFAULT_REPORT
} from './fallbackData';
import { firestoreService, isSameDay, normalizeDateStr } from '../lib/firestoreService';
import { generateAtestadoRecordsSequence, generateJustifiedAbsenceSequence } from '../utils/atestadoUtils';
import { createDefaultSchoolCalendar, getCalendarMetricsSummary, calculateCalendarAttendanceRate } from '../utils/calendarUtils';

function getLocalTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
import {
  createDefaultTimetableWorkspace,
  convertTimetableCellsToTeacherSchedules
} from '../utils/timetableEngine';

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'super_admin':
      return 'Proprietário / Admin Universal (SaaS)';
    case 'admin_escola':
      return 'Administrador da Unidade Escolar';
    case 'admin':
      return 'Administrador da Unidade Escolar';
    case 'gestao_paac':
      return 'Coordenação Pedagógica / PAAC';
    case 'aoe':
      return 'Agente de Organização Escolar (AOE)';
    case 'professor':
      return 'Professor(a) / Docente';
    default:
      return 'Usuário Escolar';
  }
}

// Cache em memória de alta performance: preserva 100% dos registros na sessão mesmo se o localStorage do navegador atingir o limite de 5MB
const memoryGlobalCache = new Map<string, any>();
const memorySchoolCache = new Map<string, any>();

const LEGACY_SCHOOL_DUPLICATE_KEYS = [
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

function isQuotaError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    String(e.message || '').toLowerCase().includes('quota')
  );
}

function purgeLegacyDuplicateStorageKeys(): void {
  try {
    for (const legacyKey of LEGACY_SCHOOL_DUPLICATE_KEYS) {
      localStorage.removeItem(legacyKey);
    }
  } catch {}
}

function sortRecordsMostRecentFirst<T extends Record<string, any>>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = String(b?.date || b?.sentAt || b?.recordedAt || b?.createdAt || '');
    const db = String(a?.date || a?.sentAt || a?.recordedAt || a?.createdAt || '');
    return da.localeCompare(db);
  });
}

function tryWriteLocalStorageWithCompaction(scopedKey: string, baseKey: string, data: any): void {
  try {
    localStorage.setItem(scopedKey, JSON.stringify(data));
    return;
  } catch (err) {
    if (!isQuotaError(err)) {
      return;
    }
  }

  // 1. Remove cópias duplicadas legadas (`school_*`) para liberar ~50% do espaço imediatamente
  purgeLegacyDuplicateStorageKeys();
  try {
    localStorage.setItem(scopedKey, JSON.stringify(data));
    return;
  } catch {}

  // 2. Se for log histórico volumoso (frequência, portaria ou alertas), grava no cache local apenas a janela recente
  // (100% dos dados seguem preservados em memorySchoolCache durante a sessão e no Firebase Firestore na nuvem)
  const isHeavyHistoryKey = baseKey === 'attendance' || baseKey === 'gate_records' || baseKey === 'alerts';
  if (isHeavyHistoryKey && Array.isArray(data)) {
    const sorted = sortRecordsMostRecentFirst(data);
    const limits = [2000, 800, 300, 100];
    for (const limit of limits) {
      if (sorted.length <= limit) continue;
      try {
        localStorage.setItem(scopedKey, JSON.stringify(sorted.slice(0, limit)));
        return;
      } catch {}
    }
    try {
      localStorage.removeItem(scopedKey);
    } catch {}
    return;
  }

  // 3. Para dados cadastrais essenciais (turmas, estudantes, calendário, grade), libera espaço de caches voláteis se necessário
  try {
    const activeSchoolId = localStorage.getItem('sigaescola_active_school_id') || DEFAULT_SCHOOL_ID;
    const volatileKeys = [
      `sigaescola_${activeSchoolId}_attendance`,
      `sigaescola_${activeSchoolId}_gate_records`,
      `sigaescola_${activeSchoolId}_alerts`,
    ];
    for (const vk of volatileKeys) {
      if (vk !== scopedKey) {
        localStorage.removeItem(vk);
      }
    }
    localStorage.setItem(scopedKey, JSON.stringify(data));
  } catch {}
}

// Helper to safely access localStorage (handles SSR, disabled cookies, etc.)
function getStored<T>(key: string, fallback: T): T {
  if (memoryGlobalCache.has(key)) {
    return memoryGlobalCache.get(key) as T;
  }
  try {
    const val = localStorage.getItem(key);
    if (!val) return fallback;
    const parsed = JSON.parse(val) as T;
    memoryGlobalCache.set(key, parsed);
    return parsed;
  } catch (e) {
    console.warn(`Erro ao ler ${key} do localStorage:`, e);
    return fallback;
  }
}

function setStored<T>(key: string, data: T): void {
  memoryGlobalCache.set(key, data);
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    if (isQuotaError(e)) {
      purgeLegacyDuplicateStorageKeys();
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {}
    } else {
      console.warn(`Erro ao salvar ${key} no localStorage:`, e);
    }
  }
}

// Helper para armazenamento isolado por escola (Multi-Tenant)
function getStoredSchool<T>(baseKey: string, fallback: T, schoolId?: string): T {
  const sId = schoolId || storageService.getActiveSchoolId();
  const scopedKey = `sigaescola_${sId}_${baseKey}`;

  if (memorySchoolCache.has(scopedKey)) {
    return memorySchoolCache.get(scopedKey) as T;
  }

  try {
    const val = localStorage.getItem(scopedKey);
    if (val) {
      const parsed = JSON.parse(val) as T;
      memorySchoolCache.set(scopedKey, parsed);
      // Limpa chave legada duplicada se já migrada para scopedKey
      if (sId === DEFAULT_SCHOOL_ID && localStorage.getItem(`school_${baseKey}`) !== null) {
        try {
          localStorage.removeItem(`school_${baseKey}`);
        } catch {}
      }
      return parsed;
    }
    // Retrocompatibilidade: Se não há valor na chave com prefixo da escola e é a escola padrão, migra chave legada uma única vez
    if (sId === DEFAULT_SCHOOL_ID) {
      const legacyKey = `school_${baseKey}`;
      const legacyVal = localStorage.getItem(legacyKey);
      if (legacyVal) {
        const parsed = JSON.parse(legacyVal) as T;
        memorySchoolCache.set(scopedKey, parsed);
        tryWriteLocalStorageWithCompaction(scopedKey, baseKey, parsed);
        try {
          localStorage.removeItem(legacyKey);
        } catch {}
        return parsed;
      }
    }
    return fallback;
  } catch (e) {
    console.warn(`Erro ao ler ${scopedKey} do localStorage:`, e);
    return fallback;
  }
}

function setStoredSchool<T>(baseKey: string, data: T, schoolId?: string): void {
  const sId = schoolId || storageService.getActiveSchoolId();
  const scopedKey = `sigaescola_${sId}_${baseKey}`;

  // Mantém 100% dos registros íntegros em memória durante toda a sessão
  memorySchoolCache.set(scopedKey, data);

  // Remove chave legada duplicada para evitar consumir o dobro do limite do navegador
  if (sId === DEFAULT_SCHOOL_ID) {
    try {
      localStorage.removeItem(`school_${baseKey}`);
    } catch {}
  }

  tryWriteLocalStorageWithCompaction(scopedKey, baseKey, data);
}

export interface MasterPasswordValidation {
  isValid: boolean;
  hasValidLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  errors: string[];
}

export function validateMasterPassword(password: string): MasterPasswordValidation {
  const pwd = password || '';
  const hasValidLength = pwd.length >= 8 && pwd.length <= 16;
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasLowercase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

  const errors: string[] = [];
  if (!hasValidLength) errors.push('Deve ter entre 8 e 16 caracteres.');
  if (!hasUppercase) errors.push('Deve conter pelo menos 1 letra maiúscula (A-Z).');
  if (!hasLowercase) errors.push('Deve conter pelo menos 1 letra minúscula (a-z).');
  if (!hasNumber) errors.push('Deve conter pelo menos 1 número (0-9).');
  if (!hasSpecial) errors.push('Deve conter pelo menos 1 caractere especial (ex: @, #, $, %, !, &).');

  return {
    isValid: hasValidLength && hasUppercase && hasLowercase && hasNumber && hasSpecial,
    hasValidLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
    errors,
  };
}

function resolveMasterPin(candidatePin?: string, fallbackPin?: string): string {
  // 1. Se candidatePin é uma senha forte personalizada (diferente da padrão inicial), preserva e salva
  if (candidatePin && candidatePin !== 'Master@2026' && validateMasterPassword(candidatePin).isValid) {
    try {
      localStorage.setItem('sigaescola_master_password', candidatePin);
    } catch {}
    return candidatePin;
  }
  // 2. Se fallbackPin é uma senha forte personalizada, preserva
  if (fallbackPin && fallbackPin !== 'Master@2026' && validateMasterPassword(fallbackPin).isValid) {
    try {
      localStorage.setItem('sigaescola_master_password', fallbackPin);
    } catch {}
    return fallbackPin;
  }
  // 3. Verifica se já existe senha forte personalizada salva dedicada no navegador
  try {
    const savedCustom = localStorage.getItem('sigaescola_master_password');
    if (savedCustom && validateMasterPassword(savedCustom).isValid) {
      return savedCustom;
    }
  } catch {}
  // 4. Caso contrário, utiliza candidatePin/fallbackPin válido ou a padrão Master@2026
  if (candidatePin && validateMasterPassword(candidatePin).isValid) {
    return candidatePin;
  }
  if (fallbackPin && validateMasterPassword(fallbackPin).isValid) {
    return fallbackPin;
  }
  return 'Master@2026';
}

// Ensure default users have their default PIN attached
function initializeDefaultUsers(): UserAccount[] {
  return DEFAULT_USERS.map(u => {
    const isMaster = u.id === 'usr-master' || u.role === 'super_admin' || u.isUniversal === true;
    return {
      ...u,
      pin: isMaster
        ? resolveMasterPin(u.pin, DEFAULT_PINS[u.id]?.pin)
        : (DEFAULT_PINS[u.id]?.pin || '1234'),
      createdAt: new Date().toISOString()
    };
  });
}

export const storageService = {
  // === GESTÃO MULTI-ESCOLAS (SaaS Multi-Tenant) ===
  getActiveSchoolId: (): string => {
    try {
      const stored = localStorage.getItem('sigaescola_active_school_id');
      if (!stored || stored === 'emeb-cecilia-meireles') {
        return DEFAULT_SCHOOL_ID;
      }
      return stored;
    } catch {
      return DEFAULT_SCHOOL_ID;
    }
  },

  setActiveSchoolId: (schoolId: string): void => {
    try {
      localStorage.setItem('sigaescola_active_school_id', schoolId);
    } catch {}
  },

  getSchools: (): School[] => {
    let schools = getStored<School[]>('sigaescola_all_schools', []);
    // Remove escola fictícia de demonstração caso estivesse em cache antigo
    schools = (schools || []).filter(s => s && s.id !== 'emeb-cecilia-meireles');
    if (schools.length === 0) {
      schools = DEFAULT_SCHOOLS;
      setStored('sigaescola_all_schools', schools);
    } else if (!schools.some(s => s.id === DEFAULT_SCHOOL_ID)) {
      schools = [DEFAULT_SCHOOLS[0], ...schools];
      setStored('sigaescola_all_schools', schools);
    }
    return schools;
  },

  setSchools: (schools: School[]): void => {
    const clean = (schools || []).filter(s => s && s.id !== 'emeb-cecilia-meireles');
    setStored('sigaescola_all_schools', clean.length > 0 ? clean : DEFAULT_SCHOOLS);
  },

  getActiveSchool: (schoolId?: string): School => {
    const targetId = schoolId || storageService.getActiveSchoolId();
    const schools = storageService.getSchools();
    const found = schools.find(s => s.id === targetId);
    return found || DEFAULT_SCHOOLS[0];
  },

  saveSchool: (school: School): School => {
    const schools = storageService.getSchools();
    const idx = schools.findIndex(s => s.id === school.id);
    if (idx >= 0) {
      schools[idx] = school;
    } else {
      schools.push(school);
    }
    setStored('sigaescola_all_schools', schools);
    firestoreService.saveSchool(school).catch(err => console.warn('Erro ao salvar escola no Firestore:', err));
    return school;
  },

  deleteSchool: (schoolId: string): boolean => {
    let schools = storageService.getSchools().filter(s => s.id !== schoolId);
    if (schools.length === 0) schools = DEFAULT_SCHOOLS;
    setStored('sigaescola_all_schools', schools);
    firestoreService.deleteSchool(schoolId).catch(err => console.warn('Erro ao deletar escola no Firestore:', err));
    return true;
  },

  // === SETTERS PARA SINCRONIZAÇÃO COM A NUVEM (Com isolamento por escola e preservação total) ===
  setUsers: (incomingUsers: UserAccount[]): void => {
    if (!Array.isArray(incomingUsers)) return;
    const existing = getStored<UserAccount[]>('school_users', []);
    const byId = new Map<string, UserAccount>();

    // Garante que o perfil estrutural Master nunca seja perdido
    for (const def of initializeDefaultUsers()) {
      byId.set(def.id, def);
    }
    for (const u of existing) {
      if (u && u.id && !u.id.includes('cecilia') && !u.id.includes('usr-cec') && u.id !== 'usr-admin-arlindo') {
        const isMaster = u.id === 'usr-master' || u.role === 'super_admin' || u.isUniversal === true;
        byId.set(u.id, {
          ...u,
          pin: isMaster ? resolveMasterPin(u.pin, byId.get(u.id)?.pin) : u.pin,
        });
      }
    }
    for (const u of incomingUsers) {
      if (u && u.id && !u.id.includes('cecilia') && !u.id.includes('usr-cec') && u.id !== 'usr-admin-arlindo') {
        const prev = byId.get(u.id);
        const isMaster = u.id === 'usr-master' || u.role === 'super_admin' || u.isUniversal === true;
        byId.set(u.id, {
          ...prev,
          ...u,
          pin: isMaster
            ? resolveMasterPin(u.pin, prev?.pin)
            : (u.pin || prev?.pin || DEFAULT_PINS[u.id]?.pin || '1234'),
          schoolId: isMaster
            ? undefined
            : (u.schoolId || prev?.schoolId || DEFAULT_SCHOOL_ID),
        });
      }
    }

    setStored('school_users', Array.from(byId.values()));
  },
  setClasses: (classes: SchoolClass[], schoolId?: string): void => {
    setStoredSchool('classes', classes, schoolId);
  },
  setStudents: (students: Student[], schoolId?: string): void => {
    setStoredSchool('students', students, schoolId);
  },
  setAttendanceRecords: (records: AttendanceRecord[], schoolId?: string): void => {
    setStoredSchool('attendance', records, schoolId);
  },
  setAlerts: (alerts: ParentAlert[], schoolId?: string): void => {
    setStoredSchool('alerts', alerts, schoolId);
  },
  setInterventions: (interventions: InterventionCase[], schoolId?: string): void => {
    setStoredSchool('interventions', interventions, schoolId);
  },
  setGateRecords: (records: GateRecord[], schoolId?: string): void => {
    setStoredSchool('gate_records', records, schoolId);
  },

  // === CALENDÁRIO ESCOLAR LETIVO ===
  getSchoolCalendar: (schoolId?: string): SchoolCalendarConfig => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const fallback = createDefaultSchoolCalendar(new Date().getFullYear() || 2026, sId);
    const stored = getStoredSchool<SchoolCalendarConfig | null>('calendar', null, sId);
    if (stored && Array.isArray(stored.bimesters)) {
      return { ...stored, schoolId: sId };
    }
    return fallback;
  },

  setSchoolCalendar: (calendar: SchoolCalendarConfig, schoolId?: string): void => {
    const sId = schoolId || calendar.schoolId || storageService.getActiveSchoolId();
    setStoredSchool('calendar', { ...calendar, schoolId: sId }, sId);
  },

  saveSchoolCalendar: (calendar: SchoolCalendarConfig, schoolId?: string): SchoolCalendarConfig => {
    const sId = schoolId || calendar.schoolId || storageService.getActiveSchoolId();
    const updated: SchoolCalendarConfig = {
      ...calendar,
      schoolId: sId,
      updatedAt: new Date().toISOString(),
    };
    setStoredSchool('calendar', updated, sId);

    // Recalcula métricas dos estudantes ativos considerando os dias letivos transcorridos no calendário
    const summary = getCalendarMetricsSummary(updated);
    const effectiveDays = Math.max(1, summary.elapsedSchoolDays);
    const students = storageService.getStudents(undefined, sId);
    const changedStudents: Student[] = [];
    const updatedStudents = students.map(st => {
      const absences = st.totalAbsences || 0;
      const newRate = Math.max(0, Math.min(100, Math.round(((effectiveDays - absences) / effectiveDays) * 100)));
      const next: Student = {
        ...st,
        totalSchoolDays: effectiveDays,
        attendanceRate: st.attendanceRate !== undefined ? newRate : 100,
      };
      if (st.status !== 'transferido') {
        if (next.consecutiveAbsences >= 4 || next.attendanceRate < 75) {
          next.riskLevel = 'critico';
          next.status = 'evasao_iminente';
        } else if (next.consecutiveAbsences >= 2 || next.attendanceRate < 80) {
          next.riskLevel = 'alto';
          next.status = 'alerta';
        } else {
          next.riskLevel = 'baixo';
          next.status = 'regular';
        }
      }
      if (next.totalSchoolDays !== st.totalSchoolDays || next.attendanceRate !== st.attendanceRate) {
        changedStudents.push(next);
      }
      return next;
    });

    if (changedStudents.length > 0) {
      setStoredSchool('students', updatedStudents, sId);
      firestoreService.batchSaveStudents(changedStudents, sId).catch(err => console.warn('Erro ao recalcular estudantes pelo calendário no Firestore:', err));
    }

    firestoreService.saveSchoolCalendar(updated, sId).catch(err => console.warn('Erro ao salvar calendário no Firestore:', err));
    return updated;
  },

  // === GRADE HORÁRIA DOCENTE ===
  getTeacherSchedules: (schoolId?: string): TeacherScheduleSlot[] => {
    const sId = schoolId || storageService.getActiveSchoolId();
    return getStoredSchool<TeacherScheduleSlot[]>('teacher_schedules', [], sId);
  },

  setTeacherSchedules: (slots: TeacherScheduleSlot[], schoolId?: string): void => {
    const sId = schoolId || storageService.getActiveSchoolId();
    setStoredSchool('teacher_schedules', Array.isArray(slots) ? slots : [], sId);
  },

  saveTeacherSchedules: (slots: TeacherScheduleSlot[], schoolId?: string): TeacherScheduleSlot[] => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const normalized = (slots || []).map(s => ({ ...s, schoolId: sId }));
    setStoredSchool('teacher_schedules', normalized, sId);
    firestoreService.saveTeacherSchedules(normalized, sId).catch(err => console.warn('Erro ao salvar grade docente no Firestore:', err));
    return normalized;
  },

  // === WORKSPACE DE GRADE CURRICULAR & GERADOR DE HORÁRIOS ===
  getTimetableWorkspace: (schoolId?: string): TimetableWorkspace => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const stored = getStoredSchool<TimetableWorkspace | null>('timetable_workspace', null, sId);
    if (stored && stored.criteriaByYear && Array.isArray(stored.periods)) {
      return { ...stored, schoolId: sId };
    }
    const classes = storageService.getClasses(sId);
    const users = storageService.getUsers(sId);
    const existingSlots = storageService.getTeacherSchedules(sId);
    return createDefaultTimetableWorkspace(sId, classes, users, existingSlots);
  },

  setTimetableWorkspace: (workspace: TimetableWorkspace, schoolId?: string): void => {
    const sId = schoolId || workspace.schoolId || storageService.getActiveSchoolId();
    setStoredSchool('timetable_workspace', { ...workspace, schoolId: sId }, sId);
  },

  saveTimetableWorkspace: (
    workspace: TimetableWorkspace,
    syncToTeacherSchedules: boolean = true,
    schoolId?: string
  ): TimetableWorkspace => {
    const sId = schoolId || workspace.schoolId || storageService.getActiveSchoolId();
    const updated: TimetableWorkspace = {
      ...workspace,
      schoolId: sId,
      updatedAt: new Date().toISOString(),
    };
    setStoredSchool('timetable_workspace', updated, sId);
    firestoreService
      .saveTimetableWorkspace(updated, sId)
      .catch(err => console.warn('Erro ao salvar workspace de horários no Firestore:', err));

    if (syncToTeacherSchedules) {
      const syncedSlots = convertTimetableCellsToTeacherSchedules(updated);
      storageService.saveTeacherSchedules(syncedSlots, sId);
    }
    return updated;
  },

  // === USUÁRIOS & ACESSOS ===
  getUsers: (schoolId?: string): UserAccount[] => {
    let storedUsers = getStored<UserAccount[]>('school_users', []);
    const byId = new Map<string, UserAccount>();

    // Sempre preserva o perfil estrutural Master Global
    for (const def of initializeDefaultUsers()) {
      byId.set(def.id, def);
    }

    for (const u of storedUsers) {
      if (!u || !u.id || u.id.includes('cecilia') || u.id.includes('usr-cec') || u.id === 'usr-admin-arlindo') continue;
      if (['usr-gestao', 'usr-aoe', 'usr-professor'].includes(u.id)) continue;

      const isMaster = u.id === 'usr-master' || u.role === 'super_admin' || u.isUniversal === true;
      byId.set(u.id, {
        ...byId.get(u.id),
        ...u,
        pin: isMaster
          ? resolveMasterPin(u.pin, byId.get(u.id)?.pin)
          : (u.pin || byId.get(u.id)?.pin || DEFAULT_PINS[u.id]?.pin || '1234'),
        isUniversal: isMaster ? true : undefined,
        schoolId: isMaster ? undefined : (u.schoolId || DEFAULT_SCHOOL_ID),
      });
    }

    const allUsers = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (storedUsers.length !== allUsers.length) {
      setStored('school_users', allUsers);
    }

    if (schoolId) {
      // Lista APENAS os operadores vinculados à unidade escolar selecionada (sem misturar o Painel Master Global)
      return allUsers.filter(u =>
        !u.isUniversal &&
        u.role !== 'super_admin' &&
        u.id !== 'usr-master' &&
        (u.schoolId || DEFAULT_SCHOOL_ID) === schoolId
      );
    }
    return allUsers;
  },

  getMasterUser: (): UserAccount => {
    const allUsers = storageService.getUsers();
    const found = allUsers.find(u => u.id === 'usr-master' || u.role === 'super_admin' || u.isUniversal === true);
    if (found) {
      return {
        ...found,
        pin: resolveMasterPin(found.pin),
      };
    }
    return {
      id: 'usr-master',
      name: 'Proprietário (Painel Master Global)',
      username: 'proprietario.master',
      role: 'super_admin',
      roleLabel: 'Proprietário / Admin Universal (SaaS)',
      pin: 'Master@2026',
      createdAt: new Date().toISOString(),
      active: true,
      isUniversal: true,
    };
  },

  getUserById: (id: string): UserAccount | undefined => {
    const users = storageService.getUsers();
    return users.find(u => u.id === id);
  },

  createUser: (data: {
    name: string;
    username?: string;
    role: UserRole;
    pin: string;
    notes?: string;
    schoolId?: string;
    isUniversal?: boolean;
  }): UserAccount => {
    const cleanName = data.name.trim();
    const cleanPin = (data.pin || '').trim();
    const cleanUsername = data.username?.trim() || cleanName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.');
    const isUniv = data.isUniversal || data.role === 'super_admin';
    const targetSchoolId = isUniv ? undefined : (data.schoolId || storageService.getActiveSchoolId());
    
    const newUser: UserAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      username: cleanUsername,
      role: data.role,
      roleLabel: getRoleLabel(data.role),
      pin: cleanPin,
      createdAt: new Date().toISOString(),
      active: true,
      notes: data.notes?.trim() || '',
      schoolId: targetSchoolId,
      isUniversal: isUniv || undefined
    };

    const users = storageService.getUsers();
    users.push(newUser);
    setStored('school_users', users);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveUser(newUser, targetSchoolId).catch(err => console.warn('Erro ao salvar usuário no Firestore:', err));

    return newUser;
  },

  updateUser: (id: string, updates: Partial<UserAccount>): UserAccount | null => {
    const users = storageService.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;

    if ((id === 'usr-master' || users[idx].role === 'super_admin' || users[idx].isUniversal) && updates.pin) {
      try {
        localStorage.setItem('sigaescola_master_password', updates.pin.trim());
      } catch {}
    }

    users[idx] = {
      ...users[idx],
      ...updates,
      roleLabel: updates.role ? getRoleLabel(updates.role) : users[idx].roleLabel
    };
    setStored('school_users', users);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveUser(users[idx]).catch(err => console.warn('Erro ao atualizar usuário no Firestore:', err));

    return users[idx];
  },

  updateUserPin: (id: string, pin: string): void => {
    const cleanPin = pin.trim();
    if (id === 'usr-master') {
      const validation = validateMasterPassword(cleanPin);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(' '));
      }
      try {
        localStorage.setItem('sigaescola_master_password', cleanPin);
      } catch {}
    }
    storageService.updateUser(id, { pin: cleanPin });
  },

  deleteUser: (userId: string): boolean => {
    const users = storageService.getUsers().filter(u => u.id !== userId);
    setStored('school_users', users);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteUser(userId).catch(err => console.warn('Erro ao deletar usuário do Firestore:', err));

    return true;
  },

  recordUserLogin: (userId: string): void => {
    try {
      const now = new Date().toISOString();
      const users = storageService.getUsers();
      const idx = users.findIndex(u => u.id === userId);
      if (idx !== -1) {
        users[idx].lastLogin = now;
        setStored('school_users', users);
        firestoreService.saveUser(users[idx]).catch(err => console.warn('Erro ao atualizar lastLogin no Firestore:', err));
      }
    } catch (e) {
      console.warn('Erro ao registrar lastLogin:', e);
    }
  },

  verifyPin: (userId: string, pin: string): { success: boolean; user?: any; error?: string } => {
    const users = storageService.getUsers();
    const cleanPin = pin.trim();
    const user = users.find(u => u.id === userId);
    const isMaster = userId === 'usr-master' || user?.role === 'super_admin' || user?.isUniversal === true;

    if (isMaster) {
      const validation = validateMasterPassword(cleanPin);
      if (!validation.isValid) {
        return {
          success: false,
          error: 'A senha do perfil Master deve ter entre 8 e 16 caracteres, contendo pelo menos 1 letra maiúscula, 1 minúscula, 1 número e 1 caractere especial.'
        };
      }
    }

    if (!user) {
      return { success: false, error: 'Usuário não localizado.' };
    }

    if (user.active === false) {
      return { success: false, error: 'Este usuário está inativo no sistema.' };
    }

    const savedCustomMaster = isMaster ? (() => {
      try { return localStorage.getItem('sigaescola_master_password'); } catch { return null; }
    })() : null;

    const masterMatches = isMaster && (
      user.pin === cleanPin ||
      (savedCustomMaster && savedCustomMaster === cleanPin) ||
      (!savedCustomMaster && cleanPin === 'Master@2026')
    );

    if (masterMatches || (!isMaster && (user.pin === cleanPin || (DEFAULT_PINS[userId] && DEFAULT_PINS[userId].pin === cleanPin)))) {
      // Registra e sincroniza último acesso imediatamente
      const now = new Date().toISOString();
      user.lastLogin = now;
      storageService.updateUser(user.id, { lastLogin: now });

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          roleLabel: user.roleLabel || getRoleLabel(user.role),
          schoolId: user.schoolId,
          isUniversal: user.isUniversal || user.role === 'super_admin',
        }
      };
    }

    return {
      success: false,
      error: isMaster
        ? 'Senha Master incorreta.'
        : 'Senha de 4 dígitos incorreta.'
    };
  },

  // === TURMAS ===
  getClasses: (schoolId?: string): SchoolClass[] => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const fallback = sId === 'emeb-cecilia-meireles' ? SECOND_SCHOOL_CLASSES : DEFAULT_CLASSES;
    return getStoredSchool<SchoolClass[]>('classes', fallback, sId);
  },

  createClass: (cls: SchoolClass, schoolId?: string): SchoolClass => {
    const sId = schoolId || cls.schoolId || storageService.getActiveSchoolId();
    const clsWithSchool = { ...cls, schoolId: sId };
    const classes = storageService.getClasses(sId);
    const existingIdx = classes.findIndex(c => c.id === cls.id);
    if (existingIdx >= 0) {
      classes[existingIdx] = clsWithSchool;
    } else {
      classes.push(clsWithSchool);
    }
    setStoredSchool('classes', classes, sId);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveClass(clsWithSchool, sId).catch(err => console.warn('Erro ao salvar turma no Firestore:', err));

    return clsWithSchool;
  },

  updateClass: (clsId: string, updates: Partial<SchoolClass>, schoolId?: string): SchoolClass | null => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const classes = storageService.getClasses(sId);
    const idx = classes.findIndex(c => c.id === clsId);
    if (idx === -1) return null;
    classes[idx] = { ...classes[idx], ...updates, schoolId: sId };
    setStoredSchool('classes', classes, sId);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveClass(classes[idx], sId).catch(err => console.warn('Erro ao atualizar turma no Firestore:', err));

    return classes[idx];
  },

  deleteClass: (clsId: string, schoolId?: string): void => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const classes = storageService.getClasses(sId).filter(c => c.id !== clsId);
    setStoredSchool('classes', classes, sId);

    // Remove apenas a matrícula ativa dos estudantes da turma excluída, preservando estudantes transferidos e todo o histórico de chamadas, alertas e busca ativa para arquivo escolar
    const classStudents = storageService.getStudents(undefined, sId).filter(s => s.classId === clsId && s.status !== 'transferido');
    if (classStudents.length > 0) {
      const idsToRemove = new Set(classStudents.map(s => s.id));
      const remainingStudents = storageService.getStudents(undefined, sId).filter(s => !idsToRemove.has(s.id));
      setStoredSchool('students', remainingStudents, sId);

      for (const st of classStudents) {
        firestoreService.deleteStudent(st.id).catch(() => {});
      }
    }

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteClass(clsId).catch(err => console.warn('Erro ao deletar turma no Firestore:', err));
  },

  // === ESTUDANTES ===
  getStudents: (classId?: string, schoolId?: string): Student[] => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const fallback = sId === 'emeb-cecilia-meireles' ? SECOND_SCHOOL_STUDENTS : DEFAULT_STUDENTS;
    const students = getStoredSchool<Student[]>('students', fallback, sId);
    if (classId) {
      return students.filter(s => s.classId === classId);
    }
    return students;
  },

  getStudentById: (id: string, schoolId?: string): Student | undefined => {
    const students = storageService.getStudents(undefined, schoolId);
    return students.find(s => s.id === id);
  },

  getStudentDetails: (studentId: string, schoolId?: string): any => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const student = storageService.getStudentById(studentId, sId);
    if (!student) return null;
    const history = storageService.getAttendanceRecords(undefined, undefined, sId)
      .filter(r => r.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date));
    const alerts = storageService.getAlerts(sId)
      .filter(a => a.studentId === studentId)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    const intervention = storageService.getInterventions(sId).find(i => i.studentId === studentId);

    return {
      student,
      attendanceHistory: history,
      alerts,
      intervention
    };
  },

  createStudent: (data: Partial<Student>, schoolId?: string): Student => {
    const sId = schoolId || data.schoolId || storageService.getActiveSchoolId();
    const students = storageService.getStudents(undefined, sId);
    const id = data.id || `std-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    const newStudent: Student = {
      id,
      name: data.name || '',
      ra: data.ra || '',
      classId: data.classId || '',
      className: data.className || '',
      tutor: data.tutor || '',
      guardianName: data.guardianName || '',
      guardianPhone: data.guardianPhone || '',
      guardianRelationship: data.guardianRelationship || 'Responsável',
      address: data.address || '',
      neighborhood: data.neighborhood || '',
      status: data.status || 'regular',
      riskLevel: data.riskLevel || 'baixo',
      totalSchoolDays: data.totalSchoolDays ?? Math.max(1, getCalendarMetricsSummary(storageService.getSchoolCalendar(sId)).elapsedSchoolDays),
      totalAbsences: data.totalAbsences ?? 0,
      consecutiveAbsences: data.consecutiveAbsences ?? 0,
      attendanceRate: data.attendanceRate ?? 100,
      vulnerabilityFactors: data.vulnerabilityFactors || [],
      lastAttendanceDate: data.lastAttendanceDate || getLocalTodayIso(),
      notes: data.notes || '',
      schoolId: sId
    };
    students.push(newStudent);
    setStoredSchool('students', students, sId);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveStudent(newStudent, sId).catch(err => console.warn('Erro ao salvar estudante no Firestore:', err));

    return newStudent;
  },

  updateStudent: (studentId: string, updates: Partial<Student>, schoolId?: string): Student | null => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const students = storageService.getStudents(undefined, sId);
    const idx = students.findIndex(s => s.id === studentId);
    if (idx === -1) return null;
    students[idx] = { ...students[idx], ...updates, schoolId: sId };
    setStoredSchool('students', students, sId);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveStudent(students[idx], sId).catch(err => console.warn('Erro ao atualizar estudante no Firestore:', err));

    return students[idx];
  },

  deleteStudent: (studentId: string, schoolId?: string): void => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const students = storageService.getStudents(undefined, sId).filter(s => s.id !== studentId);
    setStoredSchool('students', students, sId);

    // Histórico de alertas, chamadas, ocorrências e casos de busca ativa permanece preservado para consultas futuras da escola (ex: transferências)

    // Sincroniza remoção do cadastro ativo em nuvem no Firestore
    firestoreService.deleteStudent(studentId).catch(err => console.warn('Erro ao deletar estudante no Firestore:', err));
  },

  transferStudent: (
    studentId: string,
    details?: { transferredAt?: string; transferDestination?: string; transferReason?: string },
    schoolId?: string
  ): Student | null => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const students = storageService.getStudents(undefined, sId);
    const idx = students.findIndex(s => s.id === studentId);
    if (idx === -1) return null;

    const current = students[idx];
    const today = getLocalTodayIso();
    const updated: Student = {
      ...current,
      status: 'transferido',
      previousClassId: current.previousClassId || current.classId,
      previousClassName: current.previousClassName || current.className,
      transferredAt: details?.transferredAt || today,
      transferDestination: details?.transferDestination?.trim() || '',
      transferReason: details?.transferReason?.trim() || '',
      schoolId: sId,
    };

    students[idx] = updated;
    setStoredSchool('students', students, sId);

    firestoreService.saveStudent(updated, sId).catch(err => console.warn('Erro ao registrar transferência no Firestore:', err));
    return updated;
  },

  reactivateStudent: (
    studentId: string,
    targetClassId?: string,
    schoolId?: string
  ): Student | null => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const students = storageService.getStudents(undefined, sId);
    const idx = students.findIndex(s => s.id === studentId);
    if (idx === -1) return null;

    const current = students[idx];
    const classes = storageService.getClasses(sId);
    const desiredClassId = targetClassId || current.previousClassId || current.classId;
    const matchedClass = classes.find(c => c.id === desiredClassId) || classes[0];

    const newStatus =
      current.consecutiveAbsences >= 4 || current.attendanceRate < 75
        ? 'evasao_iminente'
        : current.consecutiveAbsences >= 2 || current.attendanceRate < 80
        ? 'alerta'
        : 'reintegrado';

    const updated: Student = {
      ...current,
      status: newStatus,
      classId: matchedClass ? matchedClass.id : desiredClassId,
      className: matchedClass ? matchedClass.name : (current.previousClassName || current.className),
      transferredAt: undefined,
      transferDestination: undefined,
      transferReason: undefined,
      schoolId: sId,
    };

    students[idx] = updated;
    setStoredSchool('students', students, sId);

    firestoreService.saveStudent(updated, sId).catch(err => console.warn('Erro ao reativar estudante no Firestore:', err));
    return updated;
  },

  batchCreateStudents: (newStudents: Partial<Student>[], schoolId?: string): number => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const existing = storageService.getStudents(undefined, sId);
    const createdList: Student[] = [];
    let count = 0;
    for (const data of newStudents) {
      const id = data.id || `std-${Date.now()}-${count}-${Math.random().toString(36).substring(2, 5)}`;
      const s: Student = {
        id,
        name: data.name || '',
        ra: data.ra || '',
        classId: data.classId || '',
        className: data.className || '',
        tutor: data.tutor || '',
        guardianName: data.guardianName || '',
        guardianPhone: data.guardianPhone || '',
        guardianRelationship: data.guardianRelationship || 'Responsável',
        address: data.address || '',
        neighborhood: data.neighborhood || '',
        status: data.status || 'regular',
        riskLevel: data.riskLevel || 'baixo',
        totalSchoolDays: data.totalSchoolDays ?? Math.max(1, getCalendarMetricsSummary(storageService.getSchoolCalendar(sId)).elapsedSchoolDays),
        totalAbsences: data.totalAbsences ?? 0,
        consecutiveAbsences: data.consecutiveAbsences ?? 0,
        attendanceRate: data.attendanceRate ?? 100,
        vulnerabilityFactors: data.vulnerabilityFactors || [],
        lastAttendanceDate: data.lastAttendanceDate || getLocalTodayIso(),
        notes: data.notes || '',
        schoolId: sId
      };
      existing.push(s);
      createdList.push(s);
      count++;
    }
    setStoredSchool('students', existing, sId);

    // Sincroniza em nuvem no Firestore
    firestoreService.batchSaveStudents(createdList, sId).catch(err => console.warn('Erro ao salvar lote de estudantes no Firestore:', err));

    return count;
  },

  // === FREQUÊNCIA ===
  recordAttendance: async (
    items: {
      studentId: string;
      status: AttendanceStatus;
      notes?: string;
      durationDays?: number;
      justification?: string;
      justificationDays?: number;
      justificationDayCurrent?: number;
      justificationDaysRemaining?: number;
      justificationStartDate?: string;
      justificationEndDate?: string;
      medicalCertificate?: string;
      medicalDays?: number;
      medicalDayCurrent?: number;
      medicalDaysRemaining?: number;
      medicalStartDate?: string;
      medicalEndDate?: string;
      studentName?: string;
      className?: string;
    }[],
    classId: string,
    recordedBy: string,
    date?: string
  ): Promise<any> => {
    const records = storageService.getAttendanceRecords();
    const recordDate = date || getLocalTodayIso();
    const allStudents = storageService.getStudents();
    const allClasses = storageService.getClasses();
    const targetClass = allClasses.find(c => c.id === classId || c.name === classId);

    let newRecords: AttendanceRecord[] = [];

    if (items.length === 0 && classId) {
      // Marcador de turma lançada caso a turma não tenha estudantes ainda
      newRecords = [{
        id: `att-cls-${classId}-${recordDate}`,
        studentId: `cls-marker-${classId}`,
        studentName: `Turma ${targetClass?.name || classId} (Chamada Concluída)`,
        classId,
        className: targetClass?.name || classId,
        date: recordDate,
        status: 'presente',
        durationDays: 1,
        isCountedAsAbsence: false,
        recordedBy,
        recordedAt: new Date().toISOString(),
        justification: 'Frequência da turma registrada',
      }];
    } else {
      items.forEach(item => {
        const student = allStudents.find(s => s.id === item.studentId);
        const duration = item.medicalDays || (item.durationDays && item.durationDays > 1 ? item.durationDays : 1);

        if (item.status === 'atestado_medico') {
          const atestadoSeq = generateAtestadoRecordsSequence({
            studentId: item.studentId,
            studentName: item.studentName || student?.name || 'Estudante',
            classId: classId || student?.classId || '',
            className: item.className || student?.className || targetClass?.name || '',
            startDate: item.medicalStartDate || recordDate,
            recordDate: recordDate,
            totalDays: duration,
            justification: item.justification,
            medicalCertificateNote: item.medicalCertificate,
            recordedBy,
          });
          newRecords.push(...atestadoSeq);
        } else if (item.status === 'falta_justificada' && duration > 1) {
          const justifiedSeq = generateJustifiedAbsenceSequence({
            studentId: item.studentId,
            studentName: item.studentName || student?.name || 'Estudante',
            classId: classId || student?.classId || '',
            className: item.className || student?.className || targetClass?.name || '',
            startDate: item.justificationStartDate || recordDate,
            recordDate: recordDate,
            totalDays: duration,
            justification: item.justification,
            recordedBy,
          });
          newRecords.push(...justifiedSeq);
        } else {
          const isCountedAsAbsence = item.status === 'falta_injustificada' || item.status === 'falta_justificada';
          newRecords.push({
            id: `att-${Date.now()}-${item.studentId}-${recordDate}`,
            studentId: item.studentId,
            studentName: item.studentName || student?.name || 'Estudante',
            classId: classId || student?.classId || '',
            className: item.className || student?.className || targetClass?.name || '',
            date: recordDate,
            status: item.status,
            durationDays: duration,
            justificationDays: item.status === 'falta_justificada' ? duration : undefined,
            justificationDayCurrent: item.status === 'falta_justificada' ? 1 : undefined,
            justificationDaysRemaining: item.status === 'falta_justificada' ? 0 : undefined,
            justification: item.justification || item.notes || '',
            medicalCertificate: item.medicalCertificate,
            medicalDays: item.medicalDays,
            isCountedAsAbsence,
            recordedBy,
            recordedAt: new Date().toISOString(),
          });
        }
      });
    }

    // Replace existing records for same student & dates of newRecords
    const sId = storageService.getActiveSchoolId();
    const datesAndStudents = new Set(newRecords.map(nr => `${nr.studentId}__${nr.date}`));
    const filteredRecords = records.filter(r => {
      const key = `${r.studentId}__${r.date}`;
      if (datesAndStudents.has(key)) return false;
      if (isSameDay(r.date, recordDate) && (r.classId === classId && r.studentId.startsWith('cls-marker-'))) return false;
      return true;
    });
    filteredRecords.push(...newRecords);
    setStoredSchool('attendance', filteredRecords, sId);

    // Update students absence counts based on real filteredRecords
    const updatedStudents: Student[] = [];
    allStudents.forEach(st => {
      const item = items.find(i => i.studentId === st.id);
      if (item) {
        // Obter todo o histórico real do estudante em filteredRecords
        const studentHistory = filteredRecords
          .filter(r => r.studentId === st.id)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // Contabiliza total de ausências reais
        const absenceRecords = studentHistory.filter(
          r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico'
        );
        st.totalAbsences = absenceRecords.reduce((acc, r) => acc + (r.durationDays || 1), 0);

        // Contabiliza faltas consecutivas a partir da data mais recente
        let cons = 0;
        for (const r of studentHistory) {
          if (r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico') {
            cons += (r.durationDays || 1);
          } else if (r.status === 'presente' || (r.status as any) === 'atraso') {
            break;
          }
        }
        st.consecutiveAbsences = cons;

        // Atualiza última data de presença
        const lastPres = studentHistory.find(r => r.status === 'presente' || (r.status as any) === 'atraso');
        if (lastPres) {
          st.lastAttendanceDate = lastPres.date;
        }

        const activeCalendar = storageService.getSchoolCalendar(sId);
        const { attendanceRate, effectiveSchoolDays } = calculateCalendarAttendanceRate(
          st.totalAbsences,
          activeCalendar,
          st.totalSchoolDays
        );
        st.totalSchoolDays = effectiveSchoolDays;
        st.attendanceRate = attendanceRate;
        if (st.status !== 'transferido') {
          if (st.consecutiveAbsences >= 4 || st.attendanceRate < 75) {
            st.riskLevel = 'critico';
            st.status = 'evasao_iminente';
          } else if (st.consecutiveAbsences >= 2 || st.attendanceRate < 80) {
            st.riskLevel = 'alto';
            st.status = 'alerta';
          } else {
            st.riskLevel = 'baixo';
            st.status = 'regular';
          }
        }
        updatedStudents.push(st);
      }
    });
    if (updatedStudents.length > 0) {
      setStoredSchool('students', allStudents, sId);
    }

    // Sincroniza em nuvem no Firestore de forma garantida e aguardada
    try {
      await firestoreService.batchSaveAttendance(newRecords, sId);
      if (updatedStudents.length > 0) {
        await firestoreService.batchSaveStudents(updatedStudents, sId);
      }
    } catch (err) {
      console.warn('Erro ao sincronizar chamadas no Firestore:', err);
    }

    return { success: true, count: newRecords.length, newRecords };
  },

  getAttendanceRecords: (classId?: string, date?: string, schoolId?: string): AttendanceRecord[] => {
    const sId = schoolId || storageService.getActiveSchoolId();
    let records = getStoredSchool<AttendanceRecord[]>('attendance', [], sId);
    if (classId) {
      const cleanClassId = classId.trim().toLowerCase();
      records = records.filter(r => (r.classId || '').trim().toLowerCase() === cleanClassId || (r.className || '').trim().toLowerCase() === cleanClassId);
    }
    if (date) {
      records = records.filter(r => isSameDay(r.date, date));
    }
    return records;
  },

  deleteAttendanceByDate: async (dateStr: string, classId?: string): Promise<{ deletedCount: number }> => {
    if (!dateStr) return { deletedCount: 0 };
    const sId = storageService.getActiveSchoolId();
    const allRecords = storageService.getAttendanceRecords(undefined, undefined, sId);
    const allStudents = storageService.getStudents(undefined, sId);
    const affectedStudentIds = new Set<string>();
    const cleanDate = normalizeDateStr(dateStr);
    const cleanClass = classId ? classId.trim().toLowerCase() : null;

    const remainingRecords = allRecords.filter(r => {
      const recordDate = normalizeDateStr(r.date) || r.date;
      const idMatchesDate = r.id.includes(cleanDate) || r.id.includes(dateStr);
      const dateMatches = isSameDay(recordDate, dateStr) || idMatchesDate;

      if (!dateMatches) return true;

      if (cleanClass) {
        const rClassId = (r.classId || '').trim().toLowerCase();
        const rClassName = (r.className || '').trim().toLowerCase();
        const normRId = rClassId.replace(/[^a-z0-9]/gi, '');
        const normRName = rClassName.replace(/[^a-z0-9]/gi, '');
        const normC = cleanClass.replace(/[^a-z0-9]/gi, '');
        const isMarkerForClass = r.studentId === `cls-marker-${classId}` || (normC && r.studentId.toLowerCase() === `cls-marker-${normC}`);
        const isPrefixForClass = r.id.startsWith(`att-cls-${classId}-`) || (normC && r.id.toLowerCase().startsWith(`att-cls-${normC}-`));

        const isMatch =
          rClassId === cleanClass ||
          rClassName === cleanClass ||
          (normC && (normRId === normC || normRName === normC)) ||
          isMarkerForClass ||
          isPrefixForClass;

        if (!isMatch) {
          return true; // Keep record of other classes
        }
      }

      affectedStudentIds.add(r.studentId);
      return false; // delete
    });

    const deletedCount = allRecords.length - remainingRecords.length;
    setStoredSchool('attendance', remainingRecords, sId);

    // Recalcula totais dos estudantes afetados
    const updatedStudents: Student[] = [];
    allStudents.forEach(st => {
      if (affectedStudentIds.has(st.id)) {
        const studentHistory = remainingRecords
          .filter(r => r.studentId === st.id)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const absenceRecords = studentHistory.filter(
          r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico'
        );
        st.totalAbsences = absenceRecords.reduce((acc, r) => acc + (r.durationDays || 1), 0);

        let cons = 0;
        for (const r of studentHistory) {
          if (r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico') {
            cons += (r.durationDays || 1);
          } else if (r.status === 'presente' || (r.status as any) === 'atraso') {
            break;
          }
        }
        st.consecutiveAbsences = cons;

        const lastPres = studentHistory.find(r => r.status === 'presente' || (r.status as any) === 'atraso');
        if (lastPres) {
          st.lastAttendanceDate = lastPres.date;
        }

        const activeCalendar = storageService.getSchoolCalendar(sId);
        const { attendanceRate, effectiveSchoolDays } = calculateCalendarAttendanceRate(
          st.totalAbsences,
          activeCalendar,
          st.totalSchoolDays
        );
        st.totalSchoolDays = effectiveSchoolDays;
        st.attendanceRate = attendanceRate;
        if (st.status !== 'transferido') {
          if (st.consecutiveAbsences >= 4 || st.attendanceRate < 75) {
            st.riskLevel = 'critico';
            st.status = 'evasao_iminente';
          } else if (st.consecutiveAbsences >= 2 || st.attendanceRate < 80) {
            st.riskLevel = 'alto';
            st.status = 'alerta';
          } else {
            st.riskLevel = 'baixo';
            st.status = 'regular';
          }
        }
        updatedStudents.push(st);
      }
    });

    if (updatedStudents.length > 0) {
      setStoredSchool('students', allStudents, sId);
    }

    // Sincroniza exclusão no Firestore (isolada pela unidade escolar ativa)
    try {
      await firestoreService.deleteAttendanceByDate(dateStr, classId, sId);
      if (updatedStudents.length > 0) {
        await firestoreService.batchSaveStudents(updatedStudents, sId);
      }
    } catch (e) {
      console.warn('Erro ao sincronizar exclusão de chamadas no Firestore:', e);
    }

    return { deletedCount };
  },

  // === PORTARIA ===
  getGateRecords: (date?: string, classId?: string, schoolId?: string): GateRecord[] => {
    const sId = schoolId || storageService.getActiveSchoolId();
    let list = getStoredSchool<GateRecord[]>('gate_records', [], sId);
    if (date && date !== 'todas') {
      list = list.filter(r => isSameDay(r.date, date));
    }
    if (classId && classId !== 'todas') {
      const normCls = classId.trim().toLowerCase();
      list = list.filter(
        r =>
          (r.classId || '').trim().toLowerCase() === normCls ||
          (r.className || '').trim().toLowerCase() === normCls
      );
    }
    return list.sort((a, b) => {
      const dateA = normalizeDateStr(a.date) || a.date || '';
      const dateB = normalizeDateStr(b.date) || b.date || '';
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      return (b.time || '').localeCompare(a.time || '');
    });
  },

  createGateRecord: (record: GateRecord, schoolId?: string): GateRecord => {
    const sId = schoolId || record.schoolId || storageService.getActiveSchoolId();
    const list = storageService.getGateRecords(undefined, undefined, sId);
    const normalizedDate = normalizeDateStr(record.date) || record.date || getLocalTodayIso();
    const newRecord: GateRecord = {
      ...record,
      id: record.id || `gate-${Date.now()}`,
      date: normalizedDate,
      schoolId: sId
    };
    const existingIdx = list.findIndex(r => r.id === newRecord.id);
    if (existingIdx >= 0) {
      list[existingIdx] = newRecord;
    } else {
      list.unshift(newRecord);
    }
    setStoredSchool('gate_records', list, sId);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveGateRecord(newRecord, sId).catch(err => console.warn('Erro ao salvar registro de portaria no Firestore:', err));

    return newRecord;
  },

  deleteGateRecord: (id: string, schoolId?: string): void => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const list = storageService.getGateRecords(undefined, undefined, sId).filter(r => r.id !== id);
    setStoredSchool('gate_records', list, sId);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteGateRecord(id).catch(err => console.warn('Erro ao deletar registro de portaria no Firestore:', err));
  },

  // === ALERTAS ===
  getAlerts: (schoolId?: string): ParentAlert[] => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const fallback = sId === DEFAULT_SCHOOL_ID ? DEFAULT_ALERTS : [];
    return getStoredSchool<ParentAlert[]>('alerts', fallback, sId);
  },

  addAlert: (alert: ParentAlert, schoolId?: string): ParentAlert => {
    const sId = schoolId || alert.schoolId || storageService.getActiveSchoolId();
    const list = storageService.getAlerts(sId);
    const newAlert = {
      ...alert,
      id: alert.id || `alt-${Date.now()}`,
      schoolId: sId
    };
    list.unshift(newAlert);
    setStoredSchool('alerts', list, sId);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveAlert(newAlert, sId).catch(err => console.warn('Erro ao salvar alerta no Firestore:', err));

    return newAlert;
  },

  updateAlertStatus: (alertId: string, status: any, notes?: string, schoolId?: string): void => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const list = storageService.getAlerts(sId);
    const alert = list.find(a => a.id === alertId);
    if (alert) {
      alert.status = status;
      if (notes) alert.guardianFeedback = notes;
      setStoredSchool('alerts', list, sId);

      // Sincroniza em nuvem no Firestore
      firestoreService.saveAlert(alert, sId).catch(err => console.warn('Erro ao atualizar alerta no Firestore:', err));
    }
  },

  deleteAlert: (alertId: string, schoolId?: string): void => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const list = storageService.getAlerts(sId).filter(a => a.id !== alertId);
    setStoredSchool('alerts', list, sId);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteAlert(alertId).catch(err => console.warn('Erro ao excluir alerta no Firestore:', err));
  },

  // === INTERVENÇÕES ===
  getInterventions: (schoolId?: string): InterventionCase[] => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const fallback = sId === DEFAULT_SCHOOL_ID ? DEFAULT_INTERVENTIONS : [];
    return getStoredSchool<InterventionCase[]>('interventions', fallback, sId);
  },

  addInterventionAction: (caseId: string, action: any, schoolId?: string): void => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const list = storageService.getInterventions(sId);
    const item = list.find(i => i.id === caseId);
    if (item) {
      const today = getLocalTodayIso();
      item.actionLog = item.actionLog || [];
      item.actionLog.push({
        id: action.id || `act-${Date.now()}`,
        date: action.date || today,
        action: action.action || action.type || 'Registro de Acompanhamento',
        author: action.author || action.responsibleParty || 'Coordenação Pedagógica / PAAC',
        notes: action.notes || action.description || '',
        result: action.result || action.outcome || '',
      });
      const nextStage = action.advanceStageTo || action.newStage;
      if (nextStage) {
        item.stage = nextStage;
        if (nextStage === 'reintegrado' || nextStage === 'encerrado') {
          item.resolvedDate = today;
        }
      }
      item.lastUpdatedAt = today;
      item.schoolId = sId;
      setStoredSchool('interventions', list, sId);

      // Sincroniza em nuvem no Firestore
      firestoreService.saveIntervention(item, sId).catch(err => console.warn('Erro ao salvar intervenção no Firestore:', err));
    }
  },

  deleteOpenInterventions: (schoolId?: string): void => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const all = storageService.getInterventions(sId);
    const toDelete = all.filter(i => i.stage !== 'reintegrado' && i.stage !== 'encerrado');
    const kept = all.filter(i => i.stage === 'reintegrado' || i.stage === 'encerrado');
    setStoredSchool('interventions', kept, sId);

    // Sincroniza exclusão dos casos abertos no Firestore
    toDelete.forEach(c => {
      firestoreService.deleteIntervention(c.id).catch(err =>
        console.warn('Erro ao excluir caso de intervenção no Firestore:', err)
      );
    });
  },

  // === INFORMAÇÕES ESCOLARES & RELATÓRIOS (Multi-Tenant) ===
  getSchoolInfo: (schoolId?: string): any => {
    const sId = schoolId || storageService.getActiveSchoolId();
    const school = storageService.getActiveSchool(sId);
    const students = storageService.getStudents(undefined, sId).filter(s => s.status !== 'transferido');
    const classes = storageService.getClasses(sId);
    const alerts = storageService.getAlerts(sId);
    const interventions = storageService.getInterventions(sId);

    return {
      schoolName: school.name,
      schoolId: school.id,
      codeCie: school.codeCie || '',
      network: school.network || '',
      city: school.city || '',
      directorName: school.directorName || '',
      lastUpdated: new Date().toISOString(),
      totalStudents: students.length,
      totalClasses: classes.length,
      activeAlertsCount: alerts.filter(a => a.status === 'enviado' || a.status === 'lido').length,
      activeCasesCount: interventions.filter(i => i.stage !== 'reintegrado' && i.stage !== 'encerrado').length
    };
  },

  getMonthlyReport: (monthIndex?: number, startDate?: string, endDate?: string): MonthlyPedagogicalReport => {
    try {
      const today = getLocalTodayIso();
      const start = startDate || today;
      const end = endDate || start;
      const students = storageService.getStudents().filter(s => s.status !== 'transferido');
      const classes = storageService.getClasses();
      const attendanceRecords = storageService.getAttendanceRecords();
      const alerts = storageService.getAlerts();
      const interventions = storageService.getInterventions();

      // Lazy import-like computation to avoid circular dependencies
      const totalPresencas = attendanceRecords.filter(r => {
        const d = normalizeDateStr(r.date);
        return d >= start && d <= end && !r.studentId?.startsWith('cls-marker-') && (r.status === 'presente' || (r.status as any) === 'atraso');
      }).length;
      const totalFaltas = attendanceRecords.filter(r => {
        const d = normalizeDateStr(r.date);
        return d >= start && d <= end && !r.studentId?.startsWith('cls-marker-') && (r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico');
      }).length;
      const totalAbsences = totalFaltas;
      const evaluated = totalPresencas + totalFaltas;
      const avgRate = evaluated > 0 ? Number(((totalPresencas / evaluated) * 100).toFixed(1)) : (students.length > 0 ? Number((students.reduce((acc, s) => acc + (s.attendanceRate || 100), 0) / students.length).toFixed(1)) : 100);

      const criticalCount = students.filter(s => s.attendanceRate < 75 || s.riskLevel === 'critico' || (s.consecutiveAbsences && s.consecutiveAbsences >= 4)).length;
      const activeInterventions = interventions.filter(i => i.stage !== 'reintegrado' && i.stage !== 'encerrado').length;
      const reintegrated = interventions.filter(i => i.stage === 'reintegrado' || i.stage === 'encerrado').length;

      const periodAlerts = alerts.filter(a => {
        const d = normalizeDateStr(a.sentAt);
        return d >= start && d <= end;
      });
      const dispatched = periodAlerts.length || alerts.length;
      const responded = (periodAlerts.length ? periodAlerts : alerts).filter(a => a.status === 'respondido' || a.guardianFeedback).length;

      const riskByClass = classes.map(c => {
        const cStudents = students.filter(s => s.classId === c.id || s.className === c.name);
        const cRecords = attendanceRecords.filter(r => {
          const d = normalizeDateStr(r.date);
          return d >= start && d <= end && (r.classId === c.id || r.className === c.name || cStudents.some(s => s.id === r.studentId));
        });
        const cStudRecs = cRecords.filter(r => !r.studentId?.startsWith('cls-marker-'));
        const cp = cStudRecs.filter(r => r.status === 'presente' || (r.status as any) === 'atraso').length;
        const cf = cStudRecs.filter(r => r.status === 'falta_injustificada' || r.status === 'falta_justificada' || r.status === 'atestado_medico').length;
        const cRate = cp + cf > 0 ? Number(((cp / (cp + cf)) * 100).toFixed(1)) : (c.attendanceRateToday || 95);
        const riskSt = cStudents.filter(s => s.riskLevel === 'alto' || s.riskLevel === 'critico' || s.attendanceRate < 80).length;
        return {
          classId: c.id,
          className: c.name,
          averageAttendance: cRate,
          riskStudents: riskSt,
          totalStudents: cStudents.length || c.totalStudents || 0
        };
      });

      return {
        month: 'Setembro',
        monthIndex: monthIndex || 9,
        year: 2026,
        totalEnrolled: students.length,
        averageAttendanceRate: avgRate,
        totalAbsences,
        studentsWithCriticalAbsence: criticalCount,
        activeSearchCasesCount: activeInterventions,
        successfulReintegrations: reintegrated,
        alertsDispatched: dispatched,
        alertsResponded: responded,
        absenceCausesDistribution: [
          { cause: 'Problemas de saúde / Atestados médicos', count: 4, percentage: 33 },
          { cause: 'Dificuldade de transporte escolar', count: 3, percentage: 25 },
          { cause: 'Trabalho infantil / Apoio familiar', count: 2, percentage: 17 },
          { cause: 'Desmotivação / Infrequência não justificada', count: 2, percentage: 17 },
          { cause: 'Questões familiares e vulnerabilidade', count: 1, percentage: 8 }
        ],
        riskByClass,
        attendanceTrend: [
          { week: 'Semana 1', rate: 91.2, absences: 28 },
          { week: 'Semana 2', rate: 89.5, absences: 34 },
          { week: 'Semana 3', rate: 86.8, absences: 42 },
          { week: 'Semana 4 (Atual)', rate: avgRate, absences: totalAbsences }
        ],
        pedagogicalInsights: [
          `Taxa de assiduidade real calculada em ${avgRate}% no período avaliado (${start} a ${end}).`,
          `${criticalCount} estudantes sob monitoramento com frequência inferior ao patamar mínimo de 75%.`,
          `${dispatched} comunicados aos responsáveis registrados no sistema, viabilizando ${reintegrated} reintegrações efetivas.`
        ]
      };
    } catch {
      const report = getStored<MonthlyPedagogicalReport>('school_monthly_report', DEFAULT_REPORT);
      return report;
    }
  },

  // === RESET TOTAL (Wipe All Data) ===
  wipeAllData: (currentUser?: any): void => {
    const sId = storageService.getActiveSchoolId();
    memorySchoolCache.clear();
    memoryGlobalCache.clear();
    purgeLegacyDuplicateStorageKeys();
    localStorage.removeItem('school_classes');
    localStorage.removeItem('school_students');
    localStorage.removeItem('school_attendance');
    localStorage.removeItem('school_gate_records');
    localStorage.removeItem('school_alerts');
    localStorage.removeItem('school_interventions');
    localStorage.removeItem('school_monthly_report');
    ['classes', 'students', 'attendance', 'gate_records', 'alerts', 'interventions', 'school_calendar', 'teacher_schedules', 'timetable_workspace'].forEach(k => {
      try {
        localStorage.removeItem(`sigaescola_${sId}_${k}`);
      } catch {}
    });

    // Keep only the master admin
    const masterAdmin: UserAccount = {
      id: currentUser?.id || 'usr-admin',
      name: currentUser?.name || 'Administrador Geral',
      username: currentUser?.username || 'admin',
      role: 'admin',
      roleLabel: 'Direção Escolar (Administrador)',
      pin: currentUser?.pin || '1234',
      createdAt: new Date().toISOString(),
      active: true
    };
    setStored('school_users', [masterAdmin]);
  }
};
