# Backend Architecture Guide

## Feature Module Checklist

When adding a new feature to the backend, follow this checklist to ensure consistency and maintainability.

### 1. Create Feature Directory

Create a new folder under `src/` for your feature (e.g., `src/<feature>/`).

```
src/
├── <feature>/
│   ├── config.ts           # Feature-specific configuration
│   ├── container.ts        # Dependency injection container
│   ├── routes.ts           # Express router with all routes
│   ├── domain/
│   │   ├── types.ts        # Domain types and interfaces
│   │   ├── interfaces.ts   # DI interfaces for services/repositories
│   │   └── validation.ts   # Zod schemas for request validation
│   ├── controllers/
│   │   └── *.ts            # Route handlers
│   ├── services/
│   │   └── *.ts            # Business logic
│   ├── persistence/
│   │   └── *.ts            # Repository implementations
│   └── integrations/
│       └── *.ts            # External API clients
```

### 2. Define Domain Types

Create clear domain types in `domain/types.ts`:

```typescript
// Use enums for fixed sets of values
export enum FeatureStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

// Define clear interfaces for data structures
export interface FeatureItem {
  id: number;
  name: string;
  status: FeatureStatus;
  createdAt: string;
  updatedAt: string;
}
```

### 3. Create DI Interfaces

Define interfaces for dependencies in `domain/interfaces.ts`:

```typescript
export interface IFeatureRepository {
  create(item: Omit<FeatureItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<FeatureItem>;
  findById(id: number): Promise<FeatureItem | null>;
  findAll(): Promise<FeatureItem[]>;
  update(id: number, updates: Partial<FeatureItem>): Promise<FeatureItem>;
  delete(id: number): Promise<void>;
}

export interface FeatureServiceDeps {
  repository: IFeatureRepository;
  // Add other dependencies as needed
}
```

### 4. Implement Validation

Use Zod schemas in `domain/validation.ts`:

```typescript
import { z } from 'zod';

export const createFeatureItemSchema = z.object({
  name: z.string().min(1).max(100),
  status: z.nativeEnum(FeatureStatus).default(FeatureStatus.PENDING),
});

export type CreateFeatureItemRequest = z.infer<typeof createFeatureItemSchema>;

export function parseWithZod<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed: ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
}
```

### 5. Create a Container

Implement a DI container in `container.ts`:

```typescript
import { DataSource } from 'typeorm';
import { dataSource as defaultDataSource } from 'database/createConnection';
import { FeatureRepository } from './persistence/featureRepository';
import { FeatureService } from './services/featureService';
import { IFeatureRepository } from './domain/interfaces';

export interface FeatureContainer {
  service: FeatureService;
  repository: IFeatureRepository;
}

let containerInstance: FeatureContainer | null = null;

export function createFeatureContainer(dataSource: DataSource = defaultDataSource): FeatureContainer {
  const repository = new FeatureRepository(dataSource);
  const service = new FeatureService({ repository });
  
  return { service, repository };
}

export function getFeatureContainer(): FeatureContainer {
  if (!containerInstance) {
    containerInstance = createFeatureContainer();
  }
  return containerInstance;
}

export function setFeatureContainer(container: FeatureContainer): void {
  containerInstance = container;
}

export function resetFeatureContainer(): void {
  containerInstance = null;
}
```

### 6. Implement Services with Constructor Injection

Services should accept dependencies via constructor:

```typescript
import { IFeatureRepository, FeatureServiceDeps } from './domain/interfaces';

export class FeatureService {
  private repository: IFeatureRepository;

  constructor(deps?: FeatureServiceDeps) {
    this.repository = deps?.repository ?? new FeatureRepository();
  }

  async createItem(data: CreateFeatureItemRequest): Promise<FeatureItem> {
    return this.repository.create(data);
  }
}
```

### 7. Create Controllers

Use the error handling utilities and container:

```typescript
import { catchErrors, BadUserInputError } from 'errors';
import { parseWithZod, createFeatureItemSchema } from '../domain/validation';
import { getFeatureContainer } from '../container';

export const createItem = catchErrors(async (req, res) => {
  let parsed;
  try {
    parsed = parseWithZod(createFeatureItemSchema, req.body);
  } catch (error) {
    throw new BadUserInputError({ 
      message: error instanceof Error ? error.message : 'Invalid request body' 
    });
  }

  const { service } = getFeatureContainer();
  const result = await service.createItem(parsed);
  res.respond(result);
});
```

### 8. Create Routes

Export an Express router:

```typescript
import { Router } from 'express';
import * as controller from './controllers/featureController';

export const featureRouter = Router();

featureRouter.get('/', controller.getAllItems);
featureRouter.post('/', controller.createItem);
featureRouter.get('/:id', controller.getItemById);
featureRouter.put('/:id', controller.updateItem);
featureRouter.delete('/:id', controller.deleteItem);
```

### 9. Mount Router in Main Routes

Add to `src/routes.ts`:

```typescript
import { featureRouter } from 'feature/routes';

export const attachPrivateRoutes = (app: any): void => {
  // ... other routes
  
  // Optional: guard with config check if feature is optional
  if (isFeatureConfigured()) {
    app.use('/api/v1/feature', featureRouter);
  }
};
```

### 10. Add Health Check (if external service)

If your feature uses external services, add to the health check:

```typescript
// In src/controllers/health.ts
const featureCheck: HealthCheckResult = {
  name: 'feature-name',
  status: isFeatureConfigured() ? 'healthy' : 'unhealthy',
  details: isFeatureConfigured() ? undefined : 'Feature not configured',
};
checks.push(featureCheck);
```

### 11. Add Tests

Create tests following the existing patterns:

```typescript
// feature/service/featureService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('FeatureService', () => {
  it('should create an item', async () => {
    // Test implementation
  });
});
```

## Route Versioning

All private API routes should use consistent versioning:

- Use `/api/v1/...` prefix for all private API routes
- Keep versioning predictable across all features

Example:
```
/api/v1/jira/...        # External Jira integrations
/api/v1/feature/...     # Your new feature
```

## Error Handling

Use the built-in error classes:

```typescript
import { 
  BadUserInputError,     // 400 Bad Request
  UnauthorizedError,     // 401 Unauthorized
  ForbiddenError,        // 403 Forbidden
  EntityNotFoundError,   // 404 Not Found
  ExternalServiceError,  // 502 Bad Gateway
} from 'errors';

// In controller
throw new BadUserInputError({ field: 'value' });
```

## Logging

Use the unified logger:

```typescript
import { logger } from 'utils/logger';

logger.info('Operation completed', { id, result });
logger.error('Operation failed', { error: error.message, context });
logger.debug('Debug info', { data });
```

## Configuration

Add feature configuration to `src/config/index.ts`:

```typescript
export const appConfig = {
  // ... existing config
  feature: {
    enabled: getEnv('FEATURE_ENABLED', 'false') === 'true',
    apiKey: getEnv('FEATURE_API_KEY'),
    timeout: Number(getEnv('FEATURE_TIMEOUT', '5000')),
  },
};
```

## Database Entities

If your feature needs database persistence:

1. Create entity in `src/entities/FeatureItem.ts`
2. Register in TypeORM configuration
3. Create repository in `src/<feature>/persistence/`

```typescript
// src/entities/FeatureItem.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('feature_item')
export default class FeatureItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```
