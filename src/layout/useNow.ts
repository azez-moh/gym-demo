import { useDemo } from '../data/store';

/** The simulated clock (moves on the 10 s data tick), so time labels match the data. */
export function useNow(): Date {
  return useDemo().now;
}
