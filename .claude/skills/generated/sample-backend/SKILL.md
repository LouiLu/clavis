---
name: sample-backend
description: "Skill for the Sample-backend area of platform-service. 3 symbols across 1 files."
---

# Sample-backend

3 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `apps/`
- Understanding how main, getenv, writeJSON work
- Modifying sample-backend-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/sample-backend/main.go` | main, getenv, writeJSON |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `main` | Function | `apps/sample-backend/main.go` | 9 |
| `getenv` | Function | `apps/sample-backend/main.go` | 31 |
| `writeJSON` | Function | `apps/sample-backend/main.go` | 39 |

## How to Explore

1. `gitnexus_context({name: "main"})` — see callers and callees
2. `gitnexus_query({query: "sample-backend"})` — find related execution flows
3. Read key files listed above for implementation details
