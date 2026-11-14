// In-process event bus: the worker publishes progress, the public live feed subscribes.

import { EventEmitter } from "node:events";

export type FeedEvent = {
  type: "error" | "decision" | "voice" | "cause" | "fix" | "fixed" | "change" | "heal";
  at: string;
  incident_id: number;
  data: Record<string, unknown>;
};

class Bus extends EventEmitter {
  publish(session: string | null, ev: FeedEvent) {
    if (session) this.emit(`session:${session}`, ev);
    this.emit("any", ev);
  }
}

export const bus = new Bus();
bus.setMaxListeners(500);
