"use client";

import { Component, type ReactNode } from "react";

/* Hides a small, optional part of a page (like the home LIVE strip) if it ever throws, instead of breaking the page. */
export class QuietBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("hidden a part that failed", error);
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
