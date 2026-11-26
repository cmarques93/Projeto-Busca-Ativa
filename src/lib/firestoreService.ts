import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocFromServer,
  query,
  where,
  onSnapshot,
  Unsubscribe,
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
 * Normaliza o ID de documento para o Firestore garantindo que não contenha barras, espaços ou caracteres inválidos.
 */
export function sanitizeDocId(id: string): string {
  if (!id) return `doc-${Date.now()}`;
  const cleaned = String(id)
    .trim()
    .replace(/[#/?[\]*\\]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return `doc-${Date.now()}`;
  }
  return cleaned;
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

/**
 * Deduplica registros de frequência por (studentId, date), preservando SEMPRE
 * o lançamento mais recente (recordedAt / createdAt) e priorizando registros
 * individuais sobre marcadores genéricos de turma.
 */
export function deduplicateAttendanceRecords(records: AttendanceRecord[]): AttendanceRecord[] {
  if (!Array.isArray(records) || records.length === 0) return [];
  const byKey = new Map<string, AttendanceRecord>();

  const getRecTimestamp = (r: AttendanceRecord): number => {
    const raw = r.recordedAt || r.createdAt || '';
    if (raw) {
      const parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) return parsed;
    }
    const idMatch = typeof r.id === 'string' ? r.id.match(/att-(\d{12,14})-/) : null;
    if (idMatch) {
      const n = Number(idMatch[1]);
      if (!Number.isNaN(n)) return n;
    }
    return 0;
  };

  for (const r of records) {
    if (!r || !r.studentId) continue;
    const normDate = normalizeDateStr(r.date) || r.date || '';
    const normalizedRec: AttendanceRecord = normDate && r.date !== normDate ? { ...r, date: normDate } : r;
    const key = `${normalizedRec.studentId}__${normDate}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalizedRec);
      continue;
    }
    const newTs = getRecTimestamp(normalizedRec);
    const oldTs = getRecTimestamp(existing);
    if (newTs >= oldTs) {
      byKey.set(key, normalizedRec);
    }
  }

  return Array.from(byKey.values());
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
const migratedSchoolsOcorrencias = new Set<string>();
const migratedSchoolsTablets = new Set<string>();
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

function invalidateCollectionCache(prefix: string): void {
  for (const key of Array.from(collectionCache.keys())) {
    if (key === prefix || key.startsWith(`${prefix}:`)) {
      collectionCache.delete(key);
    }
  }
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

function invalidateDocCache(prefix: string): void {
  for (const key of Array.from(docCache.keys())) {
    if (key === prefix || key.startsWith(`${prefix}:`)) {
      docCache.delete(key);
    }
  }
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

const LEGACY_SCHOOLID_BACKFILL_VERSION = 'v3';
const backfilledCollectionsInSession = new Set<string>();

function isLegacySchoolIdBackfillDone(colName: string): boolean {
  if (backfilledCollectionsInSession.has(colName)) return true;
  try {
    return localStorage.getItem(`sigaescola_schoolid_backfill_${LEGACY_SCHOOLID_BACKFILL_VERSION}_${colName}`) === 'done';
  } catch {
    return false;
  }
}

function markLegacySchoolIdBackfillDone(colName: string): void {
  backfilledCollectionsInSession.add(colName);
  try {
    localStorage.setItem(`sigaescola_schoolid_backfill_${LEGACY_SCHOOLID_BACKFILL_VERSION}_${colName}`, 'done');
  } catch {}
}

/**
 * Helper genérico de consulta isolada por escola (Multi-Tenant Server-Side Query).
 * Usa `where('schoolId', '==', schoolId)` para nunca trafegar dados de outras escolas.
 * Para a escola legada padrão (DEFAULT_SCHOOL_ID), executa uma única varredura retroativa por coleção
 * para resgatar e carimbar documentos antigos criados sem o campo `schoolId`, mesmo que alguns docs
 * já possuam `schoolId` (evitando ocultar turmas/alunos legados).
 */
async function querySchoolScopedCollection<T extends { id: string; schoolId?: string }>(
  colName: string,
  schoolId?: string,
  mapDoc?: (id: string, raw: any) => T
): Promise<T[]> {
  const cacheKey = schoolId ? `${colName}:${schoolId}` : `${colName}:__all__`;
  const cached = getCachedCollection<T>(cacheKey);
  if (cached) return [...cached];
  if (isWithinQuotaCooldown()) return [];

  return runDeduplicated(`col:${cacheKey}`, async () => {
    try {
      const colRef = collection(db, colName);
      const runLegacyScan = async (): Promise<T[]> => {
        const legacySnap = await getDocs(colRef);
        const list: T[] = [];
        const toBackfill: { id: string }[] = [];

        legacySnap.forEach(d => {
          const raw = d.data() as any;
          const rawSchoolId = typeof raw?.schoolId === 'string' ? raw.schoolId.trim() : '';
          const isUniversalMasterUser =
            colName === 'users' &&
            (d.id === 'usr-master' || raw?.role === 'super_admin' || raw?.isUniversal === true);

          if (isUniversalMasterUser) {
            return;
          }

          if (!rawSchoolId || rawSchoolId === DEFAULT_SCHOOL_ID) {
            const mapped = mapDoc
              ? mapDoc(d.id, { ...raw, schoolId: DEFAULT_SCHOOL_ID })
              : ({ id: d.id, ...raw, schoolId: DEFAULT_SCHOOL_ID } as T);
            list.push(mapped);
            if (!rawSchoolId) {
              toBackfill.push({ id: d.id });
            }
          }
        });

        if (list.length > 0 && toBackfill.length === 0) {
          markLegacySchoolIdBackfillDone(colName);
        } else if (toBackfill.length > 0) {
          // Faz backfill permanente do schoolId nos documentos legados em segundo plano
          (async () => {
            let failedCount = 0;
            const chunkSize = 400;
            for (let i = 0; i < toBackfill.length; i += chunkSize) {
              const chunk = toBackfill.slice(i, i + chunkSize);
              try {
                const batch = writeBatch(db);
                for (const item of chunk) {
                  batch.set(doc(db, colName, item.id), { schoolId: DEFAULT_SCHOOL_ID }, { merge: true });
                }
                await batch.commit();
              } catch {
                // Se algum doc isolado no lote falhar, carimba individualmente para não bloquear os demais
                for (const item of chunk) {
                  try {
                    await setDoc(doc(db, colName, item.id), { schoolId: DEFAULT_SCHOOL_ID }, { merge: true });
                  } catch {
                    failedCount++;
                  }
                }
              }
            }
            if (failedCount === 0) {
              markLegacySchoolIdBackfillDone(colName);
            }
          })();
        }

        if (list.length > 0) {
          setCachedCollection(cacheKey, list);
        }
        return [...list];
      };

      const needsLegacyScan = schoolId === DEFAULT_SCHOOL_ID && !isLegacySchoolIdBackfillDone(colName);
      if (needsLegacyScan) {
        return await runLegacyScan();
      }

      const q = schoolId ? query(colRef, where('schoolId', '==', schoolId)) : colRef;
      const snap = await getDocs(q);
      const list: T[] = [];
      snap.forEach(d => {
        const mapped = mapDoc ? mapDoc(d.id, d.data()) : ({ id: d.id, ...d.data() } as T);
        list.push(mapped);
      });

      // Se a consulta filtrada da escola padrão vier vazia, faz varredura retroativa de segurança para resgatar docs sem schoolId
      if (list.length === 0 && schoolId === DEFAULT_SCHOOL_ID) {
        return await runLegacyScan();
      }

      if (list.length > 0) {
        setCachedCollection(cacheKey, list);
      }
      return [...list];
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.warn(`Erro ao buscar ${colName} (${schoolId || 'all'}) do Firestore:`, e);
      return [];
    }
  });
}

/**
 * Migra transparentemente um documento monolítico legado de Ocorrências (system_data/ocorrencias)
 * para a arquitetura escalável em subcoleções (schools/{schoolId}/ocorrencias/{id}), eliminando o limite de 1 MB.
 */
async function migrateLegacyOcorrenciasToSubcollections(schoolId: string, legacyData: any): Promise<void> {
  if (!legacyData || migratedSchoolsOcorrencias.has(schoolId)) return;
  migratedSchoolsOcorrencias.add(schoolId);
  try {
    const cleanSchoolId = sanitizeDocId(schoolId);
    const { registros, tratativasFamilia, ...configFields } = legacyData;
    const configPayload = sanitizeForFirestore({
      ...configFields,
      schoolId: cleanSchoolId,
      migratedFromLegacy: true,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'schools', cleanSchoolId, 'module_config', 'ocorrencias'), configPayload, { merge: true });

    const regList = Array.isArray(registros) ? registros : [];
    const chunkSize = 400;
    for (let i = 0; i < regList.length; i += chunkSize) {
      const batch = writeBatch(db);
      for (const reg of regList.slice(i, i + chunkSize)) {
        const regId = reg.id || `#OC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const docId = sanitizeDocId(regId);
        batch.set(
          doc(db, 'schools', cleanSchoolId, 'ocorrencias', docId),
          sanitizeForFirestore({ ...reg, id: regId, schoolId: cleanSchoolId }),
          { merge: true }
        );
      }
      await batch.commit();
    }

    const tratList = Array.isArray(tratativasFamilia) ? tratativasFamilia : [];
    for (let i = 0; i < tratList.length; i += chunkSize) {
      const batch = writeBatch(db);
      for (let idx = 0; idx < tratList.slice(i, i + chunkSize).length; idx++) {
        const t = tratList[i + idx];
        const tId = t.id || `trat-${Date.now()}-${i + idx}`;
        const docId = sanitizeDocId(tId);
        batch.set(
          doc(db, 'schools', cleanSchoolId, 'tratativas_familia', docId),
          sanitizeForFirestore({ ...t, id: tId, schoolId: cleanSchoolId }),
          { merge: true }
        );
      }
      await batch.commit();
    }
  } catch (err) {
    migratedSchoolsOcorrencias.delete(schoolId);
    console.warn('Migração em segundo plano de ocorrências adiada:', err);
  }
}

