import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  Plane,
  Users,
  UserCheck,
  Calendar,
  MapPin,
  Clock,
  Printer,
  Plus,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
  Copy,
  ChevronDown,
  Upload,
  Search,
  UserPlus,
  FileSpreadsheet,
  RefreshCw,
  Eye,
  Check,
  X,
  Cloud,
  Link,
  ExternalLink
} from 'lucide-react';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { INITIAL_PAX_DATABASE, PaxRecord } from '../data/paxDatabase';
import { FLYZAR_CREW_PRESETS, CrewMemberPreset } from '../data/crewPresets';
import { GendecPrintTemplate } from './GendecPrintTemplate';

export interface CrewMember {
  id: string;
  fullName: string;
  role: 'PIC' | 'SIC' | 'FA' | 'DISPATCHER';
  licenseNumber: string;
  nationality: string;
  passportNumber: string;
}

export interface SelectedPax {
  id: string;
  fullName: string;
  nationality: string;
  birthDate?: string;
  dni?: string;
  passportNumber?: string;
}

const FLYZAR_AIRCRAFT = [
  'LV-KLH',
  'LV-VEG',
  'LV-SYG',
  'LV-FUT',
  'LV-CUE',
  'LV-GCK',
  'LV-CJY',
  'LV-GQN',
];

const LOCAL_STORAGE_KEY_PAX = 'flyzar_gendec_pax_db_v1';
const LOCAL_STORAGE_KEY_CUSTOM_PAX = 'flyzar_gendec_custom_pax_v1';

