/**
 * Foreign Project Service Agreement (USD) — for international clients.
 */

const fmtUsd = (n) =>
  `US$ ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s) => {
  if (!s) return '____, ____';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

module.exports = {
  id: 'foreign-usd',
  name: 'Foreign Project Service Agreement (USD)',
  description: '英文版合約；國外客戶 USD 結算。',
  currency: 'USD',
  render(data) {
    const { studio, client, project, contract } = data;
    const amount = contract.amount || 0;

    return `
      <header class="contract-header">
        <h1>Animation / Production Service Agreement</h1>
        <p class="meta">Contract No. ${contract.contract_number || '________'}</p>
      </header>

      <section class="parties">
        <p><strong>This Agreement is entered into between:</strong></p>
        <table class="parties-table">
          <tr>
            <td class="role">CLIENT</td>
            <td>
              <div class="party-name">${client.name || '________'}</div>
              ${client.address ? `<div class="party-info">Address: ${client.address}</div>` : ''}
              ${client.contact_email ? `<div class="party-info">Email: ${client.contact_email}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td class="role">SERVICE<br/>PROVIDER</td>
            <td>
              <div class="party-name">${studio.legal_name || studio.name}</div>
              <div class="party-info">Tax ID: ${studio.tax_id}</div>
              <div class="party-info">Address: ${studio.address}</div>
              <div class="party-info">Contact: ${studio.contact_name} (${studio.contact_email})</div>
            </td>
          </tr>
        </table>
      </section>

      <p class="preamble">
        WHEREAS the Client wishes to engage the Service Provider to produce certain animation / production deliverables described herein, the parties agree as follows.
      </p>

      <section class="clause">
        <h3>1. Scope of Work</h3>
        <ol>
          <li>Project: <strong>${project.name || '________'}</strong></li>
          <li>The detailed scope, deliverables and specifications are defined in the Statement of Work / Quotation mutually agreed in writing, which forms an integral part of this Agreement.</li>
          <li>Project Term: from ${fmtDate(project.start_date)} to ${fmtDate(project.end_date)}; extensions require written agreement of both parties.</li>
        </ol>
      </section>

      <section class="clause">
        <h3>2. Total Fee</h3>
        <ol>
          <li>Total contract value: <strong>${fmtUsd(amount)}</strong>, exclusive of any local taxes or wire transfer fees.</li>
          <li>Payment terms are described under the Payment Terms section below.</li>
        </ol>
      </section>

      {{CLAUSES}}

      <section class="clause">
        <h3>Term</h3>
        <p>
          This Agreement shall be effective as of ${fmtDate(contract.effective_date || contract.signed_date)}
          and shall remain in effect until ${fmtDate(contract.expiry_date)}, or until final acceptance of the deliverables, whichever is later.
        </p>
      </section>

      <section class="signatures">
        <table class="sign-table">
          <tr>
            <td>
              <p>CLIENT</p>
              <p>${client.name || '________'}</p>
              <p>Signature: ____________________</p>
              <p>Date: ${fmtDate(contract.signed_date)}</p>
            </td>
            <td>
              <p>SERVICE PROVIDER</p>
              <p>${studio.legal_name || studio.name}</p>
              <p>By: ${studio.contact_name}</p>
              <p>Signature: ____________________</p>
              <p>Date: ${fmtDate(contract.signed_date)}</p>
            </td>
          </tr>
        </table>
      </section>
    `;
  },
};
