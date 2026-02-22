# Access Control Module - Usage Guide

The Access Control module provides a **policy-driven authorization system** for the CRMP Backend. It evaluates permissions based on user roles, attributes (department, project program), and resource membership.

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
  2. Do attributes match? (Department, Project Program, Membership)
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
  @Post(':id/reject')
  @RequirePermission([Permission.PROJECT_APPROVE, Permission.PROJECT_REJECT])
  @UseGuards(AccessGuard)
  async rejectProject(@Param('id') projectId: string) {
    // User can access if they have PROJECT_APPROVE OR PROJECT_REJECT permission
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
   - Conditional: Enforced unless user's system role is explicitly cross-department (e.g., ADRPM, VPRTT, RA)
   - Ensures scoped users only access their department's projects

2. **Project Program Eligibility** (project.projectProgram: UG/PG/GENERAL)
   - Program is a **project attribute**, not a user attribute
   - GENERAL projects are always accessible
   - UG/PG program eligibility checked by AccessService (role-based)
   - Workflow-specific enrollment rules (e.g., "UG projects only open in Aug-Dec") enforced in domain services

3. **Project Team Membership** (projectMember.userId === user.id)
   - Verifies user is actually a team member
   - Checks for project role: PI, EVALUATOR, SUPERVISOR (distinct from system roles)
   - Note: Project roles are resource-specific; system roles (ADRPM, STUDENT, etc.) are global

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
  Permission.BUDGET_APPROVE,
])
@UseGuards(AccessGuard)
async finalizeProject(@Param('id') projectId: string) {
  // Access granted if user has PROJECT_APPROVE OR BUDGET_APPROVE
  // Roles are resolved internally via role-permissions.ts
}
```

### Pattern 4: Authorization + Business Rules (Responsibility Separation)

```typescript
// AccessGuard checks: role + attributes (project membership, department)
// Service layer checks: workflow, state, calendar, business constraints

