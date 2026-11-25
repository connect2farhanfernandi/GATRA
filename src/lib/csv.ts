import Papa from 'papaparse';

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  const csvBody = Papa.unparse({
    fields: headers,
    data: rows,
  });
  const blob = new Blob(['\uFEFF' + csvBody], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseCsvFile(file: File): Promise<Array<Record<string, string>>> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: 'greedy',
      quoteChar: '"',
      escapeChar: '"',
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          reject(new Error(results.errors[0].message));
          return;
        }

        const rawRows = results.data.filter((row) =>
          row.some((cell) => String(cell ?? '').trim().length > 0)
        );

        if (rawRows.length === 0) {
          resolve([]);
          return;
        }

        const headerRowIndex = rawRows.findIndex(
          (row) => row.filter((cell) => String(cell ?? '').trim().length > 0).length >= 2
        );
        const idx = headerRowIndex >= 0 ? headerRowIndex : 0;
        const headers = rawRows[idx].map((h, colIdx) =>
          String(h ?? '')
            .replace(/^\uFEFF/, '')
            .trim() || `__col_${colIdx}`
        );

        const mapped: Array<Record<string, string>> = [];
        for (let r = idx + 1; r < rawRows.length; r++) {
          const cells = rawRows[r];
          const obj: Record<string, string> = {};
          let hasData = false;
          for (let c = 0; c < headers.length; c++) {
            const key = headers[c];
            if (!key || key.startsWith('__col_')) continue;
            const val = String(cells[c] ?? '');
            if (val.trim().length > 0) hasData = true;
            obj[key] = val;
          }
          if (hasData) mapped.push(obj);
        }

        resolve(mapped);
      },
      error: (err) => {
        reject(err);
      },
    });
  });
}
