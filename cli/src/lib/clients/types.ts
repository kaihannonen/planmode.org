import type { InstallTarget, PackageType } from "../../types/index.js";

export type ClientId = InstallTarget;

export interface ClientCapabilities {
  /** The client can be launched non-interactively. */
  headless: boolean;
  /** The client exposes lifecycle hooks or plugin events. */
  hooks: boolean;
  /** The client persists a session transcript that can be read locally. */
  transcript: boolean;
  /** The client has its own permission/sandbox model. */
  permissions: boolean;
  /** The client supports MCP servers. */
  mcp: boolean;
}

export interface ClientRenderContext {
  name: string;
  type: PackageType;
  content: string;
  description?: string;
  projectDir: string;
}

export interface ClientRemoveContext {
  name: string;
  type: PackageType;
  description?: string;
  projectDir: string;
}

export interface ClientAdapter {
  id: ClientId;
  label: string;
  capabilities: ClientCapabilities;
  /** Files the client uses for project instructions. */
  instructionFiles(projectDir: string): string[];
  /** Reference a package in the client's native instruction surface. */
  apply(ctx: ClientRenderContext): void;
  /** Remove the client-specific reference. */
  remove(ctx: ClientRemoveContext): void;
  /** Return human-readable problems with the client-specific install. */
  check(ctx: ClientRemoveContext): string[];
}

export const CLIENT_IDS: ClientId[] = ["claude", "codex", "cursor", "opencode"];
