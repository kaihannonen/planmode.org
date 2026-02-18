import { readManifest, validateManifest } from "./manifest.js";
import { getGitHubToken } from "./config.js";
import { getRemoteUrl, getHeadSha, createTag, pushTag } from "./git.js";
import { logger } from "./logger.js";
import { withSpinner } from "./prompts.js";

export interface PublishOptions {
  projectDir?: string;
  token?: string;
  interactive?: boolean;
}

export interface PublishResult {
  prUrl: string;
  packageName: string;
  version: string;
}

export async function publishPackage(options: PublishOptions = {}): Promise<PublishResult> {
  const cwd = options.projectDir ?? process.cwd();
  const interactive = options.interactive ?? false;

  // Check auth
  const token = options.token ?? getGitHubToken();
  if (!token) {
    throw new Error("Not authenticated. Run `planmode login` first.");
  }

  // Read and validate manifest
  const doValidate = async () => {
    const manifest = readManifest(cwd);
    const errors = validateManifest(manifest, true);
    if (errors.length > 0) {
      throw new Error(`Invalid manifest:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    }
    return manifest;
  };

  const manifest = interactive
    ? await withSpinner("Validating manifest...", doValidate, "Manifest valid")
    : await (async () => {
        logger.info("Reading planmode.yaml...");
        return doValidate();
      })();

  // Check git remote
  const remoteUrl = await getRemoteUrl(cwd);
  if (!remoteUrl) {
    throw new Error("No git remote found. Push your code to GitHub first.");
  }

  const sha = await getHeadSha(cwd);
  const tag = `v${manifest.version}`;

  // Create and push tag
  const doTag = async () => {
    try {
      await createTag(cwd, tag);
    } catch {
      // Tag already exists
    }
    try {
      await pushTag(cwd, tag);
    } catch {
      // Tag already pushed
    }
  };

  if (interactive) {
    await withSpinner(`Creating tag ${tag}...`, doTag, `Tag ${tag} ready`);
  } else {
    logger.info(`Creating tag ${tag}...`);
    await doTag();
    logger.success(`Pushed tag ${tag}`);
  }

  // Fork registry and create PR via GitHub API
  const doSubmit = async () => {
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
    if (!userRes.ok) {
      throw new Error("Failed to authenticate with GitHub. Check your token.");
    }
    const user = (await userRes.json()) as { login: string };

    // Create metadata files content
    const repoPath = remoteUrl.replace(/^https?:\/\//, "").replace(/\.git$/, "");

    const metadataContent = JSON.stringify(
      {
        name: manifest.name,
        description: manifest.description,
        author: manifest.author,
        license: manifest.license,
        repository: repoPath,
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
          repository: repoPath,
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
      throw new Error("Failed to access registry fork. Make sure the fork exists.");
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

    if (!prRes.ok) {
      const err = await prRes.text();
      throw new Error(`Failed to create PR: ${err}`);
    }

    const pr = (await prRes.json()) as { html_url: string };
    return pr.html_url;
  };

  let prUrl: string;
  if (interactive) {
    prUrl = await withSpinner(
      "Submitting to registry...",
      doSubmit,
      "Submitted to registry",
    );
  } else {
    logger.info("Submitting to registry...");
    prUrl = await doSubmit();
    logger.success(`Published ${manifest.name}@${manifest.version}`);
    logger.info(`PR: ${prUrl}`);
  }

  return {
    prUrl,
    packageName: manifest.name,
    version: manifest.version,
  };
}
