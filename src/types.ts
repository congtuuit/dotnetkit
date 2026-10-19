export interface SdkConfig {
  version?: string;
  rollForward?: "latestPatch" | "minor" | "latestFeature" | "latestMinor" | "major" | "disable";
  allowPrerelease?: boolean;
}

export interface Manifest {
  schemaVersion: number;
  sdk?: SdkConfig;
  runtimes?: Array<{ name: string; version: string }>;
  workloads?: Array<{ id: string; version?: string }>;
  tools?: Array<{ package: string; command?: string; version: string; scope?: "local" | "global" }>;
  nuget?: { sources?: string[] };
  tasks?: Record<string, string>;
  platforms?: { os?: string[]; architectures?: string[] };
  environment?: Record<string, string>;
  policies?: { autoInstall?: boolean; network?: "online" | "offline"; confirmation?: boolean };
}

export interface GlobalJson {
  sdk?: {
    version?: string;
    rollForward?: string;
    allowPrerelease?: boolean;
  };
  tools?: Record<string, string>;
}

export interface Lockfile {
  lockfileVersion: number;
  generatedBy: string;
  platform: {
    os: string;
    architecture: string;
  };
  sdk?: SdkConfig & {
    resolvedVersion?: string;
    downloadUrl?: string;
    sha512?: string;
  };
  runtimes?: Array<{ name: string; version: string }>;
  workloads?: Array<{ id: string; version?: string }>;
  tools?: Array<{ package: string; command?: string; version: string; scope?: "local" | "global" }>;
}

export interface ReleaseIndexChannel {
  "channel-version": string;
  "latest-release": string;
  "latest-release-date": string;
  "latest-runtime": string;
  "latest-sdk": string;
  "release-type": "lts" | "sts";
  "support-phase": "active" | "maintenance" | "eol" | "preview" | "go-live";
  "releases.json": string;
}

export interface ReleasesIndex {
  "releases-index": ReleaseIndexChannel[];
}

export interface SdkFile {
  name: string;
  rid: string;
  url: string;
  hash: string;
}

export interface SdkDetails {
  version: string;
  "version-display"?: string;
  runtimeVersion?: string;
  files: SdkFile[];
}

export interface DotnetRelease {
  "release-version": string;
  "release-date": string;
  sdk?: SdkDetails;
  sdks?: SdkDetails[];
}

export interface ChannelReleases {
  "channel-version": string;
  "latest-release": string;
  "latest-sdk": string;
  "release-type": string;
  "support-phase": string;
  releases: DotnetRelease[];
}

export interface ResolvedSdk {
  channelVersion: string;
  version: string;
  releaseType: "lts" | "sts";
  supportPhase: string;
  downloadUrl?: string;
  hash?: string;
  rid?: string;
}
