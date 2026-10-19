# dotnetkit

<p align="center">
  <a href="https://www.npmjs.com/package/dotnetkit"><img src="https://img.shields.io/npm/v/dotnetkit?color=blue&style=flat-square" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dotnetkit"><img src="https://img.shields.io/npm/dm/dotnetkit?style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/congtuuit/dotnetkit/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/dotnetkit?style=flat-square" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/dotnetkit?style=flat-square" alt="node compatibility"></a>
</p>

> **Zero-admin, reproducible .NET toolchain manager distributed through npm**, inspired by [Microsoft dotnetup](https://devblogs.microsoft.com/dotnet/introducing-dotnetup/).

`dotnetkit` helps developers and teams manage .NET SDKs and runtimes cleanly in user-space without administrative privileges, switch versions seamlessly per project, and guarantee reproducible builds in CI.

---

## 🚀 Quick Start

Run instantly with `npx` (no installation required) or install globally:

```powershell
# Run directly with npx
npx dotnetkit --help

# Or install globally
npm install -g dotnetkit
```

### Basic Workflow

```powershell
# 1. Initialize project manifest (dotnetkit.json)
dotnetkit init

# 2. View official .NET channels and local installed SDKs
dotnetkit list

# 3. Check environment, project requirements, and Microsoft release status
dotnetkit doctor

# 4. Preview or install the required .NET SDK (non-admin, into ~/.dotnetkit/sdks)
dotnetkit install --dry-run
dotnetkit install

# 5. Switch project requirement to another channel (e.g. 9.0, lts, sts, 8.0)
dotnetkit use 9.0

# 6. Check active target SDK executable path
dotnetkit which

# 7. Lock exact version, download URL, and SHA-512 checksum for reproducible CI
dotnetkit lock

# 8. Run project tasks or commands with DOTNET_ROOT and PATH injected
dotnetkit run build
dotnetkit exec dotnet --info
```

---

## 💡 Key Features

- **Non-Admin by Default:** All SDKs are downloaded and unpacked into user directories (`~/.dotnetkit/sdks/<version>`), leaving `Program Files` untouched.
- **Direct Microsoft Releases API Integration:** Resolves `lts`, `sts`, `latest`, `preview`, major bands (`8.0`, `9.0`), or exact versions (`8.0.100`) directly from Microsoft official metadata.
- **SHA-512 Integrity Check:** Real-time stream hashing guarantees downloaded SDK archives match official Microsoft signatures before extraction.
- **Zero-Dependency Extraction:** Uses built-in `tar` (bsdtar on Windows 10+, Linux, macOS) for blazingly fast `.zip` and `.tar.gz` extraction without bulky npm dependencies.
- **global.json Compatibility:** Automatically finds and falls back to official .NET `global.json` if `dotnetkit.json` is not present.
- **Isolated Execution (`DOTNET_ROOT` & `PATH` Injection):** `dotnetkit run` and `dotnetkit exec` automatically isolate the active SDK for the current repository.

---

## 🧪 Testing

```powershell
npm run check    # TypeScript type check
npm run test     # Run Node native test suite
```

---

## 📄 License

MIT © [Tu Van Cong](mailto:ctv.studio.dev@gmail.com)
