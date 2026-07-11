# ADR-001: Tempo Hours Tracking Separation

## Status
**Proposed**

## Context

### Current Problem
The `external_hours_daily` table is being incorrectly reused for two distinct purposes:

1. **External Jira hours**: Hours logged on user-assigned external Jira tickets (multiple tickets per day)
2. **Tempo/VIS-2 hours**: Hours logged on the internal VIS-2 task (single task per day)

This violates the Single Responsibility Principle and creates confusion about:
- What data belongs where
- How to track different sources of truth
- When to sync from API vs. use cached values

### Domain Analysis

| Concern | External Jira Hours | Tempo/VIS-2 Hours |
|---------|---------------------|-------------------|
| Scope | Multiple tickets assigned to user | Single task (VIS-2) |
| Data source | Jira API + Worklog Submissions | Tempo API |
| Granularity | Per-ticket, per-day | Per-day aggregate |
| Confirmation | N/A (always from submissions) | Must reach 8 hours to be "confirmed" |
| Edit pattern | Via worklog submission flow | Via weekly modal or "Cargar horas" button |

### Bounded Contexts

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL JIRA CONTEXT                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌────────────────┐ │
│  │ Issue Assignment │───▶│ Worklog Submit  │───▶│ Hours Tracking │ │
│  │   (User's tickets)│    │   (JIRA/BOTH)   │    │ (per ticket)   │ │
│  └─────────────────┘    └─────────────────┘    └────────────────┘ │
│                                                          │         │
│                                                          ▼         │
│                                              external_hours_daily   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       TEMPO/VIS-2 CONTEXT                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌────────────────┐ │
│  │ "Cargar horas"   │───▶│ Tempo Worklog   │───▶│ Hours Confirm  │ │
│  │   (User action)  │    │   Creation      │    │  (>= 8 hours)  │ │
│  └─────────────────┘    └─────────────────┘    └────────────────┘ │
│                                                          │         │
│                                                          ▼         │
│                                               tempo_hours_daily     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Decision

### 1. Create Dedicated `tempo_hours_daily` Table

Separate the Tempo hours tracking into its own table with confirmation semantics.

#### Database Schema

```sql
CREATE TABLE tempo_hours_daily (
    -- Primary key: date in YYYY-MM-DD format
    work_date VARCHAR(10) PRIMARY KEY,
    
    -- Hours logged (stored as decimal for precision)
    hours_logged DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
    
    -- Source of the hours data
    -- 'tempo_api': fetched and confirmed from Tempo API
    -- 'manual': user-set via weekly modal
    source VARCHAR(20) NOT NULL DEFAULT 'tempo_api',
    
    -- When hours reached >= 8 (workday complete)
    -- NULL if not yet confirmed
    confirmed_at TIMESTAMP NULL,
    
    -- Audit timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT chk_hours_non_negative CHECK (hours_logged >= 0),
    CONSTRAINT chk_source_valid CHECK (source IN ('tempo_api', 'manual'))
);

-- Index for common query pattern: fetching a week's data
CREATE INDEX idx_tempo_hours_weekly 
    ON tempo_hours_daily(work_date);
```

#### Entity Definition (TypeORM)

```typescript
// entities/TempoHoursDaily.ts

export type TempoHoursSource = 'tempo_api' | 'manual';

@Entity('tempo_hours_daily')
export default class TempoHoursDaily {
  @PrimaryColumn({ name: 'work_date', type: 'varchar', length: 10 })
  workDate: string;

  @Column({ name: 'hours_logged', type: 'decimal', precision: 6, scale: 2, default: 0 })
  hoursLogged: number;

  @Column({ name: 'source', type: 'varchar', length: 20, default: 'tempo_api' })
  source: TempoHoursSource;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

### 2. Repository Interface

```typescript
// jira-integrations/persistence/tempoHoursDailyRepository.ts

export interface TempoHoursRecord {
  workDate: string;
  hoursLogged: number;
  source: TempoHoursSource;
  confirmedAt: Date | null;
}

export interface ITempoHoursDailyRepository {
  // Get hours for a specific date
  getByDate(workDate: string): Promise<TempoHoursRecord | null>;
  
  // Get hours for a date range (e.g., Monday to Sunday)
  getByDateRange(fromDate: string, toDate: string): Promise<TempoHoursRecord[]>;
  
  // Set hours from Tempo API (auto-confirms if >= 8)
  setFromApi(workDate: string, hours: number): Promise<TempoHoursRecord>;
  
  // Set hours manually (always confirms)
  setManually(workDate: string, hours: number): Promise<TempoHoursRecord>;
  
  // Check if a date is confirmed
  isConfirmed(workDate: string): Promise<boolean>;
}
```

---

## API Contract

### Base Path
All endpoints under `/quick-actions/actions/tempo-export`

### Endpoints

#### 1. GET `/hours` - Get Hours for a Date

**Query Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| date | string | Yes | Date in YYYY-MM-DD format |

**Response (200 OK):**
```json
{
  "date": "2026-03-16",
  "hoursLogged": 8.0,
  "source": "tempo_api",
  "isConfirmed": true,
  "confirmedAt": "2026-03-16T14:30:00Z"
}
```

**Response (200 OK - Unconfirmed):**
```json
{
  "date": "2026-03-16",
  "hoursLogged": 4.5,
  "source": "tempo_api",
  "isConfirmed": false,
  "confirmedAt": null
}
```

**Response (404 Not Found - No data):**
```json
{
  "date": "2026-03-16",
  "hoursLogged": 0,
  "source": null,
  "isConfirmed": false,
  "confirmedAt": null
}
```

**Error Responses:**
- `400` - Invalid date format or missing date parameter
- `500` - Internal server error

---

#### 2. GET `/week` - Get Week Hours

**Query Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| startDate | string | No | Any date in the week (YYYY-MM-DD). Defaults to current week's Monday |

**Response (200 OK):**
```json
{
  "weekStart": "2026-03-16",
  "weekEnd": "2026-03-22",
  "days": [
    {
      "date": "2026-03-16",
      "hoursLogged": 8.0,
      "source": "tempo_api",
      "isConfirmed": true
    },
    {
      "date": "2026-03-17",
      "hoursLogged": 6.5,
      "source": "manual",
      "isConfirmed": true
    },
    {
      "date": "2026-03-18",
      "hoursLogged": 0,
      "source": null,
      "isConfirmed": false
    }
    // ... 7 days total
  ],
  "summary": {
    "totalHours": 14.5,
    "confirmedDays": 2,
    "pendingDays": 5
  }
}
```

---

#### 3. PUT `/hours` - Manually Set Hours

**Request Body:**
```json
{
  "date": "2026-03-16",
  "hours": 8.0,
  "forceConfirm": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| date | string | Yes | Date in YYYY-MM-DD format |
| hours | number | Yes | Hours to set (non-negative) |
| forceConfirm | boolean | No | Force confirmation even if < 8 hours. Default: false |

**Response (200 OK):**
```json
{
  "date": "2026-03-16",
  "hoursLogged": 8.0,
  "source": "manual",
  "isConfirmed": true,
  "confirmedAt": "2026-03-16T15:00:00Z"
}
```

**Error Responses:**
- `400` - Invalid request (missing fields, negative hours, invalid date)
- `500` - Internal server error

---

## Data Flow

### Flow 1: "Cargar horas" (User Initiates Export)

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│  User    │     │   Frontend   │     │    API       │     │   Tempo API     │
│  Click   │────▶│  POST /tempo │────▶│  Create      │────▶│  Create Worklog │
│          │     │  -export     │     │  Worklog     │     │                 │
└──────────┘     └──────────────┘     └──────────────┘     └─────────────────┘
                                              │                     │
                                              │                     │
                                              ▼                     ▼
                                        ┌─────────────────────────────┐
                                        │  GET /hours?date=YYYY-MM-DD │
                                        │  (Verify hours logged)      │
                                        └─────────────────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
            ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
            │ Check DB for │         │ Fetch from   │         │ Sum worklogs │
            │ cached hours │         │ Tempo API    │         │ for date     │
            └──────────────┘         └──────────────┘         └──────────────┘
                    │                         │                         │
                    └─────────────────────────┼─────────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │ hours >= 8?      │
                                    └──────────────────┘
                                     │              │
                                    YES            NO
                                     │              │
                                     ▼              ▼
                           ┌────────────────┐  ┌────────────────┐
                           │ Save to        │  │ Return hours   │
                           │ tempo_hours_   │  │ (unconfirmed)  │
                           │ daily with     │  └────────────────┘
                           │ confirmed_at   │
                           └────────────────┘
```

### Flow 2: Weekly Modal Edit (Manual Confirmation)

```
┌──────────┐     ┌──────────────┐     ┌──────────────────────────┐
│  User    │     │   Frontend   │     │         API              │
│  Edit    │────▶│  PUT /hours  │────▶│  TempoHoursRepository    │
│  Hours   │     │              │     │  .setManually()          │
└──────────┘     └──────────────┘     └──────────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │ Save to          │
                                    │ tempo_hours_     │
                                    │ daily            │
                                    │ source='manual'  │
                                    │ confirmed_at=NOW │
                                    └──────────────────┘
```

### Flow 3: External Jira Worklog (Separate Context)

```
┌──────────┐     ┌──────────────┐     ┌──────────────────────────┐
│  User    │     │   Frontend   │     │         API              │
│  Submit  │────▶│  POST        │────▶│  WorklogService          │
│  Worklog │     │  /worklog    │     │  (target: JIRA or BOTH)  │
└──────────┘     └──────────────┘     └──────────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │ Create worklog   │
                                    │ in Jira          │
                                    └──────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │ Save to          │
                                    │ worklog_         │
                                    │ submission       │
                                    └──────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │ Update           │
                                    │ external_hours_  │
                                    │ daily            │
                                    │ (per ticket)     │
                                    └──────────────────┘
```

---

## Consequences

### What Becomes Easier

1. **Clear ownership**: `tempo_hours_daily` exclusively tracks VIS-2 hours
2. **Confirmation semantics**: `confirmed_at` provides explicit audit trail
3. **Source tracking**: Clear distinction between API-fetched and manually-entered data
4. **Independent evolution**: Tempo tracking can change without affecting external Jira logic
5. **Simpler queries**: No need to filter by issue key or source type

### What Becomes Harder

1. **Migration**: Existing data in `external_hours_daily` for Tempo must be migrated
2. **Two tables to maintain**: Slight increase in schema complexity
3. **Documentation overhead**: Must clearly document when to use which table

### Migration Strategy

```sql
-- Step 1: Create new table (see schema above)

-- Step 2: Migrate existing Tempo data
-- Assuming records with source='tempo' are VIS-2 hours
INSERT INTO tempo_hours_daily (work_date, hours_logged, source, confirmed_at, created_at, updated_at)
SELECT 
    work_date,
    total_seconds / 3600.0 AS hours_logged,
    'tempo_api' AS source,
    CASE 
        WHEN total_seconds >= 8 * 3600 THEN created_at 
        ELSE NULL 
    END AS confirmed_at,
    created_at,
    updated_at
FROM external_hours_daily
WHERE source = 'tempo';

-- Step 3: Clean up external_hours_daily
-- Remove Tempo records (keep only external Jira records)
-- DELETE FROM external_hours_daily WHERE source = 'tempo';
-- NOTE: Execute deletion only after verifying migration success
```

---

## Alternatives Considered

### Alternative 1: Single Table with Type Column

```sql
CREATE TABLE hours_daily (
    work_date VARCHAR(10),
    hours_type VARCHAR(20), -- 'external_jira' | 'tempo'
    issue_key VARCHAR(50),  -- NULL for tempo
    ...
    PRIMARY KEY (work_date, hours_type, issue_key)
);
```

**Rejected because:**
- Different confirmation semantics don't fit well
- Would require NULL columns for tempo type
- Query complexity increases

### Alternative 2: Keep Current Structure, Add Columns

Add `hours_type` and `confirmed_at` to `external_hours_daily`.

**Rejected because:**
- `external_hours_daily` already has unclear semantics
- Name implies external Jira, not internal Tempo
- Would perpetuate confusion

---

## Open Questions

1. **What happens when hours exceed 8?** 
   - Recommendation: Allow values > 8 (overtime is valid)
   - Confirmation logic: `hours >= 8`, not `hours == 8`

2. **Should we prevent editing confirmed hours?**
   - Recommendation: Allow edits but track via `source` and `updated_at`
   - Business rule: frontend may show warning but don't block

3. **Historical data migration:**
   - How to identify existing Tempo vs External Jira hours in `external_hours_daily`?
   - Current code shows `source='tempo'` for VIS-2 hours
   - Verify before migration

---

## Implementation Checklist

- [ ] Create `TempoHoursDaily` entity
- [ ] Create `TempoHoursDailyRepository` with full interface
- [ ] Update `maintenance.ts` controller to use new repository
- [ ] Update API responses to include `isConfirmed` and `confirmedAt`
- [ ] Create database migration script
- [ ] Update frontend to handle new response format
- [ ] Add integration tests for confirmation logic
- [ ] Update documentation and README
