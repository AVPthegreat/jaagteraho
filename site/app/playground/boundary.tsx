"use client";

import { Component, type ReactNode } from "react";
import { isChunkError, reloadOnce } from "../ui/chunk-reload";
import { resetPlaySession } from "./play";

/*
  Keeps the playground standing. If it ever throws, it first starts itself over (a fresh visitor id, so
  no saved state from an older version can trip it again), up to twice, before it shows a calm inline
  message. Old chunks after a deploy reload the page once instead.
*/
type State = { tries: number; failed: boolean; key: number };

export class PlaygroundBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { tries: 0, failed: false, key: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (isChunkError(error) && reloadOnce()) return;
    console.warn("playground restarted after an error", error);
    if (this.state.tries < 2) {
      resetPlaySession();
      this.setState((s) => ({ tries: s.tries + 1, failed: false, key: s.key + 1 }));
    }
  }

  private retry = () => {
    resetPlaySession();
    this.setState((s) => ({ tries: 0, failed: false, key: s.key + 1 }));
  };

  render() {
    if (this.state.failed && this.state.tries >= 2) {
      return (
        <div className="pg2-fallback" role="alert">
          <p>
            <b>The playground hit a snag.</b> The live server may be restarting.
          </p>
          <button type="button" className="btn" onClick={this.retry}>
            Start again
          </button>
        </div>
      );
    }
    if (this.state.failed) return null;
    return <div key={this.state.key}>{this.props.children}</div>;
  }
}
