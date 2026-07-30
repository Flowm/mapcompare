import { describe, expect, it, vi } from "vitest";

import type { CameraState } from "./camera";
import { createSyncGroup, type SyncableMap } from "./syncGroup";

/**
 * A stand-in for maplibre's Map that reproduces the one behaviour the sync design rests on:
 * `jumpTo` fires `move` SYNCHRONOUSLY and UNCONDITIONALLY, even when the camera does not
 * change. That is what makes the echo suppression testable without a browser — and if
 * maplibre ever stopped doing it, these tests are where it would surface.
 *
 * Verified against maplibre-gl v6.0.0 `Camera#jumpTo`.
 */
function fakeMap(camera: CameraState = { center: [0, 0], zoom: 2, bearing: 0, pitch: 0, roll: 0 }) {
  const listeners = new Set<() => void>();
  const map = {
    camera: { ...camera, center: [...camera.center] as [number, number] },
    jumps: [] as CameraState[],
    unsubscribes: 0,

    getCenter: () => ({ lng: map.camera.center[0], lat: map.camera.center[1] }),
    getZoom: () => map.camera.zoom,
    getBearing: () => map.camera.bearing,
    getPitch: () => map.camera.pitch,
    getRoll: () => map.camera.roll,

    jumpTo(options: CameraState) {
      map.jumps.push({ ...options, center: [...options.center] as [number, number] });
      map.camera = { ...options, center: [...options.center] as [number, number] };
      // Unconditional, synchronous — the invariant the guard depends on.
      map.fire();
      return map;
    },

    on(_type: "move", listener: () => void) {
      listeners.add(listener);
      return {
        unsubscribe: () => {
          map.unsubscribes += 1;
          listeners.delete(listener);
        },
      };
    },

    /** Simulates a user gesture: move the camera, then emit `move` as maplibre would. */
    userMoveTo(next: Partial<CameraState>) {
      map.camera = { ...map.camera, ...next };
      map.fire();
    },

    fire() {
      // Snapshotted like maplibre's own Evented does, so a listener may unsubscribe mid-fire.
      // oxlint-disable-next-line unicorn/no-useless-spread
      for (const listener of [...listeners]) listener();
    },

    listenerCount: () => listeners.size,
  };
  return map;
}

type FakeMap = ReturnType<typeof fakeMap>;

const asSyncable = (m: FakeMap): SyncableMap => m as unknown as SyncableMap;

const AMSTERDAM: CameraState = { center: [4.893, 52.373], zoom: 16, bearing: 0, pitch: 0, roll: 0 };

