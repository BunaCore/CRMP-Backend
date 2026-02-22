# Access Control Module - Usage Guide

The Access Control module provides a **policy-driven authorization system** for the CRMP Backend. It evaluates permissions based on user roles, attributes (department, program), and resource membership.

---

## Architecture Overview

```
AccessControlModule
├── permission.enum.ts       → All available permissions
├── role.enum.ts             → All available roles
├── role-permissions.ts      → Static role→permission mapping
├── access.service.ts        → Core permission evaluation logic
├── access.guard.ts          → NestJS guard for route protection
├── require-permission.decorator.ts → Decorator for routes
└── index.ts                 → Public exports
```

### Authorization Flow

```
Request with @RequirePermission()
    ↓
AccessGuard interceptsits request
    ↓
Guard calls AccessService.can(user, permissions, context)
    ↓
AccessService checks:
  1. Does user.role have permission? (RolePermissions mapping)
  2. Do attributes match? (Department, Program, Membership)
    ↓
Grant/Deny access
```

---

## Quick Start

### 1. Import and Setup

```typescript
// app.module.ts
import { AccessControlModule } from 'src/access-control';

@Module({
  imports: [
    // ... other modules
    AccessControlModule,
  ],
})
export class AppModule {}
```

### 2. Protect a Route

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { RequirePermission, AccessGuard, Permission } from 'src/access-control';

@Controller('projects')
export class ProjectsController {
  // Single permission (simplest case)
  @Post('/')
  @RequirePermission(Permission.PROJECT_CREATE)
  @UseGuards(AccessGuard)
  async createProject(@Body() dto: CreateProjectDto) {
    // User must have PROJECT_CREATE permission
  }

  // Multiple permissions (OR logic - any one grants access)
  @Post(':id/approve')
  @RequirePermission([Permission.PROJECT_APPROVE, Permission.ADRPM])
  @UseGuards(AccessGuard)
  async approveProject(@Param('id') projectId: string) {
    // User can access if they have PROJECT_APPROVE OR ADRPM permission
  }
}
```

---

## Permission System

### Available Permissions

See [permission.enum.ts](./permission.enum.ts) for the complete list. Common ones:

```typescript
Permission.PROJECT_CREATE; // Create a project
Permission.PROJECT_SUBMIT; // Submit project
Permission.PROJECT_REVIEW; // Review (read-only)
Permission.PROJECT_APPROVE; // Approve a project
Permission.PROJECT_REJECT; // Reject a project
Permission.BUDGET_APPROVE; // Approve budget
Permission.TEAM_MANAGE; // Add/remove team members
Permission.ETHICS_APPROVE; // Approve ethical clearance
```

### Role-Permission Mapping

Roles are **flat** (no inheritance). Each role has an explicit permission set:

```typescript
// role-permissions.ts (static mapping)
[Role.STUDENT]: [
  Permission.PROJECT_CREATE,
  Permission.PROJECT_SUBMIT,
  Permission.PROJECT_VIEW,
  Permission.TEAM_VIEW,
],

[Role.SUPERVISOR]: [
  Permission.PROJECT_CREATE,
  Permission.PROJECT_SUBMIT,
  Permission.PROJECT_RECOMMEND,
  Permission.TEAM_MANAGE,
],

[Role.ADRPM]: [
  Permission.PROJECT_REVIEW,
  Permission.PROJECT_APPROVE,
  Permission.BUDGET_APPROVE,
  Permission.ETHICS_APPROVE,
  // ... many more
],
```

---

## Roles

```typescript
Role.STUDENT; // Student/Researcher
Role.SUPERVISOR; // Faculty supervisor
Role.DEPARTMENT_HEAD; // Department administrator
Role.PI; // Principal Investigator
Role.RA; // Research Administration
Role.ADRPM; // Associate Director of Research
Role.VPRTT; // VP Research, Teaching & Training
```

---

## Access Context (Advanced)

For **resource-level** and **attribute-based** checks, pass a context object:

```typescript
export interface AccessContext {
  project?: any; // Hydrated project entity
  projectMember?: any; // User's role in the project
  targetUserId?: string; // For user-level checks
}
```

### Example: Protecting Project Routes with Context

```typescript
import { AccessService } from 'src/access-control';

@Controller('projects')
export class ProjectsController {
  constructor(private accessService: AccessService) {}

