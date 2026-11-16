# Statement fixtures

Every file here is synthetic: written by hand for the bank statement import tests, with made-up
names, accounts, references and amounts, in the shape of `@spy4x/bank-statements`' own fixtures.
None is, or is derived from, a real bank statement, and a real one is never committed.

| File                  | Format                                              | Rows saved |
| --------------------- | --------------------------------------------------- | ---------- |
| `signed.csv`          | CSV of the built-in signed-amount profile, balances | 3          |
| `statement.ofx`       | OFX 1, closing balance                              | 2          |
| `statement.qif`       | QIF, no balances                                    | 2          |
| `camt053.xml`         | CAMT.053, opening and closing balance, one pending  | 2          |
| `statement.mt940.sta` | MT940 in a SWIFT envelope, opening and closing      | 2          |

`signed.csv` holds the same grocery payment twice on one day, so a first import must save both.