export const GendecModule: React.FC = () => {
  // Flight Details
  const [operator] = useState<string>('FLYZAR S.A.');
  const [registration, setRegistration] = useState<string>('LV-KLH');
  const [flightNumber, setFlightNumber] = useState<string>('PRIVADO');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [departureOaci, setDepartureOaci] = useState<string>('SABE');
  const [arrivalOaci, setArrivalOaci] = useState<string>('SAEZ');
  const [stdTime, setStdTime] = useState<string>('14:00');
  const [staTime, setStaTime] = useState<string>('15:00');
  const [flightType] = useState<string>('PRIVADO');

  // Database of Pax: Starts from Excel preset, allows uploading new Excel or adding on the fly
  const [paxDatabase, setPaxDatabase] = useState<PaxRecord[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_PAX);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error loading stored pax', e);
    }
    return INITIAL_PAX_DATABASE;
  });

  // Dynamic crew list (loaded from Excel 'crew' sheet or presets)
  const [crewPresets, setCrewPresets] = useState<CrewMemberPreset[]>(() => {
    try {
      const stored = localStorage.getItem('flyzar_gendec_crew_db_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error loading stored crew', e);
    }
    return FLYZAR_CREW_PRESETS;
  });

  // Selected Manifests: start empty (no preassigned crew)
  const [crew, setCrew] = useState<CrewMember[]>([]);

  const [passengers, setPassengers] = useState<SelectedPax[]>([]);

  // Health and remarks
  const [illnessReported, setIllnessReported] = useState<boolean>(false);
  const [disinsectingDone, setDisinsectingDone] = useState<boolean>(false);
  const [remarks, setRemarks] = useState<string>('NIL');

  // Search & Selector helpers for Pax
  const [paxSearchTerm, setPaxSearchTerm] = useState<string>('');
  const [isAddingNewPersonModal, setIsAddingNewPersonModal] = useState<boolean>(false);
  const [newPersonName, setNewPersonName] = useState<string>('');
  const [newPersonNat, setNewPersonNat] = useState<string>('ARG');
  const [newPersonBirth, setNewPersonBirth] = useState<string>('');
  const [newPersonDni, setNewPersonDni] = useState<string>('');
  const [newPersonPass, setNewPersonPass] = useState<string>('');
  const [addToFlightImmediately, setAddToFlightImmediately] = useState<boolean>(true);

  // Search & Selector helpers for Crew (identical to Pax)
  const [crewSearchTerm, setCrewSearchTerm] = useState<string>('');
  const [isAddingNewCrewModal, setIsAddingNewCrewModal] = useState<boolean>(false);
  const [newCustomCrewName, setNewCustomCrewName] = useState<string>('');
  const [newCustomCrewRole, setNewCustomCrewRole] = useState<'PIC' | 'SIC' | 'FA' | 'DISPATCHER'>('PIC');
  const [newCustomCrewLic, setNewCustomCrewLic] = useState<string>('');
  const [newCustomCrewDoc, setNewCustomCrewDoc] = useState<string>('');
  const [newCustomCrewNat, setNewCustomCrewNat] = useState<string>('ARG');
  const [addCrewToFlightImmediately, setAddCrewToFlightImmediately] = useState<boolean>(true);

  // UI status
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);
  const [excelUploadSuccess, setExcelUploadSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cloud URL for live spreadsheet synchronization (Google Sheets / OneDrive CSV / direct link)
  const [cloudUrl, setCloudUrl] = useState<string>(() => {
    return localStorage.getItem('flyzar_gendec_cloud_url_v1') || '';
  });
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => {
    return localStorage.getItem('flyzar_gendec_last_sync_time_v1') || '';
  });
  const [showCloudConfigModal, setShowCloudConfigModal] = useState<boolean>(false);

  // Save changes of paxDatabase to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_PAX, JSON.stringify(paxDatabase));
    } catch (e) {
      console.warn('Could not persist pax db', e);
    }
  }, [paxDatabase]);

  // Save changes of crewPresets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('flyzar_gendec_crew_db_v1', JSON.stringify(crewPresets));
    } catch (e) {
      console.warn('Could not persist crew db', e);
    }
  }, [crewPresets]);

  // Function to fetch and sync from Cloud URL
  const fetchAndSyncFromCloud = async (targetUrl?: string) => {
    const url = (targetUrl || cloudUrl).trim();
    if (!url) {
      setShowCloudConfigModal(true);
      return;
    }

    setIsSyncingCloud(true);
    setCloudSyncError(null);

    try {
      // Format Google Sheets URL for direct export if applicable
      let fetchUrl = url;
      if (url.includes('docs.google.com/spreadsheets')) {
        const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (idMatch && idMatch[1]) {
          fetchUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=xlsx`;
        }
      }

      const res = await fetch(fetchUrl);
      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status}: no se pudo acceder al enlace remoto.`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });

      const importedPax: PaxRecord[] = [];
      const importedCrew: CrewMemberPreset[] = [];

      const paxSheetNames = wb.SheetNames.filter((s) => s.toLowerCase().includes('pax'));
      const crewSheetNames = wb.SheetNames.filter(
        (s) =>
          s.toLowerCase().includes('crew') ||
          s.toLowerCase().includes('tripulacion') ||
          s.toLowerCase().includes('piloto')
      );

      const targetPaxSheets = paxSheetNames.length > 0 ? paxSheetNames : wb.SheetNames;

      // 1. Process Pax
      targetPaxSheets.forEach((sheetName) => {
        if (crewSheetNames.includes(sheetName)) return;
        const ws = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        rows.forEach((row) => {
          if (!Array.isArray(row) || row.length < 2) return;
          let nameIdx = -1;
          for (let i = 0; i < Math.min(row.length, 4); i++) {
            const val = String(row[i] || '').trim();
            if (
              val &&
              val.includes(',') &&
              !val.toLowerCase().includes('apellido') &&
              !val.toLowerCase().includes('completar') &&
              !val.toLowerCase().includes('insertar')
            ) {
              nameIdx = i;
              break;
            }
          }

          if (nameIdx !== -1) {
            const fullName = String(row[nameIdx] || '').trim().replace(/^["']|["']$/g, '');
            const nat = String(row[nameIdx + 1] || 'ARG').trim().replace(/[\r\n]+/g, ' / ');
            const birth = String(row[nameIdx + 2] || '').trim();
            const dni = String(row[nameIdx + 3] || '').trim().replace(/[\r\n]+/g, ' / ');
            const pass = String(row[nameIdx + 4] || '').trim().replace(/[\r\n]+/g, ' / ');

            if (fullName && fullName.length > 2) {
              importedPax.push({
                id: 'pax-' + importedPax.length + '-' + Math.random().toString(36).substr(2, 4),
                fullName,
                nationality: nat,
                birthDate: birth,
                dni,
                passportNumber: pass,
              });
            }
          }
        });
      });

      // 2. Process Crew
      crewSheetNames.forEach((sheetName) => {
        const ws = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        rows.forEach((row, idx) => {
          if (!Array.isArray(row) || row.length < 2) return;
          const fullStr = row.map((c) => String(c || '')).join(' ');
          if (fullStr.toLowerCase().includes('nombre') && fullStr.toLowerCase().includes('licencia')) return;

          const rawName = String(row[0] || row[1] || '').trim().replace(/^["']|["']$/g, '');
          if (rawName && rawName.length > 3) {
            const roleVal = String(row[2] || '').toUpperCase();
            let role: 'PIC' | 'SIC' | 'FA' | 'DISPATCHER' = 'PIC';
            if (roleVal.includes('COPILOTO') || roleVal.includes('SIC')) role = 'SIC';
            else if (roleVal.includes('TCP') || roleVal.includes('FA') || roleVal.includes('CABIN')) role = 'FA';
            else if (roleVal.includes('DESPACHO') || roleVal.includes('DISPATCH')) role = 'DISPATCHER';

            const lic = String(row[3] || row[2] || 'TLA').trim().toUpperCase();
            const nat = String(row[4] || 'ARG').trim().toUpperCase();
            const doc = String(row[5] || row[4] || '').trim().toUpperCase();

            importedCrew.push({
              id: 'cr-imp-' + idx,
              fullName: rawName,
              role,
              licenseNumber: lic,
              nationality: nat || 'ARG',
              passportNumber: doc,
            });
          }
        });
      });

      if (importedPax.length > 0) {
        const existingMap = new Map(paxDatabase.map((p) => [p.fullName.toLowerCase(), p]));
        importedPax.forEach((p) => existingMap.set(p.fullName.toLowerCase(), p));
        setPaxDatabase(Array.from(existingMap.values()));
      }

      if (importedCrew.length > 0) {
        setCrewPresets(importedCrew);
      }

      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastSyncTime(nowStr);
      localStorage.setItem('flyzar_gendec_last_sync_time_v1', nowStr);
      localStorage.setItem('flyzar_gendec_cloud_url_v1', url);

      setExcelUploadSuccess(`Sincronización en la nube exitosa (${nowStr}): ${importedPax.length} pax y ${importedCrew.length} tripulantes.`);
      setTimeout(() => setExcelUploadSuccess(null), 6000);
      setShowCloudConfigModal(false);
    } catch (err: any) {
      console.error('Error syncing cloud spreadsheet:', err);
      setCloudSyncError(err.message || 'No se pudo descargar el archivo remoto. Compruebe el link y los permisos públicos de lectura.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Auto-sync on startup if cloud URL is saved
  useEffect(() => {
    if (cloudUrl) {
      fetchAndSyncFromCloud(cloudUrl);
    }
  }, []);

  // Filtered Pax for search
  const filteredPax = useMemo(() => {
    if (!paxSearchTerm.trim()) return [];
    const term = paxSearchTerm.toLowerCase().trim();
    return paxDatabase
      .filter(
        (p) =>
          p.fullName.toLowerCase().includes(term) ||
          p.dni.toLowerCase().includes(term) ||
          p.passportNumber.toLowerCase().includes(term)
      )
      .slice(0, 15);
  }, [paxSearchTerm, paxDatabase]);

  // Filtered Crew for search (identical to Pax)
  const filteredCrew = useMemo(() => {
    if (!crewSearchTerm.trim()) return [];
    const term = crewSearchTerm.toLowerCase().trim();
    return crewPresets
      .filter(
        (c) =>
          c.fullName.toLowerCase().includes(term) ||
          c.role.toLowerCase().includes(term) ||
          c.licenseNumber.toLowerCase().includes(term) ||
          c.passportNumber.toLowerCase().includes(term)
      )
      .slice(0, 15);
  }, [crewSearchTerm, crewPresets]);

  // Add pax from database
  const handleSelectPax = (p: PaxRecord) => {
    if (passengers.some((item) => item.fullName === p.fullName)) {
      alert(`El pasajero "${p.fullName}" ya está en la lista de este vuelo.`);
      return;
    }
    setPassengers((prev) => [
      ...prev,
      {
        id: 'pax-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        fullName: p.fullName,
        nationality: p.nationality || 'ARG',
        birthDate: p.birthDate || '',
        dni: p.dni || '',
        passportNumber: p.passportNumber || '',
      },
    ]);
    setPaxSearchTerm('');
  };

  // Add crew from database (search)
  const handleSelectCrew = (c: CrewMemberPreset) => {
    if (crew.some((item) => item.fullName === c.fullName)) {
      alert(`El tripulante "${c.fullName}" ya está en la lista de este vuelo.`);
      return;
    }
    setCrew((prev) => [
      ...prev,
      {
        id: 'c-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        fullName: c.fullName,
        role: c.role,
        licenseNumber: c.licenseNumber,
        nationality: c.nationality || 'ARG',
        passportNumber: c.passportNumber || 'N/A',
      },
    ]);
    setCrewSearchTerm('');
  };

  // Create new crew member
  const handleCreateNewCrew = () => {
    if (!newCustomCrewName.trim()) {
      alert('Por favor ingrese el apellido y nombre del tripulante.');
      return;
    }

    const created: CrewMemberPreset = {
      id: 'cr-custom-' + Date.now(),
      fullName: newCustomCrewName.trim().toUpperCase(),
      role: newCustomCrewRole,
      licenseNumber: newCustomCrewLic.trim().toUpperCase() || 'N/A',
      nationality: newCustomCrewNat.trim().toUpperCase() || 'ARG',
      passportNumber: newCustomCrewDoc.trim().toUpperCase() || 'N/A',
    };

    setCrewPresets((prev) => [created, ...prev]);

    if (addCrewToFlightImmediately) {
      setCrew((prev) => [
        ...prev,
        {
          id: 'c-' + Date.now(),
          fullName: created.fullName,
          role: created.role,
          licenseNumber: created.licenseNumber,
          nationality: created.nationality,
          passportNumber: created.passportNumber,
        },
      ]);
    }

    setNewCustomCrewName('');
    setNewCustomCrewRole('PIC');
    setNewCustomCrewLic('');
    setNewCustomCrewDoc('');
    setNewCustomCrewNat('ARG');
    setIsAddingNewCrewModal(false);
  };

  // Remove passenger from current flight
  const handleRemovePax = (id: string) => {
    setPassengers((prev) => prev.filter((p) => p.id !== id));
  };

  // Add completely new person
  const handleCreateNewPerson = () => {
    if (!newPersonName.trim()) {
      alert('Por favor ingrese el apellido y nombre.');
      return;
    }

    const created: PaxRecord = {
      id: 'custom-' + Date.now(),
      fullName: newPersonName.trim().toUpperCase(),
      nationality: newPersonNat.trim().toUpperCase() || 'ARG',
      birthDate: newPersonBirth.trim(),
      dni: newPersonDni.trim(),
      passportNumber: newPersonPass.trim().toUpperCase(),
      isCustom: true,
    };

    // Add to DB
    setPaxDatabase((prev) => [created, ...prev]);

    // Add to flight if checked
    if (addToFlightImmediately) {
      setPassengers((prev) => [
        ...prev,
        {
          id: 'pax-' + Date.now(),
          fullName: created.fullName,
          nationality: created.nationality,
          birthDate: created.birthDate,
          dni: created.dni,
          passportNumber: created.passportNumber,
        },
      ]);
    }

    // Reset form
    setNewPersonName('');
    setNewPersonNat('ARG');
    setNewPersonBirth('');
    setNewPersonDni('');
    setNewPersonPass('');
    setIsAddingNewPersonModal(false);
  };

  const handleRemoveCrew = (id: string) => {
    setCrew((prev) => prev.filter((c) => c.id !== id));
  };

  // Upload and parse Excel file with dedicated support for "pax" and "crew" tabs
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });

        const importedPax: PaxRecord[] = [];
        const importedCrew: CrewMemberPreset[] = [];

        // Identify sheets by name
        const paxSheetNames = wb.SheetNames.filter((s) => s.toLowerCase().includes('pax'));
        const crewSheetNames = wb.SheetNames.filter((s) => s.toLowerCase().includes('crew') || s.toLowerCase().includes('tripulacion') || s.toLowerCase().includes('piloto'));

        const targetPaxSheets = paxSheetNames.length > 0 ? paxSheetNames : wb.SheetNames;

        // 1. Process Pax Sheets
        targetPaxSheets.forEach((sheetName) => {
          // If there's a designated crew sheet, don't parse it as pax
          if (crewSheetNames.includes(sheetName)) return;

          const ws = wb.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

          rows.forEach((row) => {
            if (!Array.isArray(row) || row.length < 2) return;

            let nameIdx = -1;
            for (let i = 0; i < Math.min(row.length, 4); i++) {
              const val = String(row[i] || '').trim();
              if (
                val &&
                val.includes(',') &&
                !val.toLowerCase().includes('apellido') &&
                !val.toLowerCase().includes('completar') &&
                !val.toLowerCase().includes('insertar')
              ) {
                nameIdx = i;
                break;
              }
            }

            if (nameIdx !== -1) {
              const fullName = String(row[nameIdx] || '').trim().replace(/^["']|["']$/g, '');
              const nat = String(row[nameIdx + 1] || 'ARG').trim().replace(/[\r\n]+/g, ' / ');
              const birth = String(row[nameIdx + 2] || '').trim();
              const dni = String(row[nameIdx + 3] || '').trim().replace(/[\r\n]+/g, ' / ');
              const pass = String(row[nameIdx + 4] || '').trim().replace(/[\r\n]+/g, ' / ');

              if (fullName && fullName.length > 2) {
                importedPax.push({
                  id: 'pax-' + importedPax.length + '-' + Math.random().toString(36).substr(2, 4),
                  fullName,
                  nationality: nat,
                  birthDate: birth,
                  dni,
                  passportNumber: pass,
                });
              }
            }
          });
        });

        // 2. Process Crew Sheet if present
        crewSheetNames.forEach((sheetName) => {
          const ws = wb.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

          rows.forEach((row, idx) => {
            if (!Array.isArray(row) || row.length < 2) return;
            const fullStr = row.map((c) => String(c || '')).join(' ');
            if (fullStr.toLowerCase().includes('nombre') && fullStr.toLowerCase().includes('licencia')) return;

            // Find name
            const rawName = String(row[0] || row[1] || '').trim().replace(/^["']|["']$/g, '');
            if (rawName && rawName.length > 3) {
              const roleVal = String(row[2] || '').toUpperCase();
              let role: 'PIC' | 'SIC' | 'FA' | 'DISPATCHER' = 'PIC';
              if (roleVal.includes('COPILOTO') || roleVal.includes('SIC')) role = 'SIC';
              else if (roleVal.includes('TCP') || roleVal.includes('FA') || roleVal.includes('CABIN')) role = 'FA';
              else if (roleVal.includes('DESPACHO') || roleVal.includes('DISPATCH')) role = 'DISPATCHER';

              const lic = String(row[3] || row[2] || 'TLA').trim().toUpperCase();
              const nat = String(row[4] || 'ARG').trim().toUpperCase();
              const doc = String(row[5] || row[4] || '').trim().toUpperCase();

              importedCrew.push({
                id: 'cr-imp-' + idx,
                fullName: rawName,
                role,
                licenseNumber: lic,
                nationality: nat || 'ARG',
                passportNumber: doc,
              });
            }
          });
        });

        let msg = '';
        if (importedPax.length > 0) {
          const existingMap = new Map(paxDatabase.map((p) => [p.fullName.toLowerCase(), p]));
          importedPax.forEach((p) => existingMap.set(p.fullName.toLowerCase(), p));
          const merged = Array.from(existingMap.values());
          setPaxDatabase(merged);
          msg += `Pestaña PAX: ${importedPax.length} registros cargados. `;
        }

        if (importedCrew.length > 0) {
          setCrewPresets(importedCrew);
          localStorage.setItem('flyzar_gendec_crew_db_v1', JSON.stringify(importedCrew));
          msg += `Pestaña CREW: ${importedCrew.length} tripulantes actualizados.`;
        }

        if (msg) {
          setExcelUploadSuccess(`¡Éxito! ${msg}`);
          setTimeout(() => setExcelUploadSuccess(null), 6000);
        } else {
          alert('No se detectaron filas válidas en las pestañas del archivo seleccionado.');
        }
      } catch (err) {
        console.error('Error parsing excel:', err);
        alert('Hubo un error al procesar el archivo Excel. Asegúrese de que tenga formato .xlsx o .csv.');
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Export PDF matching the official Excel layout
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Dark Header
    doc.setFillColor(42, 52, 64);
    doc.rect(0, 0, 210, 32, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('FLYZAR · GENERAL DECLARATION', 14, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('OUTWARD / INWARD DECLARATION - ICAO ANNEX 9 (DISPATCH OPERATIONS)', 14, 20);
    doc.text(`DATE: ${date}   |   FLIGHT: ${flightNumber}   |   AIRCRAFT: ${registration}`, 14, 26);

    let y = 38;

    // 1. FLIGHT ROUTING BOX
    doc.setTextColor(31, 36, 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('1. FLIGHT ROUTING & OPERATOR DETAILS', 14, y);
    doc.setDrawColor(200, 200, 200);
    doc.line(14, y + 2, 196, y + 2);

    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Operator: ${operator}`, 14, y);
    doc.text(`Registration Marks: ${registration}`, 80, y);
    doc.text(`Flight Number: ${flightNumber}`, 140, y);

    y += 5.5;
    doc.text(`Departure Point: ${departureOaci} (STD: ${stdTime} UTC)`, 14, y);
    doc.text(`Arrival Point: ${arrivalOaci} (STA: ${staTime} UTC)`, 100, y);

    // 2. CREW MANIFEST
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`2. CREW MANIFEST (${crew.length} MEMBERS)`, 14, y);
    doc.line(14, y + 2, 196, y + 2);

    y += 6;
    doc.setFillColor(242, 242, 242);
    doc.rect(14, y - 4, 182, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('ROLE', 16, y);
    doc.text('SURNAME, FIRST NAME', 38, y);
    doc.text('LIC / CERT', 105, y);
    doc.text('NAT', 145, y);
    doc.text('DOC / PASSPORT', 165, y);

    y += 5;
    doc.setFont('helvetica', 'normal');
    crew.forEach((c) => {
      doc.text(c.role, 16, y);
      doc.text(c.fullName, 38, y);
      doc.text(c.licenseNumber, 105, y);
      doc.text(c.nationality, 145, y);
      doc.text(c.passportNumber, 165, y);
      y += 5;
    });

    // 3. PASSENGERS
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`3. PASSENGER MANIFEST (${passengers.length} PASSENGERS)`, 14, y);
    doc.line(14, y + 2, 196, y + 2);

    y += 6;
    doc.setFillColor(242, 242, 242);
    doc.rect(14, y - 4, 182, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('#', 16, y);
    doc.text('APELLIDO, Nombre', 25, y);
    doc.text('NAC', 98, y);
    doc.text('FECHA NAC', 115, y);
    doc.text('DNI / CI', 140, y);
    doc.text('PASAPORTE', 168, y);

    y += 5;
    doc.setFont('helvetica', 'normal');
    if (passengers.length === 0) {
      doc.text('NO PASSENGERS ON BOARD (FERRY FLIGHT)', 16, y);
      y += 6;
    } else {
      passengers.forEach((p, idx) => {
        // Page break if too long
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(String(idx + 1), 16, y);
        doc.text(p.fullName.slice(0, 38), 25, y);
        doc.text(p.nationality.slice(0, 8), 98, y);
        doc.text(p.birthDate || '-', 115, y);
        doc.text(p.dni || '-', 140, y);
        doc.text(p.passportNumber || '-', 168, y);
        y += 5;
      });
    }

    // 4. HEALTH & REMARKS
    y += 6;
    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('4. DECLARATION OF HEALTH & SANITARY MEASURES', 14, y);
    doc.line(14, y + 2, 196, y + 2);

    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Illness suspected on board: ${illnessReported ? 'YES (See remarks)' : 'NIL / NONE REPORTED'}`, 14, y);
    y += 4.5;
    doc.text(`Disinsecting / sanitary measures: ${disinsectingDone ? 'COMPLETED' : 'NIL / NOT APPLICABLE'}`, 14, y);
    y += 4.5;
    doc.text(`Remarks: ${remarks || 'NIL'}`, 14, y);

    // SIGNATURES
    y += 18;
    if (y > 280) {
      doc.addPage();
      y = 30;
    }
    doc.setDrawColor(150, 150, 150);
    doc.line(25, y, 85, y);
    doc.line(125, y, 185, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('PILOT IN COMMAND (PIC)', 40, y + 4);
    doc.text('FLYZAR FLIGHT DISPATCHER', 138, y + 4);

    doc.save(`FLYZAR_GENDEC_${flightNumber}_${registration}_${date}.pdf`);
  };

  // Copy plain text for WhatsApp or Email
  const handleCopyManifest = () => {
    const text = `=== FLYZAR GENDEC / MANIFIESTO OFICIAL ===
FECHA: ${date}
VUELO: ${flightNumber} | AERONAVE: ${registration}
RUTA: ${departureOaci} (STD ${stdTime}z) -> ${arrivalOaci} (STA ${staTime}z)
OPERADOR: FLYZAR S.A.

-- TRIPULACIÓN (${crew.length}) --
${crew.map((c, i) => `${i + 1}. [${c.role}] ${c.fullName} - Lic: ${c.licenseNumber} - Doc: ${c.passportNumber}`).join('\n')}

-- PASAJEROS (${passengers.length}) --
${passengers.length === 0 ? 'Sin pasajeros (Ferry)' : passengers.map((p, i) => `${i + 1}. ${p.fullName} | Nac: ${p.nationality} | DNI: ${p.dni || '-'} | Pass: ${p.passportNumber || '-'}`).join('\n')}

OBSERVACIONES: ${remarks}
`;
    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  const gendecDataForPrint = {
    operator,
    registration,
    flightNumber,
    date,
    departureOaci,
    arrivalOaci,
    stdTime,
    staTime,
    flightType,
    crew,
    passengers,
    illnessReported,
    disinsectingDone,
    remarks,
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in pb-12 w-full">
      {/* Hidden file input for uploading new Excel versions */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx, .xls, .csv"
        className="hidden"
      />

      {/* Main Banner with Action Buttons */}
      <div className="bg-[#2a3440] text-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-amber-300" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-white leading-tight">
                  GENDEC · Flyzar
                </h2>
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded-md">
                  Excel Multi-Pestaña
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                {paxDatabase.length} pax cargados (pestaña PAX) · {crewPresets.length} tripulantes (pestaña CREW)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (cloudUrl) {
                  fetchAndSyncFromCloud();
                } else {
                  setShowCloudConfigModal(true);
                }
              }}
              disabled={isSyncingCloud}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 ${
                cloudUrl
                  ? 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                  : 'bg-white/20 hover:bg-white/30 text-white'
              }`}
              title={cloudUrl ? `Sincronizar ahora con la nube (${cloudUrl})` : 'Conectar enlace a Excel / Google Sheets en la nube'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
              <span>{isSyncingCloud ? 'Sincronizando...' : cloudUrl ? 'Sincronizar Nube' : 'Vincular Excel Online'}</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
              title="Cargar archivo Excel local (.xlsx)"
            >
              <Upload className="w-3.5 h-3.5 text-white" />
              <span>Cargar .xlsx</span>
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-[#2a3440] font-black text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
          </div>
        </div>

        {/* Info banner explaining tabs & cloud live status */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-[11px] text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">PAX</span>
            <span>Buscador de pasajeros</span>
            <span className="text-white/30">|</span>
            <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold text-[10px]">CREW</span>
            <span>Buscador de tripulantes</span>
          </div>

          <div className="flex items-center gap-2">
            {cloudUrl ? (
              <button
                type="button"
                onClick={() => setShowCloudConfigModal(true)}
                className="text-xs text-sky-300 hover:text-sky-200 underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <Cloud className="w-3.5 h-3.5 text-sky-400" />
                <span>Nube activa {lastSyncTime ? `(${lastSyncTime})` : ''} · Cambiar link</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowCloudConfigModal(true)}
                className="text-xs text-amber-300 hover:text-amber-200 underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <Link className="w-3.5 h-3.5 text-amber-400" />
                <span>¿Tenés el link del Excel? Vinculalo acá</span>
              </button>
            )}
          </div>
        </div>

        {/* Success alert on excel import */}
        {excelUploadSuccess && (
          <div className="mt-3 p-2 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{excelUploadSuccess}</span>
          </div>
        )}
      </div>

      {/* Switch between Builder and Clean Excel Preview */}
      <div className="flex items-center justify-between bg-white border border-[#d4d2d0] rounded-xl p-1.5 shadow-xs">
        <span className="text-xs font-bold text-[#1f2426] px-2">Vista del Manifiesto:</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setPreviewMode(false)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              !previewMode ? 'bg-[#2a3440] text-white shadow-xs' : 'text-[#7d7570] hover:text-[#1f2426]'
            }`}
          >
            Formulario / Edición
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode(true)}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              previewMode ? 'bg-[#2a3440] text-white shadow-xs' : 'text-[#7d7570] hover:text-[#1f2426]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Vista Prolija (Plantilla)</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          VISTA 1: PLANTILLA PROLIJA (PREVIEW IDÉNTICO AL EXCEL)
         ========================================================================= */}
      {previewMode ? (
        <div className="w-full flex flex-col gap-3 animate-fade-in">
          <div className="overflow-x-auto rounded-2xl shadow-sm border border-[#d4d2d0]">
            <GendecPrintTemplate data={gendecDataForPrint} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex-1 py-2.5 rounded-xl bg-[#2a3440] text-white font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Declaración</span>
            </button>
            <button
              onClick={handleExportPDF}
              className="flex-1 py-2.5 rounded-xl bg-white border border-[#d4d2d0] text-[#1f2426] font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Descargar PDF</span>
            </button>
          </div>
        </div>
      ) : (
        /* =========================================================================
            VISTA 2: FORMULARIO INTERACTIVO (DATOS, TRIPULACIÓN, PASAJEROS)
           ========================================================================= */
        <div className="flex flex-col gap-4">
          {/* 1. Datos Generales de Vuelo */}
          <div className="bg-white border border-[#d4d2d0] rounded-2xl p-4 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#e9e9e8]">
              <div className="flex items-center gap-2">
                <Plane className="w-4 h-4 text-[#2a3440]" />
                <h3 className="font-extrabold text-xs text-[#1f2426] uppercase tracking-wider">
                  1. Datos de Vuelo & Aeronave
                </h3>
              </div>
              <span className="text-[10px] font-bold text-[#988d85] uppercase tracking-widest">
                Flyzar Dispatch
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-[#7d7570] block mb-1">Matrícula</label>
                <div className="relative">
                  <select
                    value={registration}
                    onChange={(e) => setRegistration(e.target.value)}
                    className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-black text-[#1f2426] focus:outline-none focus:border-[#2a3440] appearance-none cursor-pointer"
                  >
                    {FLYZAR_AIRCRAFT.map((reg) => (
                      <option key={reg} value={reg}>
                        {reg}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-3 text-[#7d7570] pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#7d7570] block mb-1">Vuelo / Identificador</label>
                <input
                  type="text"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                  placeholder="PRIVADO"
                  className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-black text-[#1f2426] uppercase focus:outline-none focus:border-[#2a3440]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#7d7570] block mb-1">Fecha de Despacho</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-bold text-[#1f2426] focus:outline-none focus:border-[#2a3440]"
                />
              </div>
            </div>

            {/* Origen y Destino Simplificados y Encuadrados */}
            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#f0f0ef]">
              {/* Origen */}
              <div className="bg-[#f8f8f7] border border-[#d4d2d0] rounded-xl p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[#2a3440]">
                  <MapPin className="w-3.5 h-3.5 text-[#2a3440] shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-wider">
                    Origen
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <span className="text-[9.5px] font-bold text-[#7d7570] block mb-0.5">OACI</span>
                    <input
                      type="text"
                      maxLength={4}
                      value={departureOaci}
                      onChange={(e) => setDepartureOaci(e.target.value.toUpperCase())}
                      placeholder="SABE"
                      className="w-full bg-white border border-[#d4d2d0] rounded-lg py-1.5 text-xs font-black text-center text-[#1f2426] uppercase focus:outline-none focus:border-[#2a3440]"
                    />
                  </div>
                  <div>
                    <span className="text-[9.5px] font-bold text-[#7d7570] block mb-0.5">Hora (STD)</span>
                    <input
                      type="text"
                      value={stdTime}
                      onChange={(e) => setStdTime(e.target.value)}
                      placeholder="14:00"
                      className="w-full bg-white border border-[#d4d2d0] rounded-lg py-1.5 text-xs font-bold text-center text-[#1f2426] focus:outline-none focus:border-[#2a3440]"
                    />
                  </div>
                </div>
              </div>

              {/* Destino */}
              <div className="bg-[#f8f8f7] border border-[#d4d2d0] rounded-xl p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[#2a3440]">
                  <MapPin className="w-3.5 h-3.5 text-[#2a3440] shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-wider">
                    Destino
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <span className="text-[9.5px] font-bold text-[#7d7570] block mb-0.5">OACI</span>
                    <input
                      type="text"
                      maxLength={4}
                      value={arrivalOaci}
                      onChange={(e) => setArrivalOaci(e.target.value.toUpperCase())}
                      placeholder="SAEZ"
                      className="w-full bg-white border border-[#d4d2d0] rounded-lg py-1.5 text-xs font-black text-center text-[#1f2426] uppercase focus:outline-none focus:border-[#2a3440]"
                    />
                  </div>
                  <div>
                    <span className="text-[9.5px] font-bold text-[#7d7570] block mb-0.5">Hora (STA)</span>
                    <input
                      type="text"
                      value={staTime}
                      onChange={(e) => setStaTime(e.target.value)}
                      placeholder="15:00"
                      className="w-full bg-white border border-[#d4d2d0] rounded-lg py-1.5 text-xs font-bold text-center text-[#1f2426] focus:outline-none focus:border-[#2a3440]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Tripulación Asignada (Tomados de la pestaña Crew del Excel) */}
          <div className="bg-white border border-[#d4d2d0] rounded-2xl p-4 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#e9e9e8]">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#2a3440]" />
                <h3 className="font-extrabold text-xs text-[#1f2426] uppercase tracking-wider">
                  2. Tripulación en Vuelo ({crew.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingNewCrewModal(true)}
                className="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Nuevo Tripulante</span>
              </button>
            </div>

            {/* Buscador inteligente en pestaña Crew del Excel */}
            <div className="relative">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 absolute left-3 text-[#7d7570]" />
                <input
                  type="text"
                  value={crewSearchTerm}
                  onChange={(e) => setCrewSearchTerm(e.target.value)}
                  placeholder="Buscar tripulante por Nombre, Rol (PIC/SIC/TCP) o Licencia..."
                  className="w-full pl-9 pr-8 py-2.5 bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl text-xs font-medium text-[#1f2426] placeholder-[#988d85] focus:outline-none focus:border-[#2a3440]"
                />
                {crewSearchTerm && (
                  <button
                    onClick={() => setCrewSearchTerm('')}
                    className="absolute right-2.5 text-gray-400 hover:text-gray-600 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Lista desplegable de coincidencias Crew */}
              {filteredCrew.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#d4d2d0] rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
                  {filteredCrew.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCrew(c)}
                      className="p-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors text-xs"
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-[10px] px-1.5 py-0.5 rounded-md bg-[#2a3440] text-white">
                            {c.role}
                          </span>
                          <span className="font-extrabold text-[#1f2426]">{c.fullName}</span>
                        </div>
                        <div className="text-[10px] text-[#7d7570] flex items-center gap-2 mt-0.5">
                          <span>Lic: {c.licenseNumber}</span>
                          <span>·</span>
                          <span>Doc: {c.passportNumber}</span>
                          <span>·</span>
                          <span className="font-bold">{c.nationality}</span>
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-[#2a3440] shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lista actual asignada a este vuelo */}
            {crew.length === 0 ? (
              <div className="p-4 bg-[#f8f8f7] rounded-xl text-center text-xs text-[#7d7570] font-medium border border-dashed border-[#d4d2d0]">
                No hay tripulantes asignados al vuelo. Usá el buscador para sumar pilotos/TCP de la pestaña Crew o el botón "+ Nuevo Tripulante".
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {crew.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-2.5 bg-[#f6f6f5] rounded-xl border border-[#e5e4e2] text-xs"
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-[10px] px-1.5 py-0.5 rounded-md bg-[#2a3440] text-white">
                          {member.role}
                        </span>
                        <span className="font-extrabold text-[#1f2426]">{member.fullName}</span>
                      </div>
                      <div className="text-[10.5px] text-[#7d7570] flex items-center gap-2">
                        <span>Lic: {member.licenseNumber}</span>
                        <span>·</span>
                        <span>Doc: {member.passportNumber}</span>
                        <span>·</span>
                        <span className="font-bold">{member.nationality}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCrew(member.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                      title="Quitar tripulante"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Manifiesto de Pasajeros (Tomados del Excel) */}
          <div className="bg-white border border-[#d4d2d0] rounded-2xl p-4 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#e9e9e8]">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#2a3440]" />
                <h3 className="font-extrabold text-xs text-[#1f2426] uppercase tracking-wider">
                  3. Pasajeros en Vuelo ({passengers.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingNewPersonModal(true)}
                className="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Nuevo Pasajero</span>
              </button>
            </div>

            {/* Buscador inteligente en base de datos del Excel */}
            <div className="relative">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 absolute left-3 text-[#7d7570]" />
                <input
                  type="text"
                  value={paxSearchTerm}
                  onChange={(e) => setPaxSearchTerm(e.target.value)}
                  placeholder="Buscar en el Excel por Apellido, Nombre o DNI..."
                  className="w-full pl-9 pr-8 py-2.5 bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl text-xs font-medium text-[#1f2426] placeholder-[#988d85] focus:outline-none focus:border-[#2a3440]"
                />
                {paxSearchTerm && (
                  <button
                    onClick={() => setPaxSearchTerm('')}
                    className="absolute right-2.5 text-gray-400 hover:text-gray-600 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Lista desplegable de coincidencias */}
              {filteredPax.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#d4d2d0] rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
                  {filteredPax.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectPax(p)}
                      className="p-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors text-xs"
                    >
                      <div className="flex flex-col">
                        <span className="font-extrabold text-[#1f2426]">{p.fullName}</span>
                        <div className="text-[10px] text-[#7d7570] flex items-center gap-2 mt-0.5">
                          <span className="font-bold text-slate-900 bg-slate-100 px-1 py-0.2 rounded">
                            {p.nationality || 'ARG'}
                          </span>
                          {p.birthDate && <span>Nac: {p.birthDate}</span>}
                          {p.dni && <span>DNI: {p.dni}</span>}
                          {p.passportNumber && <span>Pass: {p.passportNumber}</span>}
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-[#2a3440] shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lista actual en este vuelo */}
            {passengers.length === 0 ? (
              <div className="p-4 bg-[#f8f8f7] rounded-xl text-center text-xs text-[#7d7570] font-medium border border-dashed border-[#d4d2d0]">
                No hay pasajeros seleccionados. Usa el buscador superior para agregar pasajeros del Excel o el botón "+ Nuevo Pasajero".
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {passengers.map((pax, idx) => (
                  <div
                    key={pax.id}
                    className="flex items-center justify-between p-2.5 bg-[#f6f6f5] rounded-xl border border-[#e5e4e2] text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-black text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-extrabold text-[#1f2426]">{pax.fullName}</span>
                        <div className="text-[10px] text-[#7d7570] flex items-center gap-2 mt-0.5">
                          <span className="font-bold">{pax.nationality}</span>
                          {pax.birthDate && <span>· Nac: {pax.birthDate}</span>}
                          {pax.dni && <span>· DNI: {pax.dni}</span>}
                          {pax.passportNumber && <span>· Pass: {pax.passportNumber}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePax(pax.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                      title="Quitar pasajero"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Declaración Sanitaria & Observaciones */}
          <div className="bg-white border border-[#d4d2d0] rounded-2xl p-4 shadow-xs flex flex-col gap-3">
            <h3 className="font-extrabold text-xs text-[#1f2426] uppercase tracking-wider pb-2 border-b border-[#e9e9e8]">
              4. Declaración Sanitaria / Observaciones
            </h3>

            <div className="flex flex-col gap-2.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={illnessReported}
                  onChange={(e) => setIllnessReported(e.target.checked)}
                  className="w-4 h-4 rounded text-[#2a3440] focus:ring-0 cursor-pointer"
                />
                <span className="font-medium text-[#1f2426]">
                  ¿Sospecha de enfermedad a bordo? (Enfermedades infectocontagiosas)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={disinsectingDone}
                  onChange={(e) => setDisinsectingDone(e.target.checked)}
                  className="w-4 h-4 rounded text-[#2a3440] focus:ring-0 cursor-pointer"
                />
                <span className="font-medium text-[#1f2426]">
                  ¿Desinsectación / Medidas sanitarias completadas según protocolo?
                </span>
              </label>

              <div className="pt-2">
                <label className="text-[11px] font-bold text-[#7d7570] block mb-1">
                  Observaciones / Declaraciones Especiales
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="NIL / Observaciones de despacho"
                  className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl p-2.5 text-xs font-medium text-[#1f2426] focus:outline-none focus:border-[#2a3440]"
                />
              </div>
            </div>
          </div>

          {/* Botones de Exportación / Copia */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={handleExportPDF}
              className="w-full h-12 rounded-xl bg-[#2a3440] hover:bg-[#1f2426] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] cursor-pointer"
            >
              <Download className="w-4 h-4 text-white" />
              <span>Generar y Descargar GENDEC Oficial (PDF)</span>
            </button>

            <button
              type="button"
              onClick={handleCopyManifest}
              className="w-full h-10 rounded-xl bg-white hover:bg-slate-50 border border-[#d4d2d0] text-[#1f2426] font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-[#2a3440]" />
              <span>{copiedNotification ? '¡Copiado al portapapeles!' : 'Copiar Texto para WhatsApp / Email'}</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: AGREGAR NUEVA PERSONA QUE NO ESTÉ EN EL EXCEL
         ========================================================================= */}
      {isAddingNewPersonModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-md bg-white rounded-2xl p-5 border border-[#d4d2d0] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#e9e9e8]">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#2a3440]" />
                <h3 className="font-extrabold text-sm text-[#1f2426]">
                  Agregar Pasajero no Registrado
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingNewPersonModal(false)}
                className="text-gray-400 hover:text-gray-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-[#7d7570] block mb-1">
                  APELLIDO, Nombre *
                </label>
                <input
                  type="text"
                  placeholder="Ej: PEREZ, Juan Carlos"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-bold text-[#1f2426] uppercase focus:outline-none focus:border-[#2a3440]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-[#7d7570] block mb-1">
                    Nacionalidad
                  </label>
                  <input
                    type="text"
                    placeholder="ARG / USA / ITA"
                    value={newPersonNat}
                    onChange={(e) => setNewPersonNat(e.target.value)}
                    className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-bold text-[#1f2426] uppercase focus:outline-none focus:border-[#2a3440]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#7d7570] block mb-1">
                    Fecha de Nacimiento
                  </label>
                  <input
                    type="text"
                    placeholder="DD/MM/AAAA"
                    value={newPersonBirth}
                    onChange={(e) => setNewPersonBirth(e.target.value)}
                    className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-bold text-[#1f2426] focus:outline-none focus:border-[#2a3440]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-[#7d7570] block mb-1">
                    DNI / CI
                  </label>
                  <input
                    type="text"
                    placeholder="33.738.339"
                    value={newPersonDni}
                    onChange={(e) => setNewPersonDni(e.target.value)}
                    className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-medium text-[#1f2426] focus:outline-none focus:border-[#2a3440]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#7d7570] block mb-1">
                    Pasaporte
                  </label>
                  <input
                    type="text"
                    placeholder="AAB123456"
                    value={newPersonPass}
                    onChange={(e) => setNewPersonPass(e.target.value)}
                    className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-medium text-[#1f2426] uppercase focus:outline-none focus:border-[#2a3440]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={addToFlightImmediately}
                  onChange={(e) => setAddToFlightImmediately(e.target.checked)}
                  className="w-4 h-4 rounded text-[#2a3440] focus:ring-0 cursor-pointer"
                />
                <span className="font-bold text-[#1f2426]">
                  Sumar inmediatamente al vuelo actual
                </span>
              </label>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#e9e9e8]">
              <button
                type="button"
                onClick={() => setIsAddingNewPersonModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1f2426] font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateNewPerson}
                className="flex-1 py-2 rounded-xl bg-[#2a3440] hover:bg-[#1f2426] text-white font-bold text-xs cursor-pointer"
              >
                Guardar Pasajero
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: AGREGAR NUEVO TRIPULANTE (CREW) NO REGISTRADO
         ========================================================================= */}
      {isAddingNewCrewModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-md bg-white rounded-2xl p-5 border border-[#d4d2d0] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#e9e9e8]">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#2a3440]" />
                <h3 className="font-extrabold text-sm text-[#1f2426]">
                  Agregar Tripulante no Registrado
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingNewCrewModal(false)}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-[#7d7570] block mb-1">
                  APELLIDO, Nombre *
                </label>
                <input
                  type="text"
                  placeholder="Ej: MARTINEZ, Carlos Alberto"
                  value={newCustomCrewName}
                  onChange={(e) => setNewCustomCrewName(e.target.value)}
                  className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-bold text-[#1f2426] uppercase focus:outline-none focus:border-[#2a3440]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-[#7d7570] block mb-1">
                    Rol a bordo
                  </label>
                  <select
                    value={newCustomCrewRole}
                    onChange={(e) => setNewCustomCrewRole(e.target.value as any)}
                    className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-2.5 py-2 text-xs font-bold text-[#1f2426] focus:outline-none focus:border-[#2a3440]"
                  >
                    <option value="PIC">PIC (Comandante)</option>
                    <option value="SIC">SIC (Copiloto)</option>
                    <option value="FA">FA (Tripulante TCP)</option>
                    <option value="DISPATCHER">DISPATCHER (Despacho)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#7d7570] block mb-1">
                    Nacionalidad
                  </label>
                  <input
                    type="text"
                    placeholder="ARG / USA / ITA"
                    value={newCustomCrewNat}
                    onChange={(e) => setNewCustomCrewNat(e.target.value)}
                    className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-bold text-[#1f2426] uppercase focus:outline-none focus:border-[#2a3440]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-[#7d7570] block mb-1">
                    N° de Licencia
                  </label>
                  <input
                    type="text"
                    placeholder="TLA-26969"
                    value={newCustomCrewLic}
                    onChange={(e) => setNewCustomCrewLic(e.target.value)}
                    className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-medium text-[#1f2426] uppercase focus:outline-none focus:border-[#2a3440]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#7d7570] block mb-1">
                    DNI / Pasaporte
                  </label>
                  <input
                    type="text"
                    placeholder="26.969.181"
                    value={newCustomCrewDoc}
                    onChange={(e) => setNewCustomCrewDoc(e.target.value)}
                    className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-medium text-[#1f2426] uppercase focus:outline-none focus:border-[#2a3440]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={addCrewToFlightImmediately}
                  onChange={(e) => setAddCrewToFlightImmediately(e.target.checked)}
                  className="w-4 h-4 rounded text-[#2a3440] focus:ring-0 cursor-pointer"
                />
                <span className="font-bold text-[#1f2426]">
                  Asignar inmediatamente al vuelo actual
                </span>
              </label>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#e9e9e8]">
              <button
                type="button"
                onClick={() => setIsAddingNewCrewModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1f2426] font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateNewCrew}
                className="flex-1 py-2 rounded-xl bg-[#2a3440] hover:bg-[#1f2426] text-white font-bold text-xs cursor-pointer"
              >
                Guardar Tripulante
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: VINCULACIÓN ENLACE EN LA NUBE (GOOGLE SHEETS / EXCEL ONLINE)
         ========================================================================= */}
      {showCloudConfigModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-lg bg-white rounded-2xl p-5 border border-[#d4d2d0] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#e9e9e8]">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-sky-600" />
                <h3 className="font-extrabold text-sm text-[#1f2426]">
                  Sincronización en la Nube
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCloudConfigModal(false)}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <p className="text-[#555] leading-relaxed">
                Pegá aquí el enlace de tu <strong>Google Sheets</strong> o <strong>Excel en OneDrive/SharePoint</strong>. La aplicación consultará este archivo en vivo en cada sesión, permitiendo que cualquier cambio hecho en la planilla se refleje al instante en los buscadores de <strong>PAX</strong> y <strong>CREW</strong>.
              </p>

              <div>
                <label className="text-[11px] font-extrabold text-[#1f2426] block mb-1">
                  Enlace de la planilla en la nube:
                </label>
                <input
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/... o link directo de Excel"
                  value={cloudUrl}
                  onChange={(e) => setCloudUrl(e.target.value)}
                  className="w-full bg-[#f6f6f5] border border-[#d4d2d0] rounded-xl px-3 py-2 text-xs font-mono text-[#1f2426] focus:outline-none focus:border-[#2a3440]"
                />
              </div>

              {cloudSyncError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    <span className="font-bold">Error de sincronización:</span>
                    <span>{cloudSyncError}</span>
                    <span className="text-[10px] text-rose-600 font-medium mt-1">
                      Si usás Google Sheets, asegurate de que el archivo tenga permiso "Cualquier persona con el enlace puede ver".
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1.5 text-[11px] text-slate-600">
                <span className="font-bold text-slate-800">Requisitos para sincronizar en vivo:</span>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>Google Sheets:</strong> Menú Compartir → Acceso general → "Cualquier persona con el enlace: Lector".
                  </li>
                  <li>
                    Debe contener las pestañas <strong>PAX</strong> y <strong>CREW</strong> (o una sola si es mixta).
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#e9e9e8]">
              {cloudUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setCloudUrl('');
                    localStorage.removeItem('flyzar_gendec_cloud_url_v1');
                    localStorage.removeItem('flyzar_gendec_last_sync_time_v1');
                    setLastSyncTime('');
                    setShowCloudConfigModal(false);
                  }}
                  className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 font-bold text-xs cursor-pointer"
                >
                  Desvincular
                </button>
              )}
              <div className="flex-1 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCloudConfigModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1f2426] font-bold text-xs cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => fetchAndSyncFromCloud(cloudUrl)}
                  disabled={isSyncingCloud || !cloudUrl.trim()}
                  className="px-4 py-2 rounded-xl bg-[#2a3440] hover:bg-[#1f2426] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                  <span>{isSyncingCloud ? 'Sincronizando...' : 'Conectar y Sincronizar'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
