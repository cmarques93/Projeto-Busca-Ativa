import {
  UserAccount,
  UserRole,
  AttendanceStatus,
  GateRecord,
  AttendanceRecord,
  SchoolClass,
  Student,
  ParentAlert,
  InterventionCase,
  MonthlyPedagogicalReport
} from '../types';
import {
  DEFAULT_USERS,
  DEFAULT_PINS,
  DEFAULT_CLASSES,
  DEFAULT_STUDENTS,
  DEFAULT_ALERTS,
  DEFAULT_INTERVENTIONS,
  DEFAULT_REPORT
} from './fallbackData';
import { firestoreService } from '../lib/firestoreService';

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Direção Escolar (Administrador)';
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

// Helper to safely access localStorage (handles SSR, disabled cookies, etc.)
function getStored<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    if (!val) return fallback;
    return JSON.parse(val);
  } catch (e) {
    console.warn(`Erro ao ler ${key} do localStorage:`, e);
    return fallback;
  }
}

function setStored<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`Erro ao salvar ${key} no localStorage:`, e);
  }
}

// Ensure default users have their default PIN attached
function initializeDefaultUsers(): UserAccount[] {
  return DEFAULT_USERS.map(u => ({
    ...u,
    pin: DEFAULT_PINS[u.id]?.pin || '1234',
    createdAt: new Date().toISOString()
  }));
}

