# Changelog

All notable changes to Arc Bookmarks will be documented in this file.

## [0.1.1] - 2026-02-16

### Changed

- Renamed repository to `vscode-arc-bookmarks`
- Renamed `.vsixignore` to `.vscodeignore` (correct file for `vsce` packaging)
- Added `.claude/` to `.vscodeignore`
- Set `extensionKind` to `ui` so the extension persists across remote sessions (SSH, WSL, containers)

### Added (docs & metadata)

- README with demo gif
- MIT license
- CHANGELOG
- Publishing metadata in `package.json` (repository, homepage, bugs, keywords)

## [0.1.0] - 2025-01-01

### Initial release

- Open bookmarks in VS Code's integrated browser
- Add, edit, and remove bookmarks manually
- Sync bookmarks from Arc browser (macOS)
- Folder organization preserved from Arc's sidebar
- Duplicate detection during sync
- Clipboard URL detection for quick browsing
- Keyboard shortcut `Cmd+Alt+B` / `Ctrl+Alt+B` to open bookmarks
