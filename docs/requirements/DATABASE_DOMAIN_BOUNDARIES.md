# Kinetix Database Domain Boundaries

The PostgreSQL database is shared at the platform level but organized by clear domain ownership in the application.

## Suggested logical domains

1. identity
2. tenancy
3. organization
4. academics
5. curriculum
6. admissions
7. students
8. attendance
9. timetable
10. lms
11. assessment
12. obe
13. finance
14. hr
15. library
16. inventory
17. transport
18. hostel
19. canteen
20. placements
21. research
22. communication
23. content
24. knowledge
25. ai
26. analytics
27. files
28. audit
29. integrations
30. billing

## Common fields

Every tenant-scoped business table should use appropriate:

- id (UUID recommended)
- tenant_id
- institution_id where applicable
- created_at
- created_by
- updated_at
- updated_by
- version/row_version where concurrency matters
- status where lifecycle exists

Do not add tenant_id blindly to global reference tables if the entity is truly platform-global; document exceptions.

## Data lifecycle

Use soft-delete/archive only where historical integrity requires it. Financial, academic, attendance, assessment and accreditation records should generally be immutable or append-only with adjustment/version mechanisms rather than destructive edits.

## Database rules

- foreign keys for required relationships
- explicit unique constraints
- partial/conditional unique indexes where business state requires them
- indexes based on actual query paths
- migrations only; no manual production schema edits
- transaction boundaries documented for critical workflows
- RLS or application-layer tenant checks must never be bypassed by ordinary application credentials
