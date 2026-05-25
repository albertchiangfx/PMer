module.exports = {
  id: 'late-fee',
  name: '逾期付款違約金',
  description: '逾期未付每日加計 0.05% 違約金。',
  render() {
    return `
      <section class="clause">
        <h3>逾期付款違約金</h3>
        <ol>
          <li>甲方如未依約定期日付款，每逾一日，應按應付未付金額計算 <strong>萬分之五（0.05%）</strong> 違約金予乙方。</li>
          <li>逾期超過 <strong>30 日</strong> 仍未付款者，乙方得書面通知甲方暫停提供本案服務；且不影響乙方依本約其他規定請求損害賠償之權利。</li>
        </ol>
      </section>
    `;
  },
};
