/** Labels inserted by POST /api/project-milestones/bootstrap when project has no milestones yet. */
const TEMPLATES = {
  advertising: ['比稿', '提案報價', 'Moodboard', 'Previz', 'Styleframe', 'Final Edit 01', 'Final Delivery'],
  design: ['Briefing', '概念提案', '修改定稿', '交付'],
  research: ['資料蒐集', '初稿', 'Review', '完稿'],
  generic: ['規劃', '執行中', '驗收', '完成'],
};

function listTemplateKeys() {
  return Object.keys(TEMPLATES);
}

function getTemplateLabels(key) {
  return TEMPLATES[key] ? [...TEMPLATES[key]] : null;
}

module.exports = { TEMPLATES, listTemplateKeys, getTemplateLabels };
