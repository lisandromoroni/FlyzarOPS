# Flyzar Ops

Aplicación web de operaciones Flyzar. Incluye cálculos de combustible, bitácora de tankering y generación de GENDEC.

## Desarrollo local

Requisitos: Node.js compatible con Vite 8.

```bash
npm install
npm run dev
```

Validaciones disponibles:

```bash
npm run lint
npm run build
```

## Datos y Firebase

Por privacidad, las listas iniciales de pasajeros y tripulantes están vacías. El módulo GENDEC permite cargar datos desde Excel o agregarlos manualmente.

La configuración exportada de Firebase se conserva y la app intenta sincronizar la bitácora con ese proyecto. Las reglas incluidas permiten leer y modificar registros sin autenticación; antes de desplegar o usar datos operativos, restringe el acceso y configura autenticación y reglas apropiadas.
