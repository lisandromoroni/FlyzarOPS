export interface PaxRecord {
  id: string;
  fullName: string;
  nationality: string;
  birthDate: string;
  dni: string;
  passportNumber: string;
  docsCombined?: string;
  isCustom?: boolean;
}

export const INITIAL_PAX_DATABASE: PaxRecord[] = [];
