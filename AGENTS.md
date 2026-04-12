# AGENTS.md

## Project

Jira Clone:
- **API**: TypeScript/Node.js/Express with TypeORM
- **Client**: React/JavaScript with Webpack

## Commands

### Root
```bash
npm run install-dependencies  # Install all deps
npm run build                 # Build both
npm run start:production      # Production start
```

### API (`/api`)
```bash
npm start                   # Development
npm run build               # Compile TypeScript
npm run test                # Run tests (Vitest)
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
npx vitest run src/path/to/file.test.ts          # Single test file
npx vitest run --reporter=verbose -t "pattern"   # By pattern
npx tsc --noEmit            # TypeScript check
```

### Client (`/client`)
```bash
npm start                   # Development (webpack serve)
npm run build               # Production build
npm run test:jest           # Unit tests with Jest
npm run test:cypress        # E2E tests with Cypress
```

### Pre-commit
```bash
cd api && npm run pre-commit      # API lint + format
cd client && npm run pre-commit   # Client lint + format
npx eslint . --ext .ts,.tsx --fix
npx prettier --write "**/*.{ts,tsx,js,jsx,json,md}"
```

## Code Style Guidelines

### Prettier
```json
{ "printWidth": 100, "singleQuote": true, "trailingComma": "all" }
```

### Import Conventions
- **API**: Absolute from `src/` (e.g., `import { logger } from 'utils/logger'`)
- **Client**: Absolute from `src/` (e.g., `import { Modal } from 'shared/components'`)

### Naming Conventions
- Files: camelCase (utils/services), PascalCase (entities/components)
- Variables/functions: camelCase
- Classes/Components: PascalCase
- Constants: UPPER_SNAKE_CASE
- Tests: `[name].test.ts`

### TypeScript Guidelines (API)
- Strict mode
- Explicit return types on exports
- Use `type` for shapes
- Use `interface` for contracts
- Nullable: `| null`
- Avoid `any`

```typescript
const getIssue = async (id: number): Promise<Issue | null> => {
  return repository.findOne({ where: { id } });
};

@Entity()
class Issue extends BaseEntity {
  @PrimaryGeneratedColumn() id: number;
  @Column('varchar') title: string;
  @Column('text', { nullable: true }) description: string | null;
}
```

### React Guidelines (Client)
- Functional components
- Hooks
- PropTypes validation
- Destructure props
- Use fragments

```javascript
const Component = ({ prop1, prop2 }) => (
  <><div>{prop1}</div><div>{prop2}</div></>
);

Component.propTypes = { prop1: PropTypes.string.isRequired, prop2: PropTypes.func };
```

### Error Handling
**API**: Use `errors/customErrors.ts` and wrap with `catchErrors`.
```typescript
import { EntityNotFoundError } from 'errors';

export const getIssue = catchErrors(async (req, res) => {
  const issue = await issueService.findById(id);
  if (!issue) throw new EntityNotFoundError('Issue');
  res.respond({ issue });
});
```

**Client**: Use ErrorBoundary at app root.

### Testing Pattern

**Vitest**:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ServiceName', () => {
  beforeEach(() => { /* Reset mocks */ });
  it('should do something', async () => {
    const result = await service.method();
    expect(result).toBe(expected);
  });
});
```

### Project Structure
```
/api/src
  /controllers    - Route handlers (wrap with catchErrors)
  /entities       - TypeORM entities
  /errors         - Custom error classes
  /middleware     - Express middleware
  /services       - Business logic
  /utils          - Helper functions
  /config         - Configuration

/client/src
  /App            - Root component
  /Project        - Feature components
  /shared         - Reusable components/hooks
  /Auth           - Authentication
```

### ESLint Rules
- `no-console`: 0, `import/prefer-default-export`: 0 (named exports)
- API: `@typescript-eslint/no-explicit-any`: 0 (prefer types)
- Client: `react/prop-types`: warn, `react-hooks/exhaustive-deps`: warn

### Environment Requirements
- Node.js >= 25
- PostgreSQL or SQLite (better-sqlite3)

## Git Workflow
- Pre-commit hooks via Husky
- lint-staged runs ESLint + Prettier on staged files

## Notes
- API: `module-alias` for path resolution
- Client: webpack resolve.modules for absolute imports
- TypeORM decorators for entities
- Pino for logging (API), styled-components (client)
