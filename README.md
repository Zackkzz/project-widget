# Project widget

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173/widget.html for the labelled sample preview. Embedded in Zoho Creator, the widget uses the signed-in SDK session and preserves existing submission workflows.

- `npm start`: local HTTPS widget host (port 5000).
- `npm run package`: build `artifacts/project-widget.zip` for Creator.
- `npm test`: rules, adapter, and submission tests.
- `npm run test:e2e`: desktop/mobile Chrome flows.

Upload instructions and actual Creator test steps: [Installation](docs/installation.md).

See [setup, coverage, and deployment notes](docs/project-widget.md) and the [application inventory](docs/zoho-application-inventory.md).

Current checkpoint and next steps: [Progress](docs/progress.md).
