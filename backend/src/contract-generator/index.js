/**
 * 合約產生器：載入並暴露所有樣板與條款片段。
 */

const fs = require('fs');
const path = require('path');

function loadDir(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => require(path.join(dir, f)));
}

const templates = loadDir(path.join(__dirname, 'templates'));
const clauses = loadDir(path.join(__dirname, 'clauses'));

const templatesById = Object.fromEntries(templates.map((t) => [t.id, t]));
const clausesById = Object.fromEntries(clauses.map((c) => [c.id, c]));

function listTemplates() {
  return templates.map(({ id, name, description, currency }) => ({
    id,
    name,
    description,
    currency,
  }));
}

function listClauses() {
  return clauses.map(({ id, name, description }) => ({ id, name, description }));
}

function getTemplate(id) {
  return templatesById[id] || null;
}

function getClause(id) {
  return clausesById[id] || null;
}

module.exports = {
  listTemplates,
  listClauses,
  getTemplate,
  getClause,
};
