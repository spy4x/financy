/**
 * Determines if a dropdown should open upward to prevent clipping at the bottom of the viewport.
 *
 * @param index - The current item index (0-based)
 * @param totalLength - Total number of items in the list
 * @returns true if dropdown should open upward, false otherwise
 */
export function shouldDropdownOpenUp(index: number, totalLength: number): boolean {
  // Don't open upward for the first two rows to prevent clipping at the top
  // Only apply upward behavior when there are more than 2 items total
  return totalLength > 2 && index >= 2
}
