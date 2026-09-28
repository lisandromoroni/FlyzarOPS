import fs from 'fs';
import path from 'path';
// Read raw data and parse into TS
const csvContent = fs.readFileSync(path.join(process.cwd(), 'raw_pax.csv'), 'utf-8');

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const lines = csvContent.split(/\r?\n/);
interface PaxItem {
  id: string;
  fullName: string;
  nationality: string;
  birthDate: string;
  dni: string;
  passportNumber: string;
}

const paxList: PaxItem[] = [];
let idCounter = 1;

for (let l of lines) {
  if (!l.trim()) continue;
  const cols = parseCSVLine(l);

  // Look for full name column
  let nameColIdx = -1;
  for (let i = 0; i < Math.min(cols.length, 4); i++) {
    const val = cols[i] || '';
    if (
      val.length > 2 &&
      !val.includes('INSERTAR') &&
      !val.includes('Completar') &&
      !val.includes('APELLIDO') &&
      !val.includes('casillero') &&
      (val.includes(',') || val.length > 5)
    ) {
      nameColIdx = i;
      break;
    }
  }

  if (nameColIdx !== -1) {
    const fullName = (cols[nameColIdx] || '').trim().replace(/^["']|["']$/g, '');
    const nat = (cols[nameColIdx + 1] || 'ARG').trim().replace(/[\r\n]+/g, ' / ');
    const birth = (cols[nameColIdx + 2] || '').trim();
    const dni = (cols[nameColIdx + 3] || '').trim().replace(/[\r\n]+/g, ' / ');
    const pass = (cols[nameColIdx + 4] || '').trim().replace(/[\r\n]+/g, ' / ');

    if (fullName && fullName.length > 2) {
      paxList.push({
        id: String(idCounter++),
        fullName,
        nationality: nat || 'ARG',
        birthDate: birth,
        dni,
        passportNumber: pass,
      });
    }
  }
}

console.log(`Parsed ${paxList.length} passengers!`);

const outputTs = `export interface PaxRecord {
  id: string;
  fullName: string;
  nationality: string;
  birthDate: string;
  dni: string;
  passportNumber: string;
  docsCombined?: string;
  isCustom?: boolean;
}

export const INITIAL_PAX_DATABASE: PaxRecord[] = ${JSON.stringify(paxList, null, 2)};
`;

fs.writeFileSync(path.join(process.cwd(), 'src/data/paxDatabase.ts'), outputTs);
console.log('Successfully written src/data/paxDatabase.ts');
