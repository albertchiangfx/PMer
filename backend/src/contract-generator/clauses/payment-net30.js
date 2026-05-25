module.exports = {
  id: 'payment-net30',
  name: '付款條件 NET 30',
  description: '簽約後 30 日內付款；分期可調整。',
  render() {
    return `
      <section class="clause">
        <h3>付款條件</h3>
        <ol>
          <li>合約金額共計如本約所示，分為兩期支付：</li>
          <li>第一期（50%）：合約簽署生效後 7 日內，由乙方開立發票，甲方應於收到發票後 <strong>30 日內</strong> 一次付清。</li>
          <li>第二期（50%）：本案最終交付通過驗收後，由乙方開立發票，甲方應於收到發票後 <strong>30 日內</strong> 一次付清。</li>
          <li>所有款項應匯入乙方指定之銀行帳戶；匯款手續費由匯款方負擔。</li>
        </ol>
      </section>
    `;
  },
};
