import { Command } from "commander";
import { readManifest, validateManifest } from "../lib/manifest.js";
import { getGitHubToken } from "../lib/config.js";
import { getRemoteUrl, getHeadSha, createTag, pushTag } from "../lib/git.js";
import { logger } from "../lib/logger.js";

export const publishCommand = new Command("publish")
  .description("Publish the current directory as a package to the registry")
  .action(async () => {
    try {
      const cwd = process.cwd();

      // Check auth
      const token = getGitHubToken();
      if (!token) {
        logger.error("Not authenticated. Run `planmode login` first.");
        process.exit(1);
      }

      // Read and validate manifest
      logger.info("Reading planmode.yaml...");
      const manifest = readManifest(cwd);
      const errors = validateManifest(manifest, true);
      if (errors.length > 0) {
        logger.error("Invalid manifest:");
        for (const err of errors) {
          console.log(`  - ${err}`);
        }
        process.exit(1);
      }

      // Check git remote
      const remoteUrl = await getRemoteUrl(cwd);
      if (!remoteUrl) {
        logger.error("No git remote found. Push your code to GitHub first.");
        process.exit(1);
      }

      const sha = await getHeadSha(cwd);
      const tag = `v${manifest.version}`;

      // Create and push tag
      logger.info(`Creating tag ${tag}...`);
      try {
        await createTag(cwd, tag);
      } catch {
        logger.dim(`Tag ${tag} already exists, using existing`);
      }

      try {
        await pushTag(cwd, tag);
        logger.success(`Pushed tag ${tag}`);
      } catch {
        logger.dim(`Tag ${tag} already pushed`);
      }

      // Fork registry and create PR via GitHub API
      logger.info("Submitting to registry...");

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "planmode-cli",
        "Content-Type": "application/json",
      };

      // Fork the registry repo (idempotent)
      await fetch("https://api.github.com/repos/kaihannonen/planmode.org/forks", {
        method: "POST",
        headers,
      });

      // Get authenticated user
      const userRes = await fetch("https://api.github.com/user", { headers });
      const user = (await userRes.json()) as { login: string };

      // Create metadata files content
      const metadataContent = JSON.stringify(
        {
          name: manifest.name,
          description: manifest.description,
          author: manifest.author,
          license: manifest.license,
          repository: remoteUrl
            .replace(/^https?:\/\//, "")
            .replace(/\.git$/, ""),
          category: manifest.category ?? "other",
          tags: manifest.tags ?? [],
          type: manifest.type,
          models: manifest.models ?? [],
          latest_version: manifest.version,
          versions: [manifest.version],
          downloads: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          dependencies: manifest.dependencies,
          variables: manifest.variables,
        },
        null,
        2,
      );

      const versionContent = JSON.stringify(
        {
          version: manifest.version,
          published_at: new Date().toISOString(),
          source: {
            repository: remoteUrl
              .replace(/^https?:\/\//, "")
              .replace(/\.git$/, ""),
            tag,
            sha,
          },
          files: ["planmode.yaml", manifest.content_file ?? "inline"],
          content_hash: `sha256:${sha.slice(0, 16)}`,
        },
        null,
        2,
      );

      // Create branch on fork
      const branchName = `add-${manifest.name}-${manifest.version}`;

      // Get main branch ref
      const refRes = await fetch(
        `https://api.github.com/repos/${user.login}/planmode.org/git/ref/heads/main`,
        { headers },
      );

      if (!refRes.ok) {
        logger.error("Failed to access registry fork. Make sure the fork exists.");
        process.exit(1);
      }

      const refData = (await refRes.json()) as { object: { sha: string } };
      const baseSha = refData.object.sha;

      // Create branch
      await fetch(`https://api.github.com/repos/${user.login}/planmode.org/git/refs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        }),
      });

      // Create metadata.json
      await fetch(
        `https://api.github.com/repos/${user.login}/planmode.org/contents/registry/packages/${manifest.name}/metadata.json`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            message: `Add ${manifest.name}@${manifest.version}`,
            content: Buffer.from(metadataContent).toString("base64"),
            branch: branchName,
          }),
        },
      );

      // Create version file
      await fetch(
        `https://api.github.com/repos/${user.login}/planmode.org/contents/registry/packages/${manifest.name}/versions/${manifest.version}.json`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            message: `Add ${manifest.name}@${manifest.version} version metadata`,
            content: Buffer.from(versionContent).toString("base64"),
            branch: branchName,
          }),
        },
      );

      // Create PR
      const prRes = await fetch("https://api.github.com/repos/kaihannonen/planmode.org/pulls", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: `Add ${manifest.name}@${manifest.version}`,
          head: `${user.login}:${branchName}`,
          base: "main",
          body: `## New package: ${manifest.name}\n\n- **Type:** ${manifest.type}\n- **Version:** ${manifest.version}\n- **Description:** ${manifest.description}\n- **Author:** ${manifest.author}\n\nSubmitted via \`planmode publish\`.`,
        }),
      });

      if (prRes.ok) {
        const pr = (await prRes.json()) as { html_url: string };
        logger.blank();
        logger.success(`Published ${manifest.name}@${manifest.version}`);
        logger.info(`PR: ${pr.html_url}`);
      } else {
        const err = await prRes.text();
        logger.error(`Failed to create PR: ${err}`);
        process.exit(1);
      }

      logger.blank();
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
