Refactoring to Dexie.js for Offline-First Data Management

This guide outlines the conceptual and code changes needed to transition your Preact application from an in-memory array-based data store to a persistent IndexedDB solution using Dexie.js. 

This approach enables offline-first functionality, efficient real-time synchronization, and powerful client-side querying.

1. The Case for Dexie.js
With thousands of items and the need for offline access, real-time synchronization via WebSockets, and complex filtering/sorting, relying solely on in-memory arrays becomes inefficient.

Why Dexie.js?
Persistence: Data is stored in IndexedDB, surviving browser refreshes and tab closures, enabling true offline access.
Performance: Dexie.js provides a clean, promise-based API over IndexedDB, allowing you to leverage IndexedDB's native indexing and querying capabilities. This means filtering, sorting, and pagination can often be performed directly by the database engine, rather than in JavaScript memory after fetching all data. This is a significant performance boost for large datasets.
Reactive Queries: When integrated with Preact Signals, Dexie can automatically push updates to your UI whenever the underlying data changes, maintaining a real-time experience.
Efficient Mutations: Adding, updating, or deleting single records is highly optimized (O(1) average time complexity for primary key operations).
Synchronization: It becomes the reliable local "source of truth," against which your WebSocket diffs are applied.

2. Core Database Setup (src/db.ts) 
This file defines your IndexedDB schema and provides the Dexie instance, along with a helper for reactive signals.
```typescript
// src/db.ts
import Dexie, { type Table } from 'dexie';
import { effect, signal } from '@preact/signals';

// Extend Dexie to define your database structure
export class MyFinanceAppDB extends Dexie {
  // Declare your tables. The string defines the schema:
  // '&id': 'id' is the unique primary key.
  // Other fields are indexed for efficient querying (e.g., filtering, sorting, lookup).
  accounts!: Table<Account, string>; // Table of Account objects, primary key 'id' (string) - use jsr:@std/ulid

  constructor() {
    super('MyFinanceAppDB'); // Your database name
    this.version(1).stores({
      accounts: '&id, groupId, name, currencyId, status, createdAt', //etc other fields
    });
  }
}

// Instantiate the database
export const db = new MyFinanceAppDB();

/**
 * Creates a Preact Signal that reflects the live results of a Dexie query.
 * The signal will automatically update whenever the data in the database changes
 * that matches the given query function.
 *
 * @param queryFn A function that returns a Promise for the data you want to query from Dexie.
 * This function will be re-executed if any signals it accesses change.
 * @param initialValue An initial value for the signal while the query is loading.
 * @returns A Preact Signal containing the query results.
 */
export function createDexieLiveSignal<T>(queryFn: () => Promise<T[]>, initialValue: T[] = []): Signal<T[]> {
  const liveSignal = signal<T[]>(initialValue);

  // `effect` in Preact Signals automatically re-runs if any signals accessed within it change.
  // Dexie's `.subscribe()` method provides the real-time updates from the database.
  effect(() => {
    // The query function itself might access other signals (e.g., filter, sort),
    // causing this effect to re-run and re-subscribe with a new query.
    const subscription = queryFn().subscribe({
      next: (result: T[]) => {
        liveSignal.value = result; // Update the signal's value with the new data
      },
      error: (error: any) => {
        console.error("Dexie Live Query Error:", error);
        // Handle error: e.g., set an error state or fall back to initial value
      },
    });

    // Cleanup function: Unsubscribe from Dexie's live query when the effect is re-run or unmounted.
    return () => {
      subscription.unsubscribe();
    };
  });

  return liveSignal;
}
```

3. Centralized State Management (state/account.ts)
This module will now be the single point of contact for data operations and will expose reactive signals for components to consume. It encapsulates the interaction with Dexie and manages filtering, sorting, and pagination logic.

