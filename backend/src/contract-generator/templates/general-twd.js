/**
 * 一般委製合約（TWD）— 動畫 / 設計委製案常用版型。
 */

const fmtTwd = (n) => `NT$ ${Number(n || 0).toLocaleString('zh-TW')} 元整`;
const fmtDate = (s) => {
  if (!s) return '____ 年 __ 月 __ 日';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

module.exports = {
  id: 'general-twd',
  name: '一般委製合約（TWD）',
  description: '台幣委製案標準版型；含工作範圍、交付、付款、違約。',
  currency: 'TWD',
  render(data) {
    const { studio, client, project, contract } = data;
    const amount = contract.amount || 0;

    return `
      <header class="contract-header">
        <h1>動畫／影像 委製合約書</h1>
        <p class="meta">合約編號：${contract.contract_number || '________'}</p>
      </header>

      <section class="parties">
        <p>
          <strong>立合約書人：</strong>
        </p>
        <table class="parties-table">
          <tr>
            <td class="role">甲方<br/>（委製方）</td>
            <td>
              <div class="party-name">${client.name || '________'}</div>
              ${client.address ? `<div class="party-info">地址：${client.address}</div>` : ''}
              ${client.contact_email ? `<div class="party-info">Email：${client.contact_email}</div>` : ''}
              ${client.contact_phone ? `<div class="party-info">電話：${client.contact_phone}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td class="role">乙方<br/>（受託方）</td>
            <td>
              <div class="party-name">${studio.legal_name || studio.name}</div>
              <div class="party-info">統一編號：${studio.tax_id}</div>
              <div class="party-info">地址：${studio.address}</div>
              <div class="party-info">聯絡人：${studio.contact_name}（${studio.contact_email}）</div>
            </td>
          </tr>
        </table>
      </section>

      <p class="preamble">
        茲就甲方委託乙方執行下列影像／動畫製作專案事宜，雙方同意訂立本契約，並共同遵守下列各條約定。
      </p>

      <section class="clause">
        <h3>一、合作標的與工作範圍</h3>
        <ol>
          <li>專案名稱：<strong>${project.name || '________'}</strong></li>
          <li>工作範圍與交付規格依雙方另行確認之「製作需求書」或「報價單」為準，並視為本合約之一部分。</li>
          <li>本案執行期間：自 ${fmtDate(project.start_date)} 起至 ${fmtDate(project.end_date)} 止；如需展延，雙方應另以書面同意。</li>
        </ol>
      </section>

      <section class="clause">
        <h3>二、合約總金額</h3>
        <ol>
          <li>合約總金額為 <strong>${fmtTwd(amount)}</strong>（未稅），含稅後另行加計 5% 營業稅。</li>
          <li>付款方式與條件詳列於下列「付款條件」條款。</li>
        </ol>
      </section>

      {{CLAUSES}}

      <section class="clause">
        <h3>合約期間</h3>
        <p>
          本約自 ${fmtDate(contract.effective_date || contract.signed_date)} 生效，
          至 ${fmtDate(contract.expiry_date)} 屆滿；
          如本案延期，本約效力自動延至最終交付驗收完成為止。
        </p>
      </section>

      <section class="signatures">
        <table class="sign-table">
          <tr>
            <td>
              <p>甲方</p>
              <p>${client.name || '________'}</p>
              <p>簽署：____________________</p>
              <p>日期：${fmtDate(contract.signed_date)}</p>
            </td>
            <td>
              <p>乙方</p>
              <p>${studio.legal_name || studio.name}</p>
              <p>負責人：${studio.contact_name}</p>
              <p>簽署：____________________</p>
              <p>日期：${fmtDate(contract.signed_date)}</p>
            </td>
          </tr>
        </table>
      </section>
    `;
  },
};
