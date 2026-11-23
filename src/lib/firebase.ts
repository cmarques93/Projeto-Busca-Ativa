import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  doc,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function createFirestoreInstance(firebaseApp: FirebaseApp): Firestore {
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  try {
    return initializeFirestore(
      firebaseApp,
      {
        experimentalForceLongPolling: true,
        ignoreUndefinedProperties: true,
      },
      databaseId
    );
  } catch {
    return getFirestore(firebaseApp, databaseId);
  }
}

export const db: Firestore = createFirestoreInstance(app);
export const auth = getAuth(app);

let startupConnectionTested = false;
export async function validateFirestoreStartupConnection(): Promise<void> {
  if (startupConnectionTested) return;
  startupConnectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore está temporariamente offline ou inacessível. Operando com cache local.');
    }
  }
}

validateFirestoreStartupConnection();
