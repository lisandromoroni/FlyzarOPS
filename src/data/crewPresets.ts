export interface CrewMemberPreset {
  id: string;
  fullName: string;
  role: 'PIC' | 'SIC' | 'FA' | 'DISPATCHER';
  licenseNumber: string;
  nationality: string;
  passportNumber: string;
}

export const FLYZAR_CREW_PRESETS: CrewMemberPreset[] = [];
