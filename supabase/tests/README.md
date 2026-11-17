# Permission tests

Run against a throwaway local Postgres 15+ (never against production):

```bash
createdb bnc_test
psql -d bnc_test -f supabase/tests/00_supabase_stub.sql      # fakes Supabase's auth schema
psql -d bnc_test -v ON_ERROR_STOP=1 -f supabase/migrations/0001_network.sql
psql -d bnc_test -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql -d bnc_test -f supabase/tests/10_rls_test.sql            # each line prints what to expect
```

Every `\echo` line says the expected result; compare with what follows it.
