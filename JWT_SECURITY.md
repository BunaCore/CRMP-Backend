# JWT Security Principles

## Rule: JWT Token Contains MINIMAL CLAIMS ONLY

**The JWT token should NEVER contain sensitive user data.**

### ✅ What JWT Token Contains

```typescript
// auth.service.ts - what gets signed
this.jwtService.sign({
  sub: user.id,        // User ID (public identifier)
  role: user.role,     // Role name (needed for some quick checks)
})

// Result token payload:
{
  sub: '550e8400-e29b-41d4-a716-446655440000',
  role: 'ADRPM',
  iat: 1708618000,
  exp: 1708621600
}
```

### ❌ What JWT Token Does NOT Contain

- ❌ Email address
- ❌ Full name
- ❌ Department
- ❌ Phone number
- ❌ University ID
- ❌ Account status
- ❌ Any other sensitive data

---

## Why This Matters

### Security Risks of Putting Data in JWT

1. **JWTs are NOT Encrypted** (only signed)
   - Token content is Base64 decoded publicly
   - Anyone can read the payload
   - ```bash
     # Just base64 decode - no key needed!
     echo "eyJzdWIiOiJ1c2VyLWlkIiwgImVtYWlsIjoiYWRtaW5AYXN0dS5lZHUifQ==" | base64 -d
     # Output: {"sub":"user-id", "email":"admin@astu.edu"}
     ```

2. **Logging/Debugging Exposure**
   - Tokens appear in logs, error stacks, network traces
   - Sensitive user data leaks in production logs

3. **Browser Storage Exposure**
   - If JWT in localStorage/sessionStorage
   - XSS attacks can steal it
   - Don't need access to DB - data already in token

4. **Token Inspection by Third Parties**
   - Mobile apps, API clients, browser extensions
   - Anyone with token can read all data

---

## Correct Flow: DB Lookup per Request

```
Client sends: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5c...

Server:
1. Decode JWT (using secret key) → { sub: 'user-id', role: 'ADRPM' }
2. Verify signature is valid
3. Query DB: SELECT * FROM users WHERE id = 'user-id'
4. Get fresh user data from database:
   {
     id: 'user-id',
     email: 'admin@astu.edu',           ← Fresh from DB
     role: 'ADRPM',                      ← Verify matches JWT
     department: 'Research',             ← Fresh from DB
     accountStatus: 'active',            ← Fresh from DB
     fullName: 'Dr. Admin',              ← Fresh from DB
     ...
   }
5. Attach to request.user
6. Route handler uses request.user
```

---

## Implementation in CRMP Backend

### JWT Strategy (jwt.strategy.ts)

```typescript
async validate(payload: { sub: string; role: string }) {
  // Only sub and role from JWT!

  // Fetch COMPLETE user from DB
  const user = await this.usersService.findById(payload.sub);

  if (!user) return null;

  // Return full user data (from DB, not JWT)
  return {
    id: user.id,
    email: user.email,                  ← From DB
    role: user.role,                    ← From JWT + verified
    department: user.department,        ← From DB
    accountStatus: user.accountStatus,  ← From DB
    fullName: user.fullName,            ← From DB
    phone: user.phoneNumber,            ← From DB
    universityId: user.universityId,    ← From DB
  };
}
```

### Benefits of This Approach

1. **Security**: No sensitive data in JWT
2. **Freshness**: DB data is current (catches deactivations, role changes)
3. **Audit Trail**: All user queries logged in DB
4. **Flexibility**: Can add new user fields without token migration
5. **Revocation**: Can revoke access immediately (no cache expiry)

---

## Current User Data Flow

```
Register/Login
    ↓
Generate JWT with { sub, role }
    ↓
Client stores JWT
    ↓
Client makes request with JWT
    ↓
JwtStrategy.validate():
  - Decode JWT
  - Query DB for full user
  - Return hydrated user object
    ↓
request.user = { id, email, role, department, ... }
    ↓
AccessGuard uses request.user for permission checks
    ↓
Route handler accesses request.user
```

---

## Using @CurrentUser Decorator

```typescript
import { CurrentUser, AuthenticatedUser } from 'src/auth/decorators';
import { Auth } from 'src/auth/decorators';

@Controller('users')
export class UsersController {
  @Get('/profile')
  @Auth() // Same as @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    // user contains full data from database
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      department: user.department,
      // ... all fields
    };
  }

  @Post('/update')
  @Auth()
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    // user.id is fresh from DB
    // user.department is current
    // user.accountStatus is current
  }
}
```

---

## Debugging: What's in the JWT?

To see what's in a JWT token, **decode it** (not decrypt - no key needed):

```bash
# Install jwt-cli
npm install -g jwt-cli

# Decode
jwt decode "your-jwt-token-here"
# Shows: { sub, role, iat, exp }

# Verify (needs secret)
jwt verify "your-jwt-token-here" --secret "your-secret-key"
```

Or use [jwt.io](https://jwt.io) - paste token to see payload (signature not verified online).

---

## Performance: DB Lookup per Request

**Question:** Doesn't querying DB per request hurt performance?

**Answer:** Yes, but it's worth it because:

1. Fresh data (security priority over speed)
2. Single DB query is very fast (indexed by ID)
3. Can add caching if needed (Redis with TTL)

**Optional Optimization: User Data Caching**

```typescript
// In jwt.strategy.ts
async validate(payload: { sub: string; role: string }) {
  // Try cache first
  let user = await this.cache.get(`user:${payload.sub}`);

  if (!user) {
    // Cache miss - query DB
    user = await this.usersService.findById(payload.sub);
    // Cache for 5 minutes
    await this.cache.set(`user:${payload.sub}`, user, 300);
  }

  return user;
}
```

---

## Checklist: JWT Security

- ✅ JWT contains only `{ sub, role }`
- ✅ Full user data fetched from DB per request
- ✅ No email, phone, or sensitive fields in JWT
- ✅ Auth response sanitized (no password hash)
- ✅ Current user decorator returns hydrated user
- ✅ AccessService receives fresh user data
- ✅ All attribute checks use DB data, not JWT

---

## Summary

| What           | Where         | Sensitive?                       |
| -------------- | ------------- | -------------------------------- |
| User ID        | JWT token     | No (public identifier)           |
| Role           | JWT token     | No (needed for quick validation) |
| Email          | Database only | Yes                              |
| Department     | Database only | Yes                              |
| Phone          | Database only | Yes                              |
| Account Status | Database only | Yes                              |
| Full Name      | Database only | Potentially                      |
| Password Hash  | Database only | Yes                              |

**Rule: If it's sensitive, it lives in the database. The JWT is just a ticket to prove who you are.**
