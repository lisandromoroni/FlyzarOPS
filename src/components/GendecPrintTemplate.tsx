import React from 'react';

// Official Flyzar Brand colors
// Dark Navy: #2a3440 | Dark Gray: #1f2426 | Light BG: #e9e9e8 | Accent Gold: #d97706

export interface GendecData {
  operator: string;
  registration: string;
  flightNumber: string;
  date: string;
  departureOaci: string;
  arrivalOaci: string;
  stdTime: string;
  staTime: string;
  flightType: string;
  crew: Array<{
    role: string;
    fullName: string;
    licenseNumber: string;
    nationality: string;
    passportNumber: string;
  }>;
  passengers: Array<{
    fullName: string;
    nationality: string;
    birthDate?: string;
    dni?: string;
    passportNumber?: string;
  }>;
  illnessReported: boolean;
  disinsectingDone: boolean;
  remarks: string;
}

export const GendecPrintTemplate: React.FC<{ data: GendecData }> = ({ data }) => {
  return (
    <div className="bg-white text-black font-sans p-8 max-w-[210mm] mx-auto border border-gray-300 shadow-lg text-[11px] leading-tight print:p-2 print:border-none print:shadow-none print:max-w-none">
      {/* HEADER */}
      <div className="border-b-2 border-black pb-2 mb-3 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-black tracking-wider uppercase">FLYZAR</h1>
          <p className="text-[10px] font-bold tracking-widest uppercase text-gray-700">
            Executive Air Charter · Dispatch Operations
          </p>
        </div>
        <div className="text-right">
          <h2 className="text-base font-black tracking-tight uppercase">GENERAL DECLARATION</h2>
          <p className="text-[9px] text-gray-600 font-semibold">(Outward / Inward - ICAO Annex 9)</p>
        </div>
      </div>

      {/* FLIGHT INFO BOX */}
      <div className="border border-black mb-3">
        <div className="bg-gray-100 font-bold px-2 py-1 text-[10px] border-b border-black uppercase tracking-wider">
          Flight Routing & Aircraft Details
        </div>
        <div className="grid grid-cols-3 divide-x divide-black border-b border-black">
          <div className="p-1.5">
            <span className="text-[9px] text-gray-500 uppercase block font-semibold">Operator:</span>
            <span className="font-bold">{data.operator || 'FLYZAR S.A.'}</span>
          </div>
          <div className="p-1.5">
            <span className="text-[9px] text-gray-500 uppercase block font-semibold">Aircraft Marks:</span>
            <span className="font-black text-sm">{data.registration}</span>
          </div>
          <div className="p-1.5">
            <span className="text-[9px] text-gray-500 uppercase block font-semibold">Flight No / Ident:</span>
            <span className="font-black text-sm">{data.flightNumber}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-black">
          <div className="p-1.5">
            <span className="text-[9px] text-gray-500 uppercase block font-semibold">Date of Departure:</span>
            <span className="font-bold">{data.date}</span>
          </div>
          <div className="p-1.5">
            <span className="text-[9px] text-gray-500 uppercase block font-semibold">Point of Departure:</span>
            <span className="font-black">{data.departureOaci} {data.stdTime ? `(STD ${data.stdTime}z)` : ''}</span>
          </div>
          <div className="p-1.5">
            <span className="text-[9px] text-gray-500 uppercase block font-semibold">Point of Arrival:</span>
            <span className="font-black">{data.arrivalOaci} {data.staTime ? `(STA ${data.staTime}z)` : ''}</span>
          </div>
        </div>
      </div>

      {/* CREW MANIFEST */}
      <div className="border border-black mb-3">
        <div className="bg-gray-100 font-bold px-2 py-1 text-[10px] border-b border-black uppercase tracking-wider flex justify-between">
          <span>Crew Manifest ({data.crew.length})</span>
          <span className="text-[9px] font-normal text-gray-600">Flight Crew & Cabin Attendants</span>
        </div>
        <table className="w-full text-left text-[10px] border-collapse">
          <thead>
            <tr className="border-b border-gray-400 bg-gray-50 text-[9px] font-bold text-gray-700">
              <th className="p-1.5 border-r border-gray-300 w-16">ROLE</th>
              <th className="p-1.5 border-r border-gray-300">SURNAME, FIRST NAME</th>
              <th className="p-1.5 border-r border-gray-300 w-28">LIC / CERT NO.</th>
              <th className="p-1.5 border-r border-gray-300 w-16">NAT</th>
              <th className="p-1.5 w-32">PASSPORT / DNI</th>
            </tr>
          </thead>
          <tbody>
            {data.crew.map((c, i) => (
              <tr key={i} className="border-b border-gray-200">
                <td className="p-1.5 border-r border-gray-300 font-bold">{c.role}</td>
                <td className="p-1.5 border-r border-gray-300 font-semibold">{c.fullName}</td>
                <td className="p-1.5 border-r border-gray-300 font-mono">{c.licenseNumber || 'NIL'}</td>
                <td className="p-1.5 border-r border-gray-300">{c.nationality || 'ARG'}</td>
                <td className="p-1.5 font-mono">{c.passportNumber || 'NIL'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PASSENGER MANIFEST */}
      <div className="border border-black mb-3">
        <div className="bg-gray-100 font-bold px-2 py-1 text-[10px] border-b border-black uppercase tracking-wider flex justify-between">
          <span>Passenger Manifest ({data.passengers.length})</span>
          <span className="text-[9px] font-normal text-gray-600">
            {data.passengers.length === 0 ? 'Ferry Flight / No passengers' : 'Embarking Passengers'}
          </span>
        </div>
        <table className="w-full text-left text-[10px] border-collapse">
          <thead>
            <tr className="border-b border-gray-400 bg-gray-50 text-[9px] font-bold text-gray-700">
              <th className="p-1.5 border-r border-gray-300 w-8 text-center">#</th>
              <th className="p-1.5 border-r border-gray-300">APELLIDO, Nombre</th>
              <th className="p-1.5 border-r border-gray-300 w-16">NAC</th>
              <th className="p-1.5 border-r border-gray-300 w-24">FECHA NAC</th>
              <th className="p-1.5 border-r border-gray-300 w-28">DNI / CI</th>
              <th className="p-1.5 w-32">PASAPORTE</th>
            </tr>
          </thead>
          <tbody>
            {data.passengers.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-3 text-center text-gray-500 italic">
                  NO PASSENGERS ON BOARD (FERRY / POSICIONAMIENTO)
                </td>
              </tr>
            ) : (
              data.passengers.map((p, idx) => (
                <tr key={idx} className="border-b border-gray-200">
                  <td className="p-1 border-r border-gray-300 text-center font-bold">{idx + 1}</td>
                  <td className="p-1 border-r border-gray-300 font-bold uppercase">{p.fullName}</td>
                  <td className="p-1 border-r border-gray-300 uppercase">{p.nationality}</td>
                  <td className="p-1 border-r border-gray-300">{p.birthDate || '-'}</td>
                  <td className="p-1 border-r border-gray-300 font-mono text-[9.5px]">{p.dni || '-'}</td>
                  <td className="p-1 font-mono text-[9.5px] font-semibold">{p.passportNumber || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* HEALTH & SANITARY DECLARATION */}
      <div className="border border-black mb-4">
        <div className="bg-gray-100 font-bold px-2 py-1 text-[10px] border-b border-black uppercase tracking-wider">
          Declaration of Health & Observations
        </div>
        <div className="p-2 space-y-1 text-[9.5px]">
          <p>
            <span className="font-bold">Illness suspected on board:</span>{' '}
            {data.illnessReported ? 'YES (See remarks)' : 'NIL / NONE REPORTED'}
          </p>
          <p>
            <span className="font-bold">Details of disinsecting / sanitary measures:</span>{' '}
            {data.disinsectingDone ? 'COMPLETED ACCORDING TO PROTOCOL' : 'NOT APPLICABLE / NIL'}
          </p>
          <p>
            <span className="font-bold">Remarks / Observaciones:</span> {data.remarks || 'NIL'}
          </p>
        </div>
      </div>

      {/* SIGNATURES */}
      <div className="grid grid-cols-2 gap-8 pt-4">
        <div className="text-center">
          <div className="border-t border-black pt-1 font-bold text-[10px]">
            PILOT IN COMMAND (PIC)
          </div>
          <div className="text-[9px] text-gray-500 uppercase">Signature & License No.</div>
        </div>
        <div className="text-center">
          <div className="border-t border-black pt-1 font-bold text-[10px]">
            FLYZAR FLIGHT DISPATCHER
          </div>
          <div className="text-[9px] text-gray-500 uppercase">Signature / Stamp</div>
        </div>
      </div>
    </div>
  );
};
