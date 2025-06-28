# Fix for Monthly Limit Validation Error

## Problem
When changing a category type from "Expense" to "Income" in the UI, the system was throwing a WebSocket error: `"monthlyLimit must be a number (was null)"`. This occurred because:

1. The backend validation schema was rejecting `null` values for `monthlyLimit`
2. The frontend was sending `null` for income categories
3. The UI wasn't clearing the monthly limit field when switching to income type

## Root Cause
The `categoryBaseSchema` in `libs/shared/types/+index.ts` defined `monthlyLimit` as:
```typescript
"monthlyLimit?": "number >= 0"
```

This allowed `undefined` but not `null` values. However, the frontend was sending `null` for income categories, causing validation failures.

## Solutions Implemented

### 1. Updated Schema Validation
**File**: `libs/shared/types/+index.ts`
```typescript
// Before
"monthlyLimit?": "number >= 0"

// After  
"monthlyLimit?": "number >= 0 | null"
```
This allows both `undefined` and `null` values for `monthlyLimit`.

### 2. Enhanced UI Behavior
**File**: `apps/web/src/routes/categories/editor.tsx`

- **Auto-clear monthly limit**: When user switches to "Income" type, the monthly limit field is automatically cleared
- **Improved form submission**: For income categories, explicitly sends `undefined` instead of `null`

```typescript
onChange={(e) => {
  const newType = parseInt(e.currentTarget.value) as CategoryType
  categoryType.value = newType
  // Clear monthly limit when switching to income type
  if (newType === CategoryType.INCOME) {
    monthlyLimit.value = ""
  }
}}
```

### 3. Optimized Data Transmission
**File**: `apps/web/src/state/category.ts`

Updated the create/update functions to conditionally include `monthlyLimit` in the payload:
- **Income categories**: `monthlyLimit` field is omitted entirely from the request
- **Expense categories**: `monthlyLimit` is included only if it has a valid value

```typescript
const payload = {
  name,
  groupId,
  type,
  ...(type === CategoryType.EXPENSE && monthlyLimit !== undefined && monthlyLimit !== null && { monthlyLimit })
}
```

## Benefits

### 1. **Improved User Experience**
- No more validation errors when switching category types
- Monthly limit field automatically clears when switching to income
- Intuitive behavior that matches user expectations

### 2. **Data Consistency**
- Income categories properly omit monthly limit data
- Cleaner API requests without unnecessary null values
- Proper handling of optional fields

### 3. **Error Prevention**
- Eliminates WebSocket validation errors
- Prevents user confusion and failed form submissions
- Maintains data integrity

## Files Modified

1. **`libs/shared/types/+index.ts`** - Updated schema to allow null values
2. **`apps/web/src/routes/categories/editor.tsx`** - Enhanced UI behavior and form handling
3. **`apps/web/src/state/category.ts`** - Optimized data transmission logic

## Testing
- All TypeScript compilation checks pass ✓
- All linting and formatting standards met ✓  
- All existing tests continue to pass ✓
- No breaking changes introduced ✓

The fix is production-ready and resolves the validation error while improving the overall user experience when managing category types.
