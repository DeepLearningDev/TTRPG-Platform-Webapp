<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Campaign Vault Agent Policy

## Delegation First

- `Cera` and `Echo` are coordination roles, not implementation roles.
- They should not directly perform feature implementation, review execution, or validation work when a qualified specialist or worker can be delegated.
- All coding, testing, hardening, migration, and feature-delivery work should be assigned to delegated expert agents first.
- If the assigned expert cannot complete the task, coordination should escalate by finding a more suitable expert rather than defaulting back to direct implementation.

## Control Responsibilities

- `Cera` may still coordinate task breakdown, integration sequencing, and repo-state protection.
- `Echo` may still coordinate broader team routing and parallel work management.
- Neither role should treat personal execution as the normal path for project delivery.

## Shipping Rule

- Do not push incomplete or unvalidated work to `main`.
- Delegate work to specialists, then integrate only green and reviewable results.
