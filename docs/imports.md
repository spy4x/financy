# Imports

A person brings records into a group from a file: notes from a CSV today, bank transactions in a
product tomorrow. They upload the file, a job reads it, they match its columns to the record's
fields and check every row, then save. The valid rows are saved as one batch, and one undo removes
the whole batch.

The flow is the same for every kind of file. A kind says only which files it takes, the fields a
row maps to, and how a row is read, checked, written and removed. A product adds a kind without
touching the flow's files.

## The screens

The SPA's two pages name no kind, so a product's kind reuses them:

- `/imports/new?kind=notes` picks the file, refusing a wrong type or a file past the kind's size
  before the upload, and lists the person's recent imports of that kind in the selected group.
- `/imports/:importId` follows the import through its steps. While it is ready, the person matches
  columns to fields; every change checks all the rows again 400 ms later. Problems show on the
  20 preview rows, and the refused rows further down are listed by line, counted as a spreadsheet
  counts them (the header is line 1). The save button names the count of valid rows. A saved import
  offers the kind's list and an undo behind a confirmation.

The notes menu's "Import notes…" and the palette's "Import notes" open the picker, for an editor
or above with the notes on. The screens are `libs/ui/import-screen.tsx`, their words per kind are
`libs/ui/import-kinds.ts`, and the state is `apps/spa/src/state/imports.ts`.

The admin app's Imports module (`/imports`) lists every group's imports by status: the group, the
kind, the uploader's id, the counts, how long the read and the save took, and why one failed. It
never shows the file, its name, its cells, or the options and choices a person gave.

## The steps

| Status       | What happened                                                                   |
| ------------ | ------------------------------------------------------------------------------- |
| `READING`    | Uploaded. The read job has not finished.                                        |
| `READY`      | Read: the header, the first 20 rows, the row count and a guessed mapping.       |
| `FAILED`     | The file could not be read, or the save was refused. `failure` says why.        |
| `COMMITTING` | The person saved it. The commit job is writing the records.                     |
| `COMMITTED`  | The records are written, as one batch. Rows left out are counted.               |
| `UNDONE`     | The batch was removed the way its kind removes records (notes go to the trash). |

The file's bytes are kept in `imports.file` only while they are needed. They are dropped when the
import is saved or fails, and the nightly cleanup deletes every import not saved a day after its
upload, with its file. Saved and undone imports stay until their group or their uploader goes.

## The API

Under `/api/groups/:groupId/imports`, over HTTP only, because a file is an upload:

| Request                                              | Answer                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `POST /?kind=notes&name=notes.csv&options=…`, file   | 201 with the import. The body is the file, at most 5 MiB.      |
| `GET /`                                              | The person's own imports in the group, newest first, up to 50. |
| `GET /:importId`                                     | One import, with its preview.                                  |
| `POST /:importId/check`, `{ mapping }`               | Every refused row (up to 100, 10 errors each). Saves nothing.  |
| `POST /:importId/commit`, `{ mapping, choices? }`    | 202 with the import. The commit job saves it.                  |
| `POST /:importId/undo`                               | The import, undone, in the same request.                       |

A mapping is the field's key to the zero-based column: `{ "title": 0, "body": 1 }`. A field the
kind lacks, a column past the file and an unmapped required field are refused with 400 before
anything is queued. `options` and `choices` are optional, and a check of a kind with a review also
answers `reviews`: see "Options, review and choices" below.

Every step records a change on the group's change log (`import.created`, `import.read`,
`import.failed`, `import.committing`, `import.committed`, `import.undone`). Each member's socket
gets the hint; the import's screen then reads the import again with `GET /:importId`. Imports are
not part of the changes pull, because it would show them to every member.

