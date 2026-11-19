/**
 * Input state that the simulation reads. Desktop keys and two independent touch regions both
 * write into the same Controls object.
 */
export type Controls = {
  /** -1..1 held movement from keys. */
  moveAxis: number;
  /** Accumulated relative drag in world units, consumed by the sim each step. */
  dragDelta: number;
  /** Set true for one step when a swing is requested. */
  swingPressed: boolean;
};

export function makeControls(): Controls {
  return { moveAxis: 0, dragDelta: 0, swingPressed: false };
}

/**
 * Left half: relative horizontal drag (first touch never teleports; release leaves the batter).
 * Right half: touch-down anywhere swings instantly. Each pointer is tracked independently, so a
 * left thumb can keep dragging while the right thumb taps.
 */
export class TouchInput {
  dragId: number | null = null;
  lastX = 0;
  swingIds = new Set<number>();

  /** Returns 'swing' if this touch should swing right now, 'drag' if it started a drag, else null. */
  down(id: number, x: number, width: number): 'swing' | 'drag' | null {
    if (x < width / 2) {
      if (this.dragId !== null) return null;
      this.dragId = id;
      this.lastX = x;
      return 'drag';
    }
    this.swingIds.add(id);
    return 'swing';
  }

  /** Pixels moved since the last event for the drag pointer (0 for any other pointer). */
  move(id: number, x: number): number {
    if (this.dragId !== id) return 0;
    const d = x - this.lastX;
    this.lastX = x;
    return d;
  }

  up(id: number) {
    if (this.dragId === id) this.dragId = null;
    this.swingIds.delete(id);
  }

  clear() {
    this.dragId = null;
    this.swingIds.clear();
  }
}

export const KEY_LEFT = new Set(['a', 'arrowleft']);
export const KEY_RIGHT = new Set(['d', 'arrowright']);
