# Database Migrations Policy

**Status:** Enforced  
**Last Updated:** February 2, 2026

---

## 🚫 Golden Rule

> **No direct database modifications in production. Ever.**

All schema changes MUST go through tracked migration files.

---

## Why This Policy Exists

1. **Auditability**: Every schema change is tracked in version control
2. **Reproducibility**: Same migrations run in dev → staging → production
3. **Rollback**: Migrations can be reversed if issues arise
4. **Team Sync**: Everyone's local DB matches production schema
5. **Security**: No hardcoded credentials in scripts

---

## Migration Workflow

### 1. Create a Migration

```bash
# Generate a new migration file
npm run migration:generate -- -n DescriptiveName

# Or create an empty migration
npm run migration:create -- -n DescriptiveName
```

This creates a timestamped file in `apps/api/migrations/`:

```
1706889600000-DescriptiveName.ts
```

### 2. Write the Migration

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class DescriptiveName1706889600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE merchants ADD COLUMN new_field VARCHAR(255);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE merchants DROP COLUMN new_field;
    `);
  }
}
```

### 3. Test Locally

```bash
# Run migrations locally
npm run migration:run --workspace=apps/api

# Verify the change
npm run typeorm -- schema:log

# If needed, rollback
npm run migration:revert --workspace=apps/api
```

### 4. Commit and PR

- Include migration file in your PR
- Migration will be reviewed with code changes
- CI will validate migration syntax

### 5. Production Deployment

Migrations run automatically in CI/CD:

```yaml
# .github/workflows/deploy.yml
- name: Run Migrations
  run: npm run migration:run --workspace=apps/api
  env:
    DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
```

---

## ❌ Prohibited Practices

### 1. Direct ALTER Statements

```bash
# ❌ NEVER DO THIS
psql $DATABASE_URL -c "ALTER TABLE merchants ADD COLUMN temp VARCHAR(255);"
```

### 2. Hardcoded Connection Strings in Scripts

```javascript
// ❌ NEVER DO THIS
const client = new Client({
  connectionString: "postgresql://user:pass@neon.tech/db",
});

// ✅ DO THIS INSTEAD
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});
```

### 3. One-off SQL Files

```bash
# ❌ NEVER DO THIS
psql $DATABASE_URL < fix_something.sql
```

### 4. Using pgAdmin/DBeaver for Schema Changes

All schema changes must be scripted and version-controlled.

---

## ✅ Best Practices

### 1. Use Descriptive Migration Names

```bash
# ✅ Good
AddPaymentStatusToOrders
CreateInventoryVariantsTable
AddIndexOnCustomerPhone

# ❌ Bad
migration1
fix
update
```

### 2. Keep Migrations Atomic

One logical change per migration:

```typescript
// ✅ Good: Single focused change
export class AddPaymentStatusToOrders {
  async up(qr) {
    await qr.query(`ALTER TABLE orders ADD COLUMN payment_status VARCHAR(50)`);
  }
}

// ❌ Bad: Multiple unrelated changes
export class UpdateEverything {
  async up(qr) {
    await qr.query(`ALTER TABLE orders ADD COLUMN payment_status VARCHAR(50)`);
    await qr.query(`CREATE TABLE new_feature (...)`);
    await qr.query(`DROP TABLE old_stuff`);
  }
}
```

### 3. Always Write Down Migrations

Every `up()` must have a corresponding `down()`:

```typescript
async up(qr) {
  await qr.query(`ALTER TABLE orders ADD COLUMN status VARCHAR(50)`);
}

async down(qr) {
  await qr.query(`ALTER TABLE orders DROP COLUMN status`);
}
```

### 4. Test Rollbacks

```bash
npm run migration:revert --workspace=apps/api
npm run migration:run --workspace=apps/api
```

### 5. Use Transactions for Multi-Statement Migrations

```typescript
async up(qr) {
  await qr.startTransaction();
  try {
    await qr.query(`ALTER TABLE merchants ADD COLUMN tier VARCHAR(50)`);
    await qr.query(`UPDATE merchants SET tier = 'STARTER' WHERE tier IS NULL`);
    await qr.commitTransaction();
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  }
}
```

---

## CI/CD Integration

### Pre-merge Checks

```yaml
# .github/workflows/ci.yml
- name: Check for hardcoded credentials
  run: |
    if grep -rE "postgresql://.*@.*neon\.tech" scripts/ apps/; then
      echo "❌ Found hardcoded database credentials!"
      exit 1
    fi
```

### Migration Validation

```yaml
- name: Validate migrations
  run: |
    npm run migration:run --workspace=apps/api --dry-run
```

### Production Deployment

```yaml
deploy:
  steps:
    - name: Run migrations
      run: npm run migration:run --workspace=apps/api
      env:
        DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
```

---

## Emergency Procedures

### If You Need an Urgent Schema Fix

1. **Create a hotfix migration** (don't bypass the process)
2. **Fast-track PR review** with `hotfix` label
3. **Deploy immediately** after approval

### If a Migration Fails in Production

1. **Don't panic** - the transaction will have rolled back
2. **Check logs** for the specific error
3. **Fix the migration** locally
4. **Test the fix** in staging
5. **Redeploy** with fixed migration

### Rolling Back a Bad Migration

```bash
# Revert last migration
npm run migration:revert --workspace=apps/api

# Or revert to specific migration
npm run typeorm -- migration:revert -t 1706889600000
```

---

## Scripts Directory Policy

The `scripts/` directory is for **read-only utilities only**:

- ✅ Schema inspection (`check-*.js`)
- ✅ Data analysis (`list-*.js`)
- ✅ Testing utilities
- ❌ Schema modifications
- ❌ Data migrations

All scripts must use `process.env.DATABASE_URL` - no hardcoded credentials.

---

## Contacts

- **DBA/DevOps**: Escalate migration issues
- **Security**: Report any hardcoded credentials immediately
- **Tech Lead**: Approve emergency schema changes

---

**Remember: The few extra minutes to create a proper migration saves hours of debugging production issues.**
