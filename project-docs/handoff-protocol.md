# Protocolo de Handoff - Time Entry Unificado

## Formato Estándar de Handoff

Cada agente debe usar este formato al completar su fase:

```markdown
## Handoff: [Nombre Agente] → [Siguiente Agente]
**Fecha**: YYYY-MM-DD  
**Fase**: X de 4  
**Estado**: [COMPLETADO/EN_PROGRESO/BLOQUEADO]

---

### Resumen Ejecutivo
[2-3 líneas de qué se entregó y por qué es importante]

---

### Entregables

#### Documentos
- [ ] `ruta/al/archivo.md` - Descripción
- [ ] `ruta/al/archivo2.md` - Descripción

#### Código
- [ ] `ruta/al/código` - Descripción

#### Diseño
- [ ] `ruta/al/diseño` - Descripción

---

### Decisiones Clave Tomadas

1. **[Decisión 1]**: Contexto y justificación
2. **[Decisión 2]**: Contexto y justificación
3. **[Decisión 3]**: Contexto y justificación

---

### Riesgos Identificados

| Riesgo | Severidad | Mitigación Propuesta |
|--------|-----------|---------------------|
| [Desc] | Alta/Med/Baja | [Acción] |

---

### Supuestos y Dependencias

- **Supuestos**: [Lista de supuestos hechos]
- **Dependencias**: [Qué se necesita del siguiente agente]

---

### Checklist de Calidad

- [ ] Revisión propia completada
- [ ] Documentación actualizada
- [ ] Tests pasan (si aplica)
- [ ] Código limpio y formateado
- [ ] Revisado por pares (si aplica)

---

### Próximos Pasos para [Siguiente Agente]

1. [Acción específica]
2. [Acción específica]
3. [Acción específica]

---

### Preguntas Abiertas

- [Pregunta 1]: [Contexto]
- [Pregunta 2]: [Contexto]

---

### Contacto

Para dudas sobre este handoff, contactar a: [Agente]  
Documentación adicional: [Links]
```

---

## Canales de Comunicación

### 1. Documentos Oficiales (Source of Truth)
- `project-docs/time-entry-requirements.md` - Requerimientos (PM)
- `project-docs/time-entry-ux-specs.md` - Especificaciones UX (UI)
- `project-docs/time-entry-architecture.md` - Arquitectura (Senior)
- `project-docs/time-entry-tracking.md` - Seguimiento (Orquestador)

### 2. Handoffs
- Guardar en: `project-handoffs/handoff-fase-X.md`
- Notificar a: Orquestador + Siguiente agente

### 3. Issues/Bloqueos
- Reportar en: Comentario en `time-entry-tracking.md`
- Etiquetar a: Orquestador

---

## Reglas de Comunicación

### DO ✅
- Usar el formato de handoff estándar
- Actualizar `time-entry-tracking.md` con progreso
- Documentar decisiones técnicas importantes
- Reportar bloqueos inmediatamente
- Incluir ejemplos de código cuando sea relevante

### DON'T ❌
- No omitir el formato de handoff
- No dejar preguntas sin responder al siguiente agente
- No cambiar scope sin consultar al PM
- No ignorar checklists de calidad
- No hardcodear valores sin documentar

---

## Escalación

### Nivel 1: Checkpoint Normal
Orquestador coordina handoff entre agentes.

### Nivel 2: Bloqueo en Fase
Orquestador interviene para desbloquear:
- Re-asignar tareas
- Ajustar timeline
- Reducir scope

### Nivel 3: Cambio de Arquitectura Mayor
Requiere revisión de FASE 2+:
- Senior Dev + Frontend Dev discuten
- Orquestador evalúa impacto
- Decisión de continuar o rehacer

### Nivel 4: Cancelación/Replanificación
Impacto en timeline >50%:
- Todos los agentes involucrados
- Re-evaluación de viabilidad
- Decisión go/no-go

---

## Checklist de Verificación por Fase

### FASE 1: PM + UI Designer
**PM debe verificar:**
- [ ] Requerimientos son SMART (Específicos, Medibles...)
- [ ] Casos edge identificados
- [ ] Criterios de aceptación definidos
- [ ] UI Designer validó comprensión

**UI Designer debe verificar:**
- [ ] Diseño cubre todos los casos de uso del PM
- [ ] Componente es realizable técnicamente
- [ ] Date picker está especificado completo
- [ ] PM validó los diseños

### FASE 2: Senior Developer
- [ ] Arquitectura soporta extensibilidad
- [ ] API es clara y documentada
- [ ] Plan de migración es seguro
- [ ] Frontend Dev validó viabilidad

### FASE 3: Frontend Developer
- [ ] Componente pasa tests
- [ ] Funciona en ambos contextos
- [ ] Date picker opera correctamente
- [ ] Code review por Senior Dev
- [ ] Documentación de uso creada

### FASE 4: Workflow Optimizer
- [ ] Performance medida y optimizada
- [ ] No hay regressions
- [ ] UX consistente validada
- [ ] Checklist final completo

---

## Métricas de Éxito

| Métrica | Target | Medición |
|---------|--------|----------|
| Cobertura de reqs | 100% | PM valida |
| Alineación diseño | 100% | UI valida |
| Tests passing | >80% | CI/CD |
| Code review | Aprobado | Senior Dev |
| Performance | <200ms render | Optimizer |
| UX consistency | 100% | Validación cruzada |

---

## Glosario

- **External Assignments**: Contexto de asignaciones externas donde se usa Time Entry
- **Quick Action**: Contexto de acción rápida para loguear horas
- **Time Entry**: Componente de entrada de tiempo/horas
- **Date Picker**: Selector de fecha integrado en el componente
- **MVP**: Minimum Viable Product - versión mínima funcional