/**
 * Migra transparentemente um documento monolítico legado de Tablets (system_data/tablets)
 * para a arquitetura escalável em subcoleções (schools/{schoolId}/tablets_agendamentos/{id}).
 */
async function migrateLegacyTabletsToSubcollections(schoolId: string, legacyData: any): Promise<void> {
  if (!legacyData || migratedSchoolsTablets.has(schoolId)) return;
  migratedSchoolsTablets.add(schoolId);
  try {
    const cleanSchoolId = sanitizeDocId(schoolId);
    const { agendamentos, ...configFields } = legacyData;
    const configPayload = sanitizeForFirestore({
      ...configFields,
      schoolId: cleanSchoolId,
      migratedFromLegacy: true,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'schools', cleanSchoolId, 'module_config', 'tablets'), configPayload, { merge: true });

    const agList = Array.isArray(agendamentos) ? agendamentos : [];
    const chunkSize = 400;
    for (let i = 0; i < agList.length; i += chunkSize) {
      const batch = writeBatch(db);
      for (let idx = 0; idx < agList.slice(i, i + chunkSize).length; idx++) {
        const ag = agList[i + idx];
        const agId = ag.id || `ag-${sanitizeDocId(ag.data || 'dt')}-${sanitizeDocId(ag.aula || 'al')}-${i + idx}`;
        const docId = sanitizeDocId(agId);
        batch.set(
          doc(db, 'schools', cleanSchoolId, 'tablets_agendamentos', docId),
          sanitizeForFirestore({ ...ag, id: agId, schoolId: cleanSchoolId }),
          { merge: true }
        );
      }
      await batch.commit();
    }
  } catch (err) {
    migratedSchoolsTablets.delete(schoolId);
    console.warn('Migração em segundo plano de tablets adiada:', err);
  }
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
    const cacheKey = 'schools:all';
    const cached = getCachedCollection<School>(cacheKey);
    if (cached) return [...cached];
    if (isWithinQuotaCooldown()) return DEFAULT_SCHOOLS;

    return runDeduplicated(`col:${cacheKey}`, async () => {
      try {
        const snap = await getDocs(collection(db, 'schools'));
        const list: School[] = [];
        snap.forEach(d => {
          if (d.id !== 'emeb-cecilia-meireles') {
            list.push({ id: d.id, ...d.data() } as School);
          }
        });
        if (list.length === 0) {
          return DEFAULT_SCHOOLS;
        }
        const sorted = list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        setCachedCollection(cacheKey, sorted);
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
      const cleanData = sanitizeForFirestore({
        ...school,
        id: cleanId,
      });
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

  // === USERS (Isolamento por schoolId via query server-side) ===
  async getUsers(schoolId?: string): Promise<UserAccount[]> {
    const list = await querySchoolScopedCollection<UserAccount>('users', schoolId);
    const cleaned = list.filter(
      u => !u.id.includes('cecilia') && !u.id.includes('usr-cec') && u.id !== 'usr-admin-arlindo'
    );
    const filtered = schoolId
      ? cleaned.filter(u =>
          !u.isUniversal &&
          u.role !== 'super_admin' &&
          u.id !== 'usr-master' &&
          (u.schoolId || DEFAULT_SCHOOL_ID) === schoolId
        )
      : cleaned;
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  async getMasterUserDoc(): Promise<UserAccount | null> {
    if (isWithinQuotaCooldown()) return null;
    try {
      const snap = await getDoc(doc(db, 'users', 'usr-master'));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as UserAccount;
      }
      return null;
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      return null;
    }
  },

  async saveUser(user: UserAccount, schoolId?: string): Promise<void> {
    const cleanId = sanitizeDocId(user.id);
    const path = `users/${cleanId}`;
    try {
      const isMaster = cleanId === 'usr-master' || user.role === 'super_admin' || user.isUniversal === true;
      const withSchool = {
        ...user,
        id: cleanId,
        schoolId: isMaster ? undefined : (user.schoolId || schoolId || DEFAULT_SCHOOL_ID),
      };
      await setDoc(doc(db, 'users', cleanId), sanitizeForFirestore(withSchool), { merge: true });
      invalidateCollectionCache('users');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteUser(userId: string): Promise<void> {
    const cleanId = sanitizeDocId(userId);
    const path = `users/${cleanId}`;
    try {
      await deleteDoc(doc(db, 'users', cleanId));
      invalidateCollectionCache('users');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === CLASSES (Isolamento Multi-Tenant Server-Side) ===
  async getClasses(schoolId?: string): Promise<SchoolClass[]> {
    const list = await querySchoolScopedCollection<SchoolClass>('classes', schoolId);
    return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  async saveClass(cls: SchoolClass, schoolId?: string): Promise<void> {
    const cleanId = sanitizeDocId(cls.id);
    const path = `classes/${cleanId}`;
    try {
      const withSchool = {
        ...cls,
        id: cleanId,
        schoolId: cls.schoolId || schoolId || DEFAULT_SCHOOL_ID
      };
      await setDoc(doc(db, 'classes', cleanId), sanitizeForFirestore(withSchool), { merge: true });
      invalidateCollectionCache('classes');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteClass(clsId: string): Promise<void> {
    const cleanId = sanitizeDocId(clsId);
    const path = `classes/${cleanId}`;
    try {
      await deleteDoc(doc(db, 'classes', cleanId));
      invalidateCollectionCache('classes');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === STUDENTS (Isolamento Multi-Tenant Server-Side) ===
  async getStudents(schoolId?: string): Promise<Student[]> {
    const list = await querySchoolScopedCollection<Student>('students', schoolId);
    return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
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
        const prepared = chunk.map(s => {
          const cleanId = sanitizeDocId(s.id);
          const cleanData = sanitizeForFirestore({
            ...s,
            id: cleanId,
            name: String(s.name || 'Estudante').trim().slice(0, 200) || 'Estudante',
            schoolId: String(s.schoolId || schoolId || DEFAULT_SCHOOL_ID).slice(0, 100)
          });
          return { cleanId, cleanData };
        });
        try {
          const batch = writeBatch(db);
          for (const item of prepared) {
            batch.set(doc(db, 'students', item.cleanId), item.cleanData, { merge: true });
          }
          await batch.commit();
        } catch (batchErr) {
          // Fallback individual para impedir que um registro isolado bloqueie o lote
          for (const item of prepared) {
            try {
              await setDoc(doc(db, 'students', item.cleanId), item.cleanData, { merge: true });
            } catch (singleErr) {
              console.warn(`Erro ao salvar estudante ${item.cleanId} no Firestore:`, singleErr);
            }
          }
          markQuotaExceededIfApplicable(batchErr);
        }
      }
      invalidateCollectionCache('students');
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.error('Erro ao salvar lote de estudantes no Firestore:', e);
    }
  },

  // === ATTENDANCE RECORDS (Isolamento Multi-Tenant + Tempo Real) ===
  async getAttendanceRecords(date?: string, schoolId?: string, forceRefresh = false): Promise<AttendanceRecord[]> {
    if (forceRefresh) {
      invalidateCollectionCache('attendance_records');
    }
    const list = await querySchoolScopedCollection<AttendanceRecord>(
      'attendance_records',
      schoolId,
      (id, raw) => ({
        id,
        ...(raw as AttendanceRecord),
        date: normalizeDateStr(raw?.date) || raw?.date,
      })
    );
    const deduped = deduplicateAttendanceRecords(list);
    if (date) {
      return deduped.filter(r => isSameDay(r.date, date));
    }
    return deduped;
  },

  subscribeAttendanceRecords(
    schoolId: string,
    onUpdate: (records: AttendanceRecord[]) => void
  ): Unsubscribe {
    if (!auth.currentUser || !auth.currentUser.emailVerified) {
      return () => {};
    }
    const targetSchoolId = schoolId || DEFAULT_SCHOOL_ID;
    const colRef = collection(db, 'attendance_records');
    const q = query(colRef, where('schoolId', '==', targetSchoolId));
    const cacheKey = `attendance_records:${targetSchoolId}`;

    // Para a escola legada padrão, garante uma varredura retroativa única para carimbar registros antigos sem schoolId
    if (targetSchoolId === DEFAULT_SCHOOL_ID && !isLegacySchoolIdBackfillDone('attendance_records')) {
      querySchoolScopedCollection<AttendanceRecord>('attendance_records', targetSchoolId, (id, raw) => ({
        id,
        ...(raw as AttendanceRecord),
        date: normalizeDateStr(raw?.date) || raw?.date,
      })).catch(() => {});
    }

    return onSnapshot(
      q,
      (snapshot) => {
        const list: AttendanceRecord[] = [];
        snapshot.forEach((d) => {
          const raw = d.data() as any;
          list.push({
            id: d.id,
            ...(raw as AttendanceRecord),
            date: normalizeDateStr(raw?.date) || raw?.date,
            schoolId: raw?.schoolId || targetSchoolId,
          });
        });
        const deduped = deduplicateAttendanceRecords(list);
        if (deduped.length > 0) {
          setCachedCollection(cacheKey, deduped);
        } else {
          invalidateCollectionCache('attendance_records');
        }
        onUpdate(deduped);
      },
      (err) => {
        markQuotaExceededIfApplicable(err);
        console.warn('Erro no listener em tempo real de attendance_records:', err);
      }
    );
  },

  async batchSaveAttendance(records: AttendanceRecord[], schoolId?: string): Promise<void> {
    if (!records || records.length === 0) return;
    const targetSchoolId = String(schoolId || DEFAULT_SCHOOL_ID).trim().slice(0, 100) || DEFAULT_SCHOOL_ID;
    const fallbackDate = new Date().toISOString().split('T')[0];

    try {
      const chunkSize = 450;
      let failedCount = 0;
      let lastErr: unknown = null;

      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const prepared = chunk.map(r => {
          const cleanId = sanitizeDocId(r.id);
          const cleanDate = (normalizeDateStr(r.date) || r.date || fallbackDate).slice(0, 40);
          const cleanStudentId = String(r.studentId || cleanId).trim().slice(0, 128) || cleanId;
          const cleanClassId = String(r.classId || r.className || 'turma').trim().slice(0, 128) || 'turma';
          const cleanStatus = String(r.status || 'presente').trim().slice(0, 40) || 'presente';
          const cleanSchoolId = String(r.schoolId || targetSchoolId).trim().slice(0, 100) || targetSchoolId;

          const cleanRecord = sanitizeForFirestore({
            ...r,
            id: cleanId,
            studentId: cleanStudentId,
            classId: cleanClassId,
            date: cleanDate,
            status: cleanStatus,
            schoolId: cleanSchoolId,
            recordedAt: r.recordedAt || new Date().toISOString(),
          });
          return { cleanId, cleanRecord };
        });

        try {
          const batch = writeBatch(db);
          for (const item of prepared) {
            batch.set(doc(db, 'attendance_records', item.cleanId), item.cleanRecord, { merge: true });
          }
          await batch.commit();
        } catch (batchErr) {
          lastErr = batchErr;
          markQuotaExceededIfApplicable(batchErr);
          // Fallback individual para garantir gravação máxima caso um único doc rejeite
          for (const item of prepared) {
            try {
              await setDoc(doc(db, 'attendance_records', item.cleanId), item.cleanRecord, { merge: true });
            } catch (singleErr) {
              failedCount++;
              lastErr = singleErr;
              console.error(`Erro ao gravar frequência ${item.cleanId} no Firestore:`, singleErr);
            }
          }
        }
      }

      invalidateCollectionCache('attendance_records');
      if (failedCount > 0 && failedCount === records.length) {
        throw lastErr || new Error('Não foi possível gravar os registros de frequência no Firestore.');
      }
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.error('Erro ao salvar registros de chamada no Firestore:', e);
      throw e;
    }
  },

  async deleteAttendanceByDate(dateStr: string, classId?: string, schoolId?: string): Promise<number> {
    if (!dateStr) return 0;
    try {
      const colRef = collection(db, 'attendance_records');
      const targetSchoolId = schoolId || DEFAULT_SCHOOL_ID;
      // Para a escola padrão, consulta sem filtro apenas se ainda houver risco de docs legados sem schoolId
      const q = targetSchoolId === DEFAULT_SCHOOL_ID
        ? colRef
        : query(colRef, where('schoolId', '==', targetSchoolId));
      const snap = await getDocs(q);
      const toDelete: string[] = [];
      const cleanDate = normalizeDateStr(dateStr);
      const cleanClass = classId ? classId.trim().toLowerCase() : null;

      snap.forEach(d => {
        const data = d.data() as AttendanceRecord;
        const docSchoolId = typeof data.schoolId === 'string' && data.schoolId.trim() ? data.schoolId.trim() : DEFAULT_SCHOOL_ID;
        if (docSchoolId !== targetSchoolId) {
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

  // === ALERTS (Isolamento Multi-Tenant Server-Side) ===
  async getAlerts(schoolId?: string): Promise<ParentAlert[]> {
    const list = await querySchoolScopedCollection<ParentAlert>('alerts', schoolId);
    return list.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''));
  },

  async saveAlert(alert: ParentAlert, schoolId?: string): Promise<void> {
    const cleanId = sanitizeDocId(alert.id);
    const path = `alerts/${cleanId}`;
    try {
      const withSchool = {
        ...alert,
        id: cleanId,
        schoolId: alert.schoolId || schoolId || DEFAULT_SCHOOL_ID
      };
      await setDoc(doc(db, 'alerts', cleanId), sanitizeForFirestore(withSchool), { merge: true });
      invalidateCollectionCache('alerts');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteAlert(alertId: string): Promise<void> {
    const cleanId = sanitizeDocId(alertId);
    const path = `alerts/${cleanId}`;
    try {
      await deleteDoc(doc(db, 'alerts', cleanId));
      invalidateCollectionCache('alerts');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === INTERVENTIONS (Isolamento Multi-Tenant Server-Side) ===
  async getInterventions(schoolId?: string): Promise<InterventionCase[]> {
    return querySchoolScopedCollection<InterventionCase>('interventions', schoolId);
  },

  async saveIntervention(intervention: InterventionCase, schoolId?: string): Promise<void> {
    const cleanId = sanitizeDocId(intervention.id);
    const path = `interventions/${cleanId}`;
    try {
      const withSchool = {
        ...intervention,
        id: cleanId,
        schoolId: intervention.schoolId || schoolId || DEFAULT_SCHOOL_ID
      };
      await setDoc(doc(db, 'interventions', cleanId), sanitizeForFirestore(withSchool), { merge: true });
      invalidateCollectionCache('interventions');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteIntervention(id: string): Promise<void> {
    const cleanId = sanitizeDocId(id);
    const path = `interventions/${cleanId}`;
    try {
      await deleteDoc(doc(db, 'interventions', cleanId));
      invalidateCollectionCache('interventions');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === GATE RECORDS (Isolamento Multi-Tenant Server-Side) ===
  async getGateRecords(date?: string, schoolId?: string): Promise<GateRecord[]> {
    const list = await querySchoolScopedCollection<GateRecord>('gate_records', schoolId);
    const filtered = date ? list.filter(g => isSameDay(g.date, date)) : list;
    return filtered.sort((a, b) => {
      const dateA = normalizeDateStr(a.date) || a.date || '';
      const dateB = normalizeDateStr(b.date) || b.date || '';
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      return (b.time || '').localeCompare(a.time || '');
    });
  },

  async saveGateRecord(record: GateRecord, schoolId?: string): Promise<void> {
    const cleanId = sanitizeDocId(record.id);
    const path = `gate_records/${cleanId}`;
    try {
      const withSchool = {
        ...record,
        id: cleanId,
        schoolId: record.schoolId || schoolId || DEFAULT_SCHOOL_ID
      };
      await setDoc(doc(db, 'gate_records', cleanId), sanitizeForFirestore(withSchool), { merge: true });
      invalidateCollectionCache('gate_records');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteGateRecord(id: string): Promise<void> {
    const cleanId = sanitizeDocId(id);
    const path = `gate_records/${cleanId}`;
    try {
      await deleteDoc(doc(db, 'gate_records', cleanId));
      invalidateCollectionCache('gate_records');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  // === OCORRÊNCIAS & MEDIAÇÃO (Arquitetura em Subcoleções — Sem limite de 1 MB!) ===
  async getOcorrencias(schoolId?: string, forceRefresh = false): Promise<any | null> {
    const sId = sanitizeDocId(schoolId || DEFAULT_SCHOOL_ID);
    const cacheKey = `ocorrencias:${sId}`;
    if (!forceRefresh) {
      const cached = getCachedDoc<any>(cacheKey);
      if (cached.hit) return cached.data;
    }
    if (isWithinQuotaCooldown()) return null;

    return runDeduplicated(`doc:${cacheKey}`, async () => {
      try {
        const [configSnap, registrosSnap, tratativasSnap] = await Promise.all([
          getDoc(doc(db, 'schools', sId, 'module_config', 'ocorrencias')),
          getDocs(collection(db, 'schools', sId, 'ocorrencias')),
          getDocs(collection(db, 'schools', sId, 'tratativas_familia')),
        ]);

        if (configSnap.exists() || !registrosSnap.empty || !tratativasSnap.empty) {
          const configData = configSnap.exists() ? configSnap.data() : {};
          const registros = registrosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const tratativasFamilia = tratativasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const assembled = {
            ...configData,
            registros,
            tratativasFamilia,
            schoolId: sId,
          };
          setCachedDoc(cacheKey, assembled);
          return assembled;
        }

        // Fallback retroativo (primeira leitura antes da migração): lê documento legado system_data/ocorrencias
        const legacyDocId = sId !== DEFAULT_SCHOOL_ID ? `ocorrencias_${sId}` : 'ocorrencias';
        const legacySnap = await getDoc(doc(db, 'system_data', legacyDocId));
        if (legacySnap.exists()) {
          const legacyData = legacySnap.data();
          setCachedDoc(cacheKey, legacyData);
          // Migra automaticamente em segundo plano para a nova arquitetura em subcoleções
          migrateLegacyOcorrenciasToSubcollections(sId, legacyData);
          return legacyData;
        }

        setCachedDoc(cacheKey, null);
        return null;
      } catch (e) {
        markQuotaExceededIfApplicable(e);
        console.warn(`Erro ao carregar ocorrências (${sId}) do Firestore:`, e);
        return null;
      }
    });
  },

  // Gravação atômica de 1 registro de ocorrência (1 escrita em vez de reescrever a base inteira!)
  async saveOcorrenciaRecord(schoolId: string, record: any): Promise<void> {
    const sId = sanitizeDocId(schoolId || DEFAULT_SCHOOL_ID);
    const recId = record.id || `#OC-${Date.now()}`;
    const docId = sanitizeDocId(recId);
    const path = `schools/${sId}/ocorrencias/${docId}`;
    try {
      await setDoc(
        doc(db, 'schools', sId, 'ocorrencias', docId),
        sanitizeForFirestore({ ...record, id: recId, schoolId: sId, updatedAt: new Date().toISOString() }),
        { merge: true }
      );
      invalidateDocCache(`ocorrencias:${sId}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteOcorrenciaRecord(schoolId: string, recordId: string): Promise<void> {
    const sId = sanitizeDocId(schoolId || DEFAULT_SCHOOL_ID);
    const docId = sanitizeDocId(recordId);
    const path = `schools/${sId}/ocorrencias/${docId}`;
    try {
      await deleteDoc(doc(db, 'schools', sId, 'ocorrencias', docId));
      invalidateDocCache(`ocorrencias:${sId}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  async saveTratativaFamilia(schoolId: string, tratativa: any): Promise<void> {
    const sId = sanitizeDocId(schoolId || DEFAULT_SCHOOL_ID);
    const tId = tratativa.id || `trat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const docId = sanitizeDocId(tId);
    const path = `schools/${sId}/tratativas_familia/${docId}`;
    try {
      await setDoc(
        doc(db, 'schools', sId, 'tratativas_familia', docId),
        sanitizeForFirestore({ ...tratativa, id: tId, schoolId: sId, updatedAt: new Date().toISOString() }),
        { merge: true }
      );
      invalidateDocCache(`ocorrencias:${sId}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async saveOcorrenciasConfig(schoolId: string, config: any): Promise<void> {
    const sId = sanitizeDocId(schoolId || DEFAULT_SCHOOL_ID);
    const path = `schools/${sId}/module_config/ocorrencias`;
    try {
      const { registros: _r, tratativasFamilia: _t, ...cleanConfig } = config || {};
      await setDoc(
        doc(db, 'schools', sId, 'module_config', 'ocorrencias'),
        sanitizeForFirestore({ ...cleanConfig, schoolId: sId, updatedAt: new Date().toISOString() }),
        { merge: true }
      );
      invalidateDocCache(`ocorrencias:${sId}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  // Gravação em lote completa (usada na restauração de backup)
  async saveOcorrencias(data: any, schoolId?: string): Promise<void> {
    const sId = sanitizeDocId(schoolId || DEFAULT_SCHOOL_ID);
    const cacheKey = `ocorrencias:${sId}`;
    try {
      const { registros, tratativasFamilia, ...configFields } = data || {};
      await setDoc(
        doc(db, 'schools', sId, 'module_config', 'ocorrencias'),
        sanitizeForFirestore({ ...configFields, schoolId: sId, updatedAt: new Date().toISOString() }),
        { merge: true }
      );

      const regList = Array.isArray(registros) ? registros : [];
      const chunkSize = 400;
      for (let i = 0; i < regList.length; i += chunkSize) {
        const batch = writeBatch(db);
        for (const reg of regList.slice(i, i + chunkSize)) {
          const recId = reg.id || `#OC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const docId = sanitizeDocId(recId);
          batch.set(
            doc(db, 'schools', sId, 'ocorrencias', docId),
            sanitizeForFirestore({ ...reg, id: recId, schoolId: sId }),
            { merge: true }
          );
        }
        await batch.commit();
      }

      const tratList = Array.isArray(tratativasFamilia) ? tratativasFamilia : [];
      for (let i = 0; i < tratList.length; i += chunkSize) {
        const batch = writeBatch(db);
        for (let idx = 0; idx < tratList.slice(i, i + chunkSize).length; idx++) {
          const t = tratList[i + idx];
          const tId = t.id || `trat-${Date.now()}-${i + idx}`;
          const docId = sanitizeDocId(tId);
          batch.set(
            doc(db, 'schools', sId, 'tratativas_familia', docId),
            sanitizeForFirestore({ ...t, id: tId, schoolId: sId }),
            { merge: true }
          );
        }
        await batch.commit();
      }

      setCachedDoc(cacheKey, { ...data, schoolId: sId });
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.warn(`Erro ao salvar ocorrências (${sId}) no Firestore:`, e);
    }
  },

  // === TABLETS & AGENDAMENTOS (Arquitetura em Subcoleções — Sem limite de 1 MB!) ===
  async getTablets(schoolId?: string, forceRefresh = false): Promise<any | null> {
    const sId = sanitizeDocId(schoolId || DEFAULT_SCHOOL_ID);
    const cacheKey = `tablets:${sId}`;
    if (!forceRefresh) {
      const cached = getCachedDoc<any>(cacheKey);
      if (cached.hit) return cached.data;
    }
    if (isWithinQuotaCooldown()) return null;

    return runDeduplicated(`doc:${cacheKey}`, async () => {
      try {
        const [configSnap, agSnap] = await Promise.all([
          getDoc(doc(db, 'schools', sId, 'module_config', 'tablets')),
          getDocs(collection(db, 'schools', sId, 'tablets_agendamentos')),
        ]);

        if (configSnap.exists() || !agSnap.empty) {
          const configData = configSnap.exists() ? configSnap.data() : {};
          const agendamentos = agSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const assembled = {
            ...configData,
            agendamentos,
            schoolId: sId,
          };
          setCachedDoc(cacheKey, assembled);
          return assembled;
        }

        // Fallback retroativo (primeira leitura antes da migração): lê documento legado system_data/tablets
        const legacyDocId = sId !== DEFAULT_SCHOOL_ID ? `tablets_${sId}` : 'tablets';
        const legacySnap = await getDoc(doc(db, 'system_data', legacyDocId));
        if (legacySnap.exists()) {
          const legacyData = legacySnap.data();
          setCachedDoc(cacheKey, legacyData);
          migrateLegacyTabletsToSubcollections(sId, legacyData);
          return legacyData;
        }

        setCachedDoc(cacheKey, null);
        return null;
      } catch (e) {
        markQuotaExceededIfApplicable(e);
        console.warn(`Erro ao carregar tablets (${sId}) do Firestore:`, e);
        return null;
      }
    });
  },

  async saveTabletAgendamento(schoolId: string, agendamento: any): Promise<void> {
    const sId = sanitizeDocId(schoolId || DEFAULT_SCHOOL_ID);
    const agId = agendamento.id || `ag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const docId = sanitizeDocId(agId);
    const path = `schools/${sId}/tablets_agendamentos/${docId}`;
    try {
      await setDoc(
        doc(db, 'schools', sId, 'tablets_agendamentos', docId),
        sanitizeForFirestore({ ...agendamento, id: agId, schoolId: sId, updatedAt: new Date().toISOString() }),
        { merge: true }
      );
      invalidateDocCache(`tablets:${sId}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteTabletAgendamento(schoolId: string, agendamentoId: string): Promise<void> {
    const sId = sanitizeDocId(schoolId || DEFAULT_SCHOOL_ID);
    const docId = sanitizeDocId(agendamentoId);
    const path = `schools/${sId}/tablets_agendamentos/${docId}`;
    try {
      await deleteDoc(doc(db, 'schools', sId, 'tablets_agendamentos', docId));
      invalidateDocCache(`tablets:${sId}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  async saveTabletsConfig(schoolId: string, config: any): Promise<void> {
    const sId = sanitizeDocId(schoolId || DEFAULT_SCHOOL_ID);
    const path = `schools/${sId}/module_config/tablets`;
    try {
      const { agendamentos: _a, ...cleanConfig } = config || {};
      await setDoc(
        doc(db, 'schools', sId, 'module_config', 'tablets'),
        sanitizeForFirestore({ ...cleanConfig, schoolId: sId, updatedAt: new Date().toISOString() }),
        { merge: true }
      );
      invalidateDocCache(`tablets:${sId}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async saveTablets(data: any, schoolId?: string): Promise<void> {
    const sId = sanitizeDocId(schoolId || DEFAULT_SCHOOL_ID);
    const cacheKey = `tablets:${sId}`;
    try {
      const { agendamentos, ...configFields } = data || {};
      await setDoc(
        doc(db, 'schools', sId, 'module_config', 'tablets'),
        sanitizeForFirestore({ ...configFields, schoolId: sId, updatedAt: new Date().toISOString() }),
        { merge: true }
      );

      const agList = Array.isArray(agendamentos) ? agendamentos : [];
      const chunkSize = 400;
      for (let i = 0; i < agList.length; i += chunkSize) {
        const batch = writeBatch(db);
        for (let idx = 0; idx < agList.slice(i, i + chunkSize).length; idx++) {
          const ag = agList[i + idx];
          const agId = ag.id || `ag-${sanitizeDocId(ag.data || 'dt')}-${sanitizeDocId(ag.aula || 'al')}-${i + idx}`;
          const docId = sanitizeDocId(agId);
          batch.set(
            doc(db, 'schools', sId, 'tablets_agendamentos', docId),
            sanitizeForFirestore({ ...ag, id: agId, schoolId: sId }),
            { merge: true }
          );
        }
        await batch.commit();
      }
      setCachedDoc(cacheKey, { ...data, schoolId: sId });
    } catch (e) {
      markQuotaExceededIfApplicable(e);
      console.warn(`Erro ao salvar tablets (${sId}) no Firestore:`, e);
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

  // === GRADE HORÁRIA DOCENTE ===
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

  // === WORKSPACE DE GRADE CURRICULAR & GERADOR DE HORÁRIOS ===
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

  // === TESTE DE CONEXÃO DIRETA COM O SERVIDOR ===
  async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string; quotaExceeded?: boolean; databaseId: string }> {
    const start = performance.now();
    try {
      await getDocFromServer(doc(db, 'schools', DEFAULT_SCHOOL_ID));
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

  // === CARREGAMENTO TOTAL DIRETO DO FIREBASE (Isolado por Escola em 2 Ondas Paralelas) ===
  async getAllDataDirectly(
    schoolId?: string,
    forceRefresh = false,
    onPriorityDataReady?: (priority: {
      schools: School[];
      classes: SchoolClass[];
      users: UserAccount[];
      alerts: ParentAlert[];
      interventions: InterventionCase[];
      ocorrencias: any | null;
      tablets: any | null;
    }) => void
  ): Promise<{
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

    const dedupeKey = `getAllDataDirectly:${targetSchoolId}`;
    return runDeduplicated(dedupeKey, async () => {
      try {
        // Onda 1 (Prioritária e isolada por schoolId)
        const priorityPromise = Promise.all([
          firestoreService.getSchools(),
          firestoreService.getClasses(targetSchoolId),
          firestoreService.getUsers(targetSchoolId),
          firestoreService.getAlerts(targetSchoolId),
          firestoreService.getInterventions(targetSchoolId),
          firestoreService.getOcorrencias(targetSchoolId, forceRefresh),
          firestoreService.getTablets(targetSchoolId, forceRefresh),
        ]).then(([schools, classes, users, alerts, interventions, ocorrencias, tablets]) => {
          if (!isWithinQuotaCooldown() && onPriorityDataReady) {
            try {
              onPriorityDataReady({
                schools,
                classes,
                users,
                alerts,
                interventions,
                ocorrencias,
                tablets,
              });
            } catch (cbErr) {
              console.warn('Erro ao aplicar dados prioritários:', cbErr);
            }
          }
          return { schools, classes, users, alerts, interventions, ocorrencias, tablets };
        });

        // Onda 2 (Coleções maiores — também isoladas por schoolId no servidor!)
        const secondaryPromise = Promise.all([
          firestoreService.getStudents(targetSchoolId),
          firestoreService.getAttendanceRecords(undefined, targetSchoolId),
          firestoreService.getGateRecords(undefined, targetSchoolId),
          firestoreService.getSchoolCalendar(targetSchoolId),
          firestoreService.getTeacherSchedules(targetSchoolId),
          firestoreService.getTimetableWorkspace(targetSchoolId),
        ]).then(([students, attendance, gate, calendar, teacherSchedules, timetableWorkspace]) => ({
          students,
          attendance,
          gate,
          calendar,
          teacherSchedules,
          timetableWorkspace,
        }));

        const [priority, secondary] = await Promise.all([priorityPromise, secondaryPromise]);

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
          schools: priority.schools,
          classes: priority.classes,
          students: secondary.students,
          users: priority.users,
          alerts: priority.alerts,
          attendance: secondary.attendance,
          interventions: priority.interventions,
          gate: secondary.gate,
          ocorrencias: priority.ocorrencias,
          tablets: priority.tablets,
          calendar: secondary.calendar,
          teacherSchedules: secondary.teacherSchedules,
          timetableWorkspace: secondary.timetableWorkspace,
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
    });
  }
};
