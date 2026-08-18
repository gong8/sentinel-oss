# Versioning Policy

Sentinel follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with pre-release stages.

## Version Format

```
v{MAJOR}.{MINOR}.{PATCH}[-{STAGE}.{N}]
```

| Component | Description |
|-----------|-------------|
| `MAJOR` | Breaking changes to API, schema, or configuration |
| `MINOR` | New features, backward compatible |
| `PATCH` | Bug fixes, backward compatible |
| `STAGE` | Pre-release stage: `alpha`, `beta`, or `rc` |
| `N` | Pre-release iteration number |

## Version Examples

| Stage | Format | Example | When to Use |
|-------|--------|---------|-------------|
| Alpha | `v1.0.0-alpha.N` | `v0.2.0-alpha.1` | Active development, unstable |
| Beta | `v1.0.0-beta.N` | `v0.2.0-beta.1` | Feature complete, testing |
| RC | `v1.0.0-rc.N` | `v0.2.0-rc.1` | Release candidate, final testing |
| Stable | `v1.0.0` | `v0.2.0` | Production ready |

## Pre-Release Stages

### Alpha (`-alpha.N`)

- **Purpose**: New features in active development
- **Stability**: Unstable, may have bugs and incomplete functionality
- **API**: May change without notice
- **Data**: Migration paths not guaranteed
- **Use case**: Internal testing, early adopter feedback

### Beta (`-beta.N`)

- **Purpose**: Feature complete, ready for testing
- **Stability**: Mostly stable, known issues being fixed
- **API**: Frozen, only bug fixes
- **Data**: Migration paths provided
- **Use case**: Partner testing, pre-production validation

### Release Candidate (`-rc.N`)

- **Purpose**: Believed ready for release
- **Stability**: Production-ready quality
- **API**: Frozen, only critical fixes
- **Data**: Full migration support
- **Use case**: Final validation before stable release

### Stable (no suffix)

- **Purpose**: Production release
- **Stability**: Fully tested and supported
- **API**: Stable, follows semver
- **Data**: Full migration and backward compatibility
- **Use case**: Production deployments

## Version Progression

```
v0.2.0-alpha.1 → v0.2.0-alpha.2 → ... → v0.2.0-beta.1 → ... → v0.2.0-rc.1 → v0.2.0
```

Within a stage, increment the iteration number (`N`) for each release:
- `v0.2.0-alpha.1` → `v0.2.0-alpha.2` → `v0.2.0-alpha.3`

When moving to the next stage, reset to `.1`:
- `v0.2.0-alpha.5` → `v0.2.0-beta.1`

## When to Bump Versions

### Major Version (X.0.0)

Increment for breaking changes:
- Database schema changes requiring migration
- API endpoint changes (renamed, removed, changed signatures)
- Configuration format changes
- Policy syntax changes
- Removal of deprecated features

### Minor Version (0.X.0)

Increment for new features:
- New API endpoints
- New policy matchers or conditions
- New MCP transport support
- New webhook events
- New UI pages or features

### Patch Version (0.0.X)

Increment for fixes:
- Bug fixes
- Security patches
- Performance improvements
- Documentation updates
- Dependency updates (non-breaking)

## Release Workflow

1. **Development** (`dev` branch)
   - Features merged via PRs
   - Alpha releases for testing: `v0.2.0-alpha.1`

2. **Stabilization** (feature freeze)
   - Beta releases for partner testing: `v0.2.0-beta.1`
   - Only bug fixes merged

3. **Release Candidate**
   - RC releases for final validation: `v0.2.0-rc.1`
   - Only critical fixes

4. **Stable Release**
   - Merge to `main`
   - Tag stable version: `v0.2.0`
   - Docker images published

## Creating a Release

Use the release script:

```bash
# Alpha release
./scripts/release.sh v0.2.0-alpha.1

# Beta release
./scripts/release.sh v0.2.0-beta.1

# Release candidate
./scripts/release.sh v0.2.0-rc.1

# Stable release
./scripts/release.sh v0.2.0
```

Before releasing:
1. Update `CHANGELOG.md` with release notes
2. Ensure all tests pass
3. Verify the release is on the correct branch

## Changelog

All releases are documented in [CHANGELOG.md](/CHANGELOG.md) following the [Keep a Changelog](https://keepachangelog.com/) format.

Categories:
- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Features to be removed
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security fixes (always explicitly called out)
