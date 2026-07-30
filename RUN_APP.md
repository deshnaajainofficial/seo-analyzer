# Run The App With One Click

## Mac

Double-click:

```text
Run SEO Analyzer.command
```

If macOS blocks it the first time:

```bash
chmod +x "Run SEO Analyzer.command"
```

Then double-click it again.

## Windows

Double-click:

```text
Run SEO Analyzer.bat
```

## What The Launcher Does

- checks that Node.js is installed
- installs dependencies if `node_modules` is missing
- installs Playwright Chromium if needed
- opens `http://localhost:3000`
- starts the server

Keep the terminal window open while using the app. Press `Ctrl+C` in that window to stop it.