Errors keep the API's one shape (`docs/api-errors.md`) and reuse reasons the apps already have
words for: `GROUP_NOT_FOUND` and `ITEM_NOT_FOUND` (404), `INVALID_REQUEST` (400, also an unknown
kind), `IMPORT_REFUSED` (422, a file that cannot be read), `FILE_TOO_LARGE` (413),
`VERSION_CONFLICT` (409, a step the import's status does not allow) and `ROLE_INSUFFICIENT` (403).
The message names the exact problem.

## Who may do what

- **Upload, check, save and undo**: a member whose role may create the kind's records. For notes,
  an editor or above.
- **See an import**: the person who started it, and the group's admins and owner. Anyone else, a
  member of another group included, gets the API's usual not-found answer.
- Every write checks the role again inside its own transaction, on the locked group. The commit
  job checks the uploader's role when it runs, so a person removed after the upload saves nothing.
- A guest account cannot upload (`docs/guests.md`). API tokens cannot import.

## A save is whole or nothing

The commit job reads the stored file again, checks every row under the saved mapping and writes
every valid row in one transaction. It also writes the batch to `import_records` and drops the
file. If the group's plan has no room, or the uploader lost their role, nothing is written and the
import is marked `FAILED` with the reason in words. Any other fault rolls the transaction back and
the job is tried again. Both jobs run only on an import in the step they finish, so a rerun writes
nothing twice.

Undo runs in the request, in one transaction. It hands the batch's ids to the kind's `undo`, which
removes them through the aggregate's own delete. An id already gone is skipped.

## Options, review and choices

Three optional parts of a kind, for files that land in one parent record or repeat what the group
has already, such as a bank statement: it belongs to one account, and a second import of it must
not save its rows twice. The notes kind uses none of them.

- **Options at the upload.** `options` is a JSON object of text, at most 2048 bytes and 20 keys,
  each key a field key such as `accountId`. A kind with `readOptions` reads them inside the
  upload's transaction, after the role check, and its answer is stored in `imports.options` and
  returned as the import's `options`. It refuses with an `ImportError`; a record of another group
  is `ITEM_NOT_FOUND`, so a stranger's ids read as missing. It is called with `{}` when the upload
  has no options, so a kind may require them. A kind without `readOptions` refuses any options
  with `INVALID_REQUEST` before anything is written. Every later step gets the stored value:
  `check` as its third argument, `review`, `commit` and `undo` on their context.
- **A review with the database.** A kind with `review(tx, values, context)` answers, for every
  checked value in order, `{ skip, suggestions }`: why a save leaves the row out (such as "Saved
  before") or `null`, and values for its choice fields, such as a category guessed from the payee.
  A check runs it in a read-only transaction and answers `reviews`: `{ row, cells, skip,
  suggestions }` for each of the first 5,000 valid rows, in file order. The cells come from the
  person's own file and are shown only to those who may see the import. The commit job runs the
  review again in its own transaction, under the group's lock, and leaves out the skipped rows,
  counted in `skippedCount` (`null` for a kind without a review). So a second save of the same file
  saves nothing, even when both previews came before either save. A review that answers a
  different number of rows than it was given is a fault in the kind and throws.
- **Choices at the save.** A field marked `choice: true` may be set per row: `choices` maps a row
  number (1 is the first row, as a string) to `{ field: value }`, at most 20 fields of at most 200
  characters per row. A choice field need not be mapped to a column; a required field cannot be
  one. A field that is not a choice, a row number below 1 and a row past the file are refused with
  400 before anything is queued. The choices are stored in `imports.choices` for the commit job,
  which hands `commit` one entry per value on `context.choices`: the review's suggestions overlaid
  with the person's choices for that row. The kind checks them itself, as it checks any value from
  outside (a category of another group is refused). A choice for a row that was refused or
  skipped is ignored.

## The batch table

`import_records` holds one row per record a save made: the import's id and the record's id. It is a
join table, not a column on each aggregate, so a product adds a kind without changing its
aggregate's table. Its rows go when the import goes; the records stay.

A kind may also stamp its records with the import's id, as the bank statement kind does with
`transactions.import_batch_id`, so its undo can check that each id it is handed is its own. The
undo still takes its ids from `import_records`.

## Add a kind

1. Write the kind with `importKind` from `libs/server/imports/import-kind.ts`. Use
   `libs/server/notes/note-import.ts` as the example. A kind has:
   - `id`: lower case words joined by `-`, never renamed once used;
   - `label`, the file endings it takes (`accept`) and its size cap (`maxBytes`, at most 5 MiB);
   - `fields`: `{ key, label, required?, choice? }`;
   - `canCreate(role)`: whether a role may create these records;
   - `read(bytes)`: the header or `null`, every row as text cells and a guessed mapping, or why
     the file cannot be read, in words. Read CSV with `@spy4x/platform/universal/csv`
     (`decodeTextFile`, `sniffCsv`, `parseCsv` with limits), never by hand, and refuse text that
     `hasUnstorableTextCharacters` (`@spy4x/platform/universal/text`) finds, such as the NUL bytes
     of a binary file, which Postgres cannot store;
   - `check(row, mapping, options)`: the value to write, or each problem in words;
   - optionally `readOptions` and `review` ("Options, review and choices" above);
   - `commit(tx, values, context)`: writes every value in the flow's transaction, stamped with
     `context.changeSequence`, checks the plan's cap from `context.allowances` and the values on
     `context.choices`, and answers the new ids;
   - `undo(tx, ids, context)`: removes them through the aggregate's own delete.
2. List it in `importKinds` (`libs/server/imports/registry.ts`).
3. Put its `id`, `accept`, `maxBytes` and `maxRows` in `libs/domain` (`ImportKindLimits`, as
   `NOTE_IMPORT_KIND`), so the server kind and the SPA's picker read the same limits. Add its case
   and words to `importKindView` (`libs/ui/import-kinds.ts`) and a link to
   `IMPORT_PATHS.new(id)` where its records are listed.
4. Test its `read` with an awkward file (another encoding, a file past its limits, formula and
   HTML cells, which stay text).

## The notes kind

Notes from a `.csv` or `.txt` file of at most 2 MiB, 5,000 rows and 50 columns. The file may be
UTF-8, UTF-16 with its byte-order mark, or a single-byte encoding (read as Windows-1252). The
delimiter is guessed. A first row that names a field (`title`, `name`, `subject`, `heading`) is the
header. A file that is not text, such as a picture renamed `.csv`, fails with "The file is not a
text file." A row needs a title; its body is optional. Undo moves the batch's notes to the trash.

With `NOTES=false` (docs/start-a-product.md) the API and the worker leave this kind out: an upload
of `kind=notes` is refused, and a notes import made before the switch fails when its job runs.

## The bank statement kind

Financy's `bank-statement` kind (`libs/server/transactions/statement-import.ts`) turns a bank's
export into entries of one account. `@spy4x/bank-statements` reads the file: CSV in a built-in bank
layout, OFX or QFX, QIF, CAMT.053 and MT940, at most 5 MiB and 5,000 entries. The format comes
from the bytes, never the file name.

- **Upload options.** `accountId`, `expenseCategoryId` and `incomeCategoryId`, all three required.
  An account or category of another household is "not found"; an expense category that is not an
  expense category, an income category that is not an income category, or a crypto account is
  refused.
- **Refused files.** A PDF, a file in no known format, a CSV whose header matches no built-in
  layout in full, a statement whose balances do not add up, and one without entries are refused
  in words. A refusal names line numbers only, never a cell, because the admin panel shows it.
- **Each row.** A statement in another currency than the account's is refused, and so is an
  amount with more decimals than the account's currency has (QIF names no currency, so its
  amounts are read in the account's). Money in becomes income, money out an expense. The payee
  and the memo are joined into the entry's memo, cut at 500 characters. The bank's own reference
  goes into `transactions.bank_reference`.
- **Review.** A row is skipped as "Saved before" when a live entry of the account has its
  reference, or else the same date, amount and memo. A row with a reference matches that way only
  an entry without one (typed by hand, or brought back from an export), since another reference
  is another payment. Each stored entry matches one row, so two equal rows in one file are both
  saved the first time. A row is skipped as "Matches a transfer"
  when a live transfer into or out of the account has its amount within 3 days.
- **Choices.** `category` per row; without one, a row takes the upload's expense or income
  category by its sign. An income may take an expense category, as a refund. Payee memory
  (below) suggests a row's category.
- **Save.** The entries carry the import's id in `transactions.import_batch_id`. A household with
  no room left on its plan, a lapsed plan included, saves none and the import fails in words.
- **Undo.** Moves exactly this batch's live entries to the deleted list, with their tombstones.

## The app history kind

Financy's `app-history` kind (`libs/server/transactions/history-import.ts`) brings a household's
history over from another finance app: Firefly III's transactions CSV, YNAB's register (the CSV, or
the "Export budget" zip) and Actual Budget's "Export data" zip. `@spy4x/bank-statements` reads the
file, at most 5 MiB and 20,000 rows. The app comes from the bytes, never the file name. There is no
screen for it yet; the API takes it like any kind.

- **Upload options.** `currency`, optional: the currency of a YNAB or Actual export, which name
  none. Left out, it is the household's base currency. Firefly III names each row's currency, and
  that wins.
- **Refused files.** A file of no app above, an export over the caps (including an Actual database
  that inflates past 32 MiB) and one with no entries are refused in words, quoting nothing from the
  file. A row the reader cannot read becomes a refused row naming its line; the rest stay.
- **One read at a time.** The API and the worker each read one such file at a time, from format
  detection to the rows, so parallel previews wait in line instead of each holding a parsed export
  in memory. Each preview still keeps its rows until it answers, and the preview route does not
  limit parallel requests yet (spy4x/seed#1091): about 6 to 8 parallel previews of a 20,000-row
  file at the 5 MiB cap can exhaust an API limited to 512 MiB.
- **Each row.** An entry or a transfer, named in the `Kind` column. An amount with more decimals
  than its currency has is refused. In a currency without decimals, YNAB's amounts are read again
  as whole numbers, since `¥1,000` would otherwise read as one yen. A foreign amount goes into the
  entry's amount and currency, and the own amount into its account amount. The payee, description
  and notes are joined into the memo. Firefly III's expense and revenue accounts are payees, never
  accounts: a row on one is refused.
- **Accounts and categories.** An account matches a live one by IBAN (kept in its aliases), then
  by name in any case; else one account is created per name, in the currency of its first row,
  with its IBAN as an alias. A category matches by name and a kind that fits the row (an income in
  an expense category is a refund); else one is created per name and kind. An entry without a
  category goes to "Uncategorized". The review suggests each row's `accountId`, `toAccountId` and
  `categoryId`, or `new`.
- **Review.** A row is skipped as "Saved before" when a live entry or transfer has its accounts,
  date, amounts and memo, each stored one matching one row. A row in another currency than its
  account is skipped with that reason, and so is a transfer whose sides are one account.
- **Save.** New accounts and categories first, then the entries (with the import's id in
  `transactions.import_batch_id`) and transfers. The household's own caps (100 accounts, 100
  categories) and its plan's are checked; past one, nothing is saved and the import fails in
  words. Tags are not imported.
- **Undo.** Moves the batch's entries and transfers to the deleted list, with their tombstones,
  then deletes the accounts and archives the categories the import created. An account or category
  that the household used since (an entry or transfer outside the batch, a budget, a recurring
  rule, a subcategory) is kept.

An export leaves both new columns out; a move between households keeps them.

### Payee memory

A household's `payee_memory` table (`libs/server/transactions/payee-memory.ts`) holds, per payee,
the category it chose last. The payee's key is `payeeKey` from `@spy4x/bank-statements` (lower
case, spacing collapsed, card and reference numbers removed), cut to 200 characters. A payee with
an empty key is never remembered or looked up.

- **Review.** Each row left to save gets the remembered category of its payee as its `category`
  suggestion, when that category is not archived and fits the row's sign. A person's own choice
  overrides it. All rows are looked up in one query, scoped to the household.
- **Save.** Each saved row with a `category` choice, suggested or picked, remembers that category
  for its payee, the last row of a payee winning, as one batched upsert in the save's
  transaction. A row that took the upload's default category remembers nothing. Cancel, a refused
  save and a preview write nothing.
- **Undo** leaves the memory as it is.
- **Elsewhere.** The memory goes into a household's export file (`payeeMemory`), moves with "move
  all data" (a payee the target household already remembers keeps the target's choice), and the
  member who chose last finds it in their data export (`finance_payee_memory`). A category is
  never deleted on its own; when the household is deleted, its memory goes with it. The admin
  Imports list never carries a payee.