```typescript
// state/account.ts
import { db, type Account, createDexieLiveSignal } from '../src/db.ts';
import { signal, computed } from '@preact/signals';

// Assuming ItemStatus and group.selectedId are available.
// If not, declare or import them as needed:
enum ItemStatus { ACTIVE, ARCHIVED, DELETED } // Example declaration
declare const group: { selectedId: { value: string | undefined } }; // Example for group selection

// --- Filter, Sort, and Pagination Signals (Managed by State) ---
export const filterSearch = signal("");
export const filterCurrency = signal<number | null>(null);
export const filterStatus = signal<ItemStatus>(ItemStatus.ACTIVE);

export const sortKey = signal<keyof Account>("createdAt");
export const sortDirection = signal<"asc" | "desc">("asc");

export const currentPage = signal(1); // Current page for pagination
const ITEMS_PER_PAGE = 20; // Number of items per page

// --- Core Data Operations (Interacting with Dexie.js) ---
export const account = {
  // Expose signals for UI controls (read-only from UI perspective for direct access)
  filter: {
    search: filterSearch,
    currency: filterCurrency,
    status: filterStatus,
  },
  sort: {
    by: sortKey,
    direction: sortDirection,
  },
  pagination: {
    currentPage: currentPage,
    itemsPerPage: ITEMS_PER_PAGE,
    // totalItems and totalPages could be added as computed signals here if needed
  },

  /**
   * The main reactive signal for the filtered, sorted, and paginated list of accounts.
   * This signal updates automatically when any of the filter, sort, or pagination signals change,
   * or when the underlying Dexie database changes.
   */
  list: createDexieLiveSignal<Account>(() => {
    const search = filterSearch.value;
    const currency = filterCurrency.value;
    const status = filterStatus.value;
    const sortBy = sortKey.value;
    const direction = sortDirection.value;
    const offset = (currentPage.value - 1) * ITEMS_PER_PAGE;

    // --- Build Dexie Query for Filtering, Sorting, and Pagination on DB Side ---
    let collection = db.accounts.toCollection();

    // 1. Apply primary filters that can use indexes (e.g., `where` clauses)
    if (group.selectedId.value) {
      collection = collection.where('groupId').equals(group.selectedId.value);
    }

    // 2. Apply other filters. `and()` chains conditions. `filter()` is used for complex conditions
    //    or when fields are not indexed for direct `where` calls (e.g., `name.toLowerCase().includes`).
    if (search) {
      // Filtering with 'includes' is typically done in memory after initial query or via `and()`
      collection = collection.and(acc => acc.name.toLowerCase().includes(search.toLowerCase()));
    }
    if (currency !== null) {
      collection = collection.and(acc => acc.currencyId === currency);
    }
    if (status !== undefined) {
      collection = collection.and(acc => acc.status === status);
    }

    // 3. Apply sorting (on the database side for indexed fields)
    // Dexie's `.orderBy()` is very powerful for indexed field sorting.
    let orderedCollection = collection.sortBy(sortBy);
    if (direction === "desc") {
      orderedCollection = orderedCollection.reverse();
    }

    // 4. Apply pagination (on the database side)
    orderedCollection = orderedCollection.offset(offset).limit(ITEMS_PER_PAGE);

    // Return the promise from the Dexie query
    return orderedCollection.toArray();
  }),

  // --- CRUD Operations (Interacting with Dexie.js Directly) ---

  /**
   * Adds a new account to the database (optimistic UI).
   */
  add: async (newAccount: Account) => {
    try {
      await db.accounts.put(newAccount); // 'put' acts as upsert (add or update)
      console.log('Account added/updated locally:', newAccount.id);
      // TODO: Send newAccount to backend via WebSocket or API call.
    } catch (error) {
      console.error('Error adding account locally:', error);
    }
  },

  /**
   * Edits an existing account in the database.
   */
  edit: async (updatedAccount: Account) => {
    try {
      await db.accounts.put(updatedAccount);
      console.log('Account updated locally:', updatedAccount.id);
      // TODO: Send updatedAccount to backend via WebSocket or API call.
    } catch (error) {
      console.error('Error updating account locally:', error);
    }
  },

  /**
   * Deletes an account from the database by its ID.
   */
  delete: async (accountId: string) => {
    try {
      await db.accounts.delete(accountId);
      console.log('Account deleted locally:', accountId);
      // TODO: Send deletion request to backend via WebSocket or API call.
    } catch (error) {
      console.error('Error deleting account locally:', error);
    }
  },

  /**
   * Fetches a single account by ID from the local database.
   * Useful for detail pages or editing forms.
   */
  getById: async (accountId: string): Promise<Account | undefined> => {
    return await db.accounts.get(accountId);
  },

  /**
   * Handles real-time events from the WebSocket, applying changes directly to Dexie.
   * This keeps the local database in sync with backend/other devices.
   * (Your existing WebSocket listener should call this function with event data).
   */
  onWebsocketEvent: async (event: { type: 'created' | 'updated' | 'deleted', payload: Account | { id: string } }) => {
    try {
      switch (event.type) {
        case 'created':
        case 'updated':
          const accPayload = event.payload as Account;
          await db.accounts.put(accPayload); // Upsert the account received from WS
          console.log(`WS: Account ${event.type} locally:`, accPayload.id);
          break;
        case 'deleted':
          const { id: deletedId } = event.payload as { id: string };
          await db.accounts.delete(deletedId); // Delete the account received from WS
          console.log(`WS: Account deleted locally:`, deletedId);
          break;
        default:
          console.warn('Unknown WebSocket event type:', event.type);
      }
    } catch (error) {
      console.error('Error processing WebSocket event locally:', error);
      // Implement conflict resolution here if needed (e.g., if local version differs from WS version).
    }
  },

  /**
   * (Optional) Method to initially load or re-sync all accounts from the backend.
   * Useful for initial app load or manual full refresh.
   */
  loadAllFromBackend: async (allAccounts: Account[]) => {
    try {
      await db.accounts.clear(); // Clear existing data if this is a full sync
      await db.accounts.bulkAdd(allAccounts); // Add all new accounts in one transaction
      console.log(`Loaded ${allAccounts.length} accounts from backend.`);
    } catch (error) {
      console.error('Error loading all accounts from backend:', error);
    }
  }
};
```