describe("broadcast", () => {
  it("propagates a gesture to every peer exactly once", () => {
    const group = createSyncGroup();
    const [a, b, c] = [fakeMap(), fakeMap(), fakeMap()];
    for (const m of [a, b, c]) group.add(asSyncable(m));
    // Seeding jumps happen at add() time; ignore them.
    for (const m of [b, c]) m.jumps.length = 0;

    a.userMoveTo({ center: [4.893, 52.373], zoom: 16 });

    expect(b.jumps).toHaveLength(1);
    expect(c.jumps).toHaveLength(1);
    expect(b.jumps[0]!.center).toStrictEqual([4.893, 52.373]);
    expect(b.jumps[0]!.zoom).toBe(16);
  });

  it("does not echo back to the pane that moved", () => {
    const group = createSyncGroup();
    const [a, b] = [fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    group.add(asSyncable(b));
    a.jumps.length = 0;

    a.userMoveTo({ zoom: 9 });

    expect(a.jumps).toHaveLength(0);
  });

  it("terminates even though every jumpTo re-fires move", () => {
    // Without the guard this recurses until the stack blows. The assertion is really
    // "this returns at all"; the jump counts prove it settled after one round.
    const group = createSyncGroup();
    const maps = [fakeMap(), fakeMap(), fakeMap(), fakeMap()];
    for (const m of maps) group.add(asSyncable(m));
    for (const m of maps) m.jumps.length = 0;

    expect(() => maps[0]!.userMoveTo({ zoom: 11 })).not.toThrow();

    for (const m of maps.slice(1)) expect(m.jumps).toHaveLength(1);
  });

  it("stays consistent when two panes move in turn", () => {
    const group = createSyncGroup();
    const [a, b] = [fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    group.add(asSyncable(b));

    a.userMoveTo({ zoom: 12, center: [1, 1] });
    b.userMoveTo({ zoom: 13, center: [2, 2] });

    expect(a.camera.zoom).toBe(13);
    expect(b.camera.zoom).toBe(13);
    expect(group.camera()?.zoom).toBe(13);
  });

  it("propagates every camera axis, including roll", () => {
    const group = createSyncGroup();
    const [a, b] = [fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    group.add(asSyncable(b));
    b.jumps.length = 0;

    a.userMoveTo({ center: [10, 20], zoom: 7.5, bearing: 45, pitch: 30, roll: 15 });

    expect(b.jumps[0]).toStrictEqual({ center: [10, 20], zoom: 7.5, bearing: 45, pitch: 30, roll: 15 });
  });

  it("skips a peer that already matches, since jumpTo is not free", () => {
    const group = createSyncGroup();
    const [a, b] = [fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    group.add(asSyncable(b));
    b.jumps.length = 0;

    // Fire `move` without actually changing anything, as an idle map can.
    a.fire();

    expect(b.jumps).toHaveLength(0);
  });

  it("does not ping-pong across the bearing wrap point", () => {
    const group = createSyncGroup();
    const [a, b] = [fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    group.add(asSyncable(b));

    a.userMoveTo({ bearing: 359.9999999999 });
    b.jumps.length = 0;
    // getBearing() normalises into (-180, 180], so the peer reads back a negative near-zero.
    b.userMoveTo({ bearing: -0.0000000001 });

    expect(a.jumps.filter((j) => j.bearing !== undefined).length).toBeLessThanOrEqual(1);
  });
});

describe("add", () => {
  it("seeds a newcomer from the group camera", () => {
    const group = createSyncGroup();
    const a = fakeMap();
    group.add(asSyncable(a));
    a.userMoveTo({ center: [4.893, 52.373], zoom: 16 });

    const b = fakeMap();
    group.add(asSyncable(b));

    expect(b.camera.center).toStrictEqual([4.893, 52.373]);
    expect(b.camera.zoom).toBe(16);
  });

  it("does not let a newcomer's own camera overwrite the group", () => {
    // This is why the seeding jumpTo happens with the guard held: a fresh maplibre Map
    // starts at its constructor camera and would otherwise broadcast that to everyone.
    const group = createSyncGroup();
    const a = fakeMap();
    group.add(asSyncable(a));
    a.userMoveTo({ center: [4.893, 52.373], zoom: 16 });

    group.add(asSyncable(fakeMap({ center: [0, 0], zoom: 1, bearing: 0, pitch: 0, roll: 0 })));

    expect(a.camera.zoom).toBe(16);
    expect(group.camera()?.zoom).toBe(16);
  });

  it("takes its camera from the first member when seeded with nothing", () => {
    const group = createSyncGroup();
    group.add(asSyncable(fakeMap({ ...AMSTERDAM })));
    expect(group.camera()).toStrictEqual(AMSTERDAM);
  });

  it("applies an initial camera to the first member", () => {
    const group = createSyncGroup(AMSTERDAM);
    const a = fakeMap();
    group.add(asSyncable(a));
    expect(a.camera.zoom).toBe(16);
  });

  it("subscribes exactly one listener per member", () => {
    const group = createSyncGroup();
    const a = fakeMap();
    group.add(asSyncable(a));
    expect(a.listenerCount()).toBe(1);
  });
});

describe("unregister", () => {
  it("stops delivering to a removed pane and unsubscribes it", () => {
    const group = createSyncGroup();
    const [a, b] = [fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    const removeB = group.add(asSyncable(b));

    removeB();
    b.jumps.length = 0;
    a.userMoveTo({ zoom: 14 });

    expect(b.jumps).toHaveLength(0);
    expect(b.unsubscribes).toBe(1);
    expect(b.listenerCount()).toBe(0);
    expect(group.size()).toBe(1);
  });

  it("stops a removed pane's gestures reaching the group", () => {
    const group = createSyncGroup();
    const [a, b] = [fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    const removeB = group.add(asSyncable(b));
    removeB();
    a.jumps.length = 0;

    b.userMoveTo({ zoom: 3 });

    expect(a.jumps).toHaveLength(0);
  });

  it("survives a listener unregistering a pane mid-broadcast", () => {
    // Real case: the URL writer reacts to onChange, state changes, and Vue unmounts a pane
    // while the group is still iterating members.
    const group = createSyncGroup();
    const [a, b, c] = [fakeMap(), fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    group.add(asSyncable(b));
    const removeC = group.add(asSyncable(c));
    group.onChange(() => removeC());

    expect(() => a.userMoveTo({ zoom: 8 })).not.toThrow();
    expect(group.size()).toBe(2);
  });

  it("is idempotent", () => {
    const group = createSyncGroup();
    const a = fakeMap();
    const remove = group.add(asSyncable(a));
    remove();
    expect(() => remove()).not.toThrow();
    expect(group.size()).toBe(0);
  });
});

describe("applyCamera", () => {
  it("reaches every member, including the one that moved last", () => {
    // popstate and preset jumps must move the pane the user was just dragging too.
    const group = createSyncGroup();
    const [a, b] = [fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    group.add(asSyncable(b));
    a.userMoveTo({ zoom: 5 });

    group.applyCamera(AMSTERDAM);

    expect(a.camera).toStrictEqual(AMSTERDAM);
    expect(b.camera).toStrictEqual(AMSTERDAM);
  });

  it("does not re-broadcast, so it cannot fight the caller", () => {
    const group = createSyncGroup();
    const a = fakeMap();
    group.add(asSyncable(a));
    const onChange = vi.fn();
    group.onChange(onChange);

    group.applyCamera(AMSTERDAM);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("updates the group camera so later panes are seeded from it", () => {
    const group = createSyncGroup();
    group.add(asSyncable(fakeMap()));
    group.applyCamera(AMSTERDAM);

    const late = fakeMap();
    group.add(asSyncable(late));

    expect(late.camera).toStrictEqual(AMSTERDAM);
  });

  it("works with no members", () => {
    const group = createSyncGroup();
    expect(() => group.applyCamera(AMSTERDAM)).not.toThrow();
    expect(group.camera()).toStrictEqual(AMSTERDAM);
  });
});

describe("onChange", () => {
  it("fires once per broadcast with the new camera", () => {
    const group = createSyncGroup();
    const [a, b] = [fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    group.add(asSyncable(b));
    const onChange = vi.fn();
    group.onChange(onChange);

    a.userMoveTo({ center: [4.893, 52.373], zoom: 16 });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toMatchObject({ zoom: 16, center: [4.893, 52.373] });
  });

  it("fires once even with four panes, not once per peer jump", () => {
    const group = createSyncGroup();
    const maps = [fakeMap(), fakeMap(), fakeMap(), fakeMap()];
    for (const m of maps) group.add(asSyncable(m));
    const onChange = vi.fn();
    group.onChange(onChange);

    maps[0]!.userMoveTo({ zoom: 10 });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("can be unsubscribed", () => {
    const group = createSyncGroup();
    const a = fakeMap();
    group.add(asSyncable(a));
    const onChange = vi.fn();
    const off = group.onChange(onChange);
    off();

    a.userMoveTo({ zoom: 4 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("lets a subscriber call applyCamera without recursing", () => {
    // The guard is released before listeners run precisely so this is legal.
    const group = createSyncGroup();
    const [a, b] = [fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    group.add(asSyncable(b));
    let calls = 0;
    group.onChange(() => {
      calls += 1;
      if (calls === 1) group.applyCamera(AMSTERDAM);
    });

    expect(() => a.userMoveTo({ zoom: 6 })).not.toThrow();
    expect(a.camera).toStrictEqual(AMSTERDAM);
    expect(b.camera).toStrictEqual(AMSTERDAM);
  });
});

describe("destroy", () => {
  it("unsubscribes every member and drops listeners", () => {
    const group = createSyncGroup();
    const [a, b] = [fakeMap(), fakeMap()];
    group.add(asSyncable(a));
    group.add(asSyncable(b));
    const onChange = vi.fn();
    group.onChange(onChange);

    group.destroy();

    expect(a.listenerCount()).toBe(0);
    expect(b.listenerCount()).toBe(0);
    expect(group.size()).toBe(0);

    a.userMoveTo({ zoom: 3 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
