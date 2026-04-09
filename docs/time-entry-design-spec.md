# Time Entry Component - Especificación de Diseño Unificado

## 1. Análisis de Implementaciones Actuales

### 1.1 Time Entry Modal (External Assignments)
**Archivo:** `client/src/Project/MyJiraIssues/TimeEntryModal.jsx`

**Características:**
- Modal de 460px de ancho
- Header con gradiente violeta (#f5f3ff → #ede9fe)
- Badge del issue key (ej: "PROJ-123")
- Campos: Hours, DateTime (con time), Description
- Botón opcional "Close Issue" (si el estado lo permite)
- Validación: parseHoursToSeconds (acepta "2h", "1h 30m", "2.5")
- Submit a: `/api/v1/jira/worklogs`
- Formato fecha: `YYYY-MM-DDTHH:mm`
- Valor default: momento actual con hora fija 16:30

**Problemas identificados:**
- Placeholder hardcodeado en español: "ej. 2h, 1h 30m, 2.5"
- No hay prefilling de datos basado en horas ya registradas
- DateTime picker permite seleccionar cualquier fecha sin indicar días con horas cargadas
- Label "Hours Logged" puede confundirse (parece mostrar horas, pero es un input)

### 1.2 Tempo Export Modal (Quick Actions)
**Archivo:** `client/src/Project/QuickActions/TempoExportModal.jsx`

**Características:**
- Modal de 480px de ancho
- Header con gradiente violeta (usando tokens de color)
- Badge del task key hardcodeado: "VIS-2"
- Campos: Date (solo fecha), Duration, Description
- Warning banner cuando hoursLogged >= 8
- Validación: parseDurationToMinutes (mismo parser, diferente retorno)
- Fetch horas por fecha: `/quick-actions/actions/tempo-export/hours`
- Submit a: `/quick-actions/actions/tempo-export`
- Formato fecha: `YYYY-MM-DD`
- Valor default: momento actual startOf('day')
- Usa `<form>` con submit nativo
- Mejor accesibilidad: aria-labels en todos los campos

**Problemas identificados:**
- Task key hardcodeado "VIS-2"
- Input wrappers con max-width hardcodeados (250px, 400px)
- Validación duplicada pero ligeramente diferente
- Mismo propósito, diferentes nombres de campos y flujos

### 1.3 Comparación Directa

| Aspecto | TimeEntry Modal | TempoExport Modal |
|---------|----------------|-------------------|
| **Ancho** | 460px | 480px |
| **Header** | Gradient hardcodeado | Gradient via tokens |
| **Badge** | IssueKey dinámico | TaskKey hardcodeado |
| **DatePicker** | Con tiempo | Solo fecha |
| **Parser** | parseHoursToSeconds | parseDurationToMinutes |
| **Accesibilidad** | Básica | Mejor (aria-labels) |
| **Validación** | onBlur | onBlur + onSubmit |
| **Pre-fill** | No | Sí (horas por fecha) |
| **Contexto** | Issue específico | Task genérico VIS-2 |
| **Close Issue** | Sí | No |

### 1.4 Problemas del DatePicker Compartido

**Archivo:** `client/src/shared/components/DatePicker/`

**Problemas identificados:**
1. **Comportamiento inconsistente:** En TimeSection usa formato API, en DateSection usa moment
2. **Navegación:** Flechas de mes no tienen tooltips ni labels
3. **Selección de año:** Dropdown básico, sin búsqueda
4. **Validación visual:** No indica días con datos cargados
5. **Accesibilidad:** No tiene roles ARIA para screen readers
6. **Keyboard nav:** No soporta navegación por teclado
7. **Responsive:** Dropdown fijo en 270px/360px, no adapta a móvil

---

## 2. Diseño de Solución Unificada

### 2.1 Principios de Diseño

1. **Unificación semántica:** Mismo componente, diferentes configuraciones
2. **Contexto adaptativo:** Layout y campos según el uso
3. **Consistencia visual:** Mismos tokens, mismos espaciados
4. **Mejora progresiva:** Mejor accesibilidad y UX en ambos contextos
5. **DatePicker inteligente:** Visualización de días con horas cargadas

### 2.2 Estructura del Componente Base

```
TimeEntryForm (Componente Base)
├── TimeEntryProvider (Contexto para estado y configuración)
├── TimeEntryHeader (Badge + Título + Subtítulo opcional)
├── TimeEntryFields (Campos del formulario)
│   ├── DateField (con indicadores visuales)
│   ├── DurationField (input + hint + error)
│   └── DescriptionField (opcional)
├── TimeEntryValidation (Lógica de validación unificada)
└── TimeEntryActions (Botones según contexto)
```

### 2.3 Variantes por Contexto

#### Variante A: External Assignments (Compact)
**Props:**
```typescript
{
  variant: 'compact',
  issueKey: string,           // Badge dinámico
  issueSummary?: string,      // Subtítulo
  showCloseIssue: boolean,    // Mostrar botón close
  dateMode: 'datetime',       // Con selector de hora
  prefillData: null,          // Sin prefill
  submitEndpoint: '/api/v1/jira/worklogs',
  parserMode: 'seconds',      // Retorna segundos
}
```

**Características visuales:**
- Header con issue key como badge
- Issue summary como subtítulo
- DateTime picker (fecha + hora)
- Botón "Close Issue" condicional
- Layout compacto (padding reducido)

#### Variante B: Quick Actions (Full)
**Props:**
```typescript
{
  variant: 'full',
  taskKey: string,            // Badge del task
  taskSummary?: string,       // Subtítulo fijo
  showCloseIssue: false,      // Sin botón close
  dateMode: 'date',           // Solo fecha
  prefillData: 'fetch',       // Fetch horas por fecha
  submitEndpoint: '/quick-actions/actions/tempo-export',
  parserMode: 'minutes',      // Retorna minutos
}
```

**Características visuales:**
- Header con task key como badge
- Warning banner cuando horas >= 8
- Date picker con indicadores de días con horas
- Layout espacioso (padding normal)
- Input wrappers con max-width consistente

---

## 3. Tokens de Personalización

### 3.1 Tokens de Layout

```typescript
// Espaciados base
const timeEntryTokens = {
  spacing: {
    compact: {
      headerPadding: '16px 24px 14px',
      bodyPadding: '24px 28px 24px',
      fieldGap: '16px',
      actionsGap: '8px',
    },
    full: {
      headerPadding: '20px 28px 18px',
      bodyPadding: '28px 32px 28px',
      fieldGap: '20px',
      actionsGap: '10px',
    },
  },
  
  // Anchos
  width: {
    compact: 460,
    full: 480,
  },
  
  // Input constraints
  input: {
    maxWidth: {
      date: '250px',
      duration: '250px',
      description: '400px',
    },
  },
};
```

### 3.2 Tokens Visuales

```typescript
// Colores específicos del componente
const timeEntryColors = {
  header: {
    gradientStart: color.violetGradientStart,  // '#f5f3ff'
    gradientEnd: color.violetGradientEnd,      // '#ede9fe'
    border: color.violetBorderLight,           // '#ddd6fe'
  },
  badge: {
    bg: color.statusViolet.bg,                 // '#ede9fe'
    border: color.statusViolet.border,         // '#c4b5fd'
    text: color.statusViolet.text,             // '#6d28d9'
  },
  warning: {
    bg: color.statusWarning.bg,                // '#fef3c7'
    border: color.statusWarning.border,        // '#fcd34d'
    text: color.statusWarning.text,            // '#92400e'
  },
  // Indicadores de horas cargadas en calendario
  calendar: {
    hasHoursBg: '#dcfce7',      // Verde claro
    hasHoursText: '#166534',    // Verde oscuro
    selectedBg: color.primary,  // '#3b6cf0'
  },
};
```

### 3.3 Tokens de Tipografía

```typescript
const timeEntryTypography = {
  title: {
    font: font.bold,
    size: fontSizes.sectionTitle,  // 16px
    color: color.textDarkest,
    lineHeight: lineHeights.snug,  // 1.35
  },
  badge: {
    font: font.medium,
    size: fontSizes.caption,       // 13px
    lineHeight: 1.4,
  },
  label: {
    font: font.medium,
    size: fontSizes.bodySmall,     // 14px
    color: color.textDark,
    lineHeight: lineHeights.normal, // 1.5
  },
  hint: {
    font: font.regular,
    size: fontSizes.caption,       // 13px
    color: color.textLight,
    lineHeight: lineHeights.normal,
  },
  error: {
    font: font.medium,
    color: color.danger,
  },
};
```

### 3.4 Tokens de Animación

```typescript
const timeEntryAnimations = {
  transitions: {
    fast: '150ms ease',
    normal: '300ms ease',
    slow: '500ms ease',
  },
  dropdown: {
    open: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease',
    close: 'transform 150ms ease-in, opacity 100ms ease',
  },
  validation: {
    shake: 'shake 400ms ease-in-out',
    fadeIn: 'fadeIn 200ms ease',
  },
  banner: {
    slideIn: 'slideDown 300ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
};

// Keyframes
const keyframes = {
  shake: `
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-4px); }
    40%, 80% { transform: translateX(4px); }
  `,
  fadeIn: `
    from { opacity: 0; }
    to { opacity: 1; }
  `,
  slideDown: `
    from { 
      opacity: 0; 
      transform: translateY(-10px); 
    }
    to { 
      opacity: 1; 
      transform: translateY(0); 
    }
  `,
};
```

