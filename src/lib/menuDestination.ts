export const resolveMenuItemDestination = (
  itemDestination: string | null | undefined,
  categoryDestination: string | null | undefined,
): string | null => itemDestination?.trim() || categoryDestination?.trim() || null;
