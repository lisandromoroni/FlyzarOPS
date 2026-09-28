import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Validar conexión inicial a Firestore según especificaciones
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase en modo offline o conectando...');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface CloudSavingsRecord {
  id: string;
  dateStr: string;
  registration: string;
  flightNumber?: string;
  route: string;
  leg1Oaci?: string;
  leg2Oaci?: string;
  leg3Oaci?: string;
  hasLeg3?: boolean;
  extraUSG: number;
  extraLbs: number;
  extraLts: number;
  totalSavingsUSD: number;
  useCarryCost: boolean;
  carryBurnUSG?: number;
  carryCostUSD?: number;
  notes?: string;
  createdAt?: string;
}

export function subscribeToSavingsRecords(
  onUpdate: (records: CloudSavingsRecord[]) => void,
  onError?: (error: Error) => void
) {
  const path = 'savings_records';
  const collRef = collection(db, path);

  return onSnapshot(
    collRef,
    (snapshot) => {
      const records: CloudSavingsRecord[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as CloudSavingsRecord;
        records.push({
          ...data,
          id: d.id,
        });
      });

      // Ordenar cronológicamente descendente (más nuevos primero)
      records.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });

      onUpdate(records);
    },
    (err) => {
      console.warn('Error suscribiendo a savings_records en Firestore:', err);
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export async function saveRecordToCloud(record: CloudSavingsRecord): Promise<void> {
  const path = `savings_records/${record.id}`;
  try {
    const docRef = doc(db, 'savings_records', record.id);
    const payload: Record<string, any> = {
      id: record.id,
      dateStr: record.dateStr,
      registration: record.registration,
      route: record.route,
      extraUSG: Number(record.extraUSG),
      extraLbs: Number(record.extraLbs),
      extraLts: Number(record.extraLts),
      totalSavingsUSD: Number(record.totalSavingsUSD),
      useCarryCost: Boolean(record.useCarryCost),
      createdAt: record.createdAt || new Date().toISOString(),
    };

    if (record.leg1Oaci) payload.leg1Oaci = record.leg1Oaci;
    if (record.leg2Oaci) payload.leg2Oaci = record.leg2Oaci;
    if (record.leg3Oaci) payload.leg3Oaci = record.leg3Oaci;
    if (record.hasLeg3 !== undefined) payload.hasLeg3 = record.hasLeg3;
    if (record.carryBurnUSG !== undefined) payload.carryBurnUSG = Number(record.carryBurnUSG);
    if (record.carryCostUSD !== undefined) payload.carryCostUSD = Number(record.carryCostUSD);
    if (record.flightNumber && record.flightNumber.trim()) {
      payload.flightNumber = record.flightNumber.trim();
    }
    if (record.notes && record.notes.trim()) {
      payload.notes = record.notes.trim();
    }

    await setDoc(docRef, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateRecordInCloud(record: CloudSavingsRecord): Promise<void> {
  const path = `savings_records/${record.id}`;
  try {
    const docRef = doc(db, 'savings_records', record.id);
    const payload: Record<string, any> = {
      id: record.id,
      dateStr: record.dateStr,
      registration: record.registration,
      route: record.route,
      extraUSG: Number(record.extraUSG),
      extraLbs: Number(record.extraLbs),
      extraLts: Number(record.extraLts),
      totalSavingsUSD: Number(record.totalSavingsUSD),
      useCarryCost: Boolean(record.useCarryCost),
      createdAt: record.createdAt || new Date().toISOString(),
    };

    if (record.leg1Oaci) payload.leg1Oaci = record.leg1Oaci;
    if (record.leg2Oaci) payload.leg2Oaci = record.leg2Oaci;
    if (record.leg3Oaci) payload.leg3Oaci = record.leg3Oaci;
    if (record.hasLeg3 !== undefined) payload.hasLeg3 = record.hasLeg3;
    if (record.carryBurnUSG !== undefined) payload.carryBurnUSG = Number(record.carryBurnUSG);
    if (record.carryCostUSD !== undefined) payload.carryCostUSD = Number(record.carryCostUSD);

    if (record.flightNumber && record.flightNumber.trim()) {
      payload.flightNumber = record.flightNumber.trim();
    } else {
      payload.flightNumber = '';
    }
    if (record.notes && record.notes.trim()) {
      payload.notes = record.notes.trim();
    } else {
      payload.notes = '';
    }

    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteRecordFromCloud(id: string): Promise<void> {
  const path = `savings_records/${id}`;
  try {
    const docRef = doc(db, 'savings_records', id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
