export interface IUrlValidationResult {
  isValid: boolean;
  normalizedUrl: string;
  error?: string;
}

/**
 * Validates that the input is a valid GitHub repository URL and returns a consistent normalized form.
 *
 * Normalization Rules:
 * 1. Trims leading/trailing whitespace.
 * 2. Enforces http: or https: scheme (normalized to https:).
 * 3. Enforces github.com (or www.github.com) as host (normalized to github.com).
 * 4. Verifies exactly two path segments: [owner, repo].
 * 5. Strips optional trailing '.git' extension from the repository name.
 * 6. Strips unnecessary trailing slashes.
 * 7. Normalizes owner and repo names to lowercase for case-insensitive duplicate prevention.
 */
export const validateAndNormalizeGitHubUrl = (
  rawUrl: string,
): IUrlValidationResult => {
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      isValid: false,
      normalizedUrl: "",
      error: "GitHub repository URL is required",
    };
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      normalizedUrl: "",
      error: "Malformed repository URL format",
    };
  }

  // Enforce http/https protocol
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      isValid: false,
      normalizedUrl: "",
      error: "Repository URL must use HTTP or HTTPS protocol",
    };
  }

  // Enforce github.com host
  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    return {
      isValid: false,
      normalizedUrl: "",
      error: "Repository URL must be a valid GitHub URL (github.com)",
    };
  }

  // Extract owner and repo
  const segments = parsed.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length !== 2) {
    return {
      isValid: false,
      normalizedUrl: "",
      error:
        "GitHub repository URL must point to a specific repository (e.g., https://github.com/owner/repository)",
    };
  }

  const [owner, rawRepo] = segments;

  // Strip .git suffix if present
  const repo = rawRepo.replace(/\.git$/i, "");

  // Validate owner and repo naming conventions
  const ownerRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
  const repoRegex = /^[a-zA-Z0-9_.-]{1,100}$/;

  if (!ownerRegex.test(owner)) {
    return {
      isValid: false,
      normalizedUrl: "",
      error: `Invalid GitHub username or organization name: "${owner}"`,
    };
  }

  if (!repoRegex.test(repo) || repo === "." || repo === "..") {
    return {
      isValid: false,
      normalizedUrl: "",
      error: `Invalid GitHub repository name: "${repo}"`,
    };
  }

  const normalizedUrl = `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`;

  return {
    isValid: true,
    normalizedUrl,
  };
};

/**
 * Validates and normalizes live project URLs.
 * Enforces http: or https: scheme and standardizes casing.
 */
export const validateAndNormalizeLiveUrl = (
  rawUrl: string,
): IUrlValidationResult => {
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      isValid: false,
      normalizedUrl: "",
      error: "Live link URL is required",
    };
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      normalizedUrl: "",
      error: "Malformed live link URL format",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      isValid: false,
      normalizedUrl: "",
      error: "Live link URL must use HTTP or HTTPS protocol",
    };
  }

  // Remove trailing slash on bare domain paths e.g. https://example.com/ -> https://example.com
  let pathname = parsed.pathname;
  if (pathname === "/") {
    pathname = "";
  } else if (pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const normalizedUrl = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ""}${pathname}${parsed.search}${parsed.hash}`;

  return {
    isValid: true,
    normalizedUrl: normalizedUrl || trimmed,
  };
};
