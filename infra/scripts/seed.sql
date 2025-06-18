INSERT INTO groups (id, name, default_currency)
VALUES (1, 'Group 1', 'USD');

INSERT INTO group_memberships (group_id, user_id, role)
VALUES (1, 1, 4); -- Owner role (GroupRole.OWNER = 4) for the group creator

INSERT INTO categories (group_id, name)
VALUES (1, 'Groceries'),
       (1, 'Household'),
       (1, 'Transport'),
       (1, 'Health'),
       (1, 'Clothing'),
       (1, 'Entertainment'),
       (1, 'Travel'),
       (1, 'Dining Out'),
       (1, 'Gifts'),
       (1, 'Subscriptions'),
       (1, 'Salary'),
       (1, 'Freelance');

INSERT INTO accounts (group_id, name, currency)
VALUES (1, 'Cash', 'USD'),
       (1, 'Revolut USD', 'USD'),
       (1, 'Revolut EUR', 'EUR');

INSERT INTO transactions (group_id, account_id, type, amount, original_currency, original_amount, category_id, created_by, memo)
VALUES (1, 1, 1, -5000, 'USD', -5000, 1, 1, 'Weekly groceries'), -- 1 = TransactionType.DEBIT
       (1, 2, 2, 20000, 'USD', 20000, 11, 1, 'Salary for May'), -- 2 = TransactionType.CREDIT
       (1, 3, 1, -15000, 'EUR', -15000, 3, 1, 'Transport expenses'), -- 1 = TransactionType.DEBIT
       (1, 1, 1, -3000, 'USD', -3000, 4, 1, 'Medical checkup'), -- 1 = TransactionType.DEBIT
       (1, 2, 2, 10000, 'USD', 10000, 12, 1, 'Freelance project payment'); -- 2 = TransactionType.CREDIT