---

## 4. Estados Visuales

### 4.1 Estados del Formulario

#### Empty State
- Todos los campos en valor default
- Placeholders visibles
- Botón submit habilitado pero sin acción hasta validación
- No hay errores visibles

#### Filled State
- Campos con valores válidos
- Placeholders ocultos
- Labels visibles arriba (opcional: floating labels)
- Botón submit activo

#### Error State
- Campo con error tiene borde rojo (`color.danger`)
- Mensaje de error visible debajo del campo
- Icono de error opcional
- Shake animation en el campo
- Focus automático en primer campo con error

#### Loading State
- Spinner en botón submit (prop `isWorking`)
- Campos deshabilitados (opcional)
- Overlay semi-transparente opcional

#### Success State
- Toast notification (ya implementado)
- Modal cierra automáticamente
- Form reset

### 4.2 Estados del DatePicker

#### Default
- Calendario con mes actual
- Día actual destacado (bold)
- Selector de año visible
- Días con horas cargadas: indicador visual (dot o bg color)

#### Selected
- Día seleccionado: fondo primary color, texto blanco
- Mes anterior/siguiente: navegación disponible

#### Hover
- Día hover: fondo backgroundMedium
- Flechas hover: color textDarkest

#### Disabled
- Días futuros (configurable): opacidad reducida, no clickeables
- Días fuera de rango: mismo tratamiento

