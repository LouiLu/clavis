---
name: gateway
description: "Skill for the Gateway area of platform-service. 3 symbols across 2 files."
---

# Gateway

3 symbols | 2 files | Cohesion: 80%

## When to Use

- Working with code in `apps/`
- Understanding how NewSingleTargetProxy work
- Modifying gateway-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/gateway/cmd/gateway/main.go` | main, writeJSON |
| `apps/gateway/internal/proxy/proxy.go` | NewSingleTargetProxy |

## Entry Points

Start here when exploring this area:

- **`NewSingleTargetProxy`** (Function) — `apps/gateway/internal/proxy/proxy.go:9`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `NewSingleTargetProxy` | Function | `apps/gateway/internal/proxy/proxy.go` | 9 |
| `main` | Function | `apps/gateway/cmd/gateway/main.go` | 13 |
| `writeJSON` | Function | `apps/gateway/cmd/gateway/main.go` | 34 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Main → Config` | cross_community | 3 |
| `Main → Getenv` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Config | 1 calls |

## How to Explore

1. `gitnexus_context({name: "NewSingleTargetProxy"})` — see callers and callees
2. `gitnexus_query({query: "gateway"})` — find related execution flows
3. Read key files listed above for implementation details
