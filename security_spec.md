# Security Specification — EduScope 360 (Multi-Tenant SaaS)

## 1. Authentication & Authorization Model
- **Identity Provider**: Firebase Authentication (Google Sign-In only, `request.auth != null && request.auth.token.email_verified == true`).
- **Master Admin (SaaS Owner)**: Bootstrapped email `cmfotosport@gmail.com` (verified) OR presence in `/admins/{request.auth.uid}`.
  - Exclusively controls `/admins/{uid}`, creation/deletion of `/schools/{schoolId}`, and modifications to the global Master account (`users/usr-master`).
- **Verified Institutional Operators**: Authenticated users with verified Google email (`isVerifiedUser()`).
  - Read/write operational school data scoped by `schoolId` (`classes`, `students`, `attendance_records`, `alerts`, `interventions`, `gate_records`, `schools/{schoolId}/ocorrencias`, `schools/{schoolId}/tratativas_familia`, `schools/{schoolId}/tablets_agendamentos`, `schools/{schoolId}/module_config`, `system_data`).
  - Cannot escalate to `super_admin` or mutate `usr-master` or `/admins/{uid}`.

## 2. Data Invariants
- **Default Deny**: All unspecified paths match `/{document=**}` and return `false`.
- **Safe Document IDs**: All document IDs validated via `isValidId(id)` (non-empty string, 1..128 chars, excludes `.` and `..`, no path traversal).
- **Mandatory Tenant Binding (`schoolId`)**: Every tenant-scoped operational document must include a valid non-empty `schoolId` string (1..100 chars).
- **Subcollection Path Integrity**: Documents inside `/schools/{schoolId}/ocorrencias/{id}`, `/schools/{schoolId}/tratativas_familia/{id}`, `/schools/{schoolId}/tablets_agendamentos/{id}`, and `/schools/{schoolId}/module_config/{id}` MUST have `request.resource.data.schoolId == schoolId` (prevents cross-tenant data injection).
- **Immutable Tenant Ownership on Update**: `schoolId` cannot be altered on updates to existing tenant documents unless performed by `isMasterAdmin()`.
- **Bounded Payloads**: Strings checked for reasonable maximum lengths (`<= 200` for names/titles, `<= 10000` for narrative descriptions) to prevent storage abuse.

## 3. Red Team Verification ("Dirty Dozen" Scenarios)
1. Unauthenticated read/write on `/students`, `/users`, `/schools/{id}/ocorrencias` -> DENIED.
2. Unverified email token (`email_verified == false`) attempting read/write -> DENIED.
3. Non-master user attempting to write `/admins/{uid}` -> DENIED.
4. Non-master user attempting to create or delete `/schools/{schoolId}` -> DENIED.
5. Non-master user attempting to create/update a user with `role == 'super_admin'` or `isUniversal == true` or `userId == 'usr-master'` -> DENIED.
6. Cross-tenant injection writing `schoolId: 'school-B'` inside `/schools/school-A/ocorrencias/{id}` -> DENIED.
7. Cross-tenant hijacking attempting to change `schoolId` on an existing `/students/{id}` document -> DENIED.
8. Oversized string payload (>10,000 chars) on `descricao` or `name` -> DENIED.
9. Invalid document ID (empty or >128 chars) -> DENIED.
10. Access to arbitrary unknown collection `/secret_dump/1` -> DENIED by catch-all.
