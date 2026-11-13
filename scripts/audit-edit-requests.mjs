import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
for (const name of ['CLIENT_ID', 'CLIENT_SECRET', 'REFRESH_TOKEN']) {
  if (!process.env[name])
    throw new Error(`Missing configured ${name}; no credential values logged.`);
}
const base = new URL(process.env.BASE_URL || 'https://www.zohoapis.com');
const suffix = base.hostname.replace(/^www\./, '').replace(/^zohoapis\./, '');
const accounts = process.env.ACCOUNTS_URL || `https://accounts.zoho.${suffix}`;
const auth = await fetch(`${accounts}/oauth/v2/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    refresh_token: process.env.REFRESH_TOKEN,
  }),
});
const token = await auth.json();
if (!token.access_token) throw new Error(`OAuth refresh failed: ${token.error || auth.status}`);

const prefix = `${base.origin}/creator/v2.1/data/sungrowpower/sungrowauservice/report/`;
const scratch = await mkdtemp(join(tmpdir(), 'widget-edit-audit-'));
execFileSync('unzip', ['-q', resolve('artifacts/project-widget.zip'), '-d', scratch]);
const browser = await chromium.launch({ channel: 'chrome' });
const summaries = [];
try {
  for (const projectNumber of process.env.AUDIT_PROJECT
    ? [process.env.AUDIT_PROJECT]
    : ['AUSOLM26VIC26C0000', 'AUSOAL26NSW25U1175', 'AUENER26NSW26C0010']) {
    const initialUrl = new URL(prefix + 'Project_Report');
    initialUrl.search = new URLSearchParams({
      field_config: 'all',
      criteria: `Project_ID == "${projectNumber}"`,
      max_records: '200',
    });
    const initial = await (
      await fetch(initialUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
      })
    ).json();
    if (initial.code !== 3000 || initial.data?.length !== 1)
      throw new Error('Target project unavailable: ' + projectNumber);
    const original = initial.data[0];
    for (const mode of process.env.AUDIT_STABLE_METHODS ? ['cold'] : ['cold', 'prefetched']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const calls = [];
      let phase = 'startup',
        active = 0;
      await page.exposeFunction('auditRead', async (method, config) => {
        const item = {
          phase,
          method,
          report: config.report_name,
          fields: config.fields || 'all',
          id: config.id,
          started: Date.now(),
        };
        calls.push(item);
        active++;
        try {
          if (config.report_name === 'Project_widget_filter_cache_Report')
            return { code: 3000, data: [] };
          if (method === 'getRecords' && config.report_name === 'Project_Report') return initial;
          const path =
            method === 'readFile'
              ? config.parent_id
                ? `${config.report_name}/${config.parent_id}/${config.field_name}/${config.id}/download`
                : `${config.report_name}/${config.id}/${config.field_name}/download`
              : config.report_name + (method === 'getRecordById' ? '/' + config.id : '');
          const url = new URL(prefix + path);
          for (const key of ['fields', 'field_config', 'criteria', 'max_records', 'record_cursor'])
            if (config[key] !== undefined) url.searchParams.set(key, String(config[key]));
          const response = await fetch(url, {
            headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
            signal: AbortSignal.timeout(25000),
          });
          item.http = response.status;
          if (method === 'readFile' && !response.headers.get('content-type')?.includes('json'))
            return { responseText: Buffer.from(await response.arrayBuffer()).toString('base64') };
          const body = await response.json();
          item.code = body.code;
          return body;
        } finally {
          item.ms = Date.now() - item.started;
          active--;
        }
      });
      await page.route('https://widget.test/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/')
          return route.fulfill({
            contentType: 'text/html',
            body: '<iframe style="width:100%;height:95vh" src="/app/widget.html"></iframe>',
          });
        let body = await readFile(join(scratch, path));
        if (process.env.AUDIT_STABLE_METHODS && path.endsWith('project-record-cache.js')) {
          const original = body.toString();
          if (
            !original.includes(
              'return typeof method === "function" ? method.bind(target) : method;',
            )
          )
            throw new Error('Diagnostic binding anchor did not match');
          body = Buffer.from(
            original
              .replace(
                'return new Proxy(foreground, {',
                'const boundReads = new Map(); return new Proxy(foreground, {',
              )
              .replace(
                'return typeof method === "function" ? method.bind(target) : method;',
                'if(typeof method !== "function") return method; if(!boundReads.has(name)) boundReads.set(name,method.bind(target)); return boundReads.get(name);',
              ),
          );
        }
        return route.fulfill({
          contentType: path.endsWith('.js')
            ? 'text/javascript'
            : path.endsWith('.css')
              ? 'text/css'
              : path.endsWith('.svg')
                ? 'image/svg+xml'
                : 'text/html',
          body,
        });
      });
      await page.addInitScript(
        ({ mode }) => {
          if (mode === 'cold')
            Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
          window.ZOHO = {
            CREATOR: {
              UTIL: {
                getInitParams: async () => ({
                  appLinkName: 'sungrowauservice',
                  loginUser: 'request-audit',
                }),
              },
              META: { getFields: async () => ({ code: 3000, fields: [] }) },
              DATA: {
                getRecords: (config) => window.auditRead('getRecords', config),
                getRecordById: (config) => window.auditRead('getRecordById', config),
              },
              FILE: { readFile: (config) => window.auditRead('readFile', config) },
            },
          };
        },
        { mode },
      );
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('https://widget.test/');
      const widget = page.frameLocator('iframe');
      const edit = widget.getByRole('button', {
        name: 'Edit ' + original.Project_Name,
        exact: true,
      });
      await edit.waitFor({ timeout: 30000 });
      async function idle() {
        let quiet = 0;
        for (let n = 0; n < 120; n++) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          if (active === 0) quiet++;
          else quiet = 0;
          if (quiet >= 6) return;
        }
        throw new Error('Requests did not settle');
      }
      if (mode === 'prefetched') await idle();
      phase = 'edit';
      const started = Date.now();
      await edit.click();
      await widget.locator('.record-editor[aria-busy="false"]').waitFor({ timeout: 60000 });
      const readyMs = Date.now() - started;
      await idle();
      const summary = {
        projectNumber,
        mode,
        readyMs,
        sections: Object.fromEntries(
          [
            'PO',
            'Issue_Register',
            'Service_Tickets',
            'Milestone_Tracker',
            'Software_Iteration',
            'Rectification',
            'BOM',
          ].map((name) => [name, original[name]?.length ?? null]),
        ),
        calls,
        errors,
        signatureImages: await widget.locator('img[alt="Saved signature"]').count(),
      };
      if (process.env.AUDIT_VERIFY_CACHE) {
        const first = calls.filter((call) => call.phase === 'edit');
        if (first.filter((call) => call.method === 'readFile').length > 1)
          throw new Error('Signature was downloaded more than once');
        if (mode === 'prefetched' && first.some((call) => call.report === 'Countries'))
          throw new Error('Country cache was not reused after prefetch');
        phase = 'closing';
        await widget.getByRole('button', { name: 'Close editor', exact: true }).click();
        await edit.waitFor();
        phase = 'reopen';
        await edit.click();
        await widget.locator('.record-editor[aria-busy="false"]').waitFor({ timeout: 60000 });
        await idle();
        const repeated = calls.filter((call) => call.phase === 'reopen');
        if (
          process.env.AUDIT_VERIFY_SUBFORMS &&
          repeated.some(
            (call) => call.method === 'getRecordById' && call.report !== 'Project_Report',
          )
        )
          throw new Error('Reopen repeated missing subform metadata reads');
        if (
          process.env.AUDIT_VERIFY_SUBFORMS &&
          !repeated.some(
            (call) => call.report === 'Project_Report' && call.method === 'getRecordById',
          )
        )
          throw new Error('Reopen did not verify the project');
        if (
          repeated.some(
            (call) =>
              call.report === 'Countries' ||
              call.report === 'Staff_List' ||
              call.method === 'readFile',
          )
        )
          throw new Error('Reopen repeated a cached reference or image read');
        console.log(
          JSON.stringify({
            projectNumber,
            mode,
            reopen: repeated.length,
            reports: repeated.map((call) => call.report),
          }),
        );
      }
      summaries.push(summary);
      await writeFile(
        process.env.AUDIT_OUTPUT ||
          (process.env.AUDIT_STABLE_METHODS
            ? 'artifacts/diagnostics/edit-api-call-stable-method-probe.json'
            : 'artifacts/diagnostics/edit-api-call-audit.json'),
        JSON.stringify(
          {
            checkedAt: new Date().toISOString(),
            context:
              'Packaged browser widget with live OAuth read responses; project list restricted to one target; metadata mocked; portal session not tested',
            summaries,
          },
          null,
          2,
        ),
      );
      console.log(
        JSON.stringify({
          projectNumber,
          mode,
          readyMs,
          startup: calls.filter((c) => c.phase === 'startup').length,
          edit: calls.filter((c) => c.phase === 'edit').length,
          groups: Object.fromEntries(
            [...new Set(calls.filter((c) => c.phase === 'edit').map((c) => c.report))].map(
              (report) => [
                report,
                calls.filter((c) => c.phase === 'edit' && c.report === report).length,
              ],
            ),
          ),
          errors,
        }),
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
  await rm(scratch, { recursive: true, force: true });
}