4. UI Component Interaction (components/accounts/list.tsx)The component's role simplifies: it consumes the already filtered, sorted, and paginated account.list signal and dispatches UI actions (like changing filters or sorting) by directly setting the signals exposed by state/account.ts.
```typescript
// components/accounts/list.tsx
import { account } from "../../state/account.ts"; // Import the refactored account service
import { useComputed } from "@preact/signals"; // Assuming useComputed is available
// Assuming ItemStatus and ItemStatusUtils are available globally or imported
enum ItemStatus { ACTIVE, ARCHIVED, DELETED }
class ItemStatusUtils {
    static matches(acc: Account, status: ItemStatus): boolean {
        // Implement your actual logic here
        return acc.status === status;
    }
}


export function AccountList() {
  // Filter, sort, and pagination signals are now consumed directly from the 'account' state module
  const { filter, sort, pagination } = account;

  // The 'list' signal from 'account' already provides filtered, sorted, and paginated data
  const accountsToDisplay = account.list; // This is already a Signal<Account[]>

  // You might want a computed signal for total pages/items if needed for UI pagination controls
  const totalItems = useComputed(async () => {
    // This example fetches count on change, could be optimized if only total items for the *current* filter set is needed
    // Otherwise, you'd need a separate signal for the total count without pagination limits.
    // For simplicity, let's assume we want the count of currently filtered (but not paginated) items.
    const search = filter.search.value;
    const currency = filter.currency.value;
    const status = filter.status.value;
    const sortBy = sort.by.value; // Used to determine full collection after sort
    
    let collection = db.accounts.toCollection();

    if (group.selectedId.value) { // Assuming group.selectedId is globally available
      collection = collection.where('groupId').equals(group.selectedId.value);
    }
    if (search) {
      collection = collection.and(acc => acc.name.toLowerCase().includes(search.toLowerCase()));
    }
    if (currency !== null) {
      collection = collection.and(acc => acc.currencyId === currency);
    }
    if (status !== undefined) {
      collection = collection.and(acc => acc.status === status);
    }
    
    // Applying sort key to collection before count (though count won't change, for consistency)
    let orderedCollection = collection.sortBy(sortBy);
    
    return orderedCollection.count(); // Count all matching items before pagination
  });

  const totalPages = useComputed(() => {
      const items = totalItems.value;
      if (items === undefined || items === null) return 0; // Handle loading state
      return Math.ceil(items / pagination.itemsPerPage);
  });

  return (
    <>
      {/* UI Controls for Filter, Sort, and Pagination */}
      <div className="p-4 bg-gray-100 rounded-lg shadow-md mb-4 flex flex-wrap gap-4 items-center">
        {/* Search */}
        <label className="flex flex-col">
          <span className="text-sm font-medium text-gray-700">Search:</span>
          <input
            type="text"
            className="mt-1 p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            value={filter.search.value}
            onInput={(e) => filter.search.value = (e.target as HTMLInputElement).value}
            placeholder="Search accounts..."
          />
        </label>

        {/* Currency Filter */}
        <label className="flex flex-col">
          <span className="text-sm font-medium text-gray-700">Currency:</span>
          <select
            className="mt-1 p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            value={filter.currency.value || ''}
            onChange={(e) => filter.currency.value = parseInt((e.target as HTMLSelectElement).value) || null}
          >
            <option value="">All Currencies</option>
            {/* TODO: Dynamically load currency options */}
            <option value="1">USD</option>
            <option value="2">SGD</option>
          </select>
        </label>

        {/* Status Filter */}
        <label className="flex flex-col">
          <span className="text-sm font-medium text-gray-700">Status:</span>
          <select
            className="mt-1 p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            value={filter.status.value}
            onChange={(e) => filter.status.value = parseInt((e.target as HTMLSelectElement).value) as ItemStatus}
          >
            <option value={ItemStatus.ACTIVE}>Active</option>
            <option value={ItemStatus.ARCHIVED}>Archived</option>
            <option value={ItemStatus.DELETED}>Deleted</option>
          </select>
        </label>

        {/* Sort By */}
        <label className="flex flex-col">
          <span className="text-sm font-medium text-gray-700">Sort By:</span>
          <select
            className="mt-1 p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            value={sort.by.value}
            onChange={(e) => sort.by.value = (e.target as HTMLSelectElement).value as keyof Account}
          >
            <option value="createdAt">Created At</option>
            <option value="name">Name</option>
            <option value="currencyId">Currency</option>
            {/* Add more sortable fields corresponding to your Account interface */}
          </select>
        </label>

        {/* Sort Direction */}
        <label className="flex flex-col">
          <span className="text-sm font-medium text-gray-700">Direction:</span>
          <select
            className="mt-1 p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            value={sort.direction.value}
            onChange={(e) => sort.direction.value = (e.target as HTMLSelectElement).value as "asc" | "desc"}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>

      {/* Account List Display */}
      <div className="bg-white rounded-lg shadow-md p-4">
        {/* Loading / Empty State */}
        {accountsToDisplay.value.length === 0 && totalItems.value === 0 ? (
          <p className="text-gray-500 text-center">No accounts found matching your criteria.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {accountsToDisplay.value.map((acc, index) => (
              <li key={acc.id} className="py-3 flex justify-between items-center">
                <div className="flex-1">
                  <p className="text-lg font-semibold text-gray-900">{acc.name}</p>
                  <p className="text-sm text-gray-600">Currency ID: {acc.currencyId} | Status: {ItemStatus[acc.status]}</p>
                  <p className="text-xs text-gray-500">Created: {new Date(acc.createdAt).toLocaleDateString()}</p>
                </div>
                {/* Example actions: Edit, Delete buttons */}
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                    onClick={() => console.log('Edit', acc.id)} // TODO: Implement actual edit
                  >
                    Edit
                  </button>
                  <button
                    className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                    onClick={() => account.delete(acc.id)} // Use account service method
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination Controls */}
        {totalPages.value > 1 && (
          <div className="flex justify-center mt-4 gap-2">
            <button
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md disabled:opacity-50"
              onClick={() => pagination.currentPage.value--}
              disabled={pagination.currentPage.value <= 1}
            >
              Previous
            </button>
            <span className="px-4 py-2 text-gray-800">
              Page {pagination.currentPage.value} of {totalPages.value}
            </span>
            <button
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md disabled:opacity-50"
              onClick={() => pagination.currentPage.value++}
              disabled={pagination.currentPage.value >= totalPages.value}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </>
  );
}
```

