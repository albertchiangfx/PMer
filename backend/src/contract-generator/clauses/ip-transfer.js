module.exports = {
  id: 'ip-transfer',
  name: '著作財產權讓與',
  description: '驗收完成且全額付清後，著作財產權讓與甲方。',
  render() {
    return `
      <section class="clause">
        <h3>著作財產權歸屬</h3>
        <ol>
          <li>本案最終交付物之著作財產權，於本約全額款項支付完畢、且乙方收到甲方驗收完成通知後，由乙方讓與甲方。</li>
          <li>乙方仍保有作者人格權，並得於日後作品集、展覽、宣傳場合使用本案成果之截圖、片段或縮圖，作為公司形象推廣，但不得用於與甲方競業之商業用途。</li>
          <li>乙方執行本案過程中所使用之自家工具、流程、技術元件（rigging / shader / template 等），其權利仍歸乙方所有，不在本條讓與範圍。</li>
        </ol>
      </section>
    `;
  },
};
