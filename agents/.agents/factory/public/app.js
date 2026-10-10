'use strict';

/* Factory operations board.
   Contract (see ../types.ts):
     GET  /api/session      -> { token: string }
     GET  /api/jobs         -> Snapshot { jobs, projects, errors }
     GET  /api/jobs/:id     -> JobDetail { job, documents, events, artifacts }
     POST /api/action       { action, id, answer? } with X-Factory-Token -> { ok: true }
     GET  /api/events       SSE, emits "change" events
     GET  /api/artifact?id=&path=   approved report / check log files
   All remote text is rendered via textContent only. No innerHTML anywhere. */

(() => {
  /* ---------- constants ---------- */

  const STAGES = ['plan', 'build', 'verify', 'review', 'deliver'];

  const COLUMNS = [
    { key: 'queued', label: 'Queued' },
    { key: 'building', label: 'Building' },
    { key: 'reviewing', label: 'Reviewing' },
    { key: 'ready', label: 'Ready' },
  ];

  const ARCHIVE = [
    { key: 'paused', label: 'Paused' },
    { key: 'interrupted', label: 'Interrupted' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const STATE_LABELS = {
    queued: 'Queued',
    building: 'Building',
    reviewing: 'Reviewing',
    ready: 'Ready',
    'needs-human': 'Needs you',
    paused: 'Paused',
    cancelled: 'Cancelled',
    completed: 'Completed',
    interrupted: 'Interrupted',
  };

  const KNOWN_STATES = new Set(Object.keys(STATE_LABELS));

  /* ---------- tiny safe DOM helper ---------- */

  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'text') node.textContent = v;
        else if (k === 'class') node.className = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const c of children.flat(9)) {
      if (c == null || c === false) continue;
      node.append(c);
    }
    return node;
  }

  const $ = (id) => document.getElementById(id);

  /* replaceChildren that tolerates arrays, nulls and false (replaceChildren itself throws on those) */
  function setKids(el, children) {
    el.replaceChildren(...children.flat(9).filter((c) => c != null && c !== false));
  }

  /* ---------- state ---------- */

  const state = {
    token: null,
    snapshot: null,
    filter: 'all',
    connected: false,
    lastError: null,
    detailId: null,
    detailData: null,
    returnFocus: null,
  };

  /* ---------- formatting ---------- */

  function money(usd, runtime) {
    if (runtime === 'codex') return 'USD n/a';
    return Number.isFinite(usd) ? `$${usd.toFixed(2)}` : '$0.00';
  }

  function shortSha(sha) {
    return typeof sha === 'string' && sha.length > 10 ? sha.slice(0, 10) : (sha || '-');
  }

  function ago(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 45) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const hr = Math.floor(m / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    return `${d}d ago`;
  }

  function stamp(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return iso || '';
    return new Date(t).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function activeTime(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const m = Math.round(ms / 60000);
    if (m < 1) return '<1m active';
    if (m < 60) return `${m}m active`;
    const hr = Math.floor(m / 60);
    return `${hr}h ${m % 60}m active`;
  }

  function esc(s) {
    return s == null ? '' : String(s);
  }

  /* ---------- outbound link policy: https on github.com only ---------- */

  function safeGithubUrl(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') return null;
      const host = url.hostname.toLowerCase();
      if (host !== 'github.com' && !host.endsWith('.github.com')) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function externalLink(raw, text, cls) {
    const href = safeGithubUrl(raw);
    if (!href) return null;
    return h('a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer', text });
  }

  function artifactHref(jobId, path) {
    return `/api/artifact?id=${encodeURIComponent(jobId)}&path=${encodeURIComponent(path)}`;
  }

  /* ---------- API ---------- */

  async function apiGet(path) {
    const res = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Request failed: GET ${path} returned ${res.status}`);
    return res.json();
  }

  async function getToken() {
    if (state.token) return state.token;
    const data = await apiGet('/api/session');
    if (!data || typeof data.token !== 'string') throw new Error('Session response did not include a token');
    state.token = data.token;
    return state.token;
  }

  async function postAction(body, retried) {
    const token = await getToken();
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Factory-Token': token },
      body: JSON.stringify(body),
    });
    if ((res.status === 401 || res.status === 403) && !retried) {
      state.token = null;
      return postAction(body, true);
    }
    if (!res.ok) {
      const failure = await res.json().catch(() => ({}));
      throw new Error(failure.error || `Action "${body.action}" failed with status ${res.status}`);
    }
    return res.json().catch(() => ({ ok: true }));
  }

  /* ---------- data loading ---------- */

  async function refresh() {
    try {
      const snap = await apiGet('/api/jobs');
      state.snapshot = snap;
      state.lastError = null;
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err);
    }
    render();
    if (dialog.open && state.detailId && document.activeElement?.tagName !== 'TEXTAREA') reloadDetail();
  }

  async function reloadDetail() {
    try {
      const data = await apiGet(`/api/jobs/${encodeURIComponent(state.detailId)}`);
      state.detailData = data;
      renderDetail();
    } catch {
      /* keep showing the last good detail; banner already reports refresh errors */
    }
  }

  /* ---------- live connection (SSE) ---------- */

  function setConnected(on) {
    state.connected = on;
    const conn = $('conn');
    conn.classList.toggle('conn-live', on);
    conn.classList.toggle('conn-dead', !on);
    conn.classList.remove('conn-idle');
    $('conn-text').textContent = on ? 'Live' : 'Disconnected';
  }

  function connectEvents() {
    const es = new EventSource('/api/events');
    let timer = null;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // the browser retries automatically
    es.addEventListener('change', () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 200); // debounce bursts of change events
    });
  }

  /* ---------- actions ---------- */

  async function runAction(body, context) {
    const buttons = context ? Array.from(context.querySelectorAll('button')) : [];
    buttons.forEach((b) => { b.disabled = true; });
    try {
      await postAction(body);
      state.lastError = null;
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      state.lastError = msg;
      renderBanner();
      showDetailError(msg);
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  function actionButton(label, cls, body, job) {
    return h('button', {
      class: `btn ${cls}`,
      type: 'button',
      onclick: (e) => {
        const ctx = e.currentTarget.closest('form, .detail-controls, .human-card') || e.currentTarget.parentElement;
        runAction(body, ctx);
      },
      text: label,
    });
  }

  function controlsFor(job) {
    const controls = [];
    const id = job.id;
    switch (job.state) {
      case 'queued':
      case 'building':
      case 'reviewing':
        controls.push(actionButton('Pause', 'btn-quiet', { action: 'pause', id }, job));
        controls.push(actionButton('Cancel', 'btn-danger', { action: 'cancel', id }, job));
        break;
      case 'needs-human':
      case 'paused':
      case 'interrupted':
        controls.push(actionButton('Resume', 'btn-primary', { action: 'resume', id }, job));
        controls.push(actionButton('Cancel', 'btn-danger', { action: 'cancel', id }, job));
        break;
      case 'ready': {
        // Ready work is only ever opened as a pull request, never merged here.
        const pr = externalLink(job.pr, 'Open PR', 'btn btn-primary pr-action');
        if (pr) controls.push(pr);
        controls.push(actionButton('Pause', 'btn-quiet', { action: 'pause', id }, job));
        break;
      }
      default:
        break;
    }
    return controls;
  }

  function answerForm(job) {
    const input = h('textarea', {
      class: 'answer-input', rows: '3', required: true,
      'aria-label': `Your answer for ${job.title}`,
      placeholder: 'Type the answer the job is waiting for',
    });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit', text: 'Send answer' });
    const cancelBtn = actionButton('Cancel job', 'btn-danger', { action: 'cancel', id: job.id }, job);
    const form = h('form', { class: 'answer-form' },
      h('label', { class: 'answer-label', text: 'Your answer' }),
      input,
      h('div', { class: 'answer-actions' }, submit, cancelBtn));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const answer = input.value.trim();
      if (!answer) return;
      runAction({ action: 'answer', id: job.id, answer }, form);
    });
    return form;
  }

  /* ---------- shared bits ---------- */

  function stateBadge(job) {
    const st = KNOWN_STATES.has(job.state) ? job.state : 'queued';
    return h('span', { class: `badge st-${st}`, text: STATE_LABELS[st] });
  }

  function trail(job) {
    const idx = Math.max(0, STAGES.indexOf(job.stage));
    const allDone = job.state === 'ready' || job.state === 'completed';
    const items = STAGES.map((stageName, i) => {
      const cls = allDone || i < idx ? 'done' : i === idx ? 'current' : 'todo';
      return h('li', {
        class: `trail-step ${cls}`,
        title: stageName,
        'aria-label': `${stageName}${cls === 'current' ? ', current stage' : ''}`,
      });
    });
    return h('ol', {
      class: 'trail',
      'aria-label': `Stage ${job.stage}, step ${idx + 1} of ${STAGES.length}`,
    }, items);
  }

  function metaLine(job) {
    const bits = [`Round ${job.round ?? 1}`];
    if (job.config && job.config.profile) bits.push(job.config.profile);
    const active = activeTime(job.activeMs);
    if (active) bits.push(active);
    bits.push(`updated ${ago(job.updatedAt)}`);
    return h('div', { class: 'card-meta', text: bits.join(' · ') });
  }

  /* ---------- job card ---------- */

  function card(job) {
    const kids = [];

    kids.push(h('div', { class: 'card-top' },
      h('span', { class: 'card-project', text: job.projectName || job.project || 'project' }),
      h('span', { class: 'card-cost', text: money(job.costUSD, job.config?.runtime) })));

    kids.push(h('button', {
      class: 'card-title',
      type: 'button',
      'aria-haspopup': 'dialog',
      text: job.title || job.id,
      onclick: () => openDetail(job.id),
    }));

    kids.push(h('div', { class: 'card-stage-row' },
      trail(job),
      h('span', { class: 'card-stage', text: job.stage || '-' })));

    if (job.activity) kids.push(h('p', { class: 'card-activity', text: job.activity }));

    kids.push(metaLine(job));

    if (job.lastSummary) kids.push(h('p', { class: 'card-summary', text: job.lastSummary }));

    const pr = externalLink(job.pr, 'Open PR', 'card-pr');
    if (pr) kids.push(pr);

    return h('article', { class: 'card', dataset: { id: job.id } }, kids);
  }

  /* ---------- needs-you (human decision) card ---------- */

  function decisionFields(decision) {
    const d = decision || {};
    const tried = Array.isArray(d.alreadyTried) ? d.alreadyTried : [];
    return h('dl', { class: 'decision' },
      h('div', { class: 'decision-field' },
        h('dt', { class: 'decision-term', text: 'Blocked on' }),
        h('dd', { class: 'decision-desc', text: d.blockedOn || 'Not specified' })),
      h('div', { class: 'decision-field' },
        h('dt', { class: 'decision-term', text: 'Already tried' }),
        tried.length
          ? h('dd', { class: 'decision-desc' }, h('ul', { class: 'tried-list' }, tried.map((t) => h('li', { text: t }))))
          : h('dd', { class: 'decision-desc', text: 'Nothing tried yet' })),
      h('div', { class: 'decision-field' },
        h('dt', { class: 'decision-term', text: 'Recommendation' }),
        h('dd', { class: 'decision-desc', text: d.recommendation || 'No recommendation given' })),
      h('div', { class: 'decision-field' },
        h('dt', { class: 'decision-term', text: 'Need from you' }),
        h('dd', { class: 'decision-desc', text: d.needFromYou || 'An answer to continue' })));
  }

  function humanCard(job) {
    return h('article', { class: 'human-card', dataset: { id: job.id } },
      h('div', { class: 'human-card-head' },
        h('button', {
          class: 'human-title-btn',
          type: 'button',
          'aria-haspopup': 'dialog',
          text: job.title || job.id,
          onclick: () => openDetail(job.id),
        }),
        h('span', {
          class: 'human-meta',
          text: `${job.projectName || job.project} · round ${job.round ?? 1} · ${money(job.costUSD, job.config?.runtime)}`,
        })),
      decisionFields(job.decision),
      answerForm(job));
  }

  /* ---------- board rendering ---------- */

  function filteredJobs() {
    const jobs = (state.snapshot && Array.isArray(state.snapshot.jobs)) ? state.snapshot.jobs : [];
    if (state.filter === 'all') return jobs;
    return jobs.filter((j) => j.project === state.filter);
  }

  function renderFilter() {
    const sel = $('project-filter');
    const projects = (state.snapshot && Array.isArray(state.snapshot.projects)) ? state.snapshot.projects : [];
    const jobs = (state.snapshot && Array.isArray(state.snapshot.jobs)) ? state.snapshot.jobs : [];
    const nameOf = new Map();
    for (const j of jobs) if (j.project && !nameOf.has(j.project)) nameOf.set(j.project, j.projectName || j.project);

    const current = state.filter;
    setKids(sel, [h('option', { value: 'all', text: 'All projects' })]);
    for (const p of projects) sel.append(h('option', { value: p, text: nameOf.get(p) || p }));
    sel.value = [...sel.options].some((o) => o.value === current) ? current : 'all';
    state.filter = sel.value;
  }

  function renderColumn(col, jobs) {
    const list = $(`list-${col.key}`);
    const items = jobs.filter((j) => j.state === col.key);
    $(`count-${col.key}`).textContent = String(items.length);
    setKids(list, items.length
      ? items.map(card)
      : [h('p', { class: 'col-empty', text: `No ${col.label.toLowerCase()} jobs.` })]);
  }

  function renderArchiveGroup(group, jobs) {
    const items = jobs.filter((j) => j.state === group.key);
    $(`count-${group.key}`).textContent = String(items.length);
    setKids($(`list-${group.key}`), items.length
      ? items.map(card)
      : [h('p', { class: 'col-empty', text: `No ${group.label.toLowerCase()} jobs.` })]);
  }

  function renderNeeds(jobs) {
    const items = jobs.filter((j) => j.state === 'needs-human');
    $('needs').hidden = items.length === 0;
    if (!items.length) return;
    $('needs-count').textContent = `${items.length} waiting`;
    // Live updates must not discard a human's in-progress answer.
    if ($('needs-list').contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return;
    setKids($('needs-list'), items.map(humanCard));
  }

  function renderEmpty() {
    const all = (state.snapshot && Array.isArray(state.snapshot.jobs)) ? state.snapshot.jobs : [];
    $('empty').hidden = all.length !== 0;
  }

  function renderBanner() {
    const banner = $('banner');
    const errs = [];
    if (state.lastError) errs.push(state.lastError);
    const snapErrs = (state.snapshot && Array.isArray(state.snapshot.errors)) ? state.snapshot.errors : [];
    for (const e of snapErrs) errs.push(e);
    banner.hidden = errs.length === 0;
    setKids(banner, errs.length
      ? [h('ul', { class: 'banner-list' }, errs.map((e) => h('li', { class: 'banner-item', text: e })))]
      : []);
  }

  function render() {
    renderBanner();
    renderEmpty();
    if (!state.snapshot) return;
    renderFilter();
    const jobs = filteredJobs();
    renderNeeds(jobs);
    for (const col of COLUMNS) renderColumn(col, jobs);
    for (const group of ARCHIVE) renderArchiveGroup(group, jobs);
  }

  /* ---------- detail dialog ---------- */

  const dialog = $('detail');
  const detailBody = $('detail-body');

  function showDetailError(msg) {
    const el = $('detail-error');
    if (el && dialog.open) {
      el.hidden = false;
      el.textContent = msg;
    }
  }

  function detailErrorRegion() {
    return h('div', { class: 'detail-error', id: 'detail-error', role: 'alert', hidden: true });
  }

  function metaItem(key, value, mono) {
    return h('div', { class: 'meta-item' },
      h('span', { class: 'meta-key', text: key }),
      h('span', { class: mono ? 'meta-val mono' : 'meta-val', text: value }));
  }

  function section(title, ...children) {
    return h('section', { class: 'detail-section' },
      h('h3', { class: 'detail-section-title', text: title }),
      children.length ? children : h('p', { class: 'detail-none', text: 'Nothing here yet.' }));
  }

  function sectionSpec(job, documents) {
    const docs = documents && typeof documents === 'object' ? Object.entries(documents) : [];
    const kids = [];
    if (job.request) {
      kids.push(h('div', { class: 'doc', open: true },
        h('div', { class: 'detail-none', text: 'Request' }),
        h('pre', { class: 'doc-pre', text: job.request })));
    }
    for (const [name, content] of docs) {
      kids.push(h('details', { class: 'doc' },
        h('summary', { text: name }),
        h('pre', { class: 'doc-pre', text: esc(content) })));
    }
    if (!kids.length) kids.push(h('p', { class: 'detail-none', text: 'No spec documents yet.' }));
    return section('Spec', ...kids);
  }

  function sectionBuild(job) {
    const ev = job.evidence;
    const kids = [];

    kids.push(h('div', { class: 'meta-grid' },
      metaItem('Branch', job.branch || '-', true),
      metaItem('Target', job.targetBranch || '-', true),
      metaItem('Base', shortSha(job.baseSha), true),
      metaItem('Round', String(job.round ?? 1)),
      metaItem('Cost', money(job.costUSD, job.config?.runtime)),
      metaItem('Active', activeTime(job.activeMs) || '0m'),
      metaItem('Profile', (job.config && job.config.profile) || '-'),
      metaItem('Model', (job.config && job.config.model) || '-')));

    const checks = ev && Array.isArray(ev.checks) ? ev.checks : [];
    if (checks.length) {
      const rows = checks.map((c) => h('tr', {},
        h('td', { text: c.name || '-' }),
        h('td', {}, h('span', { class: 'check-cmd', text: c.command || '-' })),
        h('td', {}, h('span', {
          class: `check-status check-${c.status === 'passed' ? 'passed' : c.status === 'failed' ? 'failed' : 'unavailable'}`,
          text: c.status || 'unavailable',
        })),
        h('td', { class: 'mono', text: c.exitCode == null ? '-' : String(c.exitCode) }),
        h('td', {}, c.artifact
          ? h('a', { class: 'check-log', href: artifactHref(job.id, c.artifact), target: '_blank', rel: 'noopener', text: 'Log' })
          : '-')));
      kids.push(h('div', { class: 'checks' },
        h('table', { class: 'checks-table' },
          h('thead', {}, h('tr', {},
            h('th', { text: 'Check' }), h('th', { text: 'Command' }), h('th', { text: 'Result' }),
            h('th', { text: 'Exit' }), h('th', { text: 'Log' }))),
          h('tbody', {}, rows))));
    } else {
      kids.push(h('p', { class: 'detail-none', text: 'No check results yet.' }));
    }

    if (job.error) {
      kids.push(h('p', { class: 'detail-error', text: job.error, hidden: false }));
    }

    return section('Build', ...kids);
  }

  function sectionDecisions(job) {
    const kids = [];
    if (job.decision) kids.push(decisionFields(job.decision));
    else kids.push(h('p', { class: 'detail-none', text: 'No open decisions.' }));
    if (job.state === 'needs-human') kids.push(answerForm(job));
    return section('Decisions', ...kids);
  }

  function verdictBadge(verdict) {
    const map = { pass: ['Passed review', 'check-passed'], changes: ['Changes requested', 'check-unavailable'], blocked: ['Blocked', 'check-failed'] };
    const [label, cls] = map[verdict] || ['Not reviewed', 'check-unavailable'];
    return h('span', { class: `check-status ${cls}`, text: label });
  }

  function findingItem(f) {
    const sev = ['blocking', 'warning', 'info'].includes(f.severity) ? f.severity : 'info';
    return h('li', { class: `finding finding-${sev}` },
      h('div', { class: 'finding-head' },
        h('span', { class: 'finding-sev', text: sev }),
        f.location ? h('span', { class: 'finding-loc', text: f.location }) : null),
      h('p', { class: 'finding-body', text: f.explanation || '' }),
      f.suggestedFix ? h('p', { class: 'finding-fix' }, h('strong', { text: 'Suggested fix: ' }), f.suggestedFix) : null);
  }

  function sectionApproval(job) {
    const ev = job.evidence;
    const kids = [];

    if (ev && ev.review) {
      const review = ev.review;
      kids.push(h('div', { class: 'meta-grid' },
        h('div', { class: 'meta-item' },
          h('span', { class: 'meta-key', text: 'Verdict' }),
          h('span', { class: 'meta-val' }, verdictBadge(review.verdict))),
        metaItem('Reviewed', `${stamp(ev.reviewedAt)} (${ago(ev.reviewedAt)})`),
        metaItem('Round', String(ev.round ?? job.round ?? 1)),
        metaItem('Commit', shortSha(ev.sha), true),
        metaItem('Spec hash', shortSha(ev.specHash), true),
        metaItem('Config hash', shortSha(ev.configHash), true)));

      if (review.summary) kids.push(h('p', { class: 'finding-body', text: review.summary }));

      const findings = Array.isArray(review.findings) ? review.findings : [];
      if (findings.length) {
        kids.push(h('ul', { class: 'artifact-list' }, findings.map(findingItem)));
      } else {
        kids.push(h('p', { class: 'detail-none', text: 'No findings.' }));
      }
    } else {
      kids.push(h('p', { class: 'detail-none', text: 'Not yet reviewed.' }));
    }

    if (job.state === 'ready') {
      const pr = externalLink(job.pr, 'Open PR', 'btn btn-primary pr-action');
      if (pr) kids.push(h('div', {}, pr));
    }

    return section('Approval', ...kids);
  }

  function sectionHistory(events) {
    const items = Array.isArray(events) ? events : [];
    if (!items.length) return section('History', h('p', { class: 'detail-none', text: 'No events recorded.' }));
    const rows = items.map((ev) => h('li', { class: 'history-item' },
      h('span', { class: 'history-at', text: stamp(ev.at) }),
      h('span', { class: 'history-type', text: ev.type || '-' }),
      h('span', { class: 'history-msg', text: ev.message || '' })));
    return section('History',
      h('details', { class: 'history' },
        h('summary', { text: `${items.length} event${items.length === 1 ? '' : 's'}` }),
        h('ol', { class: 'history-list' }, rows)));
  }

  function sectionArtifacts(job, artifacts) {
    const items = Array.isArray(artifacts) ? artifacts : [];
    const kids = [h('p', { class: 'artifact-note', text: 'Approved reports and check logs for this job.' })];
    if (items.length) {
      kids.push(h('ul', { class: 'artifact-list' },
        items.map((p) => h('li', {},
          h('a', { class: 'artifact-link', href: artifactHref(job.id, p), target: '_blank', rel: 'noopener', text: p })))));
    } else {
      kids.push(h('p', { class: 'detail-none', text: 'No artifacts published.' }));
    }
    return section('Artifacts', ...kids);
  }

  function detailHeader(job) {
    return h('div', { class: 'detail-head' },
      h('div', { class: 'detail-titles' },
        h('h2', { class: 'detail-title', id: 'detail-title', text: job.title || job.id }),
        h('div', { class: 'detail-badges' },
          stateBadge(job),
          h('span', { class: 'badge', text: job.projectName || job.project || '-' }),
          h('span', { class: 'badge', text: (job.config && job.config.profile) || '-' }),
          h('span', { class: 'badge', text: `round ${job.round ?? 1}` }),
          h('span', { class: 'badge mono', text: job.id }))),
      h('button', {
        class: 'detail-close', type: 'button', 'aria-label': 'Close detail', text: '×',
        onclick: () => dialog.close(),
      }));
  }

  function renderDetail() {
    const d = state.detailData;
    if (!d || !d.job) return;
    const { job } = d;
    const controls = controlsFor(job);
    setKids(detailBody, [
      detailHeader(job),
      controls.length ? h('div', { class: 'detail-controls' }, controls) : null,
      detailErrorRegion(),
      sectionSpec(job, d.documents),
      sectionBuild(job),
      sectionDecisions(job),
      sectionApproval(job),
      sectionHistory(d.events),
      sectionArtifacts(job, d.artifacts)]);
  }

  async function openDetail(id) {
    state.detailId = id;
    state.detailData = null;
    state.returnFocus = document.activeElement;
    detailBody.replaceChildren(h('p', { class: 'detail-loading', text: 'Loading job detail…' }));
    if (!dialog.open) dialog.showModal();
    try {
      const data = await apiGet(`/api/jobs/${encodeURIComponent(id)}`);
      if (state.detailId !== id) return; // user moved on
      state.detailData = data;
      renderDetail();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      detailBody.replaceChildren(
        h('div', { class: 'detail-head' },
          h('div', { class: 'detail-titles' }, h('h2', { class: 'detail-title', id: 'detail-title', text: 'Could not load job' })),
          h('button', { class: 'detail-close', type: 'button', 'aria-label': 'Close detail', text: '×', onclick: () => dialog.close() })),
        h('p', { class: 'detail-loading', text: msg }));
      state.lastError = msg;
      renderBanner();
    }
  }

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close(); // backdrop click
  });

  dialog.addEventListener('close', () => {
    state.detailId = null;
    state.detailData = null;
    if (state.returnFocus && typeof state.returnFocus.focus === 'function') state.returnFocus.focus();
    state.returnFocus = null;
  });

  /* ---------- wiring ---------- */

  $('project-filter').addEventListener('change', (e) => {
    state.filter = e.target.value;
    render();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });

  /* ---------- boot ---------- */

  refresh();
  connectEvents();
  setInterval(() => { if (!document.hidden) refresh(); }, 30000); // slow safety poll
})();