5. Dexie Querying Power: Filtering, Sorting, and Pagination on the DB SideA major advantage of using Dexie.js is its ability to perform these operations directly on the IndexedDB, which is significantly more efficient for large datasets compared to fetching all data into memory and then processing it.
Conceptual Code Examples:
FilteringDexie allows various filtering methods. 
For indexed fields, where().equals(), where().above(), where().between() are highly optimized. 
For more complex conditions, and() or filter() can be chained.
```typescript
// Filtering by a specific status (using an indexed field)
// Filtering by a specific group ID (using an indexed field)
db.accounts.where('groupId').equals(someGroupId).toArray();

// Chaining multiple conditions (mix of indexed and non-indexed filters)
db.accounts
  .where('status').equals(ItemStatus.ACTIVE)
  .and(acc => acc.currencyId === someCurrencyId && acc.name.includes('savings'))
  .toArray();
Note: For text search with includes(), while and(acc => acc.name.includes(...)) works, it still requires iterating over matched records after initial indexing. For true full-text search, consider a separate dedicated client-side search library.SortingUse orderBy() on indexed fields for efficient database-side sorting. You can chain reverse() for descending order.// Sort by 'createdAt' in ascending order
db.accounts.orderBy('createdAt').toArray();

// Sort by 'createdAt' in descending order
db.accounts.orderBy('createdAt').reverse().toArray();

// Combine with filtering: first filter, then order the result
db.accounts.where('groupId').equals(someGroupId).orderBy('createdAt').reverse().toArray();
Paginationoffset() and limit() are used to implement pagination directly at the database level, fetching only the records needed for the current page.const itemsPerPage = 20;
const pageNumber = 1; // For the second page
const offset = (pageNumber - 1) * itemsPerPage;

// Fetch items for a specific page, already filtered and sorted
db.accounts
  .where('status').equals(ItemStatus.ACTIVE) // Example filter
  .orderBy('createdAt').reverse()           // Example sort
  .offset(offset)
  .limit(itemsPerPage)
  .toArray();
```
By leveraging these Dexie methods within your state/account.ts module, you offload heavy data processing to IndexedDB, ensuring your Preact application remains fast and responsive even with thousands of financial transactions.