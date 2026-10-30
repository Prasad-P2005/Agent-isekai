// The simulation advances in fixed steps, so the game plays the same at any frame rate.
export const STEP = 1 / 60;
const MAX_BEHIND = STEP * 5; // on a very slow machine the game runs slower instead of falling further behind

export function fixedSteps(step) {
  let owed = 0;
  return dt => {
    owed = Math.min(owed + dt, MAX_BEHIND);
    while (owed >= STEP) { step(STEP); owed -= STEP; }
  };
}
