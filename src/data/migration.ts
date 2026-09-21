import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { storageService } from './storageService';

export const migrateToFirebase = async () => {
  if (localStorage.getItem('firebase_migration_completed')) return;

  const users = storageService.getUsers();
  const classes = storageService.getClasses();
  const students = storageService.getStudents();
  const alerts = storageService.getAlerts();
  const records = storageService.getAttendanceRecords();

  try {
    for (const u of users) {
      await setDoc(doc(db, 'users', u.id), u);
    }
    for (const c of classes) {
      await setDoc(doc(db, 'classes', c.id), c);
    }
    for (const s of students) {
      await setDoc(doc(db, 'students', s.id), s);
    }
    for (const a of alerts) {
      await setDoc(doc(db, 'alerts', a.id), a);
    }
    for (const r of records) {
      await setDoc(doc(db, 'attendance_records', r.id), r);
    }

    localStorage.setItem('firebase_migration_completed', 'true');
    console.log('Migração concluída com sucesso!');
  } catch (error) {
    console.error('Erro na migração:', error);
  }
};
