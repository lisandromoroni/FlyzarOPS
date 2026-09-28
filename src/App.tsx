/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useId, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import {
  Fuel,
  Plane,
  Scale,
  RotateCcw,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Gauge,
  Plus,
  Trash2,
  FileText,
  AlertTriangle,
  BookOpen,
  Calendar,
  Filter,
  FileSpreadsheet,
  CheckCircle2,
  BookmarkPlus,
  Cloud,
  Pencil,
  Calculator,
  ArrowRight
} from 'lucide-react';
import { subscribeToSavingsRecords, saveRecordToCloud, updateRecordInCloud, deleteRecordFromCloud } from './firebase';
import { FlyzarLogo, FlyzarLion } from './components/FlyzarLogo';
import { GendecModule } from './components/GendecModule';

// Matrículas predefinidas de la flota de Flyzar
export const PREDEFINED_REGISTRATIONS = [
  'LV-KLH',
  'LV-VEG',
  'LV-SYG',
  'LV-FUT',
  'LV-CUE',
  'LV-GCK',
  'LV-CJY',
  'LV-GQN',
] as const;

export const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function parseDateToYearMonth(dateStr: string): { key: string; label: string } | null {
  if (!dateStr) return null;
  const slashParts = dateStr.split('/');
  if (slashParts.length === 3) {
    const month = parseInt(slashParts[1], 10);
    const year = parseInt(slashParts[2], 10);
    if (!isNaN(month) && !isNaN(year) && month >= 1 && month <= 12) {
      const monthStr = month.toString().padStart(2, '0');
      return {
        key: `${year}-${monthStr}`,
        label: `${MONTH_NAMES_ES[month - 1]} ${year}`,
      };
    }
  }
  const dashParts = dateStr.split('-');
  if (dashParts.length === 3) {
    const year = parseInt(dashParts[0], 10);
    const month = parseInt(dashParts[1], 10);
    if (!isNaN(month) && !isNaN(year) && month >= 1 && month <= 12) {
      const monthStr = month.toString().padStart(2, '0');
      return {
        key: `${year}-${monthStr}`,
        label: `${MONTH_NAMES_ES[month - 1]} ${year}`,
      };
    }
  }
  return null;
}

// Fixed Jet-A density: 6.7 lb / USG
const JET_A_DENSITY = 6.7;
// Liters per US Gallon: 3.785411784
const LITERS_PER_USG = 3.785411784;

export type FuelUnit = 'LBS' | 'USG' | 'LTS';

export interface BitacoraEntry {
  id: string;
  timestamp: number;
  dateStr: string;
  registration: string;
  flightNumber?: string;
  notes?: string;
  route: string;
  leg1Oaci: string;
  leg2Oaci: string;
  leg3Oaci?: string;
  hasLeg3: boolean;
  extraUSG: number;
  extraLbs: number;
  extraLts: number;
  totalSavingsUSD: number;
  useCarryCost: boolean;
  carryBurnUSG?: number;
  carryCostUSD?: number;
}

// Helper to convert any input value in a given unit to US Gallons and Lbs
export function convertToUSG(val: number, unit: FuelUnit): number {
  if (val <= 0) return 0;
  switch (unit) {
    case 'USG':
      return val;
    case 'LBS':
      return val / JET_A_DENSITY;
    case 'LTS':
      return val / LITERS_PER_USG;
  }
}

export function convertToLbs(val: number, unit: FuelUnit): number {
  return convertToUSG(val, unit) * JET_A_DENSITY;
}

export function convertToLiters(val: number, unit: FuelUnit): number {
  return convertToUSG(val, unit) * LITERS_PER_USG;
}

type MenuOption = 'root_menu' | 'fuel_menu' | 'waiver' | 'tankering' | 'bitacora' | 'gendec';