  @Post(':id/assign-evaluator')
  async assignEvaluator(
    @Param('id') projectId: string,
    @Body() dto: AssignEvaluatorDto,
    @Req() req: Request,
  ) {
    const user = req.user; // From JWT guard
    const project = await this.projectsService.findById(projectId);

    // Check: Does user have permission + is in same department?
    const canAssign = await this.accessService.can(
      user,
      Permission.EVALUATOR_ASSIGN,
      { project },
    );

    if (!canAssign) {
      throw new ForbiddenException('Cannot assign evaluator');
    }

    // Proceed with assignment
  }
}
```

### Attribute Checks Performed

When context is provided, AccessService additionally checks:

1. **Department Match** (`user.department === project.department`)
   - Skipped if either is missing
   - Ensures users only access projects in their department

2. **Program Eligibility** (project.projectProgram: UG/PG/GENERAL)
   - GENERAL projects are always accessible
   - UG/PG programs checked (extensible for future rules)

3. **Project Membership** (projectMember.userId === user.id)
   - Verifies user is actually a team member
   - Checks that projectMember.role exists

---

## Utility Methods

AccessService provides helpers for common checks:

```typescript
const accessService = this.accessService;

// Is this user the Project PI?
if (accessService.isProjectPI(user, project)) {
  // User is PI
}

// Is this user the assigned evaluator?
if (accessService.isProjectEvaluator(user, project)) {
  // User is evaluator
}
```

---

## Usage Patterns

### Pattern 1: Simple Role-Based (No Context)

```typescript
@Post('budgets/:id/approve')
@RequirePermission(Permission.BUDGET_APPROVE)
@UseGuards(AccessGuard)
async approveBudget(@Param('id') budgetId: string) {
  // Only users with BUDGET_APPROVE permission can access
  // No resource-level checks
}
```

### Pattern 2: Resource-Level with Context

```typescript
@Delete('projects/:id')
@UseGuards(JwtAuthGuard) // Need JWT first
async deleteProject(@Param('id') projectId: string, @Req() req: Request) {
  const user = req.user;
  const project = await this.projectsService.findById(projectId);

  // Verify permission + ownership + department
  const canDelete = await this.accessService.can(
    user,
    Permission.PROJECT_DELETE,
    { project },
  );

  if (!canDelete) {
    throw new ForbiddenException('Cannot delete this project');
  }

  await this.projectsService.delete(projectId);
}
```

### Pattern 3: Multiple Permissions (OR Logic)

```typescript
@Post('projects/:id/finalize')
@RequirePermission([
  Permission.PROJECT_APPROVE,
  Permission.VPRTT,  // High-level reviewer
])
@UseGuards(AccessGuard)
async finalizeProject(@Param('id') projectId: string) {
  // Access granted if user has PROJECT_APPROVE OR ADRPM
}
```

### Pattern 4: Workflow + Business Rules (Service Layer)

```typescript
// access-control checks: role + attributes
// Service layer checks: workflow + business rules

@Post('projects/:id/submit-for-review')
@UseGuards(JwtAuthGuard)
async submitForReview(@Param('id') projectId: string, @Req() req: Request) {
  const user = req.user;
  const project = await this.projectsService.findById(projectId);

  // 1. AccessService: Can user perform actions on this project?
  const canSubmit = await this.accessService.can(
    user,
    Permission.PROJECT_SUBMIT,
    { project },
  );
  if (!canSubmit) {
    throw new ForbiddenException('Cannot submit this project');
  }

  // 2. Service layer: Is workflow valid? (not AccessService's job)
  if (project.projectStage !== 'Submitted') {
    throw new BadRequestException('Project must be in Submitted stage');
  }

  // 3. Service layer: Is academic calendar open?
  if (!this.academicCalendarService.isOpen('UG')) {
    throw new BadRequestException('UG submission window closed');
  }

  // Proceed
  await this.projectsService.moveToReview(projectId);
}
```

---

## Composition with Other Guards

Typically used **after** JWT authentication:

```typescript
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AccessGuard } from 'src/access-control';

