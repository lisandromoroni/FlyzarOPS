import React from 'react';

interface FlyzarLogoProps {
  className?: string;
  variant?: 'full' | 'isotipo' | 'horizontal';
  light?: boolean;
}

/**
 * León oficial Flyzar
 * Vectorizado directamente del emblema oficial: silueta de cabeza de león de perfil hacia la izquierda,
 * con melena curvada y detalles internos estilizados.
 */
export const FlyzarLion: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-6 h-6',
  color = 'currentColor',
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Isotipo León Flyzar"
    >
      {/* Silueta exterior completa de la cabeza del león en perfil hacia la izquierda */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M52 14 C43 14 36 17 31 23 C28 20 23 20 19 23 C15 26 14 31 16 36 C13 38 10 42 10 47 C10 49 11 51 12 52 C10 55 9 59 11 63 C12 66 14 68 17 69 C16 73 18 77 21 80 C24 82 28 83 31 82 C34 86 38 88 43 89 C48 90 53 88 56 85 C57 88 60 91 63 92 C67 93 72 91 75 87 C77 84 78 81 77 77 C81 77 84 75 87 72 C90 68 90 63 88 58 C91 55 93 50 92 45 C91 40 88 36 84 33 C87 28 86 22 82 18 C77 15 71 14 65 14 C61 14 56 14 52 14 Z M33 27 C36 24 41 23 45 24 C43 27 40 31 36 34 C35 31 34 29 33 27 Z M27 34 C29 31 32 30 35 31 C33 34 30 38 27 41 C26 38 26 36 27 34 Z M21 44 C23 41 26 40 29 41 C27 45 24 49 20 52 C19 49 20 46 21 44 Z M22 58 C24 55 27 54 30 56 C28 60 25 64 21 67 C20 64 20 61 22 58 Z M28 72 C30 69 34 68 37 70 C35 74 31 77 27 80 C26 77 27 74 28 72 Z"
      />
      {/* Ojo y detalles expresivos del león */}
      <path
        d="M38 42 C40 39 45 39 48 42 C45 44 41 44 38 42 Z"
        fill="#ffffff"
      />
      <circle cx="42.5" cy="41.5" r="1.5" fill={color} />
      {/* Trazos escultóricos internos de la melena */}
      <path
        d="M48 24 C54 22 62 25 67 30 C60 31 54 29 48 24 Z"
        fill="#ffffff"
      />
      <path
        d="M56 34 C63 32 72 36 77 42 C70 42 63 39 56 34 Z"
        fill="#ffffff"
      />
      <path
        d="M48 48 C56 46 65 50 71 57 C64 57 56 53 48 48 Z"
        fill="#ffffff"
      />
      <path
        d="M42 61 C49 59 58 62 64 68 C58 68 50 65 42 61 Z"
        fill="#ffffff"
      />
      <path
        d="M50 72 C56 70 63 73 68 78 C62 78 56 76 50 72 Z"
        fill="#ffffff"
      />
    </svg>
  );
};

/**
 * Wordmark FLYZAR estilizado con los cortes y curvas característicos de la tipografía oficial
 */
export const FlyzarWordmark: React.FC<{ className?: string; color?: string }> = ({
  className = 'h-7',
  color = '#1f2426',
}) => {
  return (
    <svg
      viewBox="0 0 340 70"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="FLYZAR"
    >
      {/* F: Poste con esquina curva inferior y barra superior dinámica */}
      <path d="M10 60 C8 60 7 57 8 50 L16 16 C17 12 20 10 24 10 L60 10 C62 10 63 11 63 13 C63 15 62 17 59 17 L25 17 L22 30 L48 30 C50 30 51 31 51 33 C51 35 50 37 47 37 L20 37 L15 54 C14 58 13 60 10 60 Z" />

      {/* L: Poste con base suavemente curvada */}
      <path d="M72 12 C72 10 74 10 76 10 C78 10 80 11 81 14 L73 48 C72 54 75 57 81 57 L110 57 C112 57 113 58 113 60 C113 62 112 64 109 64 L77 64 C68 64 64 59 66 50 L72 12 Z" />

      {/* Y: Brazos angulares convergentes con corte diagonal en la unión */}
      <path d="M123 10 C125 10 127 11 128 13 L142 35 L157 13 C158 11 160 10 162 10 C165 10 166 12 165 14 L146 41 L141 60 C140 62 138 63 136 63 C133 63 132 61 133 59 L138 41 L121 14 C120 12 121 10 123 10 Z" />

      {/* Z: Barra superior, diagonal recortada y base horizontal estilizada */}
      <path d="M178 10 L226 10 C228 10 230 12 229 14 C227 16 224 17 221 17 L190 17 L171 45 L186 45 C189 45 190 46 190 48 C190 50 188 51 185 51 L166 51 L162 57 L216 57 C219 57 221 58 221 60 C221 62 219 64 215 64 L154 64 C151 64 150 62 151 60 L174 25 L164 25 C162 25 160 24 160 22 C160 20 162 19 165 19 L178 19 L178 10 Z" />

      {/* A: Ángulo con vértice aerodinámico y barra transversal recortada */}
      <path d="M236 63 C233 63 232 61 233 59 L251 13 C252 11 254 10 257 10 L266 10 C269 10 271 11 272 13 L288 59 C289 61 287 63 285 63 C282 63 281 62 280 59 L274 41 L246 41 L239 59 C238 62 237 63 236 63 Z M249 34 L271 34 L260 17 L249 34 Z" />

      {/* R: Letra R con arco estilizado y pierna aerodinámica hacia la derecha */}
      <path d="M300 12 C300 10 302 10 304 10 L330 10 C340 10 345 15 344 24 C343 31 337 36 328 37 L339 58 C340 60 339 62 337 63 C335 64 333 63 331 60 L320 39 L311 39 L306 60 C305 62 303 63 301 63 C298 63 297 61 298 59 L306 20 L300 20 C299 18 299 15 300 12 Z M313 17 L310 32 L327 32 C333 32 336 29 337 24 C337 19 334 17 328 17 L313 17 Z" />
    </svg>
  );
};

export const FlyzarLogo: React.FC<FlyzarLogoProps> = ({
  className = '',
  variant = 'full',
  light = false,
}) => {
  const brandTextColor = light ? '#ffffff' : '#1f2426';
  const subtitleColor = light ? 'text-slate-300' : 'text-[#7d7570]';

  if (variant === 'isotipo') {
    return (
      <div className="w-8 h-8 rounded-xl bg-[#2a3440] text-white flex items-center justify-center shadow-xs">
        <FlyzarLion className="w-5 h-5 text-white" />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Isotipo León de Flyzar con badge en el color oficial */}
      <div className="w-10 h-10 rounded-xl bg-[#2a3440] text-white flex items-center justify-center shadow-xs shrink-0 p-1">
        <FlyzarLion className="w-7 h-7 text-white" />
      </div>

      {/* Logotipo Tipográfico Oficial + DISPATCH perfectamente alineado */}
      <div className="flex flex-col justify-center select-none leading-none">
        <div className="flex items-center">
          <FlyzarWordmark className="h-5.5 w-auto" color={brandTextColor} />
        </div>
        <span className={`text-[10px] font-bold tracking-[0.24em] uppercase mt-1 leading-none ${subtitleColor}`}>
          DISPATCH
        </span>
      </div>
    </div>
  );
};
