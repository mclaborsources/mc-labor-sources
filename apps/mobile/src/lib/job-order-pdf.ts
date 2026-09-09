type Snapshot = Record<string, unknown>;

export function jobOrderHtml(snapshot: Snapshot, orderNumber: string, noticeDataUrl: string) {
  const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
  const value = (key: string) => {
    const raw = snapshot[key];
    if (key === 'payRate' && snapshot.payRateHidden) return 'Hidden';
    if (raw === null || raw === undefined || raw === '') return '—';
    if (key === 'payRate') return `$${Number(raw).toFixed(2)}`;
    return String(raw);
  };
  const row = (label: string, content: string) => `<tr><th>${escape(label)}:</th><td>${escape(content)}</td></tr>`;
  const rows = (fields: string[][]) => fields.map(([label, key]) => row(label, value(key))).join('');
  const yesNo = (key: string) => `<span class="box">${snapshot[key] === true ? 'X' : '&nbsp;'}</span> Yes &nbsp; <span class="box">${snapshot[key] === true ? '&nbsp;' : 'X'}</span> No`;
  const booleanRow = (label: string, key: string) => `<tr><th>${escape(label)}:</th><td>${yesNo(key)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Job Order ${escape(orderNumber)}</title><style>
    @page { size: letter; margin: 28pt; }
    * { box-sizing: border-box; } body { margin: 0; color: #111; font: 9pt Arial, sans-serif; line-height: 1.3; }
    .header { width: 76%; border: 1.5pt solid #111; background: #ddd; text-align: center; font-weight: bold; padding: 5pt; margin-bottom: 12pt; }
    .employee { display: table; width: 100%; } .employee-details { display: table-cell; width: 67%; vertical-align: top; padding-right: 8pt; }
    .notice { display: table-cell; width: 33%; vertical-align: top; padding-top: 8pt; } .notice img { width: 100%; height: auto; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font: 9pt/1.3 Arial, sans-serif; } th { width: 34%; text-align: left; font-weight: bold; } th, td { padding: 2pt 0; vertical-align: top; overflow-wrap: anywhere; }
    .employee th { width: 42%; } .main { width: 76%; } .divider { border-top: 1.5pt solid #111; margin: 14pt 0 8pt; }
    .box { display: inline-block; width: 10pt; height: 10pt; border: 1pt solid #111; text-align: center; font: bold 8pt Arial; }
    .protective { border: 1pt solid #111; color: #d00; padding: 4pt; margin: 10pt 0; font-weight: bold; }
    .instructions { border: 1pt solid #111; background: #ddd; margin: 8pt 0; } .instructions div { padding: 3pt; } .instructions .heading { border-bottom: 1pt solid #111; font-weight: bold; }
    .scope { color: #d00; font-weight: bold; } .footer { font-size: 8pt; margin-top: 10pt; } tr, .protective, .instructions, .employee { break-inside: avoid; }
  </style></head><body>
    <div class="header">Industrial Power Group, Inc.<br>4 Arlington Road, Needham, MA 02494. Phone (800) 439-3360</div>
    <div class="employee"><div class="employee-details"><table>${row('Job Order #', String(snapshot.jobOrderNumber || orderNumber))}${rows([
      ['Emp Name', 'employeeName'], ['Emp Address', 'employeeAddress'], ['Email', 'employeeEmail'], ['Rate of hourly pay (USD)', 'payRate'], ['Home Phone', 'homePhone'], ['Mobile Phone', 'mobilePhone'],
    ])}</table></div><div class="notice"><img src="${escape(noticeDataUrl)}" alt="This is an important notice. Please have it translated."></div></div>
    <div class="main"><div class="divider"></div><table>${rows([
      ['Customer Name', 'customerName'], ['Customer Mailing Address', 'customerMailingAddress'], ['Job Name', 'jobName'], ['Site Address', 'siteAddress'],
    ])}${booleanRow('Is worksite on strike or lockout', 'strikeOrLockout')}${rows([
      ["Foreman's Name", 'foremanName'], ["Foreman's Phone", 'foremanPhone'], ["Foreman's Email Address", 'foremanEmail'], ['Start Time', 'startTime'], ['Estimated End Date of Job', 'estimatedEndDate'],
    ])}${booleanRow('Anticipated Overtime', 'anticipatedOvertime')}</table>
    <div class="protective">Protective Equipment: ${escape(value('protectiveEquipment'))}</div>
    <div class="instructions"><div class="heading">Job Instructions:</div><div>${escape(value('jobInstructions')).replace(/\n/g, '<br>')}</div><div class="scope">${escape(value('scopeChangeNotice'))}</div></div>
    <table>${booleanRow('Special training required', 'specialTraining')}${rows([
      ['Job position', 'jobPosition'], ['Desc and nature of assignment', 'assignmentNature'], ['Start date', 'startDate'], ['Pay date', 'payDate'], ['Special site data', 'specialSiteData'], ['Transportation and meals', 'transportationAndMeals'], ['Method of delivery', 'deliveryMethod'], ["Workers Comp Info", 'workersCompCompany'], ['Address', 'workersCompAddress'],
    ])}</table>${snapshot.footerNote ? `<p class="footer">${escape(snapshot.footerNote)}</p>` : ''}</div>
  </body></html>`;
}