### 4.3 Estados de Validación del Input

```typescript
// Pseudoclases visuales
const inputStates = {
  default: {
    border: color.borderLight,
    background: '#fff',
  },
  hover: {
    border: color.borderInputFocus,
  },
  focus: {
    border: color.borderInputFocus,
    boxShadow: '0 0 0 3px rgba(59, 108, 240, 0.1)',
  },
  invalid: {
    border: color.danger,
    boxShadow: '0 0 0 3px rgba(220, 38, 38, 0.1)',
  },
  disabled: {
    background: color.backgroundLight,
    border: color.borderLightest,
    opacity: 0.6,
  },
};
```

---

## 5. Mejoras de UX

### 5.1 Flujo de Validación Mejorado

```typescript
// Validación en tiempo real (debounced)
const useValidation = () => {
  const validate = useCallback((value, rules) => {
    // Validación inmediata en blur
    // Validación debounced en change (300ms)
    // Retorna: { isValid, error, value }
  }, []);
  
  return { validate, errors, clearError };
};

// Reglas de validación unificadas
const validationRules = {
  duration: {
    required: true,
    parser: 'duration', // 'seconds' | 'minutes'
    min: 1, // mínimo 1 minuto/segundo
    max: null, // opcional
  },
  date: {
    required: true,
    max: 'today', // no fechas futuras
    min: null, // opcional
  },
  description: {
    required: false,
    maxLength: 5000,
  },
};
```

### 5.2 Feedback al Usuario

#### Inline Validation
- Error aparece inmediatamente después de blur si inválido
- Error desaparece cuando el usuario empieza a corregir
- No validar en cada keystroke (evita spam de errores)

#### Visual Indicators
- Icono de check en verde cuando campo válido (opcional)
- Contador de caracteres para description ("0/5000")
- Progress bar para horas del día (en variante full)

#### Smart Defaults
- Hora default: 9:00 AM (inicio de jornada) en vez de 16:30
- Fecha default: hoy
- Si ya hay horas cargadas hoy, sugerir diferencia para 8h

### 5.3 Accesibilidad (WCAG 2.1 AA)

#### Keyboard Navigation
```
Tab: Navegar entre campos
Enter: Submit form / Abrir datepicker
Escape: Cerrar modal/datepicker
Flechas: Navegar en calendario
Home/End: Primer/último día del mes
PageUp/PageDown: Mes anterior/siguiente
```

#### Screen Readers
```jsx
// Estructura ARIA
<form aria-labelledby="time-entry-title">
  <h2 id="time-entry-title">Log Time</h2>
  
  <div role="group" aria-labelledby="duration-label">
    <label id="duration-label">Duration *</label>
    <input 
      aria-labelledby="duration-label"
      aria-describedby="duration-hint duration-error"
      aria-invalid={hasError}
      aria-required="true"
    />
    <span id="duration-hint">Format: 2h, 30m, 1h 30m</span>
    {error && <span id="duration-error" role="alert">{error}</span>}
  </div>
</form>
```

