import type { AppProps } from './types/app.types';
import type { Gateway, CreatedProject } from './services/types/creator.types';
import type { Errors, ProjectDraft } from './domain/types/project.types';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Layers3,
  LoaderCircle,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import {
  STEPS,
  PROJECT_TYPES,
  SCENARIOS,
  STATUSES,
  isChannel,
  newDraft,
  toPayload,
  updateDraft,
  validate,
} from './domain/project';
import { Field, Section, SelectField, TextField } from './components/Fields';
import { Lookup, MultiLookup } from './components/Lookup';
import { Equipment } from './components/Equipment';
import { ErrorSummary } from './components/ErrorSummary';
import { Review } from './components/Review';
import { connectCreator, CreatorError, messageOf } from './services/creator';
import { previewGateway } from './services/preview';
function isLocalPreview() {
  return (
    window.self === window.top && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  );
}
export default function App({ initialGateway }: AppProps) {
  const [gateway, setGateway] = useState<Gateway | null>(
    initialGateway ?? (isLocalPreview() ? previewGateway : null),
  );
  const [connectionError, setConnectionError] = useState('');
  const [draft, setDraft] = useState(newDraft);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [created, setCreated] = useState<CreatedProject | null>(null);
  const [previewComplete, setPreviewComplete] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const [connectAttempt, setConnectAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (gateway) return;
    let active = true;
    setConnectionError('');
    connectCreator()
      .then((g) => {
        if (active) setGateway(g);
      })
      .catch((e) => {
        if (active) setConnectionError(messageOf(e));
      });
    return () => {
      active = false;
    };
  }, [gateway, connectAttempt]);
  useEffect(() => {
    if (!dirty || created || previewComplete) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, created, previewComplete]);
  function set<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    if (busy || uncertain) return;
    setDraft((d) => updateDraft(d, key, value));
    setDirty(true);
    setErrors((old) =>
      Object.fromEntries(
        Object.entries(old).filter(([k]) => k !== key && !k.startsWith(key + '.')),
      ),
    );
  }
  function go(target: number) {
    if (busy || uncertain) return;
    if (target > step) {
      for (let n = 0; n < target; n++) {
        const issues = validate(draft, n);
        if (Object.keys(issues).length) {
          setStep(n);
          setErrors(issues);
          focusHeading();
          return;
        }
      }
    }
    setErrors({});
    setStep(target);
    focusHeading();
  }
  function focusHeading() {
    setTimeout(() => heading.current?.focus(), 0);
  }
  async function submit() {
    if (!gateway || submitting.current || uncertain) return;
    const issues = validate(draft);
    if (Object.keys(issues).length) {
      setErrors(issues);
      setStep([0, 1, 2].find((s) => Object.keys(validate(draft, s)).length) ?? 0);
      focusHeading();
      return;
    }
    if (gateway.mode === 'preview') {
      setPreviewComplete(true);
      setDirty(false);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setSubmissionError('');
    try {
      if (!isChannel(draft.Project_Type) && draft.Service_Tickets.length) {
        const conflicts = await gateway.checkTickets(draft.Service_Tickets);
        if (Object.keys(conflicts).length) {
          setErrors(conflicts);
          setStep(2);
          focusHeading();
          return;
        }
      }
      const result = await gateway.create(toPayload(draft));
      setCreated(result);
      setDirty(false);
    } catch (e) {
      setSubmissionError(messageOf(e));
      if (e instanceof CreatorError && e.uncertain) setUncertain(true);
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  async function native(action: () => Promise<void>) {
    try {
      setNavigationError('');
      await action();
    } catch (e) {
      setNavigationError(messageOf(e));
    }
  }
  const mode = gateway?.mode;
  const intro = [
    'Start with the essentials. We’ll tailor the next steps to your project.',
    'Connect the project to the right client, location, and team.',
    'Add equipment, purchase orders, and the dates you already know.',
    'Make sure everything looks right before you create the project.',
  ][step];
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span>SUNGROW</span>
          <span className="brand-divider"></span>
          <span className="service-label">Service Australia</span>
        </div>
        <div className="topbar-context">
          <Layers3 size={16} />
          <span>Project workspace</span>
        </div>
      </header>
      <main className="main">
        <div className="breadcrumb">
          <span>Projects</span>
          <ChevronRight size={13} />
          <span>New project</span>
        </div>
        {!gateway ? (
          <div className="connection-panel">
            <h1>Connect to Zoho Creator</h1>
            {connectionError ? (
              <>
                <p role="alert">{connectionError}</p>
                <button className="button primary" onClick={() => setConnectAttempt((v) => v + 1)}>
                  Retry connection
                </button>
              </>
            ) : (
              <p role="status">
                <LoaderCircle size={20} className="spin" />
                Connecting to the current Creator session…
              </p>
            )}
          </div>
        ) : created || previewComplete ? (
          <div className="success-panel">
            <div className="success-symbol">
              <CheckCircle2 size={34} />
            </div>
            <span className="eyebrow">
              {previewComplete ? 'PREVIEW COMPLETE' : 'PROJECT CREATED'}
            </span>
            <h1>
              {previewComplete
                ? 'Your guided flow is complete.'
                : `${draft.Project_Name || 'Your project'} is ready.`}
            </h1>
            {previewComplete && (
              <p>No records were sent to Zoho Creator. Your sample project is ready for review.</p>
            )}
            {created && (
              <div className="success-reference">
                <span>{created.projectId ? 'Project ID' : 'Record ID'}</span>
                <strong>{created.projectId || created.id}</strong>
              </div>
            )}
            <div className="success-actions">
              {created && (
                <>
                  <button
                    className="button primary"
                    onClick={() => native(() => gateway.openProject(created.id))}
                  >
                    Open project
                    <ExternalLink size={16} />
                  </button>
                  {isChannel(draft.Project_Type) && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        native(() => gateway.openForm('Milestone_Tracker', { Project: created.id }))
                      }
                    >
                      Add milestone & signature
                      <ExternalLink size={16} />
                    </button>
                  )}
                </>
              )}
              {previewComplete && (
                <button className="button primary" onClick={() => setPreviewComplete(false)}>
                  Back to review
                </button>
              )}
              <button
                className="button secondary"
                onClick={() => {
                  setCreated(null);
                  setPreviewComplete(false);
                  setDraft(newDraft());
                  setErrors({});
                  setStep(0);
                  setDirty(false);
                  setNavigationError('');
                }}
              >
                Start another project
              </button>
            </div>
            {navigationError && (
              <p role="alert" className="field-error">
                {navigationError}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">NEW PROJECT</div>
                <h1>Create a project</h1>
              </div>
            </div>
            {mode === 'preview' && (
              <div className="preview-banner">
                <CircleHelp size={17} />
                <span>You’re exploring sample data. This preview cannot create real records.</span>
              </div>
            )}
            <nav className="stepper" aria-label="Project creation steps">
              {STEPS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => go(i)}
                  disabled={busy || uncertain}
                  aria-current={step === i ? 'step' : undefined}
                  className={`${step === i ? 'current' : ''} ${step > i ? 'completed' : ''}`}
                >
                  <span className="step-number">{step > i ? <Check size={16} /> : i + 1}</span>
                  <span className="step-text">
                    {label}
                    <small>
                      {
                        [
                          'The essentials',
                          'People & location',
                          'Configuration',
                          'Confirm & create',
                        ][i]
                      }
                    </small>
                  </span>
                  {i < 3 && <span className="step-line" />}
                </button>
              ))}
            </nav>
            <div className="form-layout">
              <div className="form-card">
                <div className="form-card-heading">
                  <span className="step-caption">
                    STEP {String(step + 1).padStart(2, '0')} / 04
                  </span>
                  <h2 ref={heading} tabIndex={-1}>
                    {STEPS[step]}
                  </h2>
                  <p>{intro}</p>
                </div>
                <form
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (step < 3) go(step + 1);
                    else void submit();
                  }}
                >
                  <fieldset disabled={busy || uncertain} className="form-fields">
                    <ErrorSummary errors={errors} />
                    {step === 0 && (
                      <>
                        <Section title="Project identity">
                          <div className="fields">
                            <TextField
                              name="Project_Name"
                              label="Project name"
                              value={draft.Project_Name}
                              onChange={(v) => set('Project_Name', v)}
                              errors={errors}
                              hint="Use a name your team will recognise."
                              wide
                            />
                            <SelectField
                              name="Project_Type"
                              label="Project type"
                              value={draft.Project_Type}
                              onChange={(v) => set('Project_Type', v)}
                              options={PROJECT_TYPES}
                              errors={errors}
                              required
                            />
                            <SelectField
                              name="Status"
                              label="Current status"
                              value={draft.Status}
                              onChange={(v) => set('Status', v)}
                              options={STATUSES}
                              errors={errors}
                              required
                            />
                          </div>
                        </Section>
                        <Section
                          title="System design"
                          description="Select every scenario that applies to this project."
                        >
                          <div className="fields">
                            <Field name="Scenario" label="Scenario" required errors={errors} wide>
                              <div
                                id="Scenario"
                                className="scenario-grid"
                                role="group"
                                aria-label="Scenario"
                                aria-describedby={errors.Scenario ? 'Scenario-error' : undefined}
                              >
                                {SCENARIOS.map((s) => (
                                  <label
                                    className={`scenario-choice ${draft.Scenario.includes(s) ? 'selected' : ''}`}
                                    key={s}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={draft.Scenario.includes(s)}
                                      onChange={(e) =>
                                        set(
                                          'Scenario',
                                          e.target.checked
                                            ? [...draft.Scenario, s]
                                            : draft.Scenario.filter((x) => x !== s),
                                        )
                                      }
                                    />
                                    <span>{s}</span>
                                  </label>
                                ))}
                              </div>
                            </Field>
                            <SelectField
                              name="Coupling_Type"
                              label="Coupling type"
                              value={draft.Coupling_Type}
                              onChange={(v) => set('Coupling_Type', v)}
                              options={['AC Coupling', 'DC Coupling']}
                              errors={errors}
                              required
                            />
                            {!isChannel(draft.Project_Type) && (
                              <SelectField
                                name="Product_Line"
                                label="Product line"
                                value={draft.Product_Line}
                                onChange={(v) => set('Product_Line', v)}
                                options={['PV', 'Storage', 'PV & Storage', 'Residential']}
                                errors={errors}
                              />
                            )}
                          </div>
                        </Section>
                        {!isChannel(draft.Project_Type) && (
                          <Section title="Reference">
                            <div className="fields">
                              <TextField
                                name="BX_Code"
                                label="BX code"
                                value={draft.BX_Code}
                                onChange={(v) => set('BX_Code', v)}
                                errors={errors}
                              />
                            </div>
                          </Section>
                        )}
                      </>
                    )}
                    {step === 1 && (
                      <>
                        <Section title="Client & location">
                          <div className="fields">
                            <div className="field-with-action">
                              <Lookup
                                name="Client"
                                label="Client"
                                source="clients"
                                preload
                                value={draft.Client}
                                onChange={(v) => set('Client', v)}
                                gateway={gateway}
                                errors={errors}
                                required
                              />
                              {mode === 'live' && (
                                <button
                                  type="button"
                                  className="button text small"
                                  onClick={() => native(() => gateway.openForm('Client'))}
                                >
                                  <Plus size={14} />
                                  New client
                                </button>
                              )}
                            </div>
                            <div className="field-with-action">
                              <Lookup
                                name="Site"
                                label="Site"
                                source="sites"
                                preload
                                value={draft.Site}
                                onChange={(v) => set('Site', v)}
                                gateway={gateway}
                                clientId={draft.Client?.id}
                                disabled={!draft.Client}
                                errors={errors}
                              />
                              <div className="field-actions">
                                {mode === 'live' && (
                                  <button
                                    type="button"
                                    className="button text small"
                                    disabled={!draft.Client}
                                    onClick={() =>
                                      native(() =>
                                        gateway.openForm('Site', { Client: draft.Client!.id }),
                                      )
                                    }
                                  >
                                    <Plus size={14} />
                                    New site
                                  </button>
                                )}
                                <span className="hint">
                                  Sites are filtered by the selected client.
                                </span>
                              </div>
                            </div>
                            <Lookup
                              name="Country"
                              label="Country"
                              source="countries"
                              value={draft.Country}
                              onChange={(v) => set('Country', v)}
                              gateway={gateway}
                              errors={errors}
                              required
                            />
                            {Boolean(draft.Country?.states?.length) && (
                              <SelectField
                                name="State"
                                label="State"
                                value={draft.State}
                                onChange={(v) => set('State', v)}
                                options={draft.Country!.states!}
                                errors={errors}
                                required
                              />
                            )}
                          </div>
                          {mode === 'live' && (
                            <p className="hint creation-hint">
                              Create in a new window, then search here.
                            </p>
                          )}
                        </Section>
                        <Section
                          title="Project team"
                          description="Link the people and organisations involved."
                        >
                          <div className="fields">
                            <Lookup
                              name="Project_Manager"
                              label="Project manager"
                              source="managers"
                              preload
                              value={draft.Project_Manager}
                              onChange={(v) => set('Project_Manager', v)}
                              gateway={gateway}
                              errors={errors}
                            />
                            <Lookup
                              name="Sales"
                              label="Sales"
                              source="sales"
                              value={draft.Sales}
                              onChange={(v) => set('Sales', v)}
                              gateway={gateway}
                              errors={errors}
                            />
                            <Lookup
                              name="Distributor"
                              label="Distributor"
                              source="distributors"
                              value={draft.Distributor}
                              onChange={(v) => set('Distributor', v)}
                              gateway={gateway}
                              errors={errors}
                            />
                            <MultiLookup
                              name="C4"
                              label="C4 references"
                              source="c4"
                              preload
                              values={draft.C4}
                              onChange={(v) => set('C4', v)}
                              gateway={gateway}
                              errors={errors}
                            />
                            <TextField
                              name="Stakeholders"
                              label="Stakeholders"
                              value={draft.Stakeholders}
                              onChange={(v) => set('Stakeholders', v)}
                              errors={errors}
                              wide
                            />
                          </div>
                        </Section>
                        {navigationError && (
                          <p role="alert" className="field-error">
                            {navigationError}
                          </p>
                        )}
                      </>
                    )}
                    {step === 2 && (
                      <Equipment draft={draft} errors={errors} gateway={gateway} set={set} />
                    )}
                    {step === 3 && <Review draft={draft} edit={go} />}
                  </fieldset>
                  {submissionError && (
                    <div className="submission-error" role="alert">
                      <TriangleAlert size={20} />
                      <div>
                        <strong>
                          {uncertain ? 'Creation needs checking' : 'Project was not confirmed'}
                        </strong>
                        <p>{submissionError}</p>
                        {uncertain && (
                          <p>
                            Use the Project report in Creator to confirm the result before reloading
                            this widget.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="form-footer">
                    <span className="required-note">
                      {step === 3 ? (
                        <>
                          <ShieldCheck size={15} />
                          Review before submitting
                        </>
                      ) : (
                        <>
                          <span>*</span> Required fields
                        </>
                      )}
                    </span>
                    <div className="footer-actions">
                      {step > 0 && (
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => go(step - 1)}
                          disabled={busy || uncertain}
                        >
                          <ArrowLeft size={16} />
                          Back
                        </button>
                      )}
                      <button type="submit" className="button primary" disabled={busy || uncertain}>
                        {busy ? (
                          <>
                            <LoaderCircle size={17} className="spin" />
                            Creating…
                          </>
                        ) : step === 3 ? (
                          <>
                            {mode === 'preview' ? 'Finish preview' : 'Create project'}
                            <Check size={17} />
                          </>
                        ) : (
                          <>
                            Continue
                            <ArrowRight size={17} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
              <aside className="guide">
                <div className="guide-icon">
                  <Layers3 size={20} />
                </div>
                <h3>Set up your project</h3>
                <p>
                  {
                    [
                      'Add the key details, then connect your client, site, and equipment.',
                      'Choose an existing client to see their sites. You can add the rest of the team later.',
                      'Add the details you have today. Your team can build on them as the project progresses.',
                      'Your project ID is assigned after creation. You can then continue in the project workspace.',
                    ][step]
                  }
                </p>
                <hr />
                <span className="guide-label">IN THIS STEP</span>
                <ul>
                  {[
                    ['Identity & status', 'System scenario', 'Coupling & product line'],
                    ['Client & site', 'Country & state', 'Team & references'],
                    ['Equipment & capacity', 'Purchase orders', 'Dates & service requests'],
                    ['Confirm your details', 'Create the project'],
                  ][step].map((t) => (
                    <li key={t}>
                      <span />
                      {t}
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
            <div className="bottom-note">
              Sungrow Service Australia<span>Project creation</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