export default function App() {
  // Navigation: starts at 'root_menu' (Fuel Calculations vs GENDEC)
  const [currentView, setCurrentView] = useState<MenuOption>('root_menu');

  // Helper para admitir números tanto con coma (6,85) como con punto (6.85)
  const parseNum = (val: string): number => {
    if (!val) return 0;
    const normalized = val.replace(',', '.');
    return parseFloat(normalized) || 0;
  };

  // ==========================================
  // ESTADOS: Menú 1 - Punto de equilibrio para waivear
  // ==========================================
  const [feeInput, setFeeInput] = useState<string>('');
  const [waiverInput, setWaiverInput] = useState<string>('');
  const [waiverPriceInput, setWaiverPriceInput] = useState<string>('');

  const feeInputId = useId();
  const waiverInputId = useId();
  const waiverPriceInputId = useId();

  const facilityFee = Math.max(0, parseNum(feeInput));
  const waiverUSG = Math.max(0, parseNum(waiverInput));
  const waiverFuelPrice = Math.max(0, parseNum(waiverPriceInput));

  // Waiver calculation: Break-even USG = Waiver USG - (Facility Fee / Fuel Price)
  const feeInGallons = waiverFuelPrice > 0 ? facilityFee / waiverFuelPrice : 0;
  const rawBreakEvenUSG = waiverUSG - feeInGallons;
  const effectiveBreakEvenUSG = waiverFuelPrice > 0 ? Math.max(0, rawBreakEvenUSG) : 0;
  const breakEvenLbs = effectiveBreakEvenUSG * JET_A_DENSITY;
  const waiverLbs = waiverUSG * JET_A_DENSITY;
  const isFeeExceedsWaiver = facilityFee > 0 && waiverFuelPrice > 0 && rawBreakEvenUSG < 0;

  const waiverScalePercent = waiverUSG > 0
    ? Math.min(100, Math.max(0, (effectiveBreakEvenUSG / waiverUSG) * 100))
    : 0;

  // 3-color bar scale percentages:
  // Amarillo: 0 a Punto de Equilibrio ("CARGA LO JUSTO")
  // Rojo: Punto de Equilibrio a Mínimo para Waivear ("NO CARGUES")
  // Verde: Por encima del Mínimo para Waivear ("CARGA TRANQUILO")
  let barYellowPct = 33.3;
  let barRedPct = 33.3;
  let barGreenPct = 33.4;

  if (waiverUSG > 0 && waiverFuelPrice > 0) {
    const totalScale = waiverUSG * 1.35;
    const rawYellow = (effectiveBreakEvenUSG / totalScale) * 100;
    const rawRed = ((waiverUSG - effectiveBreakEvenUSG) / totalScale) * 100;
    // Clamping para asegurar legibilidad de texto en móvil
    barYellowPct = Math.min(50, Math.max(26, rawYellow));
    barRedPct = Math.min(48, Math.max(24, rawRed));
    barGreenPct = Math.max(24, 100 - barYellowPct - barRedPct);
  }

  // ==========================================
  // ESTADOS: Menú 2 - Calculadora de ahorro tankereando
  // ==========================================
  // Tramo 1
  const [leg1Oaci, setLeg1Oaci] = useState<string>('');
  const [needed1Input, setNeeded1Input] = useState<string>('');
  const [needed1Unit, setNeeded1Unit] = useState<FuelUnit>('LBS');
  const [loaded1Input, setLoaded1Input] = useState<string>('');
  const [loaded1Unit, setLoaded1Unit] = useState<FuelUnit>('USG');
  const [price1Input, setPrice1Input] = useState<string>(''); // USD/USG

  // Tramo 2
  const [leg2Oaci, setLeg2Oaci] = useState<string>('');
  const [needed2Input, setNeeded2Input] = useState<string>('');
  const [needed2Unit, setNeeded2Unit] = useState<FuelUnit>('LBS');
  const [loaded2Input, setLoaded2Input] = useState<string>('');
  const [loaded2Unit, setLoaded2Unit] = useState<FuelUnit>('USG');
  const [price2Input, setPrice2Input] = useState<string>(''); // USD/USG

  // Tramo 3 (Opcional)
  const [hasLeg3, setHasLeg3] = useState<boolean>(false);
  const [leg3Oaci, setLeg3Oaci] = useState<string>('');
  const [needed3Input, setNeeded3Input] = useState<string>('');
  const [needed3Unit, setNeeded3Unit] = useState<FuelUnit>('LBS');
  const [loaded3Input, setLoaded3Input] = useState<string>('');
  const [loaded3Unit, setLoaded3Unit] = useState<FuelUnit>('USG');
  const [price3Input, setPrice3Input] = useState<string>(''); // USD/USG

  // Tip 2: Factor de penalización por acarreo de peso (Carry cost)
  const [useCarryCost, setUseCarryCost] = useState<boolean>(false);
  const [flightHours1Input, setFlightHours1Input] = useState<string>('1.5');
  const [flightHours2Input, setFlightHours2Input] = useState<string>('2.0');
  const [carryBurnRateInput, setCarryBurnRateInput] = useState<string>('3.0'); // % por hora de vuelo

  // IDs para accesibilidad
  const needed1Id = useId();
  const loaded1Id = useId();
  const price1Id = useId();

  const needed2Id = useId();
  const loaded2Id = useId();
  const price2Id = useId();

  const needed3Id = useId();
  const loaded3Id = useId();
  const price3Id = useId();

  // Nombres OACI con fallback a 'OACI' si están vacíos
  const oaci1 = leg1Oaci.trim() ? leg1Oaci.trim().toUpperCase() : 'OACI';
  const oaci2 = leg2Oaci.trim() ? leg2Oaci.trim().toUpperCase() : 'OACI';
  const oaci3 = leg3Oaci.trim() ? leg3Oaci.trim().toUpperCase() : 'OACI';

  // Cálculos Tramo 1 -> Tramo 2 con conversión flexible de unidades (LBS, USG, LTS)
  const rawNeeded1 = Math.max(0, parseNum(needed1Input));
  const needed1USG = convertToUSG(rawNeeded1, needed1Unit);
  const needed1Lbs = convertToLbs(rawNeeded1, needed1Unit);
  const needed1Lts = convertToLiters(rawNeeded1, needed1Unit);

  const rawLoaded1 = Math.max(0, parseNum(loaded1Input));
  const loaded1USG = convertToUSG(rawLoaded1, loaded1Unit);
  const loaded1Lbs = convertToLbs(rawLoaded1, loaded1Unit);
  const loaded1Lts = convertToLiters(rawLoaded1, loaded1Unit);

  const price1 = Math.max(0, parseNum(price1Input));

  const rawNeeded2 = Math.max(0, parseNum(needed2Input));
  const needed2USG = convertToUSG(rawNeeded2, needed2Unit);
  const needed2Lbs = convertToLbs(rawNeeded2, needed2Unit);
  const needed2Lts = convertToLiters(rawNeeded2, needed2Unit);

  const rawLoaded2 = Math.max(0, parseNum(loaded2Input));
  const loaded2USG = convertToUSG(rawLoaded2, loaded2Unit);
  const loaded2Lbs = convertToLbs(rawLoaded2, loaded2Unit);
  const loaded2Lts = convertToLiters(rawLoaded2, loaded2Unit);

  const price2 = Math.max(0, parseNum(price2Input));

  // Combustible cargado de más en Tramo 1 que reemplaza combustible caro en Tramo 2:
  const extra1USG = Math.max(0, loaded1USG - needed1USG);
  const extra1Lbs = extra1USG * JET_A_DENSITY;
  const priceDiff12 = price2 - price1;
  const savings12 = extra1USG * priceDiff12;

  // Cálculos Tramo 2 -> Tramo 3 (si está activo)
  const rawNeeded3 = Math.max(0, parseNum(needed3Input));
  const needed3USG = convertToUSG(rawNeeded3, needed3Unit);
  const needed3Lbs = convertToLbs(rawNeeded3, needed3Unit);
  const needed3Lts = convertToLiters(rawNeeded3, needed3Unit);

  const rawLoaded3 = Math.max(0, parseNum(loaded3Input));
  const loaded3USG = convertToUSG(rawLoaded3, loaded3Unit);
  const loaded3Lbs = convertToLbs(rawLoaded3, loaded3Unit);
  const loaded3Lts = convertToLiters(rawLoaded3, loaded3Unit);

  const price3 = Math.max(0, parseNum(price3Input));

  const extra2USG = Math.max(0, loaded2USG - needed2USG);
  const extra2Lbs = extra2USG * JET_A_DENSITY;
  const priceDiff23 = price3 - price2;
  const savings23 = hasLeg3 ? extra2USG * priceDiff23 : 0;

  // Cálculos de acarreo de peso (Carry Cost)
  const flightHours1 = Math.max(0, parseNum(flightHours1Input));
  const flightHours2 = Math.max(0, parseNum(flightHours2Input));
  const carryBurnRate = Math.max(0, parseNum(carryBurnRateInput)) / 100; // e.g. 0.03

  // Combustible quemado extra en Tramo 1 para trasladar extra1USG
  const carryBurn1USG = useCarryCost ? extra1USG * carryBurnRate * flightHours1 : 0;
  const carryBurn1Lbs = carryBurn1USG * JET_A_DENSITY;
  const carryCost1USD = carryBurn1USG * price1;

  // Combustible quemado extra en Tramo 2 para trasladar extra2USG (si hay Tramo 3)
  const carryBurn2USG = (useCarryCost && hasLeg3) ? extra2USG * carryBurnRate * flightHours2 : 0;
  const carryBurn2Lbs = carryBurn2USG * JET_A_DENSITY;
  const carryCost2USD = carryBurn2USG * price2;

  const totalCarryBurnUSG = carryBurn1USG + carryBurn2USG;
  const totalCarryBurnLbs = totalCarryBurnUSG * JET_A_DENSITY;
  const totalCarryCostUSD = carryCost1USD + carryCost2USD;

  const grossSavings = savings12 + savings23;
  const netSavings = grossSavings - totalCarryCostUSD;
  const totalSavings = useCarryCost ? netSavings : grossSavings;

  // Generador de Reporte PDF Prolijo y con Colores
  const generatePDFReport = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const isProfit = totalSavings >= 0;
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // Barra superior institucional azul marino
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 30, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('FLYZAR · REPORTE DE ANÁLISIS DE TANKERING', 14, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(`Ruta: ${oaci1} → ${oaci2}${hasLeg3 ? ` → ${oaci3}` : ''}   |   Fecha: ${dateStr} ${timeStr}`, 14, 22);

    let y = 38;

    // Cartel principal / Hero de ahorro o pérdida
    if (isProfit) {
      doc.setFillColor(236, 253, 245); // emerald-50
      doc.setDrawColor(16, 185, 129); // emerald-500
      doc.roundedRect(14, y, 182, 24, 3, 3, 'FD');

      doc.setTextColor(6, 95, 70); // emerald-800
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text(useCarryCost ? 'AHORRO NETO REAL (CON COSTO DE ACARREO DEDUCIDO):' : 'AHORRO TOTAL ESTIMADO TANKEREANDO:', 20, y + 7.5);

      doc.setFontSize(18);
      doc.setTextColor(4, 120, 87);
      doc.text(`USD ${Math.round(totalSavings).toLocaleString('es-AR')}`, 20, y + 17);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(5, 150, 105);
      doc.text(`Exacto: USD ${totalSavings.toFixed(2)}`, 130, y + 17);
    } else {
      doc.setFillColor(255, 241, 242); // rose-50
      doc.setDrawColor(225, 29, 72); // rose-600
      doc.roundedRect(14, y, 182, 24, 3, 3, 'FD');

      doc.setTextColor(159, 18, 57); // rose-900
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text('¡ALERTA! EL TANKEREO DA PÉRDIDA:', 20, y + 7.5);

      doc.setFontSize(18);
      doc.setTextColor(225, 29, 72);
      doc.text(`-USD ${Math.abs(Math.round(totalSavings)).toLocaleString('es-AR')}`, 20, y + 17);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text('En destino el combustible está más barato. No conviene cargar de más.', 95, y + 17);
    }

    y += 31;

    // Recuadro Tramo 1 -> 2
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.roundedRect(14, y, 182, 54, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`1. Tramo ${oaci1} → ${oaci2}`, 20, y + 8);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);

    doc.text('• Combustible necesitado:', 20, y + 16);
    doc.setFont('helvetica', 'bold');
    doc.text(`${needed1Lbs.toLocaleString()} lbs (≈ ${Math.round(needed1USG).toLocaleString()} USG)`, 76, y + 16);

    doc.setFont('helvetica', 'normal');
    doc.text(`• Combustible cargado en ${oaci1}:`, 20, y + 23);
    doc.setFont('helvetica', 'bold');
    doc.text(`${loaded1USG.toLocaleString()} USG (≈ ${Math.round(loaded1Lbs).toLocaleString()} lbs)`, 76, y + 23);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 95, 70);
    doc.text(`• Combustible tankereado (extra):`, 20, y + 31);
    doc.text(`+${Math.round(extra1USG).toLocaleString()} USG (≈ ${Math.round(extra1Lbs).toLocaleString()} lbs)`, 76, y + 31);

    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');
    doc.text(`• Precio en ${oaci1}: USD ${price1.toFixed(2)}/gal   vs   Precio en ${oaci2}: USD ${price2.toFixed(2)}/gal`, 20, y + 39);

    // Box cálculo
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(16, 185, 129);
    doc.roundedRect(20, y + 43, 170, 7.5, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(4, 120, 87);
    doc.text(`Ahorro Tramo 1 → 2: ${Math.round(extra1USG).toLocaleString()} USG × USD ${priceDiff12.toFixed(2)}/gal = USD ${savings12.toFixed(2)}`, 24, y + 48);

    y += 60;

    // Recuadro Tramo 2 -> 3 (si está activo)
    if (hasLeg3) {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(14, y, 182, 44, 3, 3, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`2. Tramo ${oaci2} → ${oaci3}`, 20, y + 8);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);

      doc.text(`• Combustible cargado en ${oaci2}:`, 20, y + 16);
      doc.setFont('helvetica', 'bold');
      doc.text(`${loaded2USG.toLocaleString()} USG  (Necesitado: ${needed2Lbs.toLocaleString()} lbs)`, 76, y + 16);

      doc.setFont('helvetica', 'normal');
      doc.text(`• Precio en ${oaci2}: USD ${price2.toFixed(2)}/gal   vs   ${oaci3}: USD ${price3.toFixed(2)}/gal`, 20, y + 23);

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(16, 185, 129);
      doc.roundedRect(20, y + 28, 170, 7.5, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(4, 120, 87);
      doc.text(`Ahorro Tramo 2 → 3: ${Math.round(extra2USG).toLocaleString()} USG × USD ${priceDiff23.toFixed(2)}/gal = USD ${savings23.toFixed(2)}`, 24, y + 33);

      y += 50;
    }

    // Recuadro Acarreo de Peso (Carry cost) si está activo
    if (useCarryCost && totalCarryCostUSD > 0) {
      doc.setFillColor(254, 243, 199); // amber-100
      doc.setDrawColor(245, 158, 11); // amber-500
      doc.roundedRect(14, y, 182, 32, 3, 3, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(146, 64, 14); // amber-900
      doc.text('⚖️ Factor de Acarreo por Peso (Carry Cost)', 20, y + 7.5);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 53, 15);
      doc.text(`• Duración: ${flightHours1} hs de vuelo   |   Tasa de consumo extra: ${(carryBurnRate * 100).toFixed(1)}% por hora`, 20, y + 15);
      doc.text(`• Combustible extra consumido por transportar peso: ≈ ${Math.round(totalCarryBurnUSG).toLocaleString()} USG (${Math.round(totalCarryBurnLbs).toLocaleString()} lbs)`, 20, y + 21);
      doc.setFont('helvetica', 'bold');
      doc.text(`• Costo total de acarreo deducido: -USD ${totalCarryCostUSD.toFixed(2)}   →   Ahorro Neto Real: USD ${netSavings.toFixed(2)}`, 20, y + 27.5);

      y += 38;
    }

    // Nota Operacional y Pie
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y, 182, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Nota Operacional:', 18, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text('Verificar limitaciones de peso máximo de despegue (MTOW) y aterrizaje (MLW) antes del vuelo. Jet-A: 6.7 lb/USG.', 47, y + 6);
    doc.text('Generado por Flyzar Fuel Calculator. Cálculos de referencia operativa.', 18, y + 11.5);

    doc.save(`Flyzar_Tankering_${oaci1}_${oaci2}.pdf`);
  };

  // ==========================================
  // ESTADOS Y PERSISTENCIA: Menú 3 - Bitácora de Cargas & Ahorro
  // ==========================================
  const [bitacora, setBitacora] = useState<BitacoraEntry[]>(() => {
    try {
      const saved = localStorage.getItem('flyzar_fuel_bitacora');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    // Datos de demostración iniciales de vuelos típicos de la flota Flyzar
    return [
      {
        id: 'init-1',
        timestamp: Date.now() - 86400000 * 3,
        dateStr: '25/09/2026',
        registration: 'LV-KLH',
        flightNumber: 'FLZ 201',
        notes: 'Vuelo corporativo SABE-SAEZ-SABE',
        route: 'SABE → SAEZ',
        leg1Oaci: 'SABE',
        leg2Oaci: 'SAEZ',
        hasLeg3: false,
        extraUSG: 750,
        extraLbs: 5025,
        extraLts: 2839,
        totalSavingsUSD: 1425.0,
        useCarryCost: true,
        carryBurnUSG: 34,
        carryCostUSD: 136.0,
      },
      {
        id: 'init-2',
        timestamp: Date.now() - 86400000 * 7,
        dateStr: '21/09/2026',
        registration: 'LV-VEG',
        flightNumber: 'FLZ 104',
        notes: 'Punta del Este rotación',
        route: 'SABE → SUMU',
        leg1Oaci: 'SABE',
        leg2Oaci: 'SUMU',
        hasLeg3: false,
        extraUSG: 920,
        extraLbs: 6164,
        extraLts: 3483,
        totalSavingsUSD: 1840.0,
        useCarryCost: false,
      },
      {
        id: 'init-3',
        timestamp: Date.now() - 86400000 * 12,
        dateStr: '16/09/2026',
        registration: 'LV-SYG',
        flightNumber: 'FLZ 305',
        notes: 'Tramo doble Bariloche y Mendoza',
        route: 'SABE → SACO → SAME',
        leg1Oaci: 'SABE',
        leg2Oaci: 'SACO',
        leg3Oaci: 'SAME',
        hasLeg3: true,
        extraUSG: 1100,
        extraLbs: 7370,
        extraLts: 4164,
        totalSavingsUSD: 2310.0,
        useCarryCost: true,
        carryBurnUSG: 66,
        carryCostUSD: 264.0,
      },
    ];
  });

  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [isSavingToCloud, setIsSavingToCloud] = useState<boolean>(false);

  // Sincronización en tiempo real con la nube (Firestore) para toda la flota de Flyzar
  useEffect(() => {
    const unsubscribe = subscribeToSavingsRecords(
      (cloudRecords) => {
        if (cloudRecords && cloudRecords.length > 0) {
          const mapped: BitacoraEntry[] = cloudRecords.map((c) => ({
            id: c.id,
            timestamp: c.createdAt ? new Date(c.createdAt).getTime() : Date.now(),
            dateStr: c.dateStr,
            registration: c.registration,
            flightNumber: c.flightNumber,
            notes: c.notes,
            route: c.route,
            leg1Oaci: c.route.split('→')[0]?.trim() || '',
            leg2Oaci: c.route.split('→')[1]?.trim() || '',
            hasLeg3: c.route.split('→').length > 2,
            extraUSG: c.extraUSG,
            extraLbs: c.extraLbs,
            extraLts: c.extraLts,
            totalSavingsUSD: c.totalSavingsUSD,
            useCarryCost: c.useCarryCost,
          }));
          setBitacora(mapped);
          setIsCloudConnected(true);
        } else {
          setIsCloudConnected(true);
        }
      },
      (err) => {
        console.warn('Conexión a la nube no disponible temporalmente:', err);
        setIsCloudConnected(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Guardar bitácora en localStorage como caché offline
  useEffect(() => {
    try {
      localStorage.setItem('flyzar_fuel_bitacora', JSON.stringify(bitacora));
    } catch {
      // ignore
    }
  }, [bitacora]);

  // Modal para guardar análisis actual en bitácora
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [saveRegInput, setSaveRegInput] = useState<string>('LV-KLH');
  const [saveCustomRegInput, setSaveCustomRegInput] = useState<string>('');
  const [saveFlightInput, setSaveFlightInput] = useState<string>('');
  const [saveNotesInput, setSaveNotesInput] = useState<string>('');
  const [saveDateInput, setSaveDateInput] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<boolean>(false);

  // Filtros de bitácora: Matrícula y Mes
  const [filterReg, setFilterReg] = useState<string>('ALL');
  const [filterMonth, setFilterMonth] = useState<string>('ALL');

  // Modal para editar análisis guardado (permite editar TODOS los datos)
  const [editingEntry, setEditingEntry] = useState<BitacoraEntry | null>(null);
  const [editReg, setEditReg] = useState<string>('LV-KLH');
  const [editCustomReg, setEditCustomReg] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editLeg1Oaci, setEditLeg1Oaci] = useState<string>('SABE');
  const [editLeg2Oaci, setEditLeg2Oaci] = useState<string>('SAEZ');
  const [editHasLeg3, setEditHasLeg3] = useState<boolean>(false);
  const [editLeg3Oaci, setEditLeg3Oaci] = useState<string>('SAME');
  const [editFuelValue, setEditFuelValue] = useState<string>('');
  const [editFuelUnit, setEditFuelUnit] = useState<FuelUnit>('USG');
  const [editTotalSavings, setEditTotalSavings] = useState<string>('');
  const [editUseCarryCost, setEditUseCarryCost] = useState<boolean>(false);
  const [editCarryBurnUSG, setEditCarryBurnUSG] = useState<string>('');
  const [editCarryCost, setEditCarryCost] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState<boolean>(false);

  // Lista de meses disponibles para filtrar
  const availableMonths = useMemo(() => {
    const map = new Map<string, string>();
    bitacora.forEach((b) => {
      const ym = parseDateToYearMonth(b.dateStr);
      if (ym) {
        map.set(ym.key, ym.label);
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, label]) => ({ key, label }));
  }, [bitacora]);

  // Lista de matrículas para el filtro (las predefinidas + cualquier otra guardada)
  const filterRegistrationOptions = useMemo(() => {
    const set = new Set<string>(PREDEFINED_REGISTRATIONS);
    bitacora.forEach((b) => {
      if (b.registration) set.add(b.registration.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [bitacora]);

  // Filtrado compuesto por Matrícula y por Mes
  const filteredBitacora = useMemo(() => {
    return bitacora.filter((b) => {
      const matchReg = filterReg === 'ALL' || b.registration === filterReg;
      const ym = parseDateToYearMonth(b.dateStr);
      const matchMonth = filterMonth === 'ALL' || (ym && ym.key === filterMonth);
      return matchReg && matchMonth;
    });
  }, [bitacora, filterReg, filterMonth]);

  const totalBitacoraSavings = filteredBitacora.reduce((acc, curr) => acc + curr.totalSavingsUSD, 0);
  const totalBitacoraUSG = filteredBitacora.reduce((acc, curr) => acc + curr.extraUSG, 0);
  const totalBitacoraLbs = filteredBitacora.reduce((acc, curr) => acc + curr.extraLbs, 0);

  // Abrir modal de edición con TODOS los campos cargados
  const handleOpenEditModal = (entry: BitacoraEntry) => {
    setEditingEntry(entry);
    const regUpper = entry.registration.trim().toUpperCase();
    if (PREDEFINED_REGISTRATIONS.includes(regUpper as any)) {
      setEditReg(regUpper);
      setEditCustomReg('');
    } else {
      setEditReg('OTHER');
      setEditCustomReg(regUpper);
    }

    // Formatear dateStr a YYYY-MM-DD para el input type="date"
    const dParts = entry.dateStr.split('/');
    if (dParts.length === 3) {
      setEditDate(`${dParts[2]}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}`);
    } else {
      setEditDate(entry.dateStr);
    }

    // Desglose de tramos y ruta
    const routeParts = entry.route.split('→').map((s) => s.trim());
    setEditLeg1Oaci(entry.leg1Oaci || routeParts[0] || 'SABE');
    setEditLeg2Oaci(entry.leg2Oaci || routeParts[1] || 'SAEZ');
    if (entry.hasLeg3 || routeParts.length > 2) {
      setEditHasLeg3(true);
      setEditLeg3Oaci(entry.leg3Oaci || routeParts[2] || 'SAME');
    } else {
      setEditHasLeg3(false);
      setEditLeg3Oaci('');
    }

    setEditFuelValue(String(entry.extraUSG));
    setEditFuelUnit('USG');
    setEditTotalSavings(String(entry.totalSavingsUSD));
    setEditUseCarryCost(Boolean(entry.useCarryCost));
    setEditCarryBurnUSG(entry.carryBurnUSG ? String(entry.carryBurnUSG) : '');
    setEditCarryCost(entry.carryCostUSD ? String(entry.carryCostUSD) : '');
    setEditNotes(entry.notes || '');
    setEditSuccessMsg(false);
  };

  // Cargar análisis guardado en la Calculadora de Tankering para recalcular desde cero
  const handleLoadIntoCalculator = (entry: BitacoraEntry) => {
    const routeParts = entry.route.split('→').map((s) => s.trim());
    setLeg1Oaci(entry.leg1Oaci || routeParts[0] || 'SABE');
    setLeg2Oaci(entry.leg2Oaci || routeParts[1] || 'SAEZ');
    if (entry.hasLeg3 && (entry.leg3Oaci || routeParts[2])) {
      setHasLeg3(true);
      setLeg3Oaci(entry.leg3Oaci || routeParts[2] || 'SAME');
    } else {
      setHasLeg3(false);
      setLeg3Oaci('');
    }
    setLoaded1Input(String(entry.extraUSG));
    setLoaded1Unit('USG');
    setNeeded1Input('0');
    setUseCarryCost(Boolean(entry.useCarryCost));
    setCurrentView('tankering');
    setEditingEntry(null);
  };

  // Guardar cambios del análisis editado (actualiza todos los campos)
  const handleSaveEditedEntry = async () => {
    if (!editingEntry) return;

    const dParts = editDate.split('-');
    const formattedDate = dParts.length === 3 ? `${dParts[2]}/${dParts[1]}/${dParts[0]}` : editDate;
    const finalReg = editReg === 'OTHER' ? (editCustomReg.trim().toUpperCase() || 'LV-FLZ') : editReg;

    // Calcular galones base según la unidad elegida por el usuario
    const rawFuel = Math.max(0, parseFloat(editFuelValue) || 0);
    let usg = rawFuel;
    if (editFuelUnit === 'LBS') {
      usg = rawFuel / JET_A_DENSITY;
    } else if (editFuelUnit === 'LTS') {
      usg = rawFuel / LITERS_PER_USG;
    }

    const savings = parseFloat(editTotalSavings) || 0;
    const carryCostVal = parseFloat(editCarryCost) || 0;
    const carryBurnVal = parseFloat(editCarryBurnUSG) || 0;

    const o1 = editLeg1Oaci.trim().toUpperCase() || 'SABE';
    const o2 = editLeg2Oaci.trim().toUpperCase() || 'SAEZ';
    const o3 = editHasLeg3 ? (editLeg3Oaci.trim().toUpperCase() || 'SAME') : undefined;
    const computedRoute = `${o1} → ${o2}${editHasLeg3 ? ` → ${o3}` : ''}`;

    const updatedEntry: BitacoraEntry = {
      ...editingEntry,
      registration: finalReg,
      dateStr: formattedDate,
      route: computedRoute,
      leg1Oaci: o1,
      leg2Oaci: o2,
      leg3Oaci: o3,
      hasLeg3: editHasLeg3,
      extraUSG: Math.round(usg),
      extraLbs: Math.round(usg * JET_A_DENSITY),
      extraLts: Math.round(usg * LITERS_PER_USG),
      totalSavingsUSD: Number(savings.toFixed(2)),
      useCarryCost: editUseCarryCost,
      carryBurnUSG: editUseCarryCost && carryBurnVal > 0 ? Math.round(carryBurnVal) : undefined,
      carryCostUSD: editUseCarryCost && carryCostVal > 0 ? Number(carryCostVal.toFixed(2)) : undefined,
      notes: editNotes.trim() || undefined,
    };

    // Actualización local inmediata
    setBitacora((prev) => prev.map((item) => (item.id === updatedEntry.id ? updatedEntry : item)));
    setIsSavingEdit(true);

    try {
      await updateRecordInCloud({
        id: updatedEntry.id,
        dateStr: updatedEntry.dateStr,
        registration: updatedEntry.registration,
        route: updatedEntry.route,
        leg1Oaci: updatedEntry.leg1Oaci,
        leg2Oaci: updatedEntry.leg2Oaci,
        leg3Oaci: updatedEntry.leg3Oaci,
        hasLeg3: updatedEntry.hasLeg3,
        extraUSG: updatedEntry.extraUSG,
        extraLbs: updatedEntry.extraLbs,
        extraLts: updatedEntry.extraLts,
        totalSavingsUSD: updatedEntry.totalSavingsUSD,
        useCarryCost: updatedEntry.useCarryCost,
        carryBurnUSG: updatedEntry.carryBurnUSG,
        carryCostUSD: updatedEntry.carryCostUSD,
        notes: updatedEntry.notes,
        createdAt: updatedEntry.timestamp ? new Date(updatedEntry.timestamp).toISOString() : new Date().toISOString(),
      });
      setIsCloudConnected(true);
    } catch (e) {
      console.warn('Error actualizando en la nube:', e);
    } finally {
      setIsSavingEdit(false);
    }

    setEditSuccessMsg(true);
    setTimeout(() => {
      setEditSuccessMsg(false);
      setEditingEntry(null);
    }, 1000);
  };

  // Guardar análisis actual en la bitácora (Local + Nube)
  const handleSaveToBitacora = async () => {
    const dParts = saveDateInput.split('-');
    const formattedDate = dParts.length === 3 ? `${dParts[2]}/${dParts[1]}/${dParts[0]}` : saveDateInput;
    const finalReg = saveRegInput === 'OTHER' ? (saveCustomRegInput.trim().toUpperCase() || 'LV-FLZ') : saveRegInput;

    const totalExtra = extra1USG + (hasLeg3 ? extra2USG : 0);
    const newEntry: BitacoraEntry = {
      id: 'flz-' + Date.now(),
      timestamp: Date.now(),
      dateStr: formattedDate,
      registration: finalReg,
      flightNumber: saveFlightInput.trim() ? saveFlightInput.trim().toUpperCase() : undefined,
      notes: saveNotesInput.trim() || undefined,
      route: `${oaci1} → ${oaci2}${hasLeg3 ? ` → ${oaci3}` : ''}`,
      leg1Oaci: oaci1,
      leg2Oaci: oaci2,
      leg3Oaci: hasLeg3 ? oaci3 : undefined,
      hasLeg3,
      extraUSG: Math.round(totalExtra),
      extraLbs: Math.round(totalExtra * JET_A_DENSITY),
      extraLts: Math.round(totalExtra * LITERS_PER_USG),
      totalSavingsUSD: Number(totalSavings.toFixed(2)),
      useCarryCost,
      carryBurnUSG: useCarryCost ? Math.round(totalCarryBurnUSG) : undefined,
      carryCostUSD: useCarryCost ? Number(totalCarryCostUSD.toFixed(2)) : undefined,
    };

    // Actualización optimista local
    setBitacora((prev) => [newEntry, ...prev.filter((p) => p.id !== newEntry.id)]);
    setIsSavingToCloud(true);

    try {
      await saveRecordToCloud({
        id: newEntry.id,
        dateStr: newEntry.dateStr,
        registration: newEntry.registration,
        flightNumber: newEntry.flightNumber,
        route: newEntry.route,
        extraUSG: newEntry.extraUSG,
        extraLbs: newEntry.extraLbs,
        extraLts: newEntry.extraLts,
        totalSavingsUSD: newEntry.totalSavingsUSD,
        useCarryCost: newEntry.useCarryCost,
        notes: newEntry.notes,
        createdAt: new Date().toISOString(),
      });
      setIsCloudConnected(true);
    } catch (e) {
      console.warn('Guardado en caché local, pendiente de sync en la nube:', e);
    } finally {
      setIsSavingToCloud(false);
    }

    setSaveSuccessMsg(true);
    setTimeout(() => {
      setSaveSuccessMsg(false);
      setShowSaveModal(false);
    }, 1200);
  };

  // Eliminar entrada de bitácora (Local + Nube)
  const handleDeleteBitacoraEntry = async (id: string) => {
    setBitacora((prev) => prev.filter((item) => item.id !== id));
    try {
      await deleteRecordFromCloud(id);
    } catch (e) {
      console.warn('Error al eliminar de la nube:', e);
    }
  };

  // Exportar a CSV / Excel (respeta los filtros aplicados)
  const handleExportCSV = () => {
    const headers = ['Fecha', 'Matricula', 'Vuelo', 'Ruta', 'Galones Tankereados (USG)', 'Libras Tankereadas (lbs)', 'Litros Tankereados (LTS)', 'Ahorro Total (USD)', 'Acarreo Aplicado', 'Costo Acarreo (USD)', 'Notas'];
    const rows = filteredBitacora.map((b) => [
      b.dateStr,
      b.registration,
      b.flightNumber || '',
      `"${b.route}"`,
      b.extraUSG,
      b.extraLbs,
      b.extraLts,
      b.totalSavingsUSD.toFixed(2),
      b.useCarryCost ? 'SI' : 'NO',
      b.carryCostUSD ? b.carryCostUSD.toFixed(2) : '0.00',
      `"${(b.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Flyzar_Bitacora_Tankering_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetWaiverInputs = () => {
    setFeeInput('');
    setWaiverInput('');
    setWaiverPriceInput('');
  };

  const resetTankerInputs = () => {
    setLeg1Oaci('');
    setNeeded1Input('');
    setNeeded1Unit('LBS');
    setLoaded1Input('');
    setLoaded1Unit('USG');
    setPrice1Input('');

    setLeg2Oaci('');
    setNeeded2Input('');
    setNeeded2Unit('LBS');
    setLoaded2Input('');
    setLoaded2Unit('USG');
    setPrice2Input('');

    setHasLeg3(false);
    setLeg3Oaci('');
    setNeeded3Input('');
    setNeeded3Unit('LBS');
    setLoaded3Input('');
    setLoaded3Unit('USG');
    setPrice3Input('');

    setUseCarryCost(false);
    setFlightHours1Input('1.5');
    setFlightHours2Input('2.0');
    setCarryBurnRateInput('3.0');
  };


  return (
    <div className="min-h-screen bg-[#e9e9e8] text-[#1f2426] font-brand transition-colors duration-150 flex flex-col items-center justify-start antialiased selection:bg-[#2a3440] selection:text-white">
      {/* Container optimizado para pantalla de teléfono / iPhone con ancho flexible para GENDEC */}
      <div className={`w-full px-4 pt-3 pb-8 flex flex-col gap-3.5 transition-all duration-200 ${
        currentView === 'gendec' ? 'max-w-xl' : 'max-w-md'
      }`}>
        {/* Cabecera Principal Oficial Flyzar */}
        <header className="flex items-center justify-between pt-1 pb-2 border-b border-[#d4d2d0]">
          <FlyzarLogo variant="full" />

          {currentView !== 'root_menu' && (
            <button
              onClick={() => {
                if (currentView === 'waiver' || currentView === 'tankering' || currentView === 'bitacora') {
                  setCurrentView('fuel_menu');
                } else {
                  setCurrentView('root_menu');
                }
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#1f2426] bg-white hover:bg-slate-50 border border-[#d4d2d0] shadow-xs flex items-center gap-1.5 min-h-[38px] active:scale-95 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#2a3440]" />
              <span>
                {currentView === 'waiver' || currentView === 'tankering' || currentView === 'bitacora'
                  ? 'Fuel'
                  : 'Inicio'}
              </span>
            </button>
          )}
        </header>

        {/* =========================================================================
            1. MENÚ PRINCIPAL RAÍZ (ROOT MENU): Fuel Calculations vs GENDEC
           ========================================================================= */}
        {currentView === 'root_menu' && (
          <main className="flex flex-col gap-3.5 pt-1 animate-fade-in">
            <div className="bg-white border border-[#d4d2d0] rounded-2xl p-4 shadow-xs text-center">
              <span className="text-[11px] font-extrabold tracking-widest uppercase text-[#2a3440] block mb-0.5">
                Despacho Operacional Flyzar
              </span>
              <p className="text-xs font-semibold text-[#1f2426]">
                Seleccioná el sistema que deseás operar:
              </p>
            </div>

            {/* Menú Principal 1: Fuel Calculations */}
            <button
              type="button"
              onClick={() => setCurrentView('fuel_menu')}
              className="w-full bg-white hover:bg-[#d4d6d4]/20 border border-[#d4d2d0] hover:border-[#2a3440] rounded-2xl p-4 text-left transition-all active:scale-[0.98] shadow-xs flex items-center justify-between gap-3 group cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-xl bg-[#2a3440] text-white shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-[#1f2426] leading-snug">
                      Fuel Calculations
                    </h2>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md">
                      Módulos
                    </span>
                  </div>
                  <p className="text-xs text-[#7d7570] font-medium mt-0.5">
                    Punto de equilibrio para waivear, tankering y registro de ahorro
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#988d85] group-hover:text-[#2a3440] shrink-0 transition-colors" />
            </button>

            {/* Menú Principal 2: GENDEC */}
            <button
              type="button"
              onClick={() => setCurrentView('gendec')}
              className="w-full bg-white hover:bg-[#d4d6d4]/20 border border-[#d4d2d0] hover:border-[#2a3440] rounded-2xl p-4 text-left transition-all active:scale-[0.98] shadow-xs flex items-center justify-between gap-3 group cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-xl bg-[#2a3440] text-white shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                  <FileText className="w-6 h-6 text-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-[#1f2426] leading-snug">
                      GENDEC
                    </h2>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-md">
                      ICAO Annex 9
                    </span>
                  </div>
                  <p className="text-xs text-[#7d7570] font-medium mt-0.5">
                    Declaración general, manifiesto de tripulación, pax y descarga PDF
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#988d85] group-hover:text-[#2a3440] shrink-0 transition-colors" />
            </button>
          </main>
        )}

        {/* =========================================================================
            2. MENÚ SECUNDARIO: FUEL CALCULATIONS (Waiver, Tankering, Registro)
           ========================================================================= */}
        {currentView === 'fuel_menu' && (
          <main className="flex flex-col gap-3 pt-1 animate-fade-in">
            <div className="bg-white border border-[#d4d2d0] rounded-2xl p-4 shadow-xs text-center">
              <span className="text-[11px] font-extrabold tracking-widest uppercase text-[#2a3440] block mb-0.5">
                Fuel Calculations · Flyzar
              </span>
              <p className="text-xs font-semibold text-[#1f2426]">
                Seleccioná la herramienta de combustible que deseás utilizar:
              </p>
            </div>

            {/* Opción 1: Waiver */}
            <button
              type="button"
              onClick={() => setCurrentView('waiver')}
              className="w-full bg-white hover:bg-[#d4d6d4]/20 border border-[#d4d2d0] hover:border-[#2a3440] rounded-2xl p-4 text-left transition-all active:scale-[0.98] shadow-xs flex items-center justify-between gap-3 group cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-[#2a3440]/10 text-[#2a3440] shrink-0 group-hover:bg-[#2a3440] group-hover:text-white transition-colors">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-[#1f2426] leading-snug">
                    Punto de equilibrio para waivear
                  </h2>
                  <p className="text-[11px] text-[#988d85] font-medium">
                    Calculá si conviene cargar para bonificar tasa
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#988d85] group-hover:text-[#2a3440] shrink-0 transition-colors" />
            </button>

            {/* Opción 2: Tankering */}
            <button
              type="button"
              onClick={() => setCurrentView('tankering')}
              className="w-full bg-white hover:bg-[#d4d6d4]/20 border border-[#d4d2d0] hover:border-[#2a3440] rounded-2xl p-4 text-left transition-all active:scale-[0.98] shadow-xs flex items-center justify-between gap-3 group cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-[#2a3440]/10 text-[#2a3440] shrink-0 group-hover:bg-[#2a3440] group-hover:text-white transition-colors">
                  <Gauge className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-[#1f2426] leading-snug">
                    Calculadora de ahorro tankereando
                  </h2>
                  <p className="text-[11px] text-[#988d85] font-medium">
                    Compará tramos, precios y penalidad por acarreo
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#988d85] group-hover:text-[#2a3440] shrink-0 transition-colors" />
            </button>

            {/* Opción 3: Registro de ahorro */}
            <button
              type="button"
              onClick={() => setCurrentView('bitacora')}
              className="w-full bg-white hover:bg-[#d4d6d4]/20 border border-[#d4d2d0] hover:border-[#2a3440] rounded-2xl p-4 text-left transition-all active:scale-[0.98] shadow-xs flex items-center justify-between gap-3 group cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-[#2a3440]/10 text-[#2a3440] shrink-0 group-hover:bg-[#2a3440] group-hover:text-white transition-colors">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-extrabold text-[#1f2426] leading-snug">
                      Registro de ahorro
                    </h2>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-[#2a3440] text-white px-2 py-0.5 rounded-md">
                      {bitacora.length} vuelos
                    </span>
                  </div>
                  <p className="text-[11px] text-[#988d85] font-medium">
                    Historial sincronizado en la nube de la flota Flyzar
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#988d85] group-hover:text-[#2a3440] shrink-0 transition-colors" />
            </button>
          </main>
        )}

        {/* =========================================================================
            MENU 1: PUNTO DE EQUILIBRIO PARA WAIVEAR
            1. Lo primero: Parámetros a setear (solo campo para tipear, sin botones)
            2. Lo segundo: Punto de equilibrio
            3. Lo último: Reglas de decisión (criollas)
           ========================================================================= */}
        {currentView === 'waiver' && (
          <main className="flex flex-col gap-3.5 animate-fade-in">
            {/* Barra de título de la sección */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-amber-600" />
                Punto de equilibrio para waivear
              </span>
              <button
                type="button"
                onClick={resetWaiverInputs}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold"
                title="Restablecer valores"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>

            {/* 1. PARÁMETROS A SETEAR */}
            <section
              aria-label="1. Parámetros a setear"
              className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm flex flex-col gap-3.5"
            >
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5 text-amber-600" />
                  1. Parámetros a setear
                </h2>
              </div>

              {/* Handling Fee */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={feeInputId} className="text-xs font-bold text-slate-800 cursor-pointer">
                    Handling Fee (USD)
                  </label>
                  <span className="text-xs font-mono font-bold text-slate-600 tabular-nums">
                    ${facilityFee.toFixed(2)} USD
                  </span>
                </div>
                <div className="relative">
                  <input
                    id={feeInputId}
                    type="text"
                    inputMode="decimal"
                    value={feeInput}
                    onChange={(e) => setFeeInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                    className="w-full h-12 px-14 text-center text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 focus:border-amber-600 focus:bg-white focus:ring-1 focus:ring-amber-600 transition-all shadow-xs"
                    placeholder="0"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold pointer-events-none">
                    USD
                  </span>
                </div>
              </div>

              {/* Minimo para waivear */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={waiverInputId} className="text-xs font-bold text-slate-800 cursor-pointer">
                    Minimo para waivear (USG)
                  </label>
                  <span className="text-xs font-mono font-bold text-slate-600 tabular-nums">
                    {waiverUSG.toFixed(0)} USG ≈ {Math.round(waiverLbs)} lbs
                  </span>
                </div>
                <div className="relative">
                  <input
                    id={waiverInputId}
                    type="text"
                    inputMode="decimal"
                    value={waiverInput}
                    onChange={(e) => setWaiverInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                    className="w-full h-12 px-14 text-center text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 focus:border-amber-600 focus:bg-white focus:ring-1 focus:ring-amber-600 transition-all shadow-xs"
                    placeholder="0"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold pointer-events-none">
                    USG
                  </span>
                </div>
              </div>

              {/* Fuel Price */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={waiverPriceInputId} className="text-xs font-bold text-slate-800 cursor-pointer">
                    Fuel Price (USD/USG)
                  </label>
                  <span className="text-xs font-mono font-bold text-slate-600 tabular-nums">
                    ${waiverFuelPrice.toFixed(2)} / USG
                  </span>
                </div>
                <div className="relative">
                  <input
                    id={waiverPriceInputId}
                    type="text"
                    inputMode="decimal"
                    value={waiverPriceInput}
                    onChange={(e) => setWaiverPriceInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                    className="w-full h-12 px-14 text-center text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 focus:border-amber-600 focus:bg-white focus:ring-1 focus:ring-amber-600 transition-all shadow-xs"
                    placeholder="0"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold pointer-events-none">
                    USD/gal
                  </span>
                </div>
              </div>
            </section>

            {/* 2. PUNTO DE EQUILIBRIO */}
            <section
              aria-label="2. Punto de equilibrio"
              className="rounded-2xl p-5 bg-white border border-slate-200 shadow-sm relative overflow-hidden text-center"
            >
              <div className="flex items-center justify-center mb-1">
                <span className="text-xs font-bold tracking-wider uppercase text-amber-700">
                  2. Punto de equilibrio
                </span>
              </div>

              {/* Valor Hero de Break-Even */}
              <div className="flex items-baseline justify-center gap-2.5 my-2">
                {waiverFuelPrice <= 0 ? (
                  waiverUSG === 0 && facilityFee === 0 ? (
                    <>
                      <span className="text-5xl font-extrabold tracking-tight font-mono tabular-nums text-slate-300">
                        0.0
                      </span>
                      <span className="text-2xl font-extrabold text-slate-300">
                        USG
                      </span>
                    </>
                  ) : (
                    <span className="text-lg font-bold text-amber-600">
                      Ingrese precio &gt; $0
                    </span>
                  )
                ) : (
                  <>
                    <span className="text-5xl font-extrabold tracking-tight font-mono tabular-nums text-slate-900">
                      {effectiveBreakEvenUSG.toFixed(1)}
                    </span>
                    <span className="text-2xl font-extrabold text-amber-600">
                      USG
                    </span>
                  </>
                )}
              </div>

              {isFeeExceedsWaiver && (
                <div className="mb-3 text-xs py-2 px-3 rounded-xl flex items-center gap-2 bg-emerald-50 text-emerald-900 border border-emerald-200 text-left font-medium">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>El Handling Fee supera el costo del mínimo para waivear. Conviene cargar el mínimo siempre.</span>
                </div>
              )}

              {/* Escala Visual de 3 colores con Indicadores */}
              <div className="pt-4 border-t border-slate-100">
                {/* Fila de Indicadores Superiores (Escalonados para no pisarse nunca) */}
                <div className="relative h-[74px] w-full mb-1.5">
                  {/* Indicador 1: Punto de equilibrio (Nivel Inferior) */}
                  <div
                    style={{ left: `${barYellowPct}%` }}
                    className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center transition-all duration-150 z-20 pointer-events-none"
                  >
                    <div className="bg-slate-900 text-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-md flex flex-col items-center leading-tight whitespace-nowrap border border-slate-700">
                      <span className="text-[9px] uppercase tracking-wider text-amber-400">Punto de equilibrio</span>
                      <span className="text-[11px] font-mono font-black text-white tabular-nums">
                        {effectiveBreakEvenUSG > 0 ? effectiveBreakEvenUSG.toFixed(1) : '0.0'} USG
                      </span>
                    </div>
                    <div className="w-0 h-0 border-x-4 border-x-transparent border-t-[5px] border-t-slate-900" />
                  </div>

                  {/* Indicador 2: Mínimo para waivear (Nivel Superior - Elevado con vástago de 32px) */}
                  <div
                    style={{ left: `${barYellowPct + barRedPct}%` }}
                    className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center transition-all duration-150 z-20 pointer-events-none"
                  >
                    <div className="bg-slate-900 text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-md flex flex-col items-center leading-tight whitespace-nowrap border border-slate-700">
                      <span className="text-[9px] uppercase tracking-wider text-emerald-400">Mínimo para waivear</span>
                      <span className="text-[11px] font-mono font-black text-white tabular-nums">
                        {waiverUSG > 0 ? waiverUSG.toFixed(0) : '0'} USG
                      </span>
                    </div>
                    <div className="w-[2px] h-8 bg-slate-900" />
                    <div className="w-0 h-0 border-x-4 border-x-transparent border-t-[5px] border-t-slate-900" />
                  </div>
                </div>

                {/* Barra de colores */}
                <div className="relative h-12 w-full rounded-xl overflow-hidden bg-slate-200 border-2 border-slate-300 flex shadow-inner">
                  {/* Zona 1: Amarillo */}
                  <div
                    style={{ width: `${barYellowPct}%` }}
                    className="h-full bg-amber-400 transition-all duration-150 flex items-center justify-center px-1 overflow-hidden"
                  >
                    <span className="text-[11px] sm:text-xs font-black text-amber-950 uppercase tracking-tight text-center drop-shadow-xs">
                      CARGA LO JUSTO
                    </span>
                  </div>

                  {/* Zona 2: Rojo */}
                  <div
                    style={{ width: `${barRedPct}%` }}
                    className="h-full bg-rose-600 transition-all duration-150 flex items-center justify-center px-1 overflow-hidden"
                  >
                    <span className="text-[11px] sm:text-xs font-black text-white uppercase tracking-tight text-center drop-shadow-xs">
                      NO CARGUES
                    </span>
                  </div>

                  {/* Zona 3: Verde */}
                  <div
                    style={{ width: `${barGreenPct}%` }}
                    className="h-full bg-emerald-500 transition-all duration-150 flex items-center justify-center px-1 overflow-hidden"
                  >
                    <span className="text-[11px] sm:text-xs font-black text-white uppercase tracking-tight text-center drop-shadow-xs">
                      CARGA TRANQUILO
                    </span>
                  </div>

                  {/* Línea divisoria 1: entre amarillo y rojo */}
                  <div
                    style={{ left: `${barYellowPct}%` }}
                    className="absolute top-0 bottom-0 w-[2px] bg-slate-900 -translate-x-1/2 z-10 pointer-events-none"
                  />

                  {/* Línea divisoria 2: entre rojo y verde */}
                  <div
                    style={{ left: `${barYellowPct + barRedPct}%` }}
                    className="absolute top-0 bottom-0 w-[2px] bg-slate-900 -translate-x-1/2 z-10 pointer-events-none"
                  />
                </div>

                {/* Resumen / Leyenda debajo de la barra con renglones perfectamente alineados */}
                <div className="grid grid-cols-3 gap-2 text-xs mt-3 font-bold text-center items-stretch">
                  <div className="flex flex-col justify-between bg-amber-50/90 border border-amber-300 p-2 rounded-xl shadow-xs">
                    <div className="min-h-[28px] flex items-center justify-center gap-1 text-amber-950 font-black text-[11px] leading-tight">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-600 shrink-0" />
                      <span>CARGA LO JUSTO</span>
                    </div>
                    <div className="min-h-[22px] flex items-center justify-center text-[10.5px] text-amber-900 font-bold mt-1.5 pt-1.5 border-t border-amber-200/80 whitespace-nowrap">
                      Hasta {effectiveBreakEvenUSG > 0 ? effectiveBreakEvenUSG.toFixed(1) : '0.0'} USG
                    </div>
                  </div>

                  <div className="flex flex-col justify-between bg-rose-50/90 border border-rose-300 p-2 rounded-xl shadow-xs">
                    <div className="min-h-[28px] flex items-center justify-center gap-1 text-rose-950 font-black text-[11px] leading-tight">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0" />
                      <span>NO CARGUES</span>
                    </div>
                    <div className="min-h-[22px] flex items-center justify-center text-[10.5px] text-rose-900 font-bold mt-1.5 pt-1.5 border-t border-rose-200/80 whitespace-nowrap">
                      {effectiveBreakEvenUSG > 0 ? effectiveBreakEvenUSG.toFixed(1) : '0.0'} a {waiverUSG > 0 ? waiverUSG.toFixed(0) : '0'} USG
                    </div>
                  </div>

                  <div className="flex flex-col justify-between bg-emerald-50/90 border border-emerald-300 p-2 rounded-xl shadow-xs">
                    <div className="min-h-[28px] flex items-center justify-center gap-1 text-emerald-950 font-black text-[11px] leading-tight">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>CARGA TRANQUILO</span>
                    </div>
                    <div className="min-h-[22px] flex items-center justify-center text-[10.5px] text-emerald-900 font-bold mt-1.5 pt-1.5 border-t border-emerald-200/80 whitespace-nowrap">
                      Desde {waiverUSG > 0 ? waiverUSG.toFixed(0) : '0'} USG
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. REGLAS DE DECISIÓN (CRIOLLAS) */}
            <section
              aria-label="3. Reglas de decisión"
              className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm flex flex-col gap-2.5"
            >
              <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                <Scale className="w-4 h-4 text-amber-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  3. Reglas de Decisión
                </h2>
              </div>

              {/* 1. Amarillo: Debajo del PE */}
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/80 text-amber-950 flex items-start gap-2.5">
                <div className="w-3 h-3 rounded-full bg-amber-400 border border-amber-500 shrink-0 mt-1" />
                <div className="text-xs leading-relaxed">
                  <div className="font-extrabold text-amber-900 mb-0.5">
                    🟡 Menos de {effectiveBreakEvenUSG > 0 ? effectiveBreakEvenUSG.toFixed(1) : '0'} USG — CARGA LO JUSTO:
                  </div>
                  <div className="text-slate-700">
                    <strong>Pagá el handling fee y cargá lo justo.</strong> No te gastes en llegar al mínimo porque vas a gastar más en nafta al pedo que lo que te sale el fee.
                  </div>
                </div>
              </div>

              {/* 2. Rojo: Entre el PE y el mínimo */}
              <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/80 text-rose-950 flex items-start gap-2.5">
                <div className="w-3 h-3 rounded-full bg-rose-500 shrink-0 mt-1" />
                <div className="text-xs leading-relaxed">
                  <div className="font-extrabold text-rose-900 mb-0.5">
                    🔴 Entre {effectiveBreakEvenUSG > 0 ? effectiveBreakEvenUSG.toFixed(1) : '0'} y {waiverUSG > 0 ? waiverUSG.toFixed(0) : '0'} USG — NO CARGUES:
                  </div>
                  <div className="text-slate-700">
                    <strong>¡Ni se te ocurra pagar el fee cargando en este rango!</strong> O no cargues o estirate y cargá los {waiverUSG > 0 ? waiverUSG.toFixed(0) : '0'} USG del mínimo. Te sale más barato pagar el combustible completo que pagar el fee más tu combustible necesario. ¡Te llevás combustible gratis!
                  </div>
                </div>
              </div>

              {/* 3. Verde: Por encima del mínimo */}
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/80 text-emerald-950 flex items-start gap-2.5">
                <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0 mt-1" />
                <div className="text-xs leading-relaxed">
                  <div className="font-extrabold text-emerald-900 mb-0.5">
                    🟢 {waiverUSG > 0 ? waiverUSG.toFixed(0) : '0'} USG o más — CARGA TRANQUILO:
                  </div>
                  <div className="text-slate-700">
                    <strong>Cargá de una.</strong> Ya alcanzás o superás el mínimo para waivear, así que el handling fee queda 100% bonificado.
                  </div>
                </div>
              </div>
            </section>
          </main>
        )}

        {/* =========================================================================
            MENU 2: CALCULADORA DE AHORRO TANKEREANDO
            - Tramo 1: Necesitado (lbs), Cargado (USG), Precio ($/USG), OACI
            - Tramo 2: Necesitado (lbs), Cargado (USG), Precio ($/USG), OACI
            - Tramo 3: (Opcional mediante botón)
            - Análisis de ahorro idéntico y detallado
           ========================================================================= */}
        {currentView === 'tankering' && (
          <main className="flex flex-col gap-3.5 animate-fade-in">
            {/* Barra de título de la sección */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-emerald-600" />
                Calculadora de ahorro tankereando
              </span>
              <button
                type="button"
                onClick={resetTankerInputs}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold"
                title="Restablecer valores"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>

            {/* TRAMO 1 */}
            <section
              aria-label="Tramo 1"
              className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm flex flex-col gap-3.5"
            >
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 text-xs font-extrabold flex items-center justify-center">
                    1
                  </div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Tramo 1
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 font-semibold">Aeropuerto:</span>
                  <input
                    type="text"
                    value={leg1Oaci}
                    maxLength={4}
                    onChange={(e) => setLeg1Oaci(e.target.value.toUpperCase())}
                    className="w-16 h-7 text-xs font-extrabold text-center bg-slate-100 border border-slate-200 rounded-md uppercase text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 outline-none"
                    placeholder="OACI"
                  />
                </div>
              </div>

              {/* Combustible necesitado */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={needed1Id} className="text-xs font-bold text-slate-800 cursor-pointer">
                    Combustible necesitado
                  </label>
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    {needed1Unit === 'LBS'
                      ? `≈ ${Math.round(needed1USG).toLocaleString()} USG`
                      : needed1Unit === 'USG'
                      ? `≈ ${Math.round(needed1Lbs).toLocaleString()} lbs`
                      : `≈ ${Math.round(needed1USG).toLocaleString()} USG · ${Math.round(needed1Lbs).toLocaleString()} lbs`}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    id={needed1Id}
                    type="text"
                    inputMode="decimal"
                    value={needed1Input}
                    onChange={(e) => setNeeded1Input(e.target.value.replace(/[^0-9.,]/g, ''))}
                    className="w-full h-12 pl-4 pr-24 text-left text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all shadow-xs"
                    placeholder="0"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <select
                      value={needed1Unit}
                      onChange={(e) => setNeeded1Unit(e.target.value as FuelUnit)}
                      className="h-8 px-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-700 outline-none hover:border-emerald-500 focus:border-emerald-600 cursor-pointer shadow-2xs"
                    >
                      <option value="LBS">LBS</option>
                      <option value="USG">USG</option>
                      <option value="LTS">LTS</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Combustible realmente cargado */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={loaded1Id} className="text-xs font-bold text-slate-800 cursor-pointer">
                    Combustible realmente cargado
                  </label>
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    {loaded1Unit === 'USG'
                      ? `≈ ${Math.round(loaded1Lbs).toLocaleString()} lbs`
                      : loaded1Unit === 'LBS'
                      ? `≈ ${Math.round(loaded1USG).toLocaleString()} USG`
                      : `≈ ${Math.round(loaded1USG).toLocaleString()} USG · ${Math.round(loaded1Lbs).toLocaleString()} lbs`}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    id={loaded1Id}
                    type="text"
                    inputMode="decimal"
                    value={loaded1Input}
                    onChange={(e) => setLoaded1Input(e.target.value.replace(/[^0-9.,]/g, ''))}
                    className="w-full h-12 pl-4 pr-24 text-left text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all shadow-xs"
                    placeholder="0"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <select
                      value={loaded1Unit}
                      onChange={(e) => setLoaded1Unit(e.target.value as FuelUnit)}
                      className="h-8 px-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-700 outline-none hover:border-emerald-500 focus:border-emerald-600 cursor-pointer shadow-2xs"
                    >
                      <option value="USG">USG</option>
                      <option value="LBS">LBS</option>
                      <option value="LTS">LTS</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Precio */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={price1Id} className="text-xs font-bold text-slate-800 cursor-pointer">
                    Precio en {oaci1} (USD/USG)
                  </label>
                  <span className="text-xs font-mono font-bold text-slate-600 tabular-nums">
                    ${price1.toFixed(2)} / gal
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base pointer-events-none">
                    $
                  </span>
                  <input
                    id={price1Id}
                    type="text"
                    inputMode="decimal"
                    value={price1Input}
                    onChange={(e) => setPrice1Input(e.target.value.replace(/[^0-9.,]/g, ''))}
                    className="w-full h-12 pl-8 pr-12 text-center text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all shadow-xs"
                    placeholder="0.00"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold pointer-events-none">
                    /gal
                  </span>
                </div>
              </div>
            </section>

            {/* TRAMO 2 */}
            <section
              aria-label="Tramo 2"
              className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm flex flex-col gap-3.5"
            >
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 text-xs font-extrabold flex items-center justify-center">
                    2
                  </div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Tramo 2
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 font-semibold">Aeropuerto:</span>
                  <input
                    type="text"
                    value={leg2Oaci}
                    maxLength={4}
                    onChange={(e) => setLeg2Oaci(e.target.value.toUpperCase())}
                    className="w-16 h-7 text-xs font-extrabold text-center bg-slate-100 border border-slate-200 rounded-md uppercase text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 outline-none"
                    placeholder="OACI"
                  />
                </div>
              </div>

              {/* Combustible necesitado */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={needed2Id} className="text-xs font-bold text-slate-800 cursor-pointer">
                    Combustible necesitado
                  </label>
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    {needed2Unit === 'LBS'
                      ? `≈ ${Math.round(needed2USG).toLocaleString()} USG`
                      : needed2Unit === 'USG'
                      ? `≈ ${Math.round(needed2Lbs).toLocaleString()} lbs`
                      : `≈ ${Math.round(needed2USG).toLocaleString()} USG · ${Math.round(needed2Lbs).toLocaleString()} lbs`}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    id={needed2Id}
                    type="text"
                    inputMode="decimal"
                    value={needed2Input}
                    onChange={(e) => setNeeded2Input(e.target.value.replace(/[^0-9.,]/g, ''))}
                    className="w-full h-12 pl-4 pr-24 text-left text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all shadow-xs"
                    placeholder="0"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <select
                      value={needed2Unit}
                      onChange={(e) => setNeeded2Unit(e.target.value as FuelUnit)}
                      className="h-8 px-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-700 outline-none hover:border-emerald-500 focus:border-emerald-600 cursor-pointer shadow-2xs"
                    >
                      <option value="LBS">LBS</option>
                      <option value="USG">USG</option>
                      <option value="LTS">LTS</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Combustible realmente cargado */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={loaded2Id} className="text-xs font-bold text-slate-800 cursor-pointer">
                    Combustible realmente cargado
                  </label>
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    {loaded2Unit === 'USG'
                      ? `≈ ${Math.round(loaded2Lbs).toLocaleString()} lbs`
                      : loaded2Unit === 'LBS'
                      ? `≈ ${Math.round(loaded2USG).toLocaleString()} USG`
                      : `≈ ${Math.round(loaded2USG).toLocaleString()} USG · ${Math.round(loaded2Lbs).toLocaleString()} lbs`}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    id={loaded2Id}
                    type="text"
                    inputMode="decimal"
                    value={loaded2Input}
                    onChange={(e) => setLoaded2Input(e.target.value.replace(/[^0-9.,]/g, ''))}
                    className="w-full h-12 pl-4 pr-24 text-left text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all shadow-xs"
                    placeholder="0"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <select
                      value={loaded2Unit}
                      onChange={(e) => setLoaded2Unit(e.target.value as FuelUnit)}
                      className="h-8 px-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-700 outline-none hover:border-emerald-500 focus:border-emerald-600 cursor-pointer shadow-2xs"
                    >
                      <option value="USG">USG</option>
                      <option value="LBS">LBS</option>
                      <option value="LTS">LTS</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Precio */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={price2Id} className="text-xs font-bold text-slate-800 cursor-pointer">
                    Precio en {oaci2} (USD/USG)
                  </label>
                  <span className="text-xs font-mono font-bold text-slate-600 tabular-nums">
                    ${price2.toFixed(2)} / gal
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base pointer-events-none">
                    $
                  </span>
                  <input
                    id={price2Id}
                    type="text"
                    inputMode="decimal"
                    value={price2Input}
                    onChange={(e) => setPrice2Input(e.target.value.replace(/[^0-9.,]/g, ''))}
                    className="w-full h-12 pl-8 pr-12 text-center text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all shadow-xs"
                    placeholder="0.00"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold pointer-events-none">
                    /gal
                  </span>
                </div>
              </div>
            </section>

            {/* BOTÓN PARA AGREGAR O QUITAR TRAMO 3 */}
            {!hasLeg3 ? (
              <button
                type="button"
                onClick={() => setHasLeg3(true)}
                className="w-full h-12 rounded-2xl border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-white hover:bg-emerald-50/40 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-xs"
              >
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>+ Agregar Tramo 3</span>
              </button>
            ) : (
              /* TRAMO 3 */
              <section
                aria-label="Tramo 3"
                className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm flex flex-col gap-3.5 relative"
              >
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 text-xs font-extrabold flex items-center justify-center">
                      3
                    </div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Tramo 3
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-semibold">Aeropuerto:</span>
                    <input
                      type="text"
                      value={leg3Oaci}
                      maxLength={4}
                      onChange={(e) => setLeg3Oaci(e.target.value.toUpperCase())}
                      className="w-16 h-7 text-xs font-extrabold text-center bg-slate-100 border border-slate-200 rounded-md uppercase text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 outline-none"
                      placeholder="OACI"
                    />
                    <button
                      type="button"
                      onClick={() => setHasLeg3(false)}
                      className="p-1 rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors ml-1"
                      title="Quitar Tramo 3"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Combustible necesitado */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor={needed3Id} className="text-xs font-bold text-slate-800 cursor-pointer">
                      Combustible necesitado
                    </label>
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {needed3Unit === 'LBS'
                        ? `≈ ${Math.round(needed3USG).toLocaleString()} USG`
                        : needed3Unit === 'USG'
                        ? `≈ ${Math.round(needed3Lbs).toLocaleString()} lbs`
                        : `≈ ${Math.round(needed3USG).toLocaleString()} USG · ${Math.round(needed3Lbs).toLocaleString()} lbs`}
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      id={needed3Id}
                      type="text"
                      inputMode="decimal"
                      value={needed3Input}
                      onChange={(e) => setNeeded3Input(e.target.value.replace(/[^0-9.,]/g, ''))}
                      className="w-full h-12 pl-4 pr-24 text-left text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all shadow-xs"
                      placeholder="0"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <select
                        value={needed3Unit}
                        onChange={(e) => setNeeded3Unit(e.target.value as FuelUnit)}
                        className="h-8 px-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-700 outline-none hover:border-emerald-500 focus:border-emerald-600 cursor-pointer shadow-2xs"
                      >
                        <option value="LBS">LBS</option>
                        <option value="USG">USG</option>
                        <option value="LTS">LTS</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Combustible realmente cargado */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor={loaded3Id} className="text-xs font-bold text-slate-800 cursor-pointer">
                      Combustible realmente cargado
                    </label>
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {loaded3Unit === 'USG'
                        ? `≈ ${Math.round(loaded3Lbs).toLocaleString()} lbs`
                        : loaded3Unit === 'LBS'
                        ? `≈ ${Math.round(loaded3USG).toLocaleString()} USG`
                        : `≈ ${Math.round(loaded3USG).toLocaleString()} USG · ${Math.round(loaded3Lbs).toLocaleString()} lbs`}
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      id={loaded3Id}
                      type="text"
                      inputMode="decimal"
                      value={loaded3Input}
                      onChange={(e) => setLoaded3Input(e.target.value.replace(/[^0-9.,]/g, ''))}
                      className="w-full h-12 pl-4 pr-24 text-left text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all shadow-xs"
                      placeholder="0"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <select
                        value={loaded3Unit}
                        onChange={(e) => setLoaded3Unit(e.target.value as FuelUnit)}
                        className="h-8 px-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-700 outline-none hover:border-emerald-500 focus:border-emerald-600 cursor-pointer shadow-2xs"
                      >
                        <option value="USG">USG</option>
                        <option value="LBS">LBS</option>
                        <option value="LTS">LTS</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Precio */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor={price3Id} className="text-xs font-bold text-slate-800 cursor-pointer">
                      Precio en {oaci3} (USD/USG)
                    </label>
                    <span className="text-xs font-mono font-bold text-slate-600 tabular-nums">
                      ${price3.toFixed(2)} / gal
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base pointer-events-none">
                      $
                    </span>
                    <input
                      id={price3Id}
                      type="text"
                      inputMode="decimal"
                      value={price3Input}
                      onChange={(e) => setPrice3Input(e.target.value.replace(/[^0-9.,]/g, ''))}
                      className="w-full h-12 pl-8 pr-12 text-center text-xl font-bold font-mono tabular-nums rounded-xl outline-none bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all shadow-xs"
                      placeholder="0.00"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold pointer-events-none">
                      /gal
                    </span>
                  </div>
                </div>
              </section>
            )}

            {/* ALERTA DE PÉRDIDA SI EL PRECIO EN DESTINO ES MÁS BARATO O EL TOTAL ES NEGATIVO */}
            {((extra1USG > 0 && priceDiff12 < 0) || (hasLeg3 && extra2USG > 0 && priceDiff23 < 0) || totalSavings < 0) && (
              <div className="rounded-2xl p-4 bg-rose-50 border-2 border-rose-400 text-rose-950 shadow-sm flex items-start gap-3">
                <div className="p-2 rounded-xl bg-rose-100 text-rose-600 shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  <h3 className="font-black text-rose-900 text-sm">
                    ¡Ojo: En destino la nafta está más barata!
                  </h3>
                  <p className="text-rose-800 leading-relaxed">
                    {priceDiff12 < 0 && price1 > 0 && price2 > 0 ? (
                      <>En <strong>{oaci2}</strong> (USD {price2.toFixed(2)}) el galón cuesta menos que en <strong>{oaci1}</strong> (USD {price1.toFixed(2)}). Tankerear acá te hace perder <strong>USD {Math.abs(Math.round(totalSavings)).toLocaleString()}</strong>. ¡Cargá solo lo justo para el vuelo!</>
                    ) : (
                      <>Tankerear con estos precios genera pérdida de <strong>USD {Math.abs(Math.round(totalSavings)).toLocaleString()}</strong>. Conviene cargar únicamente lo requerido para el vuelo.</>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* FACTOR DE PENALIZACIÓN POR ACARREO DE PESO (CARRY COST) */}
            <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm flex flex-col gap-3">
              <label className="flex items-center justify-between cursor-pointer select-none">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm">
                    ⚖️
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      Descontar costo de acarreo de peso (Carry Cost)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Consumo extra de turbinas por trasladar combustible (~3%/hora)
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={useCarryCost}
                  onChange={(e) => setUseCarryCost(e.target.checked)}
                  className="w-5 h-5 rounded accent-emerald-600 cursor-pointer"
                />
              </label>

              {useCarryCost && (
                <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-600">
                        Horas de vuelo {oaci1} → {oaci2}:
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={flightHours1Input}
                          onChange={(e) => setFlightHours1Input(e.target.value.replace(/[^0-9.,]/g, ''))}
                          placeholder="1.5"
                          className="w-full h-9 px-3 pr-8 text-center font-mono font-bold text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">hs</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-600">
                        Tasa de consumo extra:
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={carryBurnRateInput}
                          onChange={(e) => setCarryBurnRateInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                          placeholder="3.0"
                          className="w-full h-9 px-3 pr-8 text-center font-mono font-bold text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">%/hr</span>
                      </div>
                    </div>
                  </div>
                  {extra1USG > 0 && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900 flex justify-between items-center">
                      <span>Quemado extra por peso:</span>
                      <strong className="font-mono">
                        ≈ {Math.round(totalCarryBurnUSG).toLocaleString()} USG (−USD {totalCarryCostUSD.toFixed(2)})
                      </strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. AHORRO Y CUENTA EXACTA (FORMATO CRIOLLO Y DIRECTO) */}
            <section
              aria-label="Resultado y Cuenta"
              className="rounded-2xl p-5 bg-white border border-slate-200 shadow-sm relative overflow-hidden"
            >
              <div className="text-center pb-3 border-b border-slate-100">
                <span className="text-xs font-bold tracking-wider uppercase text-emerald-800 block mb-1">
                  {useCarryCost ? 'Ahorro neto real (con acarreo deducido)' : 'Ahorro estimado tankereando'}
                </span>

                <div className="flex items-baseline justify-center gap-1.5 my-1">
                  <span className={`text-4xl md:text-5xl font-extrabold tracking-tight font-mono tabular-nums ${
                    totalSavings > 0 ? 'text-emerald-700' : totalSavings < 0 ? 'text-rose-700' : 'text-slate-800'
                  }`}>
                    {totalSavings < 0 ? '-USD ' : 'USD '}{Math.abs(Math.round(totalSavings)).toLocaleString()}
                  </span>
                </div>

                <div className="text-xs font-mono font-bold text-slate-500 tabular-nums mt-0.5">
                  {totalSavings !== 0 ? (
                    `${useCarryCost ? 'Ahorro neto exacto:' : 'Ahorro exacto:'} USD ${totalSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  ) : (
                    'Completá los tramos arriba para ver el ahorro'
                  )}
                </div>
              </div>

              {/* Desglose criollo y visual con menos texto */}
              <div className="mt-4 flex flex-col gap-3 text-xs leading-relaxed">
                {/* SECTOR GRIS: Lo que subiste de más */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 flex flex-col gap-2">
                  <div className="font-extrabold text-slate-900 flex items-center gap-1.5 text-xs">
                    <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 text-[11px] font-black flex items-center justify-center">
                      1
                    </span>
                    <span>⛽ {oaci1} → {oaci2}: Lo que subiste de más</span>
                  </div>

                  <div className="space-y-1.5 pt-1 text-slate-700 font-medium">
                    <div className="flex justify-between items-center">
                      <span>Combustible necesitado:</span>
                      <span className="font-bold text-slate-900 font-mono">
                        {needed1Lbs > 0 ? `${needed1Lbs.toLocaleString()} lbs` : '0 lbs'}
                        <span className="text-slate-500 font-normal ml-1">
                          (≈ {Math.round(needed1USG).toLocaleString()} USG)
                        </span>
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span>Combustible cargado:</span>
                      <span className="font-bold text-slate-900 font-mono">
                        {loaded1USG > 0 ? `${loaded1USG.toLocaleString()} USG` : '0 USG'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-200/80 text-emerald-800 font-bold">
                      <span>Te sobraron para {oaci2}:</span>
                      <span className="font-black font-mono">
                        +{Math.round(extra1USG).toLocaleString()} USG
                        <span className="text-emerald-700/80 font-semibold ml-1">
                          (≈ {Math.round(extra1Lbs).toLocaleString()} lbs)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* SECTOR VERDE: La guita que te ahorrás */}
                <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-300 text-emerald-950 flex flex-col gap-2">
                  <div className="font-extrabold text-emerald-950 flex items-center gap-1.5 text-xs">
                    <span className="w-5 h-5 rounded-md bg-emerald-200 text-emerald-800 text-[11px] font-black flex items-center justify-center">
                      2
                    </span>
                    <span>💵 La guita que te ahorrás en {oaci2}</span>
                  </div>

                  <p className="text-emerald-900 text-xs">
                    En {oaci2} pagabas <strong>USD {price2.toFixed(2)}</strong> vs <strong>USD {price1.toFixed(2)}</strong> en {oaci1} →{' '}
                    <strong className="text-emerald-800 underline decoration-emerald-400">
                      {priceDiff12 >= 0 ? `Te ahorrás USD ${priceDiff12.toFixed(2)} por galón` : `Pagás USD ${Math.abs(priceDiff12).toFixed(2)} más caro por galón`}
                    </strong>.
                  </p>

                  <div className="bg-white p-2.5 px-3 rounded-lg border border-emerald-200 text-xs flex justify-between items-center gap-2 shadow-2xs">
                    <span className="text-slate-600 font-sans font-bold whitespace-nowrap">Cuenta corta:</span>
                    <strong className="text-emerald-700 font-mono text-right tabular-nums">
                      {Math.round(extra1USG).toLocaleString()} USG × USD {priceDiff12.toFixed(2)} = USD {savings12.toFixed(2)}
                    </strong>
                  </div>
                </div>

                {/* TRAMO 3 (Si está activo) */}
                {hasLeg3 && (
                  <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-300 text-emerald-950 flex flex-col gap-2">
                    <div className="font-extrabold text-emerald-950 flex items-center gap-1.5 text-xs">
                      <span className="w-5 h-5 rounded-md bg-emerald-200 text-emerald-800 text-[11px] font-black flex items-center justify-center">
                        3
                      </span>
                      <span>💵 Ahorro extra ({oaci2} → {oaci3})</span>
                    </div>

                    {extra2USG > 0 ? (
                      <div>
                        <p className="text-emerald-900 mb-2">
                          Saliste de {oaci2} con <strong>+{Math.round(extra2USG).toLocaleString()} USG de más</strong> para {oaci3} (ahorrás <strong>USD {priceDiff23.toFixed(2)}/gal</strong>).
                        </p>
                        <div className="bg-white p-2.5 px-3 rounded-lg border border-emerald-200 text-xs flex justify-between items-center gap-2 shadow-2xs">
                          <span className="text-slate-600 font-sans font-bold whitespace-nowrap">Cuenta corta:</span>
                          <strong className="text-emerald-700 font-mono text-right tabular-nums">
                            {Math.round(extra2USG).toLocaleString()} USG × USD {priceDiff23.toFixed(2)} = USD {savings23.toFixed(2)}
                          </strong>
                        </div>
                      </div>
                    ) : (
                      <p className="text-emerald-900 font-medium">
                        Cargaste solo lo justo para llegar a {oaci3}. No tankereaste fuel extra.
                      </p>
                    )}
                  </div>
                )}

                {/* DESCUENTO POR CARRY COST EN EL RESUMEN SI ESTÁ ACTIVO */}
                {useCarryCost && totalCarryCostUSD > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-col gap-1.5">
                    <div className="font-bold flex items-center justify-between text-xs">
                      <span>⚖️ Deducción de Acarreo (Carry Cost):</span>
                      <span className="font-mono text-amber-800 font-black">-USD {totalCarryCostUSD.toFixed(2)}</span>
                    </div>
                    <div className="text-[11px] text-amber-900">
                      Consumo extra estimado por trasladar peso: ≈ {Math.round(totalCarryBurnUSG).toLocaleString()} USG ({flightHours1} hs al {(carryBurnRate * 100).toFixed(1)}%/hr).
                    </div>
                  </div>
                )}

                {/* Nota operacional criolla */}
                <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200 mt-0.5 leading-relaxed">
                  ⚠️ <strong>Ojo con los pesos:</strong> Chequeá no pasarte de MTOW al despegar ni de MLW al tocar.
                </div>

                {/* BOTONES DE ACCIÓN: DESCARGAR PDF Y GUARDAR EN BITÁCORA */}
                <div className="flex flex-col sm:flex-row gap-2 mt-1">
                  <button
                    type="button"
                    onClick={generatePDFReport}
                    className="flex-1 h-11 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Descargar PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSaveModal(true)}
                    className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] cursor-pointer"
                  >
                    <BookmarkPlus className="w-4 h-4" />
                    <span>Guardar en Registro de ahorro</span>
                  </button>
                </div>
              </div>
            </section>
          </main>
        )}

        {/* =========================================================================
            MENU 3: REGISTRO DE AHORRO
           ========================================================================= */}
        {currentView === 'bitacora' && (
          <main className="flex flex-col gap-3.5 animate-fade-in">
            {/* Barra de título de la sección */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  Registro de ahorro
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isCloudConnected
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  <Cloud className={`w-3 h-3 ${isCloudConnected ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
                  <span>{isCloudConnected ? 'Nube Flyzar Activa' : 'Guardando local'}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={handleExportCSV}
                className="text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold border border-blue-200 transition-colors shadow-2xs cursor-pointer"
                title="Exportar a Excel / CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>
            </div>

            {/* TARJETAS DE IMPACTO ACUMULADO (KPIs) */}
            <section className="grid grid-cols-3 gap-2">
              <div className="bg-white border border-[#d4d2d0] rounded-2xl p-3 shadow-xs text-center flex flex-col justify-center">
                <span className="text-[10px] font-bold text-[#988d85] uppercase tracking-wider block">
                  Ahorro Total
                </span>
                <span className="text-base sm:text-lg font-black font-mono text-emerald-800 tabular-nums">
                  USD {Math.round(totalBitacoraSavings).toLocaleString('es-AR')}
                </span>
              </div>

              <div className="bg-white border border-[#d4d2d0] rounded-2xl p-3 shadow-xs text-center flex flex-col justify-center">
                <span className="text-[10px] font-bold text-[#988d85] uppercase tracking-wider block">
                  Tankereado
                </span>
                <span className="text-base sm:text-lg font-black font-mono text-[#2a3440] tabular-nums">
                  {totalBitacoraUSG.toLocaleString()} <span className="text-[10px] font-bold text-[#988d85]">gal</span>
                </span>
                <span className="text-[10px] font-mono text-[#988d85]">
                  ≈ {Math.round(totalBitacoraLbs).toLocaleString()} lb
                </span>
              </div>

              <div className="bg-white border border-[#d4d2d0] rounded-2xl p-3 shadow-xs text-center flex flex-col justify-center">
                <span className="text-[10px] font-bold text-[#988d85] uppercase tracking-wider block">
                  Vuelos
                </span>
                <span className="text-base sm:text-lg font-black font-mono text-[#1f2426] tabular-nums">
                  {filteredBitacora.length}
                </span>
                <span className="text-[10px] font-medium text-[#988d85]">
                  registrados
                </span>
              </div>
            </section>

            {/* FILTROS: POR MATRÍCULA Y POR MES */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              {/* Filtro Matrícula */}
              <div className="flex-1 flex items-center justify-between sm:justify-start gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 whitespace-nowrap">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  <span>Matrícula:</span>
                </div>
                <select
                  value={filterReg}
                  onChange={(e) => setFilterReg(e.target.value)}
                  className="h-8 px-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-black text-slate-800 outline-none hover:border-blue-500 focus:border-blue-600 cursor-pointer shadow-2xs w-full max-w-[170px]"
                >
                  <option value="ALL">Todas ({bitacora.length})</option>
                  {filterRegistrationOptions.map((reg) => (
                    <option key={reg} value={reg}>
                      {reg}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Mes */}
              <div className="flex-1 flex items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Mes:</span>
                </div>
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="h-8 px-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-black text-slate-800 outline-none hover:border-blue-500 focus:border-blue-600 cursor-pointer shadow-2xs w-full max-w-[170px]"
                >
                  <option value="ALL">Todos los meses</option>
                  {availableMonths.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* LISTA DE REGISTROS DE VUELOS */}
            <div className="flex flex-col gap-2.5">
              {filteredBitacora.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-2 text-slate-400">
                  <BookOpen className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">No hay vuelos registrados para este filtro</p>
                  <p className="text-[11px] text-slate-400">
                    Probá seleccionando "Todas las matrículas" o "Todos los meses" para ver el historial completo.
                  </p>
                </div>
              ) : (
                filteredBitacora.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-white border border-[#d4d2d0] hover:border-[#2a3440] rounded-2xl p-4 shadow-xs transition-all flex flex-col gap-2 relative group"
                  >
                    <div className="flex items-center justify-between border-b border-[#d4d2d0]/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-[#2a3440] text-white font-mono font-black text-xs shadow-2xs">
                          {entry.registration}
                        </span>
                        {entry.flightNumber && (
                          <span className="text-[11px] font-bold text-[#988d85]">
                            {entry.flightNumber}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-[#988d85] flex items-center gap-1 mr-1">
                          <Calendar className="w-3 h-3 text-[#988d85]" />
                          {entry.dateStr}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(entry)}
                          className="text-[#2a3440] hover:text-[#1f2426] p-1.5 hover:bg-[#2a3440]/10 rounded-lg transition-colors cursor-pointer"
                          title="Editar este vuelo completamente"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBitacoraEntry(entry.id)}
                          className="text-slate-300 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar este vuelo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-extrabold text-[#1f2426]">
                          Ruta: {entry.route}
                        </span>
                        <span className="text-[11px] text-[#988d85] font-mono">
                          +{entry.extraUSG.toLocaleString()} USG (≈ {entry.extraLbs.toLocaleString()} lb · {entry.extraLts.toLocaleString()} L)
                        </span>
                      </div>

                      <div className="text-right">
                        <div className="font-mono font-black text-sm text-emerald-800">
                          +USD {Math.round(entry.totalSavingsUSD).toLocaleString('es-AR')}
                        </div>
                        <div className="text-[10px] text-[#988d85]">
                          {entry.useCarryCost ? 'Neto c/acarreo' : 'Ahorro directo'}
                        </div>
                      </div>
                    </div>

                    {entry.notes && (
                      <div className="bg-[#e9e9e8]/50 border border-[#d4d2d0]/60 rounded-lg px-2.5 py-1 text-[11px] text-[#443a37] italic">
                        "{entry.notes}"
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* BOTÓN RÁPIDO PARA IR A CALCULAR NUEVO VUELO */}
            <button
              type="button"
              onClick={() => setCurrentView('tankering')}
              className="w-full h-11 rounded-xl bg-[#2a3440] hover:bg-[#1f2426] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] cursor-pointer mt-1"
            >
              <Gauge className="w-4 h-4 text-white" />
              <span>+ Nuevo Análisis de Tankering</span>
            </button>
          </main>
        )}

        {/* =========================================================================
            MÓDULO: GENDEC (Declaración General ICAO)
           ========================================================================= */}
        {currentView === 'gendec' && (
          <main className="w-full">
            <GendecModule />
          </main>
        )}

        {/* PIE DE PÁGINA OFICIAL FLYZAR */}
        <footer className="pt-3 pb-2 flex flex-col items-center gap-1 text-center">
          <p className="text-[11px] text-[#988d85] font-brand font-medium">
            Flyzar Fuel Operations · Jet-A: 6.7 lb/USG
          </p>
          <p className="text-[10px] text-[#988d85]/80 font-bold uppercase tracking-widest">
            Dispatch
          </p>
        </footer>
      </div>

      {/* MODAL: GUARDAR ANÁLISIS EN BITÁCORA */}
      {showSaveModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 animate-fade-in"
        >
          <div className="w-full max-w-md rounded-2xl p-5 border border-[#d4d2d0] bg-white text-[#1f2426] shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-1 border-b border-[#d4d2d0]">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="w-5 h-5 text-[#2a3440]" />
                <h3 className="font-extrabold text-sm text-[#1f2426]">
                  Guardar en Registro de ahorro
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="text-slate-400 hover:text-slate-800 p-1 text-sm font-bold min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Resumen de lo que se va a guardar */}
            <div className="bg-[#e9e9e8]/50 border border-[#d4d2d0] rounded-xl p-3 text-xs flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[#988d85] font-semibold">Ruta:</span>
                <strong className="text-[#1f2426] font-mono font-bold">
                  {oaci1} → {oaci2}{hasLeg3 ? ` → ${oaci3}` : ''}
                </strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#988d85] font-semibold">Combustible tankereado:</span>
                <strong className="text-[#2a3440] font-mono font-bold">
                  +{Math.round(extra1USG + (hasLeg3 ? extra2USG : 0)).toLocaleString()} USG
                </strong>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-[#d4d2d0] text-emerald-800 font-bold">
                <span>Ahorro neto calculado:</span>
                <span className="font-mono text-sm font-black">
                  +USD {Math.round(totalSavings).toLocaleString('es-AR')}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-[#1f2426]">Matrícula Avión:</label>
                  <select
                    value={saveRegInput}
                    onChange={(e) => setSaveRegInput(e.target.value)}
                    className="h-10 px-2.5 font-mono font-bold uppercase rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none cursor-pointer"
                  >
                    {PREDEFINED_REGISTRATIONS.map((reg) => (
                      <option key={reg} value={reg}>
                        {reg}
                      </option>
                    ))}
                    <option value="OTHER">Otra matrícula...</option>
                  </select>
                </div>
                {saveRegInput === 'OTHER' ? (
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[#1f2426]">Matrícula manual:</label>
                    <input
                      type="text"
                      value={saveCustomRegInput}
                      onChange={(e) => setSaveCustomRegInput(e.target.value.toUpperCase())}
                      placeholder="LV-XXX"
                      className="h-10 px-3 font-mono font-bold uppercase rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[#1f2426]">Fecha del Vuelo:</label>
                    <input
                      type="date"
                      value={saveDateInput}
                      onChange={(e) => setSaveDateInput(e.target.value)}
                      className="h-10 px-3 font-mono font-semibold rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                    />
                  </div>
                )}
              </div>

              {saveRegInput === 'OTHER' && (
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-[#1f2426]">Fecha del Vuelo:</label>
                  <input
                    type="date"
                    value={saveDateInput}
                    onChange={(e) => setSaveDateInput(e.target.value)}
                    className="h-10 px-3 font-mono font-semibold rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="font-bold text-[#1f2426]">Notas / Pasajero / Motivo (Opcional):</label>
                <input
                  type="text"
                  value={saveNotesInput}
                  onChange={(e) => setSaveNotesInput(e.target.value)}
                  placeholder="Ej: Tramo de regreso corporativo"
                  className="h-10 px-3 text-xs rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                />
              </div>
            </div>

            {saveSuccessMsg ? (
              <div className="h-11 rounded-xl bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center justify-center gap-1.5 animate-pulse">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>¡Guardado y sincronizado en la Nube de Flyzar!</span>
              </div>
            ) : (
              <div className="flex gap-2 pt-1 border-t border-[#d4d2d0]">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 h-11 rounded-xl border border-[#d4d2d0] bg-[#e9e9e8] hover:bg-[#d4d6d4] text-[#1f2426] font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveToBitacora}
                  disabled={isSavingToCloud}
                  className="flex-1 h-11 rounded-xl bg-[#2a3440] hover:bg-[#1f2426] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-75"
                >
                  <Cloud className="w-4 h-4" />
                  <span>{isSavingToCloud ? 'Guardando...' : 'Guardar en la Nube'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: EDITAR ANÁLISIS GUARDADO (EDITAR TODO) */}
      {editingEntry && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 animate-fade-in"
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-5 border border-[#d4d2d0] bg-white text-[#1f2426] shadow-2xl flex flex-col gap-4">
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-[#d4d2d0] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#2a3440] text-white flex items-center justify-center shadow-xs">
                  <Pencil className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[#1f2426]">
                    Editar Análisis Completo
                  </h3>
                  <p className="text-[10px] text-[#988d85] font-editorial italic">
                    Modificá cualquier parámetro del vuelo o cargalo en la calculadora
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="text-slate-400 hover:text-slate-800 p-1 text-sm font-bold min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              {/* SECCIÓN 1: IDENTIFICACIÓN Y FECHA */}
              <div className="bg-[#e9e9e8]/50 p-2.5 rounded-xl border border-[#d4d2d0] flex flex-col gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#988d85]">
                  1. Aeronave y Fecha
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[#1f2426]">Matrícula:</label>
                    <select
                      value={editReg}
                      onChange={(e) => setEditReg(e.target.value)}
                      className="h-10 px-2 font-mono font-bold uppercase rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none cursor-pointer"
                    >
                      {PREDEFINED_REGISTRATIONS.map((reg) => (
                        <option key={reg} value={reg}>
                          {reg}
                        </option>
                      ))}
                      <option value="OTHER">Otra matrícula...</option>
                    </select>
                  </div>
                  {editReg === 'OTHER' ? (
                    <div className="flex flex-col gap-1">
                      <label className="font-bold text-[#1f2426]">Matrícula manual:</label>
                      <input
                        type="text"
                        value={editCustomReg}
                        onChange={(e) => setEditCustomReg(e.target.value.toUpperCase())}
                        placeholder="LV-XXX"
                        className="h-10 px-3 font-mono font-bold uppercase rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <label className="font-bold text-[#1f2426]">Fecha de Operación:</label>
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="h-10 px-2.5 font-mono font-semibold rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                      />
                    </div>
                  )}
                </div>

                {editReg === 'OTHER' && (
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[#1f2426]">Fecha de Operación:</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="h-10 px-2.5 font-mono font-semibold rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                    />
                  </div>
                )}
              </div>

              {/* SECCIÓN 2: RUTA Y TRAMOS OACI */}
              <div className="bg-[#e9e9e8]/50 p-2.5 rounded-xl border border-[#d4d2d0] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#988d85]">
                    2. Ruta y Aeropuertos (OACI)
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-[#2a3440]">
                    <input
                      type="checkbox"
                      checked={editHasLeg3}
                      onChange={(e) => setEditHasLeg3(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-[#2a3440] cursor-pointer"
                    />
                    <span>¿Tiene escala / 2° tramo?</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[#1f2426]">Origen (OACI):</label>
                    <input
                      type="text"
                      maxLength={4}
                      value={editLeg1Oaci}
                      onChange={(e) => setEditLeg1Oaci(e.target.value.toUpperCase())}
                      placeholder="SABE"
                      className="h-10 px-3 font-mono font-bold uppercase rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[#1f2426]">
                      {editHasLeg3 ? 'Escala (OACI):' : 'Destino (OACI):'}
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={editLeg2Oaci}
                      onChange={(e) => setEditLeg2Oaci(e.target.value.toUpperCase())}
                      placeholder="SAEZ"
                      className="h-10 px-3 font-mono font-bold uppercase rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                    />
                  </div>
                  {editHasLeg3 && (
                    <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                      <label className="font-bold text-[#1f2426]">Destino Final (OACI):</label>
                      <input
                        type="text"
                        maxLength={4}
                        value={editLeg3Oaci}
                        onChange={(e) => setEditLeg3Oaci(e.target.value.toUpperCase())}
                        placeholder="SAME"
                        className="h-10 px-3 font-mono font-bold uppercase rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="bg-white px-2.5 py-1.5 rounded-lg border border-[#d4d2d0] flex items-center justify-between text-[11px]">
                  <span className="text-[#988d85] font-semibold">Ruta resultante:</span>
                  <span className="font-mono font-black text-[#2a3440]">
                    {editLeg1Oaci || '----'} → {editLeg2Oaci || '----'}
                    {editHasLeg3 ? ` → ${editLeg3Oaci || '----'}` : ''}
                  </span>
                </div>
              </div>

              {/* SECCIÓN 3: COMBUSTIBLE TANKEREADO (CON UNIDAD EDITABLE) */}
              <div className="bg-[#e9e9e8]/50 p-2.5 rounded-xl border border-[#d4d2d0] flex flex-col gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#988d85]">
                  3. Combustible Extra Tankereado
                </span>
                <div className="grid grid-cols-2 gap-2 items-center">
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[#1f2426]">Cantidad:</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={editFuelValue}
                      onChange={(e) => setEditFuelValue(e.target.value)}
                      placeholder="750"
                      className="h-10 px-3 font-mono font-bold rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none text-[#2a3440]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-[#1f2426]">Unidad ingresada:</label>
                    <div className="grid grid-cols-3 gap-1 bg-[#d4d2d0] p-1 rounded-lg h-10 items-center">
                      {(['USG', 'LBS', 'LTS'] as FuelUnit[]).map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setEditFuelUnit(u)}
                          className={`h-8 rounded font-mono font-bold text-xs cursor-pointer transition-colors ${
                            editFuelUnit === u
                              ? 'bg-[#2a3440] text-white shadow-xs'
                              : 'text-[#1f2426] hover:bg-white/50'
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Resumen dinámico de equivalencias en tiempo real */}
                {(() => {
                  const raw = Math.max(0, parseFloat(editFuelValue) || 0);
                  let usg = raw;
                  if (editFuelUnit === 'LBS') usg = raw / JET_A_DENSITY;
                  if (editFuelUnit === 'LTS') usg = raw / LITERS_PER_USG;
                  const lbs = Math.round(usg * JET_A_DENSITY);
                  const lts = Math.round(usg * LITERS_PER_USG);
                  return (
                    <div className="bg-white p-2 rounded-lg border border-[#d4d2d0] grid grid-cols-3 gap-1 text-center font-mono text-[10px]">
                      <div>
                        <span className="text-[#988d85] block">US Gallons</span>
                        <strong className="text-[#2a3440] text-xs font-black">
                          {Math.round(usg).toLocaleString()} USG
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#988d85] block">Libras Jet-A</span>
                        <strong className="text-[#2a3440] text-xs font-black">
                          {lbs.toLocaleString()} lb
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#988d85] block">Litros</span>
                        <strong className="text-[#2a3440] text-xs font-black">
                          {lts.toLocaleString()} L
                        </strong>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* SECCIÓN 4: COSTO DE ACARREO (WEIGHT PENALTY) */}
              <div className="bg-[#e9e9e8]/50 p-2.5 rounded-xl border border-[#d4d2d0] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#988d85]">
                    4. Penalidad de Acarreo de Peso
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-[#2a3440]">
                    <input
                      type="checkbox"
                      checked={editUseCarryCost}
                      onChange={(e) => setEditUseCarryCost(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-[#2a3440] cursor-pointer"
                    />
                    <span>Aplica costo de acarreo</span>
                  </label>
                </div>

                {editUseCarryCost && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#d4d2d0]">
                    <div className="flex flex-col gap-1">
                      <label className="font-bold text-[#1f2426]">Consumo acarreo (USG):</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={editCarryBurnUSG}
                        onChange={(e) => setEditCarryBurnUSG(e.target.value)}
                        placeholder="Ej: 34"
                        className="h-10 px-3 font-mono font-bold rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-bold text-[#1f2426]">Deducción en USD:</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={editCarryCost}
                        onChange={(e) => setEditCarryCost(e.target.value)}
                        placeholder="Ej: 136.00"
                        className="h-10 px-3 font-mono font-bold rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none text-rose-700"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECCIÓN 5: AHORRO NETO Y NOTAS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-[#1f2426]">Ahorro Neto Total (USD):</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 font-mono font-black text-emerald-800">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={editTotalSavings}
                      onChange={(e) => setEditTotalSavings(e.target.value)}
                      placeholder="1425"
                      className="w-full h-10 pl-7 pr-3 font-mono font-black rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none text-emerald-800"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-bold text-[#1f2426]">Notas / Motivo / Pasajero:</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Ej: Vuelo corporativo SABE-SAEZ"
                    className="h-10 px-3 text-xs rounded-lg border border-[#d4d2d0] bg-white focus:border-[#2a3440] outline-none"
                  />
                </div>
              </div>

              {/* BOTÓN ESPECIAL: CARGAR EN LA CALCULADORA DE TANKERING */}
              <button
                type="button"
                onClick={() => handleLoadIntoCalculator(editingEntry)}
                className="w-full h-10 rounded-xl bg-[#e9e9e8] hover:bg-[#d4d6d4] text-[#2a3440] border border-[#d4d2d0] font-extrabold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer mt-1"
                title="Carga esta ruta y combustible en la calculadora para ajustar precios de aeropuertos en vivo"
              >
                <Calculator className="w-4 h-4 text-[#2a3440]" />
                <span>Cargar en Calculadora (Recalcular con Precios de Aeropuertos)</span>
              </button>
            </div>

            {editSuccessMsg ? (
              <div className="h-11 rounded-xl bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center justify-center gap-1.5 animate-pulse">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>¡Cambios actualizados y sincronizados en la Nube de Flyzar!</span>
              </div>
            ) : (
              <div className="flex gap-2 pt-1 border-t border-[#d4d2d0]">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="flex-1 h-11 rounded-xl border border-[#d4d2d0] bg-[#e9e9e8] hover:bg-[#d4d6d4] text-[#1f2426] font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedEntry}
                  disabled={isSavingEdit}
                  className="flex-1 h-11 rounded-xl bg-[#2a3440] hover:bg-[#1f2426] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-75"
                >
                  <Pencil className="w-4 h-4" />
                  <span>{isSavingEdit ? 'Actualizando...' : 'Guardar Cambios'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
