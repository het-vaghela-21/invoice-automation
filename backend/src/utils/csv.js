/**
 * Minimal CSV builder — no external dependency needed for this scale of export.
 * `columns` is [{ key, label }] where key is either a field name on the row
 * or a function(row) => value, so callers can pull from populated/nested data.
 */
function toCSV(rows, columns) {
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    // Quote anything containing a comma, quote, or newline; double up embedded quotes.
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const header = columns.map((c) => escape(c.label)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escape(typeof c.key === 'function' ? c.key(row) : row[c.key])).join(',')
  );
  return [header, ...lines].join('\r\n');
}

module.exports = { toCSV };
