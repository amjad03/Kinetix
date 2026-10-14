# Record depth kit

Every list in the ERP should let people add, view, edit, delete (to a recycle bin), restore, act in bulk, import,
export, move, reorder, duplicate, see history and save views. The record depth kit gives a module all of that from
one description of its list (an "entity"). This page is the recipe for applying it to a module, and the checklist a
module must pass.

Reference modules (copy the nearest one):

| Entity | API description | ERP page |
| --- | --- | --- |
| `students` | `services/api/src/students/students.records.ts` | `apps/erp/src/app/(dashboard)/students/page.tsx`, `components/students/StudentRecords.tsx` |
| `staff` | `services/api/src/hr/staff.records.ts` | `app/(dashboard)/hr/page.tsx`, `components/hr/StaffDirectory.tsx` |
| `departments` | `services/api/src/departments/departments.records.ts` | `app/(dashboard)/departments/page.tsx`, `components/department/DepartmentRecords.tsx` |
| `programmes`, `classes`, `subjects` | `services/api/src/admin/structure.records.ts` | `app/(dashboard)/academics/structure/page.tsx`, `components/academics/StructureRecords.tsx` |

Students is the fullest template: lifecycle-aware status and class changes, move between classes and programmes with
a reason, a module action (bulk promote), import through the existing importer, extra columns joined on the page.

## How it fits together

**API** (`services/api/src/records/`)

- `entity.ts`: the `RecordEntity` description and the `RecordRegistry`. A module registers its entity from a
  provider's `onModuleInit`; `RecordsModule` is global.
- `records.controller.ts`: `/v1/records/:entity` for every entity:
  - `GET /` list: `?q&sort=<key>:<asc|desc>&page&pageSize&f.<filter>=<value>` → `{ rows, total, page, pageSize }`
  - `GET /meta`: fields (with choices), filters, sorts, export columns, move targets, actions, import columns, `can`
  - `GET /:id`, `POST /` (add), `PATCH /:id` (edit), `DELETE /:id` (to the bin; answers `{ binId, label, rows }` for Undo)
  - `POST /:id/duplicate`, `POST /:id/move` `{ to, reason? }`, `POST /reorder` `{ ids }`
  - `POST /bulk` `{ op: update|delete|move|action, target: { ids } | { all: true, query, except }, fields | to,reason | action,params, atomic? }`
    → a report per record. Each record runs in its own savepoint; `atomic: true` undoes everything on any failure.
  - `GET /:id/history`: the audit trail with each field's value before and after
  - `GET /export?format=csv|xlsx&columns&ids&except` plus the list's own search, filters and sort
  - `GET /import/template` (Excel: headers, drop-down lists, example row, instructions), `POST /import?mode=upsert|insert`
    (multipart `file`; checks every row, saves nothing, keeps the batch), `POST /import/:batchId/commit` `{ skipErrors }`,
    `GET /import/:batchId`
- `recycle-bin.*`: `/v1/recycle-bin` list (by module/kind, search), `POST restore|purge { ids }`, `POST /:id/restore`,
  `DELETE /:id`, `GET|PUT /settings { retentionDays }` (default 90). The daily job `records.purge-bin` removes older entries.
- `snapshot.ts`: the bin's engine. Before a delete it reads the foreign keys from the catalog and keeps, as JSON, the
  row, every row the database will cascade away (any depth) and every link it will set to null. Restore puts them
  back with their original ids. A delete refused by a restricting key answers `409 RECORD_IN_USE` naming the table;
  a restore whose parent was deleted answers `409 RESTORE_PARENT_MISSING` naming the record to restore first
  (restoring both in one request does them in the right order). Sessions, one-time codes and device tokens never come back.
- `saved-views.controller.ts`: `/v1/saved-views?page=<entity>`; a view is the person's own, optionally shared with roles.
- `common/audit.ts`: pass `before`/`after` (and optionally `fields`) and the entry stores the field-by-field `changes`
  that History shows. Every kit write is audited as `<subjectType>.<verb>` with the record's id.

**ERP**

- `components/ui/DataTable.tsx` (the one table; `components/DataTable.tsx` re-exports it with `TableFrame`):
  in-memory or `server` mode, selection (row, page, every matching row), sticky bulk bar, column chooser and density,
  row actions menu, drag-handle and keyboard reorder, sticky header, saved-views slot, CSV/Excel export.
  Selection logic is in `lib/selection.ts` (unit-tested).
- `components/records/RecordsTable.tsx` wires a `DataTable` to an entity: URL list state, Add/Edit (`RecordForm`),
  Duplicate, Move (`MoveDialog`), History (`RecordHistoryDrawer`), Delete with Undo, bulk edit (`BulkEditDialog`),
  bulk move, module actions and bulk delete with type-to-confirm (`ConfirmDialog`), per-record reports
  (`BulkReportDialog`), Import (`ImportWizard`), Export, reorder and `SavedViews`.
- `app/(dashboard)/records-actions.ts`: the server actions (any entity). `app/api/records/route.ts`: exports and templates.
- `lib/records.ts` (URL state, API shapes), `lib/records-server.ts` (`loadRecords` for pages).
- Recycle bin page: `app/(dashboard)/recycle-bin/page.tsx` (Settings → Recycle bin).
- Strings: `i18n/messages/records.ts` (en, hi, kn).

## Recipe: apply the kit to a module

