// Live events of playground runs. Viewers subscribe per app; the home page's strip listens to every app.

import { EventEmitter } from "node:events";

export type PlaygroundStep =
  | "plant" // a bench bug was planted into a fresh copy of the app
  | "crash" // the app crashed for real: the traceback
  | "connected" // JaagteRaho received the error report
  | "decision"
  | "cause"
  | "gate"
  | "own_test"
  | "hidden_test"
  | "done" // the scorecard
  | "failed"
  | "replay"; // a spend cap is reached: a real past run is being replayed

export type PlaygroundEvent = {
  step: PlaygroundStep;
  app: string;
  run_id: number;
  at: string;
  t: number; // seconds since the run started
  data: Record<string, unknown>;
  replay_of?: { run_id: number; app: string; at: string };
};

class PlaygroundBus extends EventEmitter {
  send(ev: PlaygroundEvent) {
    this.emit(`app:${ev.app}`, ev);
    this.emit("all", ev);
  }
}

export const playgroundBus = new PlaygroundBus();
playgroundBus.setMaxListeners(1000);