#### Focus Management
- Focus trap dentro del modal
- Focus inicial en primer campo
- Retorno de focus al trigger cuando cierra
- Focus visible con outline claro (2px solid primary)

### 5.4 DatePicker Mejorado

#### Indicadores Visuales
```typescript
// Días con horas cargadas
interface CalendarDay {
  date: Date;
  hasHours: boolean;
  hoursLogged: number;
  isWeekend: boolean;
  isToday: boolean;
  isSelected: boolean;
}

// Visual indicators
const dayIndicators = {
  hasHours: 'dot-bottom', // Punto debajo del número
  complete: 'bg-green',   // Fondo verde si >= 8h
  partial: 'bg-yellow',   // Fondo amarillo si < 8h
};
```

#### Navegación Mejorada
- Atajos de teclado (t, y, m para hoy, ayer, mañana)
- Presets rápidos: "Hoy", "Ayer", "Lunes", "Viernes"
- Navegación por teclado completa

---

## 6. API del Componente Unificado

### 6.1 Props Interface

```typescript
interface TimeEntryFormProps {
  // Configuración básica
  variant: 'compact' | 'full';
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TimeEntryData) => void;
  
  // Contexto del issue/task
  entityKey: string;           // Issue key o Task key
  entitySummary?: string;      // Descripción opcional
  entityStatus?: string;       // Para mostrar "Close Issue"
  
  // Configuración de campos
  dateMode: 'date' | 'datetime';
  showDescription: boolean;
  showCloseIssue: boolean;
  
  // Datos pre-cargados
  prefillData?: {
    hoursLogged: number;
    date: string;
  } | null;
  onDateChange?: (date: string) => Promise<HoursStatus | null>;
  
  // Parser y formato
  durationUnit: 'seconds' | 'minutes';
  
  // Endpoints
  submitEndpoint: string;
  closeIssueEndpoint?: string;
  
  // Customización
  labels?: Partial<TimeEntryLabels>;
  placeholders?: Partial<TimeEntryPlaceholders>;
  
  // Accesibilidad
  ariaLabel?: string;
  testId?: string;
}

interface TimeEntryData {
  date: string;              // ISO date o datetime
  duration: number;          // En unidades especificadas
  description?: string;
  entityKey: string;
}

interface HoursStatus {
  hoursLogged: number;
  targetHours?: number;      // Default: 8
  isComplete: boolean;
}
```

### 6.2 Ejemplos de Uso

```jsx
// External Assignments (Compact)
<TimeEntryForm
  variant="compact"
  isOpen={isOpen}
  onClose={handleClose}
  onSubmit={handleSubmit}
  entityKey={issue.key}
  entitySummary={issue.summary}
  entityStatus={issue.status}
  dateMode="datetime"
  showDescription={true}
  showCloseIssue={true}
  durationUnit="seconds"
  submitEndpoint="/api/v1/jira/worklogs"
  closeIssueEndpoint={`/api/v1/jira/issues/${issue.key}/transitions`}
/>

// Quick Actions (Full)
<TimeEntryForm
  variant="full"
  isOpen={isOpen}
  onClose={handleClose}
  onSubmit={handleSubmit}
  entityKey="VIS-2"
  entitySummary="Internal time tracking"
  dateMode="date"
  showDescription={true}
  showCloseIssue={false}
  durationUnit="minutes"
  submitEndpoint="/quick-actions/actions/tempo-export"
  onDateChange={fetchHoursForDate}
  prefillData={hoursStatus}
/>
```

---

## 7. Guía de Uso

### 7.1 Casos de Uso

| Caso de Uso | Variante | Configuración |
|-------------|----------|---------------|
| Log hours en issue específico | compact | issueKey, showCloseIssue=true, dateMode=datetime |
| Log hours en task genérico | full | entityKey="VIS-2", prefillData=true, dateMode=date |
| Log hours sin descripción | compact | showDescription=false |
| Log hours futuros (planning) | compact/full | dateMode=datetime, allowFutureDates=true |

### 7.2 Checklist de Implementación

- [ ] Crear componente `TimeEntryForm` base
- [ ] Migrar `TimeEntryModal` a usar `TimeEntryForm` con variant='compact'
- [ ] Migrar `TempoExportModal` a usar `TimeEntryForm` con variant='full'
- [ ] Unificar parsers: `parseDuration()` con param `unit: 'seconds' | 'minutes'`
- [ ] Mejorar DatePicker con indicadores de horas
- [ ] Agregar keyboard navigation completo
- [ ] Implementar focus trap en modal
- [ ] Agregar tests de accesibilidad (axe-core)
- [ ] Documentar tokens de personalización
- [ ] Crear Storybook stories

