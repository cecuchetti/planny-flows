# TimeEntry Component

Componente unificado y reutilizable para el registro de horas trabajadas.

## Ubicación

`client/src/shared/components/TimeEntry/`

## Archivos

- `index.jsx` - Componente principal
- `styles.js` - Estilos del componente
- `utils.js` - Utilidades (parsers de horas)

## Uso

```jsx
import { TimeEntry } from 'shared/components';

function MyComponent() {
  const handleSubmit = (formData) => {
    // formData = {
    //   hoursInput,    // string - valor original del input
    //   parsedTime,    // number - tiempo parseado (segundos o minutos)
    //   date,          // string - fecha seleccionada
    //   description,   // string - descripción
    //   timeMode       // 'seconds' | 'minutes'
    // }
  };

  return (
    <TimeEntry
      isOpen={true}
      onClose={() => {}}
      onSubmit={handleSubmit}
      title="Log Hours"
      entityKey="VIS-2"
      entitySummary="Administración"
      timeMode="minutes"
      withTime={false}
    />
  );
}
```

## Props

### Obligatorias

| Prop | Tipo | Descripción |
|------|------|-------------|
| `isOpen` | boolean | Controla la visibilidad del modal |
| `onClose` | function | Callback al cerrar el modal |
| `onSubmit` | function | Callback al enviar el formulario |
| `title` | string | Título del modal |

### Opcionales

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `entityKey` | string | null | Key a mostrar en el badge (ej: issue key) |
| `entitySummary` | string | null | Descripción debajo del título |
| `showDescription` | boolean | true | Mostrar campo de descripción |
| `withTime` | boolean | true | DatePicker incluye selección de tiempo |
| `timeMode` | 'seconds' \| 'minutes' | 'seconds' | Unidad de tiempo para el parser |
| `initialValues` | object | {} | Valores iniciales del formulario |
| `submitButtonText` | string | 'Save' | Texto del botón submit |
| `cancelButtonText` | string | 'Cancel' | Texto del botón cancelar |
| `warning` | node | null | Mensaje de advertencia a mostrar |
| `canCloseEntity` | boolean | false | Mostrar botón de cerrar entidad |
| `closeEntityText` | string | null | Texto del botón cerrar entidad |
| `onCloseEntity` | function | null | Callback al cerrar entidad |
| `onDateChange` | function | null | Callback cuando cambia la fecha |
| `isSubmitting` | boolean | false | Estado de carga para submit |
| `isClosingEntity` | boolean | false | Estado de carga para cerrar entidad |
| `validateHours` | function | null | Función custom de validación |
| `errorMessages` | object | {} | Mensajes de error personalizados |
| `labels` | object | {} | Labels de los campos |
| `placeholders` | object | {} | Placeholders de los campos |
| `testid` | string | 'modal:time-entry' | Test ID |
| `width` | number | 460 | Ancho del modal |
| `headerGradient` | object | {} | Colores del gradiente del header |
| `badgeColors` | object | {} | Colores del badge |

## Utilidades Exportadas

```jsx
import {
  parseHoursToSeconds,      // "2h 30m" -> 9000 (segundos)
  parseDurationToMinutes,   // "2h 30m" -> 150 (minutos, valida duplicados)
  formatSecondsToHuman,     // 9000 -> "2h 30m"
  formatMinutesToHuman,     // 150 -> "2h 30m"
} from 'shared/components/TimeEntry/utils';
```

## Implementaciones Usando TimeEntry

### TimeEntryModal (MyJiraIssues)

- Usa `timeMode="seconds"`
- DatePicker con tiempo (`withTime={true}`)
- Permite cerrar el issue

### TempoExportModal (QuickActions)

- Usa `timeMode="minutes"`
- DatePicker solo fecha (`withTime={false}`)
- Muestra warning cuando hay 8+ horas logueadas
- TASK_KEY hardcodeado a 'VIS-2'

## Migraciones Realizadas

1. ✅ Creado componente unificado en `shared/components/TimeEntry/`
2. ✅ Actualizado `TimeEntryModal` para usar el componente unificado
3. ✅ Actualizado `TempoExportModal` para usar el componente unificado
4. ✅ Eliminado código duplicado
5. ✅ DatePicker funcional y consistente en ambos
