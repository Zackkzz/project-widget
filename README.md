# Project widget

The Sungrow Service Australia Projects widget opens to the project table in Zoho Creator and provides detail, edit, and create flows. See the [product and release handoff](PROJECT-HANDOFF.md) for the full widget and its current status.

## Create form development

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173/widget.html for the labelled sample preview. Embedded in Zoho Creator, the widget uses the signed-in SDK session and preserves existing submission workflows.

- `npm start`: local HTTPS widget host (port 5000).
- `npm run package`: package the older create-only source. Follow the handoff to package or restore the full Projects widget.
- `npm test`: rules, adapter, and submission tests.
- `npm run test:e2e`: desktop/mobile Chrome flows.
