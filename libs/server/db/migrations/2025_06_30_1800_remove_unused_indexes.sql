-- Remove unused database indexes to improve performance
-- This migration removes indexes that are not used by any queries in the application

-- Analysis of actual query patterns shows these indexes are not used:

-- 1. currencies.type - Never queried by type
DROP INDEX IF EXISTS idx_currencies_by_type;

-- 2. exchange_rates.pair - Table exists but no queries use it
DROP INDEX IF EXISTS idx_exchange_rates_by_pair;

-- 3. groups.currency_id - Never joined or queried by currency
DROP INDEX IF EXISTS idx_groups_by_currency;

-- 4. accounts.currency_id - Never joined or queried by currency  
DROP INDEX IF EXISTS idx_accounts_by_currency;

-- 5. categories.type - Never queried by type
DROP INDEX IF EXISTS idx_categories_by_type;

-- 6. transactions.created_by - Never queried by creator
DROP INDEX IF EXISTS idx_transactions_by_creator;

-- 7. transactions.original_currency_id - Never queried by original currency
DROP INDEX IF EXISTS idx_transactions_by_original_currency;

-- 8. transactions.type - Never queried by type
DROP INDEX IF EXISTS idx_transactions_type;

-- 9. transactions_to_tags.tag_id - Junction table not used in queries
DROP INDEX IF EXISTS idx_transactions_to_tags_by_tag;

-- 10. transactions_to_tags.transaction_id - Junction table not used in queries  
DROP INDEX IF EXISTS idx_transactions_to_tags_by_transaction;

-- Keep these indexes as they ARE used:
-- - idx_currencies_by_code (used for currency lookups)
-- - idx_groups_sync_retrieval (used for sync operations)
-- - idx_memberships_by_user_group (used for permission checks)
-- - idx_memberships_by_group (used for group membership queries)
-- - idx_accounts_sync_retrieval (used for sync operations)  
-- - idx_categories_by_group (used for category queries scoped by group)
-- - idx_transactions_sync_retrieval (used for sync operations)
-- - idx_transactions_by_group (used for transaction queries scoped by group)
-- - idx_transactions_by_account (used for account transaction queries)
-- - idx_transactions_linked_transaction_code (used for transfer queries)
-- - idx_transactions_by_timestamp (used for transaction ordering)
