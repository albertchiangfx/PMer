module.exports = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${err.stack || err.message}`);

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate entry', detail: err.detail });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record not found', detail: err.detail });
  }
  if (err.code === '23502') {
    return res.status(400).json({ error: 'Required field missing', detail: err.detail });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
};