---

## 8. Responsive Design

### 8.1 Breakpoints

```typescript
const breakpoints = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
};
```

### 8.2 Adaptaciones por Breakpoint

#### Mobile (< 480px)
- Modal: 100% width, 100% height (pantalla completa)
- Header: Padding reducido
- Campos: Stack vertical, 100% width
- DatePicker: Pantalla completa overlay
- Actions: Botones stack, full width

#### Tablet (480px - 768px)
- Modal: 90% width, max 480px
- Campos: Stack vertical
- DatePicker: Dropdown normal

#### Desktop (> 768px)
- Modal: Width según variante (460px/480px)
- Campos: Layout normal
- DatePicker: Dropdown normal

### 8.3 Touch Considerations

- Touch targets mínimo 44px
- Date picker: Swipe para cambiar mes
- Inputs: Zoom prevention en focus (viewport meta)
- Botones: Espaciado aumentado en móvil

---

## 9. Consideraciones de Implementación

### 9.1 Estructura de Archivos Propuesta

```
client/src/shared/components/TimeEntry/
├── index.jsx                 # Export principal
├── TimeEntryForm.jsx         # Componente base
├── TimeEntryProvider.jsx     # Contexto
├── TimeEntryHeader.jsx       # Header con badge
├── TimeEntryFields.jsx       # Campos del formulario
├── TimeEntryActions.jsx      # Botones de acción
├── useTimeEntry.js           # Hook de lógica
├── useValidation.js          # Hook de validación
├── parsers.js                # parseDuration unificado
├── tokens.js                 # Tokens de diseño
├── types.ts                  # TypeScript types
└── __tests__/
    ├── TimeEntryForm.test.jsx
    ├── parsers.test.js
    └── validation.test.js
```

### 9.2 Dependencias

```json
{
  "peerDependencies": {
    "react": "^18.0.0",
    "styled-components": "^5.0.0",
    "moment": "^2.29.0",
    "react-i18next": "^12.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "axe-core": "^4.8.0"
  }
}
```

### 9.3 Performance Considerations

- Memoizar callbacks con `useCallback`
- Memoizar componentes con `React.memo` donde aplica
- Lazy load del DatePicker (código pesado)
- Debounce en validación en tiempo real
- Virtualizar lista de años si es necesario

---

## 10. Anexos

### 10.1 Mapeo de Traducciones Unificado

```json
{
  "timeEntry": {
    "title": "Log Time",
    "duration": "Duration",
    "date": "Date",
    "dateAndTime": "Date & Time",
    "description": "Description (optional)",
    "durationPlaceholder": "e.g. 2h, 1h 30m, 2.5",
    "descriptionPlaceholder": "What did you work on?",
    "durationHint": "Format: 2h, 30m, 1h 30m, or 2.5",
    "hoursRequired": "Duration is required",
    "hoursInvalid": "Invalid format. Use: 2h, 30m, 1h 30m",
    "hoursPositive": "Duration must be greater than 0",
    "descriptionTooLong": "Description must be less than 5000 characters",
    "save": "Save",
    "saving": "Saving...",
    "cancel": "Cancel",
    "closeIssue": "Close Issue",
    "saved": "Time logged successfully",
    "saveFailed": "Failed to log time",
    "issueClosed": "Issue closed successfully",
    "closeFailed": "Failed to close issue",
    "hoursCompleteWarning": "You've already logged {{hours}} hours today",
    "hoursFetchError": "Could not load hours for this date"
  }
}
```

### 10.2 Diagrama de Flujo

```
┌─────────────────┐
│   User Opens    │
│  Time Entry     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Set Defaults   │
│  (date/time)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  User Inputs    │────▶│  Real-time      │
│  Data           │     │  Validation     │
└────────┬────────┘     └────────┬────────┘
         │                        │
         │         Valid          │
         │◄───────────────────────┘
         │
         ▼
┌─────────────────┐
│   User Clicks   │
│     Save        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Final Validate │
│     + Submit    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│Success│ │ Error │
└───┬───┘ └───┬───┘
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│ Toast │ │ Show  │
│+ Close│ │ Error │
│       │ │+ Stay  │
└───────┘ └───────┘
```

---

**Documento creado:** 2026-04-09  
**Versión:** 1.0  
**Estado:** Listo para implementación
