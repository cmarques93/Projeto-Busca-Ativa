import {
  DEFAULT_USERS,
  DEFAULT_PINS,
  DEFAULT_CLASSES,
  DEFAULT_STUDENTS,
  DEFAULT_ALERTS,
  DEFAULT_INTERVENTIONS,
  DEFAULT_SCHOOL_INFO,
  DEFAULT_REPORT
} from './fallbackData';
import {
  SchoolClass,
  Student,
  ParentAlert,
  InterventionCase,
  UserSession,
  UserAccount,
  UserRole,
  AttendanceStatus,
  GateRecord,
  AttendanceRecord
} from '../types';

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

export const storageService = {
  // === USUÁRIOS & ACESSOS ===
  getUsers(): UserAccount[] {
    let list: any[] = [];
    try {
      const saved = localStorage.getItem('school_users');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
      }
    } catch (e) {
      console.warn('Erro ao ler school_users do localStorage:', e);
    }

    let savedPins: Record<string, { pin: string }> = {};
    try {
      const sp = localStorage.getItem('school_pins');
      savedPins = sp ? JSON.parse(sp) : DEFAULT_PINS;
    } catch (e) {
      savedPins = DEFAULT_PINS;
    }

    if (list.length === 0) {
      list = DEFAULT_USERS.map(u => ({
        ...u,
        pin: savedPins[u.id]?.pin || '1234',
        createdAt: '2026-02-01',
        active: u.active ?? true,
      }));
      try {
        localStorage.setItem('school_users', JSON.stringify(list));
      } catch (e) {
        // ignore
      }
    }

    return list.map(u => ({
      ...u,
      pin: u.pin || savedPins[u.id]?.pin || '1234',
      createdAt: u.createdAt || '2026-02-01',
      active: u.active !== false,
      roleLabel: u.roleLabel || getRoleLabel(u.role),
    }));
  },

  createUser(data: {
    name: string;
    role: UserRole;
    pin: string;
    notes?: string;
  }): UserAccount {
    const newId = `user-${Date.now()}`;
    const cleanUsername = data.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .trim()
      .replace(/\s+/g, '.');

    const newUser: UserAccount = {
      id: newId,
      username: cleanUsername || `usuario.${Date.now().toString().slice(-4)}`,
      name: data.name,
      role: data.role,
      roleLabel: getRoleLabel(data.role),
      pin: data.pin,
      active: true,
      createdAt: new Date().toISOString().split('T')[0],
      notes: data.notes || 'Cadastrado no sistema escolar',
    };

    // Salva no banco de usuários
    const users = this.getUsers();
    users.push(newUser);
    try {
      localStorage.setItem('school_users', JSON.stringify(users));
    } catch (e) {
      console.error(e);
    }

    // Salva a senha numérica de 4 dígitos
    try {
      const savedPins = localStorage.getItem('school_pins');
      const pins = savedPins ? JSON.parse(savedPins) : { ...DEFAULT_PINS };
      pins[newId] = {
        pin: data.pin,
        user: {
          id: newUser.id,
          username: newUser.username,
          name: newUser.name,
          role: newUser.role,
          roleLabel: newUser.roleLabel,
        }
      };
      localStorage.setItem('school_pins', JSON.stringify(pins));
    } catch (e) {
      console.error(e);
    }

    return newUser;
  },

  updateUser(id: string, updates: Partial<UserAccount>): UserAccount | null {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;

    users[idx] = { ...users[idx], ...updates };
    try {
      localStorage.setItem('school_users', JSON.stringify(users));
    } catch (e) {
      console.error(e);
    }

    // Sincroniza dados da sessão no mapa de PINs
    try {
      const savedPins = localStorage.getItem('school_pins');
      const pins = savedPins ? JSON.parse(savedPins) : { ...DEFAULT_PINS };
      if (pins[id]) {
        pins[id].user = {
          ...pins[id].user,
          name: users[idx].name,
          role: users[idx].role,
          roleLabel: users[idx].roleLabel,
        };
        if (updates.pin) {
          pins[id].pin = updates.pin;
        }
        localStorage.setItem('school_pins', JSON.stringify(pins));
      }
    } catch (e) {
      console.error(e);
    }

    return users[idx];
  },

  updateUserPin(userId: string, newPin: string): boolean {
    const users = this.getUsers();
    const u = users.find(x => x.id === userId);
    if (!u) return false;

    u.pin = newPin;
    try {
      localStorage.setItem('school_users', JSON.stringify(users));
    } catch (e) {
      console.error(e);
    }

    try {
      const savedPins = localStorage.getItem('school_pins');
      const pins = savedPins ? JSON.parse(savedPins) : { ...DEFAULT_PINS };
      pins[userId] = {
        pin: newPin,
        user: {
          id: u.id,
          username: u.username,
          name: u.name,
          role: u.role,
          roleLabel: u.roleLabel,
        }
      };
      localStorage.setItem('school_pins', JSON.stringify(pins));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  deleteUser(userId: string): boolean {
    const users = this.getUsers().filter(u => u.id !== userId);
    try {
      localStorage.setItem('school_users', JSON.stringify(users));
      const savedPins = localStorage.getItem('school_pins');
      if (savedPins) {
        const pins = JSON.parse(savedPins);
        delete pins[userId];
        localStorage.setItem('school_pins', JSON.stringify(pins));
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  verifyPin(userId: string, pin: string): { success: boolean; user?: UserSession; error?: string } {
    try {
      const savedPins = localStorage.getItem('school_pins');
      const pins = savedPins ? JSON.parse(savedPins) : { ...DEFAULT_PINS };
      const target = pins[userId];

      if (target) {
        if (target.pin === pin) {
          return { success: true, user: target.user };
        }
      }

      // Procura o usuário na lista ativa
      const users = this.getUsers();
      const u = users.find(x => x.id === userId);
      if (u) {
        if (u.pin === pin) {
          return {
            success: true,
            user: {
              id: u.id,
              username: u.username,
              name: u.name,
              role: u.role,
              roleLabel: u.roleLabel
            }
          };
        }
        // Se a senha padrão for 1234
        if (pin === '1234') {
          return {
            success: true,
            user: {
              id: u.id,
              username: u.username,
              name: u.name,
              role: u.role,
              roleLabel: u.roleLabel
            }
          };
        }
      }

      return { success: false, error: 'Senha numérica incorreta.' };
    } catch (e) {
      console.error(e);
      return { success: false, error: 'Erro ao validar senha.' };
    }
  },

  // === TURMAS ===
  getClasses(): SchoolClass[] {
    try {
      const saved = localStorage.getItem('school_classes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      // ignore
    }
    return DEFAULT_CLASSES;
  },

  createClass(cls: SchoolClass): SchoolClass {
    const classes = this.getClasses();
    const existingIdx = classes.findIndex(c => c.id.toLowerCase() === cls.id.toLowerCase());
    if (existingIdx !== -1) {
      classes[existingIdx] = { ...classes[existingIdx], ...cls };
    } else {
      classes.push(cls);
    }
    try {
      localStorage.setItem('school_classes', JSON.stringify(classes));
    } catch (e) {
      console.error(e);
    }
    return cls;
  },

  updateClass(clsId: string, updates: Partial<SchoolClass>): SchoolClass | null {
    const classes = this.getClasses();
    const idx = classes.findIndex(c => c.id.toLowerCase() === clsId.toLowerCase());
    if (idx === -1) return null;
    classes[idx] = { ...classes[idx], ...updates };
    try {
      localStorage.setItem('school_classes', JSON.stringify(classes));
    } catch (e) {
      console.error(e);
    }
    return classes[idx];
  },

  deleteClass(clsId: string) {
    const classes = this.getClasses().filter(c => c.id.toLowerCase() !== clsId.toLowerCase());
    try {
      localStorage.setItem('school_classes', JSON.stringify(classes));
    } catch (e) {
      console.error(e);
    }
  },

  // === ESTUDANTES ===
  getStudents(classId?: string): Student[] {
    try {
      const saved = localStorage.getItem('school_students');
      const list: Student[] = saved ? JSON.parse(saved) : DEFAULT_STUDENTS;
      if (classId) {
        return list.filter(s => s.classId === classId);
      }
      return list;
    } catch (e) {
      return DEFAULT_STUDENTS;
    }
  },

  getStudentById(id: string): Student | undefined {
    return this.getStudents().find(s => s.id === id);
  },

  saveStudents(students: Student[]) {
    try {
      localStorage.setItem('school_students', JSON.stringify(students));
    } catch (e) {
      console.error(e);
    }
  },

  updateStudent(studentId: string, updates: Partial<Student>): Student | null {
    const list = this.getStudents();
    const idx = list.findIndex(s => s.id === studentId);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates };
    this.saveStudents(list);
    return list[idx];
  },

  createStudent(data: Partial<Student>): Student {
    const list = this.getStudents();
    const newStudent: Student = {
      id: data.id || `std-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: data.name || 'Novo Estudante',
      ra: data.ra || `2024-${Math.floor(1000 + Math.random() * 9000)}`,
      classId: data.classId || '9A',
      className: data.className || '9º Ano A',
      status: data.status || 'regular',
      riskLevel: data.riskLevel || 'baixo',
      totalSchoolDays: data.totalSchoolDays || 45,
      totalAbsences: data.totalAbsences || 0,
      consecutiveAbsences: data.consecutiveAbsences || 0,
      attendanceRate: data.attendanceRate || 100,
      guardianName: data.guardianName || 'Responsável',
      guardianPhone: data.guardianPhone || '(11) 90000-0000',
      guardianRelationship: data.guardianRelationship || 'Responsável',
      address: data.address || 'Endereço escolar',
      neighborhood: data.neighborhood || 'Bairro escolar',
      vulnerabilityFactors: data.vulnerabilityFactors || [],
      notes: data.notes || 'Cadastrado no sistema',
      lastAttendanceDate: data.lastAttendanceDate || new Date().toISOString().split('T')[0],
    };

    list.push(newStudent);
    this.saveStudents(list);
    return newStudent;
  },

  deleteStudent(studentId: string) {
    const list = this.getStudents().filter(s => s.id !== studentId);
    this.saveStudents(list);
  },

  batchCreateStudents(studentsData: Partial<Student>[]): number {
    const currentList = this.getStudents();
    let count = 0;
    studentsData.forEach(d => {
      if (!d.name) return;
      const newStudent: Student = {
        id: d.id || `std-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        name: d.name,
        ra: d.ra || `2024-${Math.floor(1000 + Math.random() * 9000)}`,
        classId: d.classId || '9A',
        className: d.className || '9º Ano A',
        status: 'regular',
        riskLevel: 'baixo',
        totalSchoolDays: 45,
        totalAbsences: 0,
        consecutiveAbsences: 0,
        attendanceRate: 100,
        guardianName: d.guardianName || 'Responsável',
        guardianPhone: d.guardianPhone || '(11) 90000-0000',
        guardianRelationship: 'Responsável',
        address: 'Endereço escolar',
        neighborhood: 'Bairro escolar',
        vulnerabilityFactors: [],
        notes: 'Cadastrado via importação em lote',
        lastAttendanceDate: new Date().toISOString().split('T')[0],
      };
      currentList.push(newStudent);
      count++;
    });
    this.saveStudents(currentList);
    return count;
  },

  // === FREQUÊNCIA & DIÁRIO ===
  recordAttendance(
    items: {
      studentId: string;
      status: AttendanceStatus;
      durationDays?: number;
      justification?: string;
      medicalCertificate?: string;
      medicalDays?: number;
    }[],
    classId: string,
    recordedBy: string,
    date?: string
  ): { newAlerts: ParentAlert[] } {
    const students = this.getStudents();
    const newAlerts: ParentAlert[] = [];
    const currentDate = date || new Date().toISOString().split('T')[0];

    // Guarda histórico de chamadas diárias no localStorage
    let savedRecords: AttendanceRecord[] = [];
    try {
      const sr = localStorage.getItem('school_attendance_records');
      if (sr) savedRecords = JSON.parse(sr);
    } catch (e) {}

    items.forEach(item => {
      const student = students.find(s => s.id === item.studentId);
      if (!student) return;

      student.totalSchoolDays = (student.totalSchoolDays || 45) + 1;
      student.lastAttendanceDate = currentDate;

      if (item.status === 'falta_injustificada' || item.status === 'falta_justificada') {
        student.totalAbsences = (student.totalAbsences || 0) + 1;
        if (item.status === 'falta_injustificada') {
          student.consecutiveAbsences = (student.consecutiveAbsences || 0) + 1;
        }
      } else if (item.status === 'presente') {
        student.consecutiveAbsences = 0;
      }

      // Se tiver atestado médico registrado
      if (item.status === 'atestado_medico' && item.medicalCertificate) {
        student.notes = item.medicalCertificate;
      }

      // Recalcula taxa de presença
      student.attendanceRate = Math.max(
        0,
        Math.round(((student.totalSchoolDays - student.totalAbsences) / student.totalSchoolDays) * 1000) / 10
      );

      // Atualiza nível de risco
      if (student.attendanceRate < 75 || student.consecutiveAbsences >= 5) {
        student.riskLevel = 'critico';
        student.status = 'busca_ativa';
      } else if (student.attendanceRate < 80 || student.consecutiveAbsences >= 3) {
        student.riskLevel = 'alto';
        student.status = 'alerta';
      } else if (student.attendanceRate < 85) {
        student.riskLevel = 'medio';
        student.status = 'regular';
      } else {
        student.riskLevel = 'baixo';
        student.status = 'regular';
      }

      // Gera alerta automático se atingir 3 ausências consecutivas
      if (student.consecutiveAbsences >= 3) {
        const alert: ParentAlert = {
          id: `alt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          studentId: student.id,
          studentName: student.name,
          classId: student.classId,
          className: student.className,
          guardianPhone: student.guardianPhone,
          guardianName: student.guardianName,
          channel: 'whatsapp',
          triggerReason: '3_faltas_consecutivas',
          triggerLabel: `${student.consecutiveAbsences} ausências consecutivas`,
          status: 'enviado',
          sentAt: new Date().toISOString(),
          messageContent: `Prezado(a) ${student.guardianName}, a EE Professor Arlindo Silvestre comunica que seu(sua) filho(a) ${student.name} registrou ${student.consecutiveAbsences} ausências consecutivas. Solicitamos comparecer à coordenação.`,
          autoGenerated: true,
        };
        newAlerts.push(alert);
      }

      // Adiciona ao registro diário
      const recIndex = savedRecords.findIndex(r => r.studentId === item.studentId && r.date === currentDate);
      const recData: AttendanceRecord = {
        id: `att-${Date.now()}-${item.studentId}`,
        studentId: item.studentId,
        studentName: student.name,
        classId: student.classId,
        className: student.className,
        date: currentDate,
        status: item.status,
        justification: item.justification,
        medicalCertificate: item.medicalCertificate,
        recordedBy: recordedBy || 'AOE / Equipe Escolar',
        createdAt: new Date().toISOString(),
      };
      if (recIndex !== -1) {
        savedRecords[recIndex] = recData;
      } else {
        savedRecords.push(recData);
      }
    });

    this.saveStudents(students);

    try {
      localStorage.setItem('school_attendance_records', JSON.stringify(savedRecords));
    } catch (e) {
      console.error(e);
    }

    if (newAlerts.length > 0) {
      const existingAlerts = this.getAlerts();
      const updatedAlerts = [...newAlerts, ...existingAlerts];
      try {
        localStorage.setItem('school_alerts', JSON.stringify(updatedAlerts));
      } catch (e) {
        console.error(e);
      }
    }

    return { newAlerts };
  },

  getAttendanceRecords(classId?: string, date?: string): AttendanceRecord[] {
    try {
      const saved = localStorage.getItem('school_attendance_records');
      if (saved) {
        let list: AttendanceRecord[] = JSON.parse(saved);
        if (classId) list = list.filter(r => r.classId === classId);
        if (date) list = list.filter(r => r.date === date);
        return list;
      }
    } catch (e) {}
    return [];
  },

  // === PORTARIA & MOVIMENTAÇÕES DE ALUNOS ===
  getGateRecords(date?: string, classId?: string): GateRecord[] {
    try {
      const saved = localStorage.getItem('school_gate_records');
      if (saved) {
        let list: GateRecord[] = JSON.parse(saved);
        if (date) list = list.filter(r => r.date === date);
        if (classId) list = list.filter(r => r.classId === classId);
        return list;
      }
    } catch (e) {}
    return [];
  },

  createGateRecord(record: GateRecord): GateRecord {
    const list = this.getGateRecords();
    list.unshift(record);
    try {
      localStorage.setItem('school_gate_records', JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
    return record;
  },

  deleteGateRecord(id: string): boolean {
    const list = this.getGateRecords().filter(r => r.id !== id);
    try {
      localStorage.setItem('school_gate_records', JSON.stringify(list));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  // === ALERTAS ===
  getAlerts(): ParentAlert[] {
    try {
      const saved = localStorage.getItem('school_alerts');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return DEFAULT_ALERTS;
  },

  addAlert(alert: ParentAlert): ParentAlert {
    const list = this.getAlerts();
    list.unshift(alert);
    try {
      localStorage.setItem('school_alerts', JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
    return alert;
  },

  updateAlertStatus(alertId: string, status: string, notes?: string): ParentAlert | null {
    const list = this.getAlerts();
    const alert = list.find(a => a.id === alertId);
    if (alert) {
      alert.status = status as any;
      if (status === 'lido' && !alert.readAt) {
        alert.readAt = new Date().toISOString();
      }
      if (notes) {
        alert.notes = notes;
      }
      try {
        localStorage.setItem('school_alerts', JSON.stringify(list));
      } catch (e) {
        console.error(e);
      }
      return alert;
    }
    return null;
  },

  // === INTERVENÇÕES & BUSCA ATIVA ===
  getInterventions(): InterventionCase[] {
    try {
      const saved = localStorage.getItem('school_interventions');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return DEFAULT_INTERVENTIONS;
  },

  addIntervention(c: InterventionCase): InterventionCase {
    const list = this.getInterventions();
    list.unshift(c);
    try {
      localStorage.setItem('school_interventions', JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
    return c;
  },

  addInterventionAction(caseId: string, action: any): InterventionCase | null {
    const list = this.getInterventions();
    const item = list.find(c => c.id === caseId);
    if (item) {
      if (!item.actionLog) item.actionLog = [];
      item.actionLog.push({
        id: `act-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        action: action.action || action.type || 'Ação de Busca Ativa',
        author: action.author || action.responsibleParty || 'Equipe Escolar',
        notes: action.notes || action.description || '',
        result: action.result || action.outcome || '',
      });
      if (action.newStage) {
        item.stage = action.newStage;
      }
      item.lastUpdatedAt = new Date().toISOString().split('T')[0];
      try {
        localStorage.setItem('school_interventions', JSON.stringify(list));
      } catch (e) {
        console.error(e);
      }
      return item;
    }
    return null;
  },

  // === INFORMAÇÕES ESCOLARES & RELATÓRIOS ===
  getSchoolInfo() {
    return DEFAULT_SCHOOL_INFO;
  },

  getMonthlyReport() {
    return DEFAULT_REPORT;
  },

  // === RESET DE CONTINGÊNCIA ===
  resetToDefaults() {
    try {
      localStorage.removeItem('school_users');
      localStorage.removeItem('school_pins');
      localStorage.removeItem('school_classes');
      localStorage.removeItem('school_students');
      localStorage.removeItem('school_alerts');
      localStorage.removeItem('school_interventions');
      localStorage.removeItem('school_attendance_records');
      localStorage.removeItem('school_gate_records');
    } catch (e) {
      console.error(e);
    }
  }
};
