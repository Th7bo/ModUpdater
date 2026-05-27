---
name: feedback-docker-local-db
description: User prefers docker-compose for managing local development databases, not bare docker run commands
metadata:
  type: feedback
---

Use `docker compose up -d db` (or similar compose service) to start local databases for development and testing. Do not use bare `docker run` commands to spin up throwaway containers.

**Why:** User explicitly rejected a `docker run` command and asked for docker-compose instead.

**How to apply:** Whenever a local database or service is needed for development, testing, or any local workflow — create or reference a `docker-compose.yml` service rather than issuing a `docker run` command.
