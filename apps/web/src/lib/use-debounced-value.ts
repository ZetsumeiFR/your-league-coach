import { useEffect, useState } from "react";

/**
 * The value once it has stopped changing for `delayMs`. The first value is
 * returned at once; a burst of changes gives its last value, once.
 */
export const useDebouncedValue = <Value extends string | number>(
  value: Value,
  delayMs: number
): Value => {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
};
