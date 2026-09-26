# Pass 1G — Live Auth and Read Model

**Merged:** 2026-09-26 05:13:50 UTC  
**Local:** 2026-09-26 07:13:50 SAST  
**PR:** #12  
**Merge commit:** `d576f84e4977ee4415c148f20e120bcaf05f8be1`

Established:

- live Supabase session restoration
- server-authorized `whoAmI` gating
- fail-closed authorization lifecycle
- authenticated dashboard/read-model loading
- live Today, Work, Repairs, Schedule and Search state
- live Job, Task and Repair detail reads
- strict aggregate/read-model validation
- stale-session and account-rollover clearing
- hardened CORS and browser/server boundary checks

State after milestone:

The mobile application stopped being a fixture-only shell and became an authenticated read client over Elara's durable operational model.
