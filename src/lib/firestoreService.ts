import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocFromServer
} from 'firebase/firestore';
import { db, auth } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  School,
  UserAccount,
  SchoolClass,
  Student,
  AttendanceRecord,
  ParentAlert,
  InterventionCase,
  GateRecord,
  SchoolCalendarConfig,
  TeacherScheduleSlot,
  TimetableWorkspace
} from '../types';
import { DEFAULT_SCHOOL_ID, DEFAULT_SCHOOLS } from '../data/fallbackData';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * Remove qualquer campo com valor undefined de objetos para impedir que o Firestore rejeite a gravação.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return null as unknown as T;
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleanObj: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanObj[key] = sanitizeForFirestore(value);
      }
    }
    return cleanObj as T;
  }
  return data;
}

/**
 * Normaliza o ID de documento para o Firestore garantindo que não contenha barras ou espaços inválidos.
 */
export function sanitizeDocId(id: string): string {
  if (!id) return `doc-${Date.now()}`;
  return String(id).replace(/\//g, '_').replace(/\s+/g, '_');
}

/**
 * Normaliza datas no formato YYYY-MM-DD para comparação precisa.
 */
export function normalizeDateStr(d?: string): string {
  if (!d) return '';
  const clean = String(d).trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
    const [day, month, year] = clean.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return clean;
}

export function isSameDay(d1?: string, d2?: string): boolean {
  if (!d1 || !d2) return false;
  return normalizeDateStr(d1) === normalizeDateStr(d2);
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId || '(default)';
export const FIRESTORE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_UPGRADE_URL = `https://console.firebase.google.com/project/${FIRESTORE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;
export const FIRESTORE_PRICING_URL = 'https://firebase.google.com/pricing#cloud-firestore';

const READ_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutos de cache em memória para economizar cota de leitura
const QUOTA_COOLDOWN_MS = 60 * 1000; // Pausa leituras redundantes por 60s quando a cota diária é excedida

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const collectionCache = new Map<string, CacheEntry<any[]>>();
const docCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();
let quotaExceededUntil = 0;

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const errObj = error as any;
  const code = String(errObj?.code || '').toLowerCase();
  const msg = String(errObj?.message || error).toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota exceeded') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('free daily read units') ||
    msg.includes('429')
  );
}

function markQuotaExceededIfApplicable(error: unknown): boolean {
  if (isQuotaExceededError(error)) {
    quotaExceededUntil = Date.now() + QUOTA_COOLDOWN_MS;
    return true;
  }
  return false;
}

function isWithinQuotaCooldown(): boolean {
  return Date.now() < quotaExceededUntil;
}

function getCachedCollection<T>(key: string): T[] | null {
  const entry = collectionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > READ_CACHE_TTL_MS) {
    collectionCache.delete(key);
    return null;
  }
  return entry.data as T[];
}

function setCachedCollection<T>(key: string, data: T[]): void {
  collectionCache.set(key, { data, fetchedAt: Date.now() });
}

function invalidateCollectionCache(key: string): void {
  collectionCache.delete(key);
}

function getCachedDoc<T>(key: string): { hit: boolean; data: T | null } {
  const entry = docCache.get(key);
  if (!entry) return { hit: false, data: null };
  if (Date.now() - entry.fetchedAt > READ_CACHE_TTL_MS) {
    docCache.delete(key);
    return { hit: false, data: null };
  }
  return { hit: true, data: entry.data as T | null };
}

function setCachedDoc<T>(key: string, data: T | null): void {
  docCache.set(key, { data, fetchedAt: Date.now() });
}

function invalidateDocCache(key: string): void {
  docCache.delete(key);
}

async function runDeduplicated<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fetcher().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  markQuotaExceededIfApplicable(error);
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const firestoreService = {
  clearReadCache(): void {
    collectionCache.clear();
    docCache.clear();
    quotaExceededUntil = 0;
  },

  isQuotaCurrentlyExceeded(): boolean {
    return isWithinQuotaCooldown();
  },

  // === SCHOOLS (Unidades Escolares cadastradas no sistema SaaS) ===
  async getSchools(): Promise<School[]> {
    const cached = getCachedCollection<School>('schools');
    if (cached) return [...cached];
    if (isWithinQuotaCooldown()) return DEFAULT_SCHOOLS;

    return runDeduplicated('col:schools', async () => {
      try {
        const snap = await getDocs(collection(db, 'schools'));
        const list: School[] = [];
        snap.forEach(d => {
          if (d.id !== 'emeb-cecilia-meireles') {
            list.push({ id: d.id, ...d.data() } as School);
          }
        });
        if (list.length === 0) {
          for (const s of DEFAULT_SCHOOLS) {
            const cleanId = sanitizeDocId(s.id);
            await setDoc(doc(db, 'schools', cleanId), sanitizeForFirestore({ ...s, id: cleanId }), { merge: true });
          }
          setCachedCollection('schools', DEFAULT_SCHOOLS);
          return DEFAULT_SCHOOLS;
        }
        const sorted = list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        setCachedCollection('schools', sorted);
        return sorted;
      } catch (e) {
        markQuotaExceededIfApplicable(e);
        console.warn('Erro ao buscar escolas do Firestore:', e);
        return DEFAULT_SCHOOLS;
      }
    });
  },

  async saveSchool(school: School): Promise<void> {
    const cleanId = sanitizeDocId(school.id);
    const path = `schools/${cleanId}`;
    try {
      const cleanData = sanitizeForFirestore({ ...school, id: cleanId });
      await setDoc(doc(db, 'schools', cleanId), cleanData, { merge: true });
      invalidateCollectionCache('schools');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteSchool(schoolId: string): Promise<void> {
    const cleanId = sanitizeDocId(schoolId);
    const path = `schools/${cleanId}`;
    try {
      await deleteDoc(doc(db, 'schools', cleanId));
      invalidateCollectionCache('schools');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === USERS ===
  async getUsers(schoolId?: string): Promise<UserAccount[]> {
    const loadAll = async (): Promise<UserAccount[]> => {
      const cached = getCachedCollection<UserAccount>('users');
      if (cached) return cached;
      if (isWithinQuotaCooldown()) return [];
      return runDeduplicated('col:users', async () => {
        try {
          const snap = await getDocs(collection(db, 'users'));
          const list: UserAccount[] = [];
          snap.forEach(d => {
            if (!d.id.includes('cecilia') && !d.id.includes('usr-cec') && d.id !== 'usr-admin-arlindo') {
              list.push({ id: d.id, ...d.data() } as UserAccount);
            }
          });
          setCachedCollection('users', list);
          return list;
        } catch (e) {
          markQuotaExceededIfApplicable(e);
          console.warn('Erro ao buscar usuários do Firestore:', e);
          return [];
        }
      });
    };

    const list = await loadAll();
    const filtered = schoolId
      ? list.filter(u =>
          !u.isUniversal &&
          u.role !== 'super_admin' &&
          u.id !== 'usr-master' &&
          (u.schoolId || DEFAULT_SCHOOL_ID) === schoolId
        )
      : [...list];
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  async saveUser(user: UserAccount, schoolId?: string): Promise<void> {
    const path = `users/${user.id}`;
    try {
      const withSchool = {
        ...user,
        schoolId: user.schoolId || schoolId || undefined
      };
      await setDoc(doc(db, 'users', user.id), sanitizeForFirestore(withSchool), { merge: true });
      invalidateCollectionCache('users');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteUser(userId: string): Promise<void> {
    const path = `users/${userId}`;
    try {
      await deleteDoc(doc(db, 'users', userId));
      invalidateCollectionCache('users');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === CLASSES ===
  async getClasses(schoolId?: string): Promise<SchoolClass[]> {
    const loadAll = async (): Promise<SchoolClass[]> => {
      const cached = getCachedCollection<SchoolClass>('classes');
      if (cached) return cached;
      if (isWithinQuotaCooldown()) return [];
      return runDeduplicated('col:classes', async () => {
        try {
          const snap = await getDocs(collection(db, 'classes'));
          const list: SchoolClass[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as SchoolClass);
          });
          setCachedCollection('classes', list);
          return list;
        } catch (e) {
          markQuotaExceededIfApplicable(e);
          console.warn('Erro ao buscar turmas do Firestore:', e);
          return [];
        }
      });
    };

    const list = await loadAll();
    const filtered = schoolId
      ? list.filter(c => (c.schoolId || DEFAULT_SCHOOL_ID) === schoolId)
      : [...list];
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  async saveClass(cls: SchoolClass, schoolId?: string): Promise<void> {
    const path = `classes/${cls.id}`;
    try {
      const withSchool = {
        ...cls,
        schoolId: cls.schoolId || schoolId || DEFAULT_SCHOOL_ID
      };
      await setDoc(doc(db, 'classes', cls.id), sanitizeForFirestore(withSchool), { merge: true });
      invalidateCollectionCache('classes');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteClass(clsId: string): Promise<void> {
    const path = `classes/${clsId}`;
    try {
      await deleteDoc(doc(db, 'classes', clsId));
      invalidateCollectionCache('classes');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === STUDENTS ===
  async getStudents(schoolId?: string): Promise<Student[]> {
    const loadAll = async (): Promise<Student[]> => {
      const cached = getCachedCollection<Student>('students');
      if (cached) return cached;
      if (isWithinQuotaCooldown()) return [];
      return runDeduplicated('col:students', async () => {
        try {
          const snap = await getDocs(collection(db, 'students'));
          const list: Student[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as Student);
          });
          setCachedCollection('students', list);
          return list;
        } catch (e) {
          markQuotaExceededIfApplicable(e);
          console.warn('Erro ao buscar estudantes do Firestore:', e);
          return [];
        }
      });
    };

    const list = await loadAll();
    const filtered = schoolId
      ? list.filter(s => (s.schoolId || DEFAULT_SCHOOL_ID) === schoolId)
      : [...list];
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  async saveStudent(student: Student, schoolId?: string): Promise<void> {
    const cleanId = sanitizeDocId(student.id);
    const path = `students/${cleanId}`;
    try {
      const cleanData = sanitizeForFirestore({
        ...student,
        id: cleanId,
        schoolId: student.schoolId || schoolId || DEFAULT_SCHOOL_ID
      });
      await setDoc(doc(db, 'students', cleanId), cleanData, { merge: true });
      invalidateCollectionCache('students');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteStudent(studentId: string): Promise<void> {
    const cleanId = sanitizeDocId(studentId);
    const path = `students/${cleanId}`;
    try {
      await deleteDoc(doc(db, 'students', cleanId));
      invalidateCollectionCache('students');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  async batchSaveStudents(students: Student[], schoolId?: string): Promise<void> {
    if (!students || students.length === 0) return;
    try {
      const chunkSize = 450;
      for (let i = 0; i < students.length; i += chunkSize) {
        const chunk = students.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const s of chunk) {
          const cleanId = sanitizeDocId(s.id);
          const cleanData = sanitizeForFirestore({
            ...s,
            id: cleanId,
            schoolId: s.schoolId || schoolId || DEFAULT_SCHOOL_ID
          });
          batch.set(doc(db, 'students', cleanId), cleanData, { merge: true });
        }
        await batch.commit();
      }
      invalidateCollectionCache('students');
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.error('Erro ao salvar lote de estudantes no Firestore:', e);
    }
  },

  // === ATTENDANCE RECORDS ===
  async getAttendanceRecords(date?: string, schoolId?: string): Promise<AttendanceRecord[]> {
    const loadAll = async (): Promise<AttendanceRecord[]> => {
      const cached = getCachedCollection<AttendanceRecord>('attendance_records');
      if (cached) return cached;
      if (isWithinQuotaCooldown()) return [];
      return runDeduplicated('col:attendance_records', async () => {
        try {
          const snap = await getDocs(collection(db, 'attendance_records'));
          const list: AttendanceRecord[] = [];
          snap.forEach(d => {
            const raw = d.data() as AttendanceRecord;
            list.push({
              id: d.id,
              ...raw,
              date: normalizeDateStr(raw.date) || raw.date,
            });
          });
          setCachedCollection('attendance_records', list);
          return list;
        } catch (e) {
          markQuotaExceededIfApplicable(e);
          console.warn('Erro ao buscar chamadas do Firestore:', e);
          return [];
        }
      });
    };

    const list = await loadAll();
    let filtered = schoolId
      ? list.filter(r => (r.schoolId || DEFAULT_SCHOOL_ID) === schoolId)
      : [...list];
    if (date) {
      filtered = filtered.filter(r => isSameDay(r.date, date));
    }
    return filtered;
  },

  async batchSaveAttendance(records: AttendanceRecord[], schoolId?: string): Promise<void> {
    if (!records || records.length === 0) return;
    try {
      const chunkSize = 450;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const r of chunk) {
          const cleanId = sanitizeDocId(r.id);
          const cleanRecord = sanitizeForFirestore({
            ...r,
            id: cleanId,
            date: normalizeDateStr(r.date) || r.date,
            schoolId: r.schoolId || schoolId || DEFAULT_SCHOOL_ID
          });
          batch.set(doc(db, 'attendance_records', cleanId), cleanRecord, { merge: true });
        }
        await batch.commit();
      }
      invalidateCollectionCache('attendance_records');
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.error('Erro ao salvar registros de chamada no Firestore:', e);
    }
  },

  async deleteAttendanceByDate(dateStr: string, classId?: string, schoolId?: string): Promise<number> {
    if (!dateStr) return 0;
    try {
      const snap = await getDocs(collection(db, 'attendance_records'));
      const toDelete: string[] = [];
      const cleanDate = normalizeDateStr(dateStr);
      const cleanClass = classId ? classId.trim().toLowerCase() : null;

      snap.forEach(d => {
        const data = d.data() as AttendanceRecord;
        // Isolamento multi-tenant: não apaga registros de outras escolas
        if (schoolId && (data.schoolId || DEFAULT_SCHOOL_ID) !== schoolId) {
          return;
        }
        const recordDate = normalizeDateStr(data.date) || data.date;
        const idMatchesDate = d.id.includes(cleanDate) || d.id.includes(dateStr);
        const dateMatches = isSameDay(recordDate, dateStr) || idMatchesDate;

        if (dateMatches) {
          if (!cleanClass) {
            toDelete.push(d.id);
          } else {
            const rClassId = (data.classId || '').trim().toLowerCase();
            const rClassName = (data.className || '').trim().toLowerCase();
            const normRId = rClassId.replace(/[^a-z0-9]/gi, '');
            const normRName = rClassName.replace(/[^a-z0-9]/gi, '');
            const normC = cleanClass.replace(/[^a-z0-9]/gi, '');
            const isMarkerForClass = data.studentId === `cls-marker-${classId}` || (normC && data.studentId.toLowerCase() === `cls-marker-${normC}`);
            const isPrefixForClass = d.id.startsWith(`att-cls-${classId}-`) || (normC && d.id.toLowerCase().startsWith(`att-cls-${normC}-`));
            
            if (
              rClassId === cleanClass ||
              rClassName === cleanClass ||
              (normC && (normRId === normC || normRName === normC)) ||
              isMarkerForClass ||
              isPrefixForClass
            ) {
              toDelete.push(d.id);
            }
          }
        }
      });

      const chunkSize = 450;
      for (let i = 0; i < toDelete.length; i += chunkSize) {
        const chunk = toDelete.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const id of chunk) {
          batch.delete(doc(db, 'attendance_records', id));
        }
        await batch.commit();
      }
      invalidateCollectionCache('attendance_records');
      return toDelete.length;
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.error('Erro ao excluir registros de chamada do Firestore por data:', e);
      return 0;
    }
  },

  // === ALERTS ===
  async getAlerts(schoolId?: string): Promise<ParentAlert[]> {
    const loadAll = async (): Promise<ParentAlert[]> => {
      const cached = getCachedCollection<ParentAlert>('alerts');
      if (cached) return cached;
      if (isWithinQuotaCooldown()) return [];
      return runDeduplicated('col:alerts', async () => {
        try {
          const snap = await getDocs(collection(db, 'alerts'));
          const list: ParentAlert[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as ParentAlert);
          });
          setCachedCollection('alerts', list);
          return list;
        } catch (e) {
          markQuotaExceededIfApplicable(e);
          console.warn('Erro ao buscar alertas do Firestore:', e);
          return [];
        }
      });
    };

    const list = await loadAll();
    const filtered = schoolId
      ? list.filter(a => (a.schoolId || DEFAULT_SCHOOL_ID) === schoolId)
      : [...list];
    return filtered.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''));
  },

  async saveAlert(alert: ParentAlert, schoolId?: string): Promise<void> {
    const path = `alerts/${alert.id}`;
    try {
      const withSchool = {
        ...alert,
        schoolId: alert.schoolId || schoolId || DEFAULT_SCHOOL_ID
      };
      await setDoc(doc(db, 'alerts', alert.id), sanitizeForFirestore(withSchool), { merge: true });
      invalidateCollectionCache('alerts');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteAlert(alertId: string): Promise<void> {
    const path = `alerts/${alertId}`;
    try {
      await deleteDoc(doc(db, 'alerts', alertId));
      invalidateCollectionCache('alerts');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === INTERVENTIONS ===
  async getInterventions(schoolId?: string): Promise<InterventionCase[]> {
    const loadAll = async (): Promise<InterventionCase[]> => {
      const cached = getCachedCollection<InterventionCase>('interventions');
      if (cached) return cached;
      if (isWithinQuotaCooldown()) return [];
      return runDeduplicated('col:interventions', async () => {
        try {
          const snap = await getDocs(collection(db, 'interventions'));
          const list: InterventionCase[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as InterventionCase);
          });
          setCachedCollection('interventions', list);
          return list;
        } catch (e) {
          markQuotaExceededIfApplicable(e);
          console.warn('Erro ao buscar intervenções do Firestore:', e);
          return [];
        }
      });
    };

    const list = await loadAll();
    return schoolId
      ? list.filter(i => (i.schoolId || DEFAULT_SCHOOL_ID) === schoolId)
      : [...list];
  },

  async saveIntervention(intervention: InterventionCase, schoolId?: string): Promise<void> {
    const path = `interventions/${intervention.id}`;
    try {
      const withSchool = {
        ...intervention,
        schoolId: intervention.schoolId || schoolId || DEFAULT_SCHOOL_ID
      };
      await setDoc(doc(db, 'interventions', intervention.id), sanitizeForFirestore(withSchool), { merge: true });
      invalidateCollectionCache('interventions');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteIntervention(id: string): Promise<void> {
    const path = `interventions/${id}`;
    try {
      await deleteDoc(doc(db, 'interventions', id));
      invalidateCollectionCache('interventions');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === GATE RECORDS ===
  async getGateRecords(date?: string, schoolId?: string): Promise<GateRecord[]> {
    const loadAll = async (): Promise<GateRecord[]> => {
      const cached = getCachedCollection<GateRecord>('gate_records');
      if (cached) return cached;
      if (isWithinQuotaCooldown()) return [];
      return runDeduplicated('col:gate_records', async () => {
        try {
          const snap = await getDocs(collection(db, 'gate_records'));
          const list: GateRecord[] = [];
          snap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as GateRecord);
          });
          setCachedCollection('gate_records', list);
          return list;
        } catch (e) {
          markQuotaExceededIfApplicable(e);
          console.warn('Erro ao buscar registros de portaria do Firestore:', e);
          return [];
        }
      });
    };

    const list = await loadAll();
    let filtered = schoolId
      ? list.filter(g => (g.schoolId || DEFAULT_SCHOOL_ID) === schoolId)
      : [...list];
    if (date) {
      filtered = filtered.filter(g => isSameDay(g.date, date));
    }
    return filtered.sort((a, b) => {
      const dateA = normalizeDateStr(a.date) || a.date || '';
      const dateB = normalizeDateStr(b.date) || b.date || '';
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      return (b.time || '').localeCompare(a.time || '');
    });
  },

  async saveGateRecord(record: GateRecord, schoolId?: string): Promise<void> {
    const path = `gate_records/${record.id}`;
    try {
      const withSchool = {
        ...record,
        schoolId: record.schoolId || schoolId || DEFAULT_SCHOOL_ID
      };
      await setDoc(doc(db, 'gate_records', record.id), sanitizeForFirestore(withSchool), { merge: true });
      invalidateCollectionCache('gate_records');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteGateRecord(id: string): Promise<void> {
    const path = `gate_records/${id}`;
    try {
      await deleteDoc(doc(db, 'gate_records', id));
      invalidateCollectionCache('gate_records');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === OCORRÊNCIAS & MEDIAÇÃO (Nuvem compartilhada e isolada por escola) ===
  async getOcorrencias(schoolId?: string): Promise<any | null> {
    const docId = schoolId && schoolId !== DEFAULT_SCHOOL_ID ? `ocorrencias_${sanitizeDocId(schoolId)}` : 'ocorrencias';
    const cacheKey = `system_data/${docId}`;
    const cached = getCachedDoc<any>(cacheKey);
    if (cached.hit) return cached.data;
    if (isWithinQuotaCooldown()) return null;

    return runDeduplicated(`doc:${cacheKey}`, async () => {
      try {
        const snap = await getDoc(doc(db, 'system_data', docId));
        if (snap.exists()) {
          const data = snap.data();
          setCachedDoc(cacheKey, data);
          return data;
        }
        setCachedDoc(cacheKey, null);
        return null;
      } catch (e) {
        markQuotaExceededIfApplicable(e);
        console.warn(`Erro ao carregar ocorrências (${docId}) do Firestore:`, e);
        return null;
      }
    });
  },

  async saveOcorrencias(data: any, schoolId?: string): Promise<void> {
    const docId = schoolId && schoolId !== DEFAULT_SCHOOL_ID ? `ocorrencias_${sanitizeDocId(schoolId)}` : 'ocorrencias';
    const cacheKey = `system_data/${docId}`;
    try {
      const payload = sanitizeForFirestore({
        ...data,
        schoolId: schoolId || DEFAULT_SCHOOL_ID,
        updatedAt: new Date().toISOString()
      });
      await setDoc(doc(db, 'system_data', docId), payload, { merge: true });
      setCachedDoc(cacheKey, payload);
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.warn(`Erro ao salvar ocorrências (${docId}) no Firestore:`, e);
    }
  },

  // === TABLETS & AGENDAMENTOS (Nuvem compartilhada e isolada por escola) ===
  async getTablets(schoolId?: string): Promise<any | null> {
    const docId = schoolId && schoolId !== DEFAULT_SCHOOL_ID ? `tablets_${sanitizeDocId(schoolId)}` : 'tablets';
    const cacheKey = `system_data/${docId}`;
    const cached = getCachedDoc<any>(cacheKey);
    if (cached.hit) return cached.data;
    if (isWithinQuotaCooldown()) return null;

    return runDeduplicated(`doc:${cacheKey}`, async () => {
      try {
        const snap = await getDoc(doc(db, 'system_data', docId));
        if (snap.exists()) {
          const data = snap.data();
          setCachedDoc(cacheKey, data);
          return data;
        }
        setCachedDoc(cacheKey, null);
        return null;
      } catch (e) {
        markQuotaExceededIfApplicable(e);
        console.warn(`Erro ao carregar tablets (${docId}) do Firestore:`, e);
        return null;
      }
    });
  },

  async saveTablets(data: any, schoolId?: string): Promise<void> {
    const docId = schoolId && schoolId !== DEFAULT_SCHOOL_ID ? `tablets_${sanitizeDocId(schoolId)}` : 'tablets';
    const cacheKey = `system_data/${docId}`;
    try {
      const payload = sanitizeForFirestore({
        ...data,
        schoolId: schoolId || DEFAULT_SCHOOL_ID,
        updatedAt: new Date().toISOString()
      });
      await setDoc(doc(db, 'system_data', docId), payload, { merge: true });
      setCachedDoc(cacheKey, payload);
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.warn(`Erro ao salvar tablets (${docId}) no Firestore:`, e);
    }
  },

  // === CALENDÁRIO ESCOLAR LETIVO (Nuvem isolada por escola) ===
  async getSchoolCalendar(schoolId?: string): Promise<SchoolCalendarConfig | null> {
    const docId = schoolId && schoolId !== DEFAULT_SCHOOL_ID ? `calendario_${sanitizeDocId(schoolId)}` : 'calendario';
    const cacheKey = `system_data/${docId}`;
    const cached = getCachedDoc<SchoolCalendarConfig>(cacheKey);
    if (cached.hit) return cached.data;
    if (isWithinQuotaCooldown()) return null;

    return runDeduplicated(`doc:${cacheKey}`, async () => {
      try {
        const snap = await getDoc(doc(db, 'system_data', docId));
        if (snap.exists()) {
          const data = snap.data() as SchoolCalendarConfig;
          setCachedDoc(cacheKey, data);
          return data;
        }
        setCachedDoc(cacheKey, null);
        return null;
      } catch (e) {
        markQuotaExceededIfApplicable(e);
        console.warn(`Erro ao carregar calendário escolar (${docId}) do Firestore:`, e);
        return null;
      }
    });
  },

  async saveSchoolCalendar(calendar: SchoolCalendarConfig, schoolId?: string): Promise<void> {
    const sId = schoolId || calendar.schoolId || DEFAULT_SCHOOL_ID;
    const docId = sId && sId !== DEFAULT_SCHOOL_ID ? `calendario_${sanitizeDocId(sId)}` : 'calendario';
    const cacheKey = `system_data/${docId}`;
    try {
      const payload = sanitizeForFirestore({
        ...calendar,
        schoolId: sId,
        updatedAt: new Date().toISOString()
      });
      await setDoc(doc(db, 'system_data', docId), payload, { merge: true });
      setCachedDoc(cacheKey, payload);
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.warn(`Erro ao salvar calendário escolar (${docId}) no Firestore:`, e);
    }
  },

  // === GRADE HORÁRIA DOCENTE (Preparado para sincronia com módulo de Grade Horária) ===
  async getTeacherSchedules(schoolId?: string): Promise<TeacherScheduleSlot[]> {
    const docId = schoolId && schoolId !== DEFAULT_SCHOOL_ID ? `grade_docente_${sanitizeDocId(schoolId)}` : 'grade_docente';
    const cacheKey = `system_data/${docId}`;
    const cached = getCachedDoc<TeacherScheduleSlot[]>(cacheKey);
    if (cached.hit) return cached.data || [];
    if (isWithinQuotaCooldown()) return [];

    return runDeduplicated(`doc:${cacheKey}`, async () => {
      try {
        const snap = await getDoc(doc(db, 'system_data', docId));
        if (snap.exists()) {
          const data = snap.data();
          const slots = Array.isArray(data?.slots) ? data.slots : [];
          setCachedDoc(cacheKey, slots);
          return slots;
        }
        setCachedDoc(cacheKey, []);
        return [];
      } catch (e) {
        markQuotaExceededIfApplicable(e);
        console.warn(`Erro ao carregar grade docente (${docId}) do Firestore:`, e);
        return [];
      }
    });
  },

  async saveTeacherSchedules(slots: TeacherScheduleSlot[], schoolId?: string): Promise<void> {
    const sId = schoolId || DEFAULT_SCHOOL_ID;
    const docId = sId && sId !== DEFAULT_SCHOOL_ID ? `grade_docente_${sanitizeDocId(sId)}` : 'grade_docente';
    const cacheKey = `system_data/${docId}`;
    try {
      await setDoc(doc(db, 'system_data', docId), sanitizeForFirestore({
        slots,
        schoolId: sId,
        updatedAt: new Date().toISOString()
      }), { merge: true });
      setCachedDoc(cacheKey, slots);
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.warn(`Erro ao salvar grade docente (${docId}) no Firestore:`, e);
    }
  },

  // === WORKSPACE DE GRADE CURRICULAR & GERADOR DE HORÁRIOS (Critérios Anuais + Matrizes + Grade Completa) ===
  async getTimetableWorkspace(schoolId?: string): Promise<TimetableWorkspace | null> {
    const sId = schoolId || DEFAULT_SCHOOL_ID;
    const docId = sId && sId !== DEFAULT_SCHOOL_ID ? `timetable_workspace_${sanitizeDocId(sId)}` : 'timetable_workspace';
    const cacheKey = `system_data/${docId}`;
    const cached = getCachedDoc<TimetableWorkspace>(cacheKey);
    if (cached.hit) return cached.data;
    if (isWithinQuotaCooldown()) return null;

    return runDeduplicated(`doc:${cacheKey}`, async () => {
      try {
        const snap = await getDoc(doc(db, 'system_data', docId));
        if (snap.exists()) {
          const data = snap.data() as TimetableWorkspace;
          setCachedDoc(cacheKey, data);
          return data;
        }
        setCachedDoc(cacheKey, null);
        return null;
      } catch (e) {
        markQuotaExceededIfApplicable(e);
        console.warn(`Erro ao carregar workspace de horários (${docId}) do Firestore:`, e);
        return null;
      }
    });
  },

  async saveTimetableWorkspace(workspace: TimetableWorkspace, schoolId?: string): Promise<void> {
    const sId = schoolId || workspace.schoolId || DEFAULT_SCHOOL_ID;
    const docId = sId && sId !== DEFAULT_SCHOOL_ID ? `timetable_workspace_${sanitizeDocId(sId)}` : 'timetable_workspace';
    const cacheKey = `system_data/${docId}`;
    try {
      const payload = sanitizeForFirestore({
        ...workspace,
        schoolId: sId,
        updatedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'system_data', docId), payload, { merge: true });
      setCachedDoc(cacheKey, payload);
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.warn(`Erro ao salvar workspace de horários (${docId}) no Firestore:`, e);
    }
  },

  // === TESTE DE CONEXÃO DIRETA COM O SERVIDOR (Validação de Acesso Multi-Navegador) ===
  async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string; quotaExceeded?: boolean; databaseId: string }> {
    const start = performance.now();
    try {
      await getDocFromServer(doc(db, 'system_data', 'ocorrencias'));
      quotaExceededUntil = 0;
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: true,
        latencyMs,
        quotaExceeded: false,
        databaseId: FIRESTORE_DATABASE_ID
      };
    } catch (error: any) {
      const latencyMs = Math.round(performance.now() - start);
      const quotaExceeded = markQuotaExceededIfApplicable(error);
      console.warn('Teste de conexão com Firestore falhou ou offline:', error);
      return {
        success: false,
        latencyMs,
        quotaExceeded,
        error: quotaExceeded
          ? 'Cota diária gratuita de leituras do Firebase Firestore excedida (HTTP 429 RESOURCE_EXHAUSTED). A cota gratuita é renovada automaticamente amanhã, ou você pode fazer upgrade imediato do banco de dados no Console do Firebase.'
          : (error?.message || String(error)),
        databaseId: FIRESTORE_DATABASE_ID
      };
    }
  },

  // === CARREGAMENTO TOTAL DIRETO DO FIREBASE (Ao efetuar Login, Inicializar ou Alternar Escola) ===
  async getAllDataDirectly(schoolId?: string, forceRefresh = false): Promise<{
    success: boolean;
    quotaExceeded?: boolean;
    error?: string;
    schools: School[];
    classes: SchoolClass[];
    students: Student[];
    users: UserAccount[];
    alerts: ParentAlert[];
    attendance: AttendanceRecord[];
    interventions: InterventionCase[];
    gate: GateRecord[];
    ocorrencias: any | null;
    tablets: any | null;
    calendar: SchoolCalendarConfig | null;
    teacherSchedules: TeacherScheduleSlot[];
    timetableWorkspace: TimetableWorkspace | null;
    latencyMs: number;
    source: 'firebase_direct';
  }> {
    const start = performance.now();
    const targetSchoolId = schoolId || DEFAULT_SCHOOL_ID;
    if (forceRefresh) {
      firestoreService.clearReadCache();
    } else if (isWithinQuotaCooldown()) {
      return {
        success: false,
        quotaExceeded: true,
        error: 'Cota diária gratuita de leituras do Firestore excedida.',
        schools: DEFAULT_SCHOOLS,
        classes: [],
        students: [],
        users: [],
        alerts: [],
        attendance: [],
        interventions: [],
        gate: [],
        ocorrencias: null,
        tablets: null,
        calendar: null,
        teacherSchedules: [],
        timetableWorkspace: null,
        latencyMs: 0,
        source: 'firebase_direct'
      };
    }
    try {
      // Validação rápida de conectividade e cota antes de disparar leituras paralelas
      await getDocFromServer(doc(db, 'test', 'connection')).catch((err: any) => {
        if (isQuotaExceededError(err)) {
          markQuotaExceededIfApplicable(err);
          throw err;
        }
        const msg = String(err?.message || '').toLowerCase();
        if (
          msg.includes('offline') ||
          msg.includes('did not respond') ||
          msg.includes('unavailable') ||
          msg.includes('failed to get document from server')
        ) {
          throw err;
        }
        // Erros como permission-denied ou not-found indicam que o backend respondeu
      });

      const [
        schools,
        classes,
        students,
        users,
        alerts,
        attendance,
        interventions,
        gate,
        ocorrencias,
        tablets,
        calendar,
        teacherSchedules,
        timetableWorkspace
      ] = await Promise.all([
        firestoreService.getSchools(),
        firestoreService.getClasses(targetSchoolId),
        firestoreService.getStudents(targetSchoolId),
        firestoreService.getUsers(),
        firestoreService.getAlerts(targetSchoolId),
        firestoreService.getAttendanceRecords(undefined, targetSchoolId),
        firestoreService.getInterventions(targetSchoolId),
        firestoreService.getGateRecords(undefined, targetSchoolId),
        firestoreService.getOcorrencias(targetSchoolId),
        firestoreService.getTablets(targetSchoolId),
        firestoreService.getSchoolCalendar(targetSchoolId),
        firestoreService.getTeacherSchedules(targetSchoolId),
        firestoreService.getTimetableWorkspace(targetSchoolId)
      ]);

      const latencyMs = Math.round(performance.now() - start);
      if (isWithinQuotaCooldown()) {
        return {
          success: false,
          quotaExceeded: true,
          error: 'Cota diária gratuita de leituras do Firestore excedida.',
          schools: DEFAULT_SCHOOLS,
          classes: [],
          students: [],
          users: [],
          alerts: [],
          attendance: [],
          interventions: [],
          gate: [],
          ocorrencias: null,
          tablets: null,
          calendar: null,
          teacherSchedules: [],
          timetableWorkspace: null,
          latencyMs,
          source: 'firebase_direct'
        };
      }

      return {
        success: true,
        quotaExceeded: false,
        schools,
        classes,
        students,
        users,
        alerts,
        attendance,
        interventions,
        gate,
        ocorrencias,
        tablets,
        calendar,
        teacherSchedules,
        timetableWorkspace,
        latencyMs,
        source: 'firebase_direct'
      };
    } catch (err: any) {
      const quotaExceeded = markQuotaExceededIfApplicable(err);
      if (quotaExceeded) {
        console.warn('Cota diária gratuita do Firebase Firestore excedida; operando temporariamente com cache local.');
      } else {
        console.error('Falha no carregamento direto do Firebase:', err);
      }
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: false,
        quotaExceeded,
        error: err?.message || String(err),
        schools: DEFAULT_SCHOOLS,
        classes: [],
        students: [],
        users: [],
        alerts: [],
        attendance: [],
        interventions: [],
        gate: [],
        ocorrencias: null,
        tablets: null,
        calendar: null,
        teacherSchedules: [],
        timetableWorkspace: null,
        latencyMs,
        source: 'firebase_direct'
      };
    }
  }
};