@Post('projects/:id/submit-for-review')
@UseGuards(JwtAuthGuard)
async submitForReview(@Param('id') projectId: string, @Req() req: Request) {
  const user = req.user;
  const project = await this.projectsService.findById(projectId);

  // 1. AccessService: Is user authorized to interact with this project?
  const canSubmit = await this.accessService.can(
    user,
    Permission.PROJECT_SUBMIT,
    { project },  // AccessService checks: role + department + membership
  );
  if (!canSubmit) {
    throw new ForbiddenException('Insufficient permissions');
  }

  // 2. Service layer: Is workflow state valid?
  // AccessService does NOT check business rules - that's the service's job
  if (project.projectStage !== 'Submitted') {
    throw new BadRequestException('Project must be in Submitted stage');
  }

  // 3. Service layer: Are calendar/enrollment rules satisfied?
  if (!this.academicCalendarService.isOpen(project.projectProgram)) {
    throw new BadRequestException(
      `Submission window closed for ${project.projectProgram} projects`,
    );
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

### System Roles vs. Project Roles

**System Roles** (global scope):

- `ADRPM`, `VPRTT`, `RA`, `SUPERVISOR`, `DEPARTMENT_HEAD`, `PI`, `STUDENT`
- Defined in `role.enum.ts`
- Map to permissions via `role-permissions.ts`
- User has ONE system role

**Project Roles** (resource-specific scope, in `project_members` table):

- `PI`, `EVALUATOR`, `SUPERVISOR`
- Different from system roles with the same name
- A user may have project role `PI` on one project and be a `STUDENT` on another
- Checked via `projectMember.role` in AccessContext

**Key:** AccessService evaluates both dimensions when context is provided.

---

### Responsibility Boundaries

**AccessService handles** (authorization layer):

- Role → permission mapping
- Department matching
- Project membership verification
- Project-specific role checks (PI, EVALUATOR)

**AccessService does NOT handle** (business logic layer):

- Project state/workflow transitions (e.g., "Submitted" → "Under Review")
- Academic calendar validation
- Enrollment period checks
- Budget approval workflows
- Multi-level approvals or cascading rules

These belong in domain services (`ProjectService`, `AcademicCalendarService`, etc.)

---

### ⚠️ What AccessService MUST NEVER Do

AccessService is **authorization-only**. It MUST NOT:

- ❌ Query the database directly for supplementary context (use `AccessContext` instead)
- ❌ Evaluate business logic (workflow state, calendar rules, budget constraints)
- ❌ Throw exceptions—return `true`/`false` and let the caller decide
- ❌ Cache decisions or store state
- ❌ Perform side effects (logging, metrics, notifications)
- ❌ Infer missing context—require explicit AccessContext parameters
- ❌ Apply role inheritance or permission inference beyond the static `role-permissions.ts` mapping

**Why?** Keeps authorization logic isolated, testable, and fast. Business rules belong in domain services.

---

### AccessContext Structure

```typescript
type AccessContext = {
  project?: Project; // Hydrated project entity
  projectMember?: ProjectMember; // User's role in the project (or null)
  targetUserId?: string; // For user-level operations
};
```

**Usage:**

- Pass only what's needed; missing fields are skipped
- Example: `{ project }` checks department + program eligibility
- Example: `{ projectMember }` verifies team membership
- Example: `{ project, projectMember }` checks both + project role
- **Controllers must supply hydrated entities** (not just IDs)

### Permission Logic (OR Only)

Decorator supports multiple **permissions** with **OR** logic:

```typescript
@RequirePermission([Permission.A, Permission.B, Permission.C])
// User needs ANY ONE of A, B, C (resolved via their system role)

@RequirePermission(Permission.A)
// User must have A
```

**⚠️ HARD RULES - These Are Not Guidance, These Are Requirements:**

- ✅ **ONLY permissions** go in the decorator (e.g., `Permission.PROJECT_APPROVE`)
- ❌ **NEVER roles** in the decorator (e.g., `Role.ADRPM` is forbidden)
- ✅ **Multiple permissions use OR logic** (user needs any one)
- ❌ **NOT AND logic** in the decorator (use AccessService.can() directly if needed)
- ✅ **Always pair with @UseGuards(AccessGuard)**
- ❌ **@RequirePermission without AccessGuard has no effect**

**Example violations:**

```typescript
// ❌ WRONG - Roles in decorator
@RequirePermission([Role.ADRPM, Role.SUPERVISOR])

// ❌ WRONG - AND logic attempt
@RequirePermission(Permission.PROJECT_APPROVE)
@RequirePermission(Permission.TEAM_MANAGE)  // This doesn't AND them

// ✅ CORRECT
@RequirePermission([Permission.PROJECT_APPROVE, Permission.TEAM_MANAGE])
@UseGuards(AccessGuard)
```

Role → permission resolution happens **internally** in AccessService using `role-permissions.ts`.

For **AND** logic (all permissions required), call AccessService directly in your controller.

---

### ⚠️ What AccessGuard MUST/MUST NOT Do

AccessGuard enforces authorization **only**. It MUST:

- ✅ Read permission metadata from `@RequirePermission` decorator
- ✅ Call `AccessService.can()` to evaluate permissions
- ✅ Throw `ForbiddenException` if denied
- ✅ Allow request if granted

AccessGuard MUST NOT:

- ❌ Query the database (no context inference)
- ❌ Perform fallback logic (e.g., "if ADRPM, grant anyway")
- ❌ Apply business rules (workflow, state, calendar)
- ❌ Throw non-authorization exceptions
- ❌ Modify request state or perform side effects

**Why?** Keeps guards predictable and composable. If you need custom logic, handle it in your controller/service.

---

### When NOT to Use AccessGuard

Use `AccessGuard` + `@RequirePermission()` for:

- ✅ Simple, declarative permission checks
- ✅ Route-level authorization
- ✅ Stateless, permission-only decisions

**Do NOT use AccessGuard when:**

- ❌ You need resource-level context (use `AccessService.can()` directly in controller)
- ❌ You need AND logic for permissions (call AccessService multiple times)
- ❌ You need to handle missing context (guard expects hydrated entities)
- ❌ You need custom error messages (guard throws generic ForbiddenException)
- ❌ You require async business logic before the decision

**Pattern: Direct AccessService Usage (no guard)**

```typescript
@Post('projects/:id/submit')
@UseGuards(JwtAuthGuard)  // Just auth, no AccessGuard
async submitProject(@Param('id') id: string, @Req() req: Request) {
  const user = req.user;
  const project = await this.projectsService.findById(id);

  // Custom authorization logic
  const canSubmit = await this.accessService.can(
    user,
    Permission.PROJECT_SUBMIT,
    { project, projectMember: await this.getProjectMember(id, user.id) }
  );

  if (!canSubmit) {
    throw new ForbiddenException('Cannot submit this project');
  }

  // Then check business rules (state, calendar, etc.)
  if (project.projectStage !== 'Draft') {
    throw new BadRequestException('Project not in Draft state');
  }

  await this.projectsService.submit(id);
}
```

This pattern is used when you need:

- Resource context before authorization
- AND logic for multiple checks
- Custom error messages
- Business rule validation alongside authorization

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