@UseGuards(JwtAuthGuard, AccessGuard)  // JWT first, then access control
@RequirePermission(Permission.PROJECT_APPROVE)
@Post('projects/:id/approve')
async approveProject(@Param('id') projectId: string) {
  // Guaranteed user is authenticated + has permission
}
```

---

## Adding New Permissions

1. Add to [permission.enum.ts](./permission.enum.ts):

```typescript
export enum Permission {
  // ...existing
  NEW_PERMISSION = 'NEW_PERMISSION',
}
```

2. Add to relevant roles in [role-permissions.ts](./role-permissions.ts):

```typescript
[Role.ADRPM]: [
  // ...existing
  Permission.NEW_PERMISSION,
],
```

No other changes needed—fully extensible!

---

## Adding New Roles

1. Add to [role.enum.ts](./role.enum.ts):

```typescript
export enum Role {
  // ...existing
  NEW_ROLE = 'NEW_ROLE',
}
```

2. Add mapping in [role-permissions.ts](./role-permissions.ts):

```typescript
[Role.NEW_ROLE]: [
  Permission.PROJECT_CREATE,
  Permission.TEAM_VIEW,
  // ... add relevant permissions
],
```

---

## Important Notes

### Authorization vs. Business Logic

- **AccessService**: Role + attribute checks (permission-based)
- **Service Layer**: Workflow, state, calendar rules (business logic)

Example:

```typescript
// AccessService says: User has permission ✓
// Service must check: Is project workflow valid?
if (project.stage !== 'APPROVED') {
  throw new BadRequestException('Cannot proceed');
}
```

### Context is Flexible

- Pass only what you need
- Missing fields are skipped (no errors)
- Example: `{ project }` alone is valid
- Example: `{ projectMember }` alone is valid

### OR Logic for Multiple Permissions

Decorator support multiple permissions with **OR** logic:

```typescript
@RequirePermission([Perm.A, Perm.B, Perm.C])
// User needs ANY ONE of A, B, C

@RequirePermission(Perm.A)
// User must have A
```

To enforce **AND** logic, call AccessService directly in your controller.

---

## Testing

```typescript
describe('AccessService', () => {
  let service: AccessService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AccessService],
    }).compile();
    service = module.get<AccessService>(AccessService);
  });

  it('should grant access for permission match', async () => {
    const user = { id: '123', role: Role.ADRPM };
    const canApprove = await service.can(user, Permission.PROJECT_APPROVE);
    expect(canApprove).toBe(true);
  });

  it('should deny access for missing permission', async () => {
    const user = { id: '123', role: Role.STUDENT };
    const canApprove = await service.can(user, Permission.PROJECT_APPROVE);
    expect(canApprove).toBe(false);
  });

  it('should check department match', async () => {
    const user = { id: '123', role: Role.SUPERVISOR, department: 'CS' };
    const project = { projectId: '456', department: 'CE' };
    const canAccess = await service.can(user, Permission.PROJECT_RECOMMEND, {
      project,
    });
    expect(canAccess).toBe(false); // Different departments
  });
});
```

---

## FAQ

**Q: Can I use AccessService directly without the Guard?**
A: Yes. Inject it into any service/controller and call `can()` manually for custom logic.

**Q: What if I need AND logic for permissions?**
A: Check them sequentially in your controller or create custom guards.

**Q: Can contexts be combined?**
A: Yes, pass `{ project, projectMember, targetUserId }` together.

**Q: Is there role inheritance?**
A: No—roles are flat. Assign permissions explicitly via `role-permissions.ts`.

**Q: How do I handle dynamic attributes beyond department/program?**
A: Add methods to AccessService and call them from your controller logic.

---

## Troubleshooting

**Guard not triggering:**

- Ensure `AccessGuard` is in `@UseGuards()`
- Ensure `@RequirePermission()` is on the route handler
- Check JWT guard is applied first

**"ForbiddenException: User not authenticated":**

- Missing `JwtAuthGuard` before `AccessGuard`
- JWT token is invalid or expired

**"Insufficient permissions":**

- Check user's role against `role-permissions.ts`
- Verify role name matches exactly
- Add permission to the role if needed

---

## Summary

| Component              | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `Permission`           | All available actions                    |
| `Role`                 | User categories                          |
| `RolePermissions`      | Flat mapping of role → permissions       |
| `AccessService`        | Core logic: role + attribute checks      |
| `AccessGuard`          | NestJS guard for routes                  |
| `@RequirePermission()` | Decorator to specify required permission |

**Keep it simple:** Use the decorator + guard for most routes. Use `AccessService` directly for advanced logic.
