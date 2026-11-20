/**
 * Build identifier for analytics. Vite injects __BUILD_INFO__ (package version, commit SHA from
 * GITHUB_SHA on Pages builds or `git rev-parse HEAD` locally, build time). Node tests and any build
 * without the define get an explicit "not injected" marker instead of a guess.
 */
import type { BuildInfo } from './run-recorder.ts';

declare const __BUILD_INFO__: BuildInfo | undefined;

export const BUILD_INFO: BuildInfo =
  typeof __BUILD_INFO__ !== 'undefined' && __BUILD_INFO__ ? __BUILD_INFO__ : { version: 'dev', commit: 'not-injected', builtAt: '' };
