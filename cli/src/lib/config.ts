import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse, stringify } from "yaml";
import type { PlanmodeConfig } from "../types/index.js";

const CONFIG_DIR = path.join(os.homedir(), ".planmode");
const CONFIG_PATH = path.join(CONFIG_DIR, "config");
const CACHE_DIR = path.join(CONFIG_DIR, "cache");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getCacheDir(): string {
  const config = readConfig();
  return config.cache?.dir ?? CACHE_DIR;
}

export function getCacheTTL(): number {
  const config = readConfig();
  return config.cache?.ttl ?? 3600;
}

export function readConfig(): PlanmodeConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return (parse(raw) as PlanmodeConfig) ?? {};
  } catch {
    return {};
  }
}

export function writeConfig(config: PlanmodeConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, stringify(config), "utf-8");
}

export function getGitHubToken(): string | undefined {
  const envToken = process.env["PLANMODE_GITHUB_TOKEN"];
  if (envToken) return envToken;
  const config = readConfig();
  return config.auth?.github_token;
}

export function setGitHubToken(token: string): void {
  const config = readConfig();
  config.auth = { ...config.auth, github_token: token };
  writeConfig(config);
}

export function getRegistries(): Record<string, string> {
  const config = readConfig();
  return {
    default: "github.com/planmode/registry",
    ...config.registries,
  };
}

export function addRegistry(name: string, url: string): void {
  const config = readConfig();
  config.registries = { ...config.registries, [name]: url };
  writeConfig(config);
}