export const storageService = {
  // === SETTERS PARA SINCRONIZAÇÃO COM A NUVEM ===
  setUsers: (users: UserAccount[]): void => {
    setStored('school_users', users);
  },
  setClasses: (classes: SchoolClass[]): void => {
    setStored('school_classes', classes);
  },
  setStudents: (students: Student[]): void => {
    setStored('school_students', students);
  },
  setAttendanceRecords: (records: AttendanceRecord[]): void => {
    setStored('school_attendance', records);
  },
  setAlerts: (alerts: ParentAlert[]): void => {
    setStored('school_alerts', alerts);
  },
  setInterventions: (interventions: InterventionCase[]): void => {
    setStored('school_interventions', interventions);
  },
  setGateRecords: (records: GateRecord[]): void => {
    setStored('school_gate_records', records);
  },

  // === USUÁRIOS & ACESSOS ===
  getUsers: (): UserAccount[] => {
    let users = getStored<UserAccount[]>('school_users', []);
    if (!users || users.length === 0) {
      users = initializeDefaultUsers();
      setStored('school_users', users);
    }
    return users;
  },

  getUserById: (id: string): UserAccount | undefined => {
    const users = storageService.getUsers();
    return users.find(u => u.id === id);
  },

  createUser: (data: { name: string; username?: string; role: UserRole; pin: string; notes?: string }): UserAccount => {
    const cleanName = data.name.trim();
    const cleanPin = (data.pin || '').trim();
    const cleanUsername = data.username?.trim() || cleanName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.');
    
    const newUser: UserAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      username: cleanUsername,
      role: data.role,
      roleLabel: getRoleLabel(data.role),
      pin: cleanPin,
      createdAt: new Date().toISOString(),
      active: true,
      notes: data.notes?.trim() || ''
    };

    const users = storageService.getUsers();
    users.push(newUser);
    setStored('school_users', users);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveUser(newUser).catch(err => console.warn('Erro ao salvar usuário no Firestore:', err));

    return newUser;
  },

  updateUser: (id: string, updates: Partial<UserAccount>): UserAccount | null => {
    const users = storageService.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;

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
    storageService.updateUser(id, { pin: pin.trim() });
  },

  deleteUser: (userId: string): boolean => {
    const users = storageService.getUsers().filter(u => u.id !== userId);
    setStored('school_users', users);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteUser(userId).catch(err => console.warn('Erro ao deletar usuário do Firestore:', err));

    return true;
  },

  verifyPin: (userId: string, pin: string): { success: boolean; user?: any; error?: string } => {
    const users = storageService.getUsers();
    const cleanPin = pin.trim();
    const user = users.find(u => u.id === userId);

    if (!user) {
      const defaultPinObj = DEFAULT_PINS[userId];
      if (defaultPinObj && defaultPinObj.pin === cleanPin) {
        return { success: true, user: defaultPinObj.user };
      }
      return { success: false, error: 'Usuário não localizado.' };
    }

    if (user.active === false) {
      return { success: false, error: 'Este usuário está inativo no sistema.' };
    }

    if (user.pin === cleanPin || (DEFAULT_PINS[userId] && DEFAULT_PINS[userId].pin === cleanPin)) {
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          roleLabel: user.roleLabel || getRoleLabel(user.role)
        }
      };
    }

    return { success: false, error: 'Senha de 4 dígitos incorreta.' };
  },

  // === TURMAS ===
  getClasses: (): SchoolClass[] => {
    return getStored<SchoolClass[]>('school_classes', DEFAULT_CLASSES);
  },

  createClass: (cls: SchoolClass): SchoolClass => {
    const classes = storageService.getClasses();
    const existingIdx = classes.findIndex(c => c.id === cls.id);
    if (existingIdx >= 0) {
      classes[existingIdx] = cls;
    } else {
      classes.push(cls);
    }
    setStored('school_classes', classes);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveClass(cls).catch(err => console.warn('Erro ao salvar turma no Firestore:', err));

    return cls;
  },

  updateClass: (clsId: string, updates: Partial<SchoolClass>): SchoolClass | null => {
    const classes = storageService.getClasses();
    const idx = classes.findIndex(c => c.id === clsId);
    if (idx === -1) return null;
    classes[idx] = { ...classes[idx], ...updates };
    setStored('school_classes', classes);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveClass(classes[idx]).catch(err => console.warn('Erro ao atualizar turma no Firestore:', err));

    return classes[idx];
  },

  deleteClass: (clsId: string): void => {
    const classes = storageService.getClasses().filter(c => c.id !== clsId);
    setStored('school_classes', classes);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteClass(clsId).catch(err => console.warn('Erro ao deletar turma no Firestore:', err));
  },

  // === ESTUDANTES ===
  getStudents: (classId?: string): Student[] => {
    const students = getStored<Student[]>('school_students', DEFAULT_STUDENTS);
    if (classId) {
      return students.filter(s => s.classId === classId);
    }
    return students;
  },

  getStudentById: (id: string): Student | undefined => {
    const students = storageService.getStudents();
    return students.find(s => s.id === id);
  },

  getStudentDetails: (studentId: string): any => {
    const student = storageService.getStudentById(studentId);
    if (!student) return null;
    const history = storageService.getAttendanceRecords()
      .filter(r => r.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date));
    const alerts = storageService.getAlerts()
      .filter(a => a.studentId === studentId)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    const intervention = storageService.getInterventions().find(i => i.studentId === studentId);

    return {
      student,
      attendanceHistory: history,
      alerts,
      intervention
    };
  },

  createStudent: (data: Partial<Student>): Student => {
    const students = storageService.getStudents();
    const id = data.id || `std-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    const newStudent: Student = {
      id,
      name: data.name || '',
      ra: data.ra || '',
      classId: data.classId || '',
      className: data.className || '',
      guardianName: data.guardianName || '',
      guardianPhone: data.guardianPhone || '',
      guardianRelationship: data.guardianRelationship || 'Responsável',
      address: data.address || '',
      neighborhood: data.neighborhood || '',
      status: data.status || 'regular',
      riskLevel: data.riskLevel || 'baixo',
      totalSchoolDays: data.totalSchoolDays ?? 45,
      totalAbsences: data.totalAbsences ?? 0,
      consecutiveAbsences: data.consecutiveAbsences ?? 0,
      attendanceRate: data.attendanceRate ?? 100,
      vulnerabilityFactors: data.vulnerabilityFactors || [],
      lastAttendanceDate: data.lastAttendanceDate || new Date().toISOString().split('T')[0],
      notes: data.notes || ''
    };
    students.push(newStudent);
    setStored('school_students', students);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveStudent(newStudent).catch(err => console.warn('Erro ao salvar estudante no Firestore:', err));

    return newStudent;
  },

  updateStudent: (studentId: string, updates: Partial<Student>): Student | null => {
    const students = storageService.getStudents();
    const idx = students.findIndex(s => s.id === studentId);
    if (idx === -1) return null;
    students[idx] = { ...students[idx], ...updates };
    setStored('school_students', students);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveStudent(students[idx]).catch(err => console.warn('Erro ao atualizar estudante no Firestore:', err));

    return students[idx];
  },

  deleteStudent: (studentId: string): void => {
    const students = storageService.getStudents().filter(s => s.id !== studentId);
    setStored('school_students', students);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteStudent(studentId).catch(err => console.warn('Erro ao deletar estudante no Firestore:', err));
  },

  batchCreateStudents: (newStudents: Partial<Student>[]): number => {
    const existing = storageService.getStudents();
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
        guardianName: data.guardianName || '',
        guardianPhone: data.guardianPhone || '',
        guardianRelationship: data.guardianRelationship || 'Responsável',
        address: data.address || '',
        neighborhood: data.neighborhood || '',
        status: data.status || 'regular',
        riskLevel: data.riskLevel || 'baixo',
        totalSchoolDays: data.totalSchoolDays ?? 45,
        totalAbsences: data.totalAbsences ?? 0,
        consecutiveAbsences: data.consecutiveAbsences ?? 0,
        attendanceRate: data.attendanceRate ?? 100,
        vulnerabilityFactors: data.vulnerabilityFactors || [],
        lastAttendanceDate: data.lastAttendanceDate || new Date().toISOString().split('T')[0],
        notes: data.notes || ''
      };
      existing.push(s);
      createdList.push(s);
      count++;
    }
    setStored('school_students', existing);

    // Sincroniza em nuvem no Firestore
    firestoreService.batchSaveStudents(createdList).catch(err => console.warn('Erro ao salvar lote de estudantes no Firestore:', err));

    return count;
  },

  // === FREQUÊNCIA ===
  recordAttendance: (
    items: { studentId: string; status: AttendanceStatus; notes?: string }[],
    classId: string,
    recordedBy: string,
    date?: string
  ): any => {
    const records = storageService.getAttendanceRecords();
    const recordDate = date || new Date().toISOString().split('T')[0];
    const students = storageService.getStudents(classId);

    const newRecords: AttendanceRecord[] = items.map(item => {
      const student = students.find(s => s.id === item.studentId);
      return {
        id: `att-${Date.now()}-${item.studentId}`,
        studentId: item.studentId,
        studentName: student?.name || '',
        classId,
        className: student?.className || '',
        date: recordDate,
        status: item.status,
        recordedBy,
        recordedAt: new Date().toISOString(),
        justification: item.notes
      };
    });

    // Replace existing records for same student & date
    const studentIds = new Set(items.map(i => i.studentId));
    const filteredRecords = records.filter(r => !(r.date === recordDate && studentIds.has(r.studentId)));
    filteredRecords.push(...newRecords);
    setStored('school_attendance', filteredRecords);

    // Update students absence counts
    const allStudents = storageService.getStudents();
    const updatedStudents: Student[] = [];
    allStudents.forEach(st => {
      const item = items.find(i => i.studentId === st.id);
      if (item) {
        if (item.status === 'falta_injustificada' || item.status === 'falta_justificada') {
          st.totalAbsences = (st.totalAbsences || 0) + 1;
          st.consecutiveAbsences = (st.consecutiveAbsences || 0) + 1;
        } else if (item.status === 'presente') {
          st.consecutiveAbsences = 0;
          st.lastAttendanceDate = recordDate;
        }
        st.attendanceRate = Math.max(0, Math.round(((st.totalSchoolDays - st.totalAbsences) / st.totalSchoolDays) * 100));
        if (st.consecutiveAbsences >= 4 || st.attendanceRate < 75) {
          st.riskLevel = 'critico';
          st.status = 'evasao_iminente';
        } else if (st.consecutiveAbsences >= 2 || st.attendanceRate < 80) {
          st.riskLevel = 'alto';
          st.status = 'alerta';
        }
        updatedStudents.push(st);
      }
    });
    setStored('school_students', allStudents);

    // Sincroniza em nuvem no Firestore
    firestoreService.batchSaveAttendance(newRecords).catch(err => console.warn('Erro ao salvar chamadas no Firestore:', err));
    firestoreService.batchSaveStudents(updatedStudents).catch(err => console.warn('Erro ao atualizar alunos no Firestore:', err));

    return { success: true, count: newRecords.length };
  },

  getAttendanceRecords: (classId?: string, date?: string): AttendanceRecord[] => {
    let records = getStored<AttendanceRecord[]>('school_attendance', []);
    if (classId) {
      records = records.filter(r => r.classId === classId);
    }
    if (date) {
      records = records.filter(r => r.date === date);
    }
    return records;
  },

  // === PORTARIA ===
  getGateRecords: (date?: string, classId?: string): GateRecord[] => {
    let list = getStored<GateRecord[]>('school_gate_records', []);
    if (date) {
      list = list.filter(r => r.date === date);
    }
    if (classId) {
      list = list.filter(r => r.classId === classId);
    }
    return list;
  },

  createGateRecord: (record: GateRecord): GateRecord => {
    const list = storageService.getGateRecords();
    const newRecord = {
      ...record,
      id: record.id || `gate-${Date.now()}`
    };
    list.push(newRecord);
    setStored('school_gate_records', list);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveGateRecord(newRecord).catch(err => console.warn('Erro ao salvar registro de portaria no Firestore:', err));

    return newRecord;
  },

  deleteGateRecord: (id: string): void => {
    const list = storageService.getGateRecords().filter(r => r.id !== id);
    setStored('school_gate_records', list);

    // Sincroniza em nuvem no Firestore
    firestoreService.deleteGateRecord(id).catch(err => console.warn('Erro ao deletar registro de portaria no Firestore:', err));
  },

  // === ALERTAS ===
  getAlerts: (): ParentAlert[] => {
    return getStored<ParentAlert[]>('school_alerts', DEFAULT_ALERTS);
  },

  addAlert: (alert: ParentAlert): ParentAlert => {
    const list = storageService.getAlerts();
    const newAlert = {
      ...alert,
      id: alert.id || `alt-${Date.now()}`
    };
    list.unshift(newAlert);
    setStored('school_alerts', list);

    // Sincroniza em nuvem no Firestore
    firestoreService.saveAlert(newAlert).catch(err => console.warn('Erro ao salvar alerta no Firestore:', err));

    return newAlert;
  },

  updateAlertStatus: (alertId: string, status: any, notes?: string): void => {
    const list = storageService.getAlerts();
    const alert = list.find(a => a.id === alertId);
    if (alert) {
      alert.status = status;
      if (notes) alert.guardianFeedback = notes;
      setStored('school_alerts', list);

      // Sincroniza em nuvem no Firestore
      firestoreService.saveAlert(alert).catch(err => console.warn('Erro ao atualizar alerta no Firestore:', err));
    }
  },

  // === INTERVENÇÕES ===
  getInterventions: (): InterventionCase[] => {
    return getStored<InterventionCase[]>('school_interventions', DEFAULT_INTERVENTIONS);
  },

  addInterventionAction: (caseId: string, action: any): void => {
    const list = storageService.getInterventions();
    const item = list.find(i => i.id === caseId);
    if (item) {
      item.actionLog = item.actionLog || [];
      item.actionLog.push({
        ...action,
        id: action.id || `act-${Date.now()}`
      });
      item.lastUpdatedAt = new Date().toISOString().split('T')[0];
      setStored('school_interventions', list);

      // Sincroniza em nuvem no Firestore
      firestoreService.saveIntervention(item).catch(err => console.warn('Erro ao salvar intervenção no Firestore:', err));
    }
  },

  deleteOpenInterventions: (): void => {
    const list = storageService.getInterventions().filter(i => i.stage === 'reintegrado' || i.stage === 'encerrado');
    setStored('school_interventions', list);
  },

  // === INFORMAÇÕES ESCOLARES & RELATÓRIOS ===
  getSchoolInfo: (): any => {
    const students = storageService.getStudents();
    const classes = storageService.getClasses();
    const alerts = storageService.getAlerts();
    const interventions = storageService.getInterventions();

    return {
      schoolName: 'EE Professor Arlindo Silvestre',
      lastUpdated: new Date().toISOString(),
      totalStudents: students.length,
      totalClasses: classes.length,
      activeAlertsCount: alerts.filter(a => a.status === 'enviado' || a.status === 'lido').length,
      activeCasesCount: interventions.filter(i => i.stage !== 'reintegrado' && i.stage !== 'encerrado').length
    };
  },

  getMonthlyReport: (monthIndex?: number): MonthlyPedagogicalReport => {
    const report = getStored<MonthlyPedagogicalReport>('school_monthly_report', DEFAULT_REPORT);
    return report;
  },

  // === RESET TOTAL (Wipe All Data) ===
  wipeAllData: (currentUser?: any): void => {
    localStorage.removeItem('school_classes');
    localStorage.removeItem('school_students');
    localStorage.removeItem('school_attendance');
    localStorage.removeItem('school_gate_records');
    localStorage.removeItem('school_alerts');
    localStorage.removeItem('school_interventions');
    localStorage.removeItem('school_monthly_report');

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
