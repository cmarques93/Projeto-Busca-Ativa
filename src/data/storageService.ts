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
import { SchoolClass, Student, ParentAlert, InterventionCase, UserSession } from '../types';

export const storageService = {
  getUsers() {
    try {
      const saved = localStorage.getItem('school_users');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return DEFAULT_USERS;
  },

  verifyPin(userId: string, pin: string): { success: boolean; user?: UserSession; error?: string } {
    try {
      const savedPins = localStorage.getItem('school_pins');
      const pins = savedPins ? JSON.parse(savedPins) : DEFAULT_PINS;
      const target = pins[userId];

      if (!target) {
        // Find user in users list
        const users = this.getUsers();
        const u = users.find((x: any) => x.id === userId);
        if (u) {
          // If default user not in custom pins, check default
          const def = DEFAULT_PINS[userId];
          if (def && def.pin === pin) {
            return { success: true, user: def.user };
          }
          // If 1234 or pin matches
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
        return { success: false, error: 'Usuário não encontrado ou senha incorreta.' };
      }

      if (target.pin === pin) {
        return { success: true, user: target.user };
      }
    } catch (e) {
      console.error(e);
    }
    return { success: false, error: 'Senha incorreta.' };
  },

  getClasses(): SchoolClass[] {
    try {
      const saved = localStorage.getItem('school_classes');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return DEFAULT_CLASSES;
  },

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

  saveStudents(students: Student[]) {
    try {
      localStorage.setItem('school_students', JSON.stringify(students));
    } catch (e) {
      // ignore
    }
  },

  getAlerts(): ParentAlert[] {
    try {
      const saved = localStorage.getItem('school_alerts');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return DEFAULT_ALERTS;
  },

  getInterventions(): InterventionCase[] {
    try {
      const saved = localStorage.getItem('school_interventions');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return DEFAULT_INTERVENTIONS;
  },

  getSchoolInfo() {
    return DEFAULT_SCHOOL_INFO;
  },

  getMonthlyReport() {
    return DEFAULT_REPORT;
  }
};