1. **Describe the entity** next to the module's controller, e.g. `src/library/books.records.ts`, as a provider:

   ```ts
   @Injectable()
   export class BookRecords implements OnModuleInit {
     constructor(private readonly registry: RecordRegistry) {}
     onModuleInit() {
       this.registry.register({
         key: 'books', module: 'library', table: libraryBooks, subjectType: 'library_book',
         roles: { read: LIBRARY_ROLES, write: LIBRARY_ROLES },
         label: (r) => String(r.title),
         list: { select: { id: libraryBooks.id, title: libraryBooks.title, … }, search: [libraryBooks.title], filters: { … }, sorts: { title: libraryBooks.title }, defaultSort: { id: 'title', dir: 'asc' } },
         fields: { title: { label: 'Title', type: 'text', schema: Text(200), column: libraryBooks.title, required: true }, … },
         columns: [{ key: 'title', header: 'Title' }, …],
         // as the module needs: move, order, duplicate, remove.guard / remove.dependents, import, actions
       });
     }
   }
   ```

   - `subjectType` must be the audit subject type the module already writes, so History includes its own entries.
   - `list.scope` limits what a role sees (a head of department, a teacher's classes).
   - A field whose value must go through the module's rules uses `apply` (students' status goes through the lifecycle
     service); a value elsewhere than the root table uses `apply` too (staff department → `staff_profiles`).
   - `move.apply` when the module keeps its own history of moves; otherwise `move.column`.
   - `order` needs a `sort_order` column (add it in the module's migration, backfilled in name order).
   - `import.run` uses `eachRow` from `records/import.ts`, or the existing bulk importer (`ImportService.applyRows`).
   - Table names in the bin come from the database, so nothing else is needed for delete and restore. Add
     `remove.guard` for business rules ("you cannot delete your own account") and `remove.dependents` for rows linked
     without a foreign key.
2. **Register the provider** in the module's `providers`.
3. **Test** in the module's e2e file (copy `test/record-kit.e2e.spec.ts`): list/filter/sort, add and edit with history,
   delete → bin → restore (linked rows back), in-use refusal, bulk with a failing row, move, import check and commit,
   export, reorder, permissions and another tenant's view.
4. **ERP page**: load with `loadRecords('<entity>', searchParams)` and render a client component that gives
   `RecordsTable` its columns (`sortKey` = an API sort key; `defaultHidden` for optional columns) and, as needed,
   `rowHref` or `onView`, `extraRowActions`, `extraBulkActions`, `toolbar`, `empty`, `reorderScope`, `extraParams`.
5. **Strings**: add to `i18n/messages/records.ts` (en, hi, kn): `rk.entity.<e>`, `rk.one.<e>`, `rk.module.<module>`,
   `rk.f.<e>.<field>`, `rk.filter.<e>.<filter>`, `rk.o.<e>.<key>.<value>` for fixed choices, `rk.move.<e>`,
   `rk.action.<e>.<action>`, `rk.help.<e>.<field>`, and the page's column headers. Without a key the API's English shows.
6. Run `npx tsc --noEmit -p .` and the module's e2e in `services/api`; `npx tsc --noEmit -p .` and `npx vitest run` in `apps/erp`.

## Checklist (a module is done when every line holds)

- [ ] **Add**: the Add button opens the form from the entity's fields; required fields are enforced by the API.
- [ ] **View**: a row opens the record (its page via `rowHref`, or a panel via `onView`); Enter does the same.
- [ ] **Edit**: the form shows current values and sends only what changed; History shows before and after.
- [ ] **Delete → bin**: delete asks first, moves the record and what belongs to it to the recycle bin, offers Undo.
- [ ] **Restore**: from the bin (single and bulk), with linked rows and links back; a missing parent is explained.
- [ ] **Bulk edit**: fields marked `bulk` can be set for the selection, including every matching row.
- [ ] **Bulk delete**: type-to-confirm; records still in use are reported, the rest go to the bin.
- [ ] **Move**: where the record belongs somewhere (class, department, category), single and bulk, with a reason if the module records one.
- [ ] **Reorder**: where the list has a manual order; drag or keyboard; within its group (`reorderScope`).
- [ ] **Duplicate**: where a copy makes sense; unique values get a free "(copy)" name or code.
- [ ] **Import template**: the Excel template has every column, drop-downs for fixed and known values, an example row.
- [ ] **Import**: check shows row errors before anything is saved; commit all or only the good rows; report downloadable.
- [ ] **Export**: CSV and Excel of the filtered list or the selection.
- [ ] **History**: every change of the record, who and when, field by field.
- [ ] **Saved views**: save, update, default, share with roles; the list state is in the URL.
- [ ] **Search, filter, sort, paginate** on the server; filters for the fields people narrow by.
- [ ] **Empty state**: a first-run message (with what to do) when the list has no records at all.
- [ ] **Permissions**: `roles.read` and `roles.write` match the module's own endpoints; `list.scope` hides what a role may not see; module actions have their own `roles` when narrower.
- [ ] **Audit**: kit writes are audited automatically; module code that changes records outside the kit passes `before`/`after` to `audit()`.
- [ ] **Tests**: API e2e as in step 3, including another institution seeing nothing; ERP strings in en, hi and kn.
- [ ] **Keyboard**: rows reachable with Tab and arrows, Space selects, Shift+F10 opens row actions, "/" searches.
