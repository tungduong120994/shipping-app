const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();
const port = process.env.PORT || 3000;

// Initialize SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'customers.db'), (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    // Create customers table if not exists
    db.run(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        minLevel REAL NOT NULL,
        pricePerWeight REAL NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Error creating table:', err);
      } else {
        console.log('Customers table ready');
      }
    });
  }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API endpoint to get all sheet IDs (GID) from a Google Sheet by parsing sheet names
app.get('/api/sheet-ids/:sheetId', async (req, res) => {
  try {
    const { sheetId } = req.params;

    // Fetch the HTML page to find sheet names and GIDs
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    
    if (!response.ok) {
      return res.json({ success: false, gids: [], message: 'Cannot fetch spreadsheet' });
    }

    const html = await response.text();
    
    // Extract sheet names and their corresponding data
    // Look for pattern like "sheetId":123,"title":"T1/2026"
    const sheetRegex = /"sheetId":(\d+),"title":"([^"]+)"/g;
    const sheetMap = new Map();
    let match;

    while ((match = sheetRegex.exec(html)) !== null) {
      const gid = match[1];
      const name = match[2];
      sheetMap.set(gid, name);
    }

    // If we found sheet names, return them
    if (sheetMap.size > 0) {
      const gids = Array.from(sheetMap.keys()).sort((a, b) => parseInt(a) - parseInt(b));
      const sheetInfo = {};
      gids.forEach(gid => {
        sheetInfo[gid] = sheetMap.get(gid);
      });
      
      return res.json({ 
        success: true, 
        gids: gids,
        sheets: sheetInfo
      });
    }

    // Fallback: Try another regex pattern
    const sheetRegex2 = /"index":\d+,"sheetId":(\d+).*?"title":"([^"]+)"/g;
    while ((match = sheetRegex2.exec(html)) !== null) {
      const gid = match[1];
      const name = match[2];
      sheetMap.set(gid, name);
    }

    if (sheetMap.size > 0) {
      const gids = Array.from(sheetMap.keys()).sort((a, b) => parseInt(a) - parseInt(b));
      const sheetInfo = {};
      gids.forEach(gid => {
        sheetInfo[gid] = sheetMap.get(gid);
      });
      
      return res.json({ 
        success: true, 
        gids: gids,
        sheets: sheetInfo
      });
    }

    // Method 2: Brute force with smart GID guessing
    const gidsToTry = new Set();
    
    // Add GID 0 and sequential numbers
    for (let i = 0; i < 50; i++) {
      gidsToTry.add(i.toString());
    }
    
    // Add the known GID pattern
    gidsToTry.add('1853935368');
    
    // Add more potential GIDs around the known one
    const baseGid = 1853935368;
    for (let i = -10; i <= 10; i++) {
      if (baseGid + i > 0) {
        gidsToTry.add((baseGid + i).toString());
      }
    }

    const validGids = [];
    console.log(`Testing ${gidsToTry.size} GIDs...`);
    
    // Check which GIDs actually have data
    for (const gid of Array.from(gidsToTry)) {
      try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
        const csvResponse = await fetch(csvUrl, { timeout: 5000 });
        const csv = await csvResponse.text();
        
        // Check if we got real data
        const nonEmptyLines = csv.split('\n').filter(line => line.trim().length > 2);
        if (nonEmptyLines.length > 2) {
          validGids.push(gid);
          console.log(`Found valid sheet with GID: ${gid}`);
        }
      } catch (e) {
        // Skip failed requests
      }
    }

    if (validGids.length > 0) {
      return res.json({ 
        success: true, 
        gids: validGids.map(g => g.toString()).sort((a, b) => parseInt(a) - parseInt(b))
      });
    }

    res.json({ success: false, gids: [], message: 'No sheets found - try entering GIDs manually' });
  } catch (error) {
    console.error('Error in sheet-ids endpoint:', error);
    res.json({ success: false, gids: [], message: error.message });
  }
});

// API endpoint to fetch all sheets from Google Sheets
app.get('/api/sheets/:sheetId', async (req, res) => {
  try {
    const { sheetId } = req.params;
    const { gid } = req.query;

    // Fetch CSV from Google Sheets
    let url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    if (gid) {
      url += `&gid=${gid}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(400).json({ error: 'Cannot fetch data from Google Sheets' });
    }

    const csv = await response.text();
    const lines = csv.split('\n').filter(line => line.trim());
    
    const data = lines.map(line => {
      // Parse CSV carefully to handle quoted values
      const cells = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cells.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      cells.push(current.trim());
      
      return cells;
    });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to search for specific codes across multiple sheets
app.post('/api/search-codes', async (req, res) => {
  try {
    const { sheetId, gids, codes } = req.body;

    if (!sheetId || !gids || !codes || codes.length === 0) {
      return res.json({ success: false, error: 'Missing parameters' });
    }

    const foundCodes = new Map();
    const gidArray = Array.isArray(gids) ? gids : [gids];

    // Search in each sheet
    for (const gid of gidArray) {
      let url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      if (gid) {
        url += `&gid=${gid}`;
      }

      const response = await fetch(url);
      if (!response.ok) continue;

      const csv = await response.text();
      const lines = csv.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) continue;

      // Parse first row as header
      const headerRow = lines[0].split(',');
      
      // Parse data rows starting from index 1
      for (let rowIndex = 1; rowIndex < lines.length; rowIndex++) {
        const line = lines[rowIndex];
        if (!line.trim()) continue;

        // Parse CSV carefully to handle quoted values
        const cells = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            cells.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        cells.push(current.trim());

        // Normalize code function
        const normalizeCode = (value) => {
          let normalized = value.toString().trim();

          // Extract inside parentheses if present
          const parenMatch = normalized.match(/\(([^)]+)\)/);
          if (parenMatch) {
            normalized = parenMatch[1].trim();
          }

          // Normalize by removing suffix after first dash
          if (normalized.includes('-')) {
            normalized = normalized.split('-')[0].trim();
          }

          return normalized;
        };

        // Search through the row for the exact code, then weight is the next column.
        // Track which codes have been found in this row to avoid duplicates
        const foundInThisRow = new Set();
        const isWeightCell = (value) => /^[0-9]+(?:[.,][0-9]+)?$/.test(value.toString().trim());

        for (let colIndex = 0; colIndex < cells.length; colIndex++) {
          const cellValue = cells[colIndex];
          if (!cellValue || cellValue.trim() === '') continue;

          codes.forEach(searchCode => {
            const normalizedSearchCode = normalizeCode(searchCode);
            const normalizedCellValue = normalizeCode(cellValue);

            if (normalizedCellValue === normalizedSearchCode && !foundInThisRow.has(normalizedSearchCode)) {
              foundInThisRow.add(normalizedSearchCode);

              let canNang = '';
              const nextCell = cells[colIndex + 1] || '';
              const prevCell = cells[colIndex - 1] || '';

              if (isWeightCell(nextCell)) {
                canNang = nextCell;
              } else if (isWeightCell(prevCell)) {
                canNang = prevCell;
              }

              const rawDate = colIndex > 0 ? (headerRow[colIndex - 1] || 'N/A') : 'N/A';
              const dateMatch = rawDate.toString().match(/(\d{1,2}\/\d{1,2})/);
              const date = dateMatch ? dateMatch[1] : 'N/A';

              const result = {
                originalCode: cellValue, // Use actual cell value as original
                code: normalizedSearchCode,
                weight: canNang,
                date: date,
                maBao: cells[colIndex - 1] || '',
                gid: gid  // Track which sheet this came from
              };

              // Collect all results for this normalized code
              if (!foundCodes.has(normalizedSearchCode)) {
                foundCodes.set(normalizedSearchCode, []);
              }
              foundCodes.get(normalizedSearchCode).push(result);
            }
          });
        }
      }
    }

    // Return results - group by code and sum weights
    const found = [];
    const notFound = [];

    codes.forEach(code => {
      if (foundCodes.has(code)) {
        const results = foundCodes.get(code);
        
        // Group by gid (sheet) and get all occurrences per sheet
        const resultsByGid = new Map();
        results.forEach(result => {
          if (!resultsByGid.has(result.gid)) {
            resultsByGid.set(result.gid, []);
          }
          resultsByGid.get(result.gid).push(result);
        });
        
        const numberOfSheets = resultsByGid.size;
        let dedupedResults = [];
        let countTotal = 0;
        
        // Logic: 
        // - If code appears in ONLY 1 sheet: sum all occurrences (count them all, sum all weights)
        // - If code appears in MULTIPLE sheets: take 1 from each sheet (count = number of sheets, sum weights from those 1s)
        
        if (numberOfSheets === 1) {
          // Only in 1 sheet - use all occurrences and sum their weights
          const sheetEntries = Array.from(resultsByGid.entries());
          dedupedResults = sheetEntries[0][1];  // Get all results from the only sheet
          countTotal = dedupedResults.length;
        } else {
          // In multiple sheets - take only 1 from each sheet
          resultsByGid.forEach((sheetResults, gid) => {
            dedupedResults.push(sheetResults[0]);
          });
          countTotal = dedupedResults.length;
        }
        
        const uniqueOriginalCodes = [...new Set(dedupedResults.map(r => r.originalCode))];
        
        const groupedResult = {
          code: code,
          originalCodes: uniqueOriginalCodes,
          weight: dedupedResults[0].weight, // Keep original format from first result
          date: dedupedResults[0].date,
          maBao: dedupedResults[0].maBao,
          count: countTotal,
          totalWeight: dedupedResults.reduce((sum, item) => {
            const weight = parseFloat(item.weight.replace(',', '.'));
            return sum + (isNaN(weight) ? 0 : weight);
          }, 0).toFixed(2).replace('.', ',')
        };
        
        found.push(groupedResult);
      } else {
        notFound.push(code);
      }
    });

    res.json({ success: true, found, notFound });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoints for customer management
// Get all customers
app.get('/api/customers', (req, res) => {
  db.all('SELECT * FROM customers ORDER BY createdAt DESC', (err, rows) => {
    if (err) {
      console.error('Database error when getting customers:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    console.log('Retrieved customers from database:', rows || []);
    res.json({ success: true, customers: rows || [] });
  });
});

// Add a new customer
app.post('/api/customers', (req, res) => {
  try {
    const { code, minLevel, pricePerWeight } = req.body;

    if (!code || minLevel === undefined || pricePerWeight === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields: code, minLevel, pricePerWeight' });
    }

    const query = 'INSERT INTO customers (code, minLevel, pricePerWeight) VALUES (?, ?, ?)';
    db.run(query, [code.trim(), parseFloat(minLevel), parseFloat(pricePerWeight)], function(err) {
      if (err) {
        console.error('Database error when adding customer:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ success: false, error: 'Mã khách hàng đã tồn tại' });
        }
        return res.status(500).json({ success: false, error: err.message });
      }

      const newCustomer = {
        id: this.lastID,
        code: code.trim(),
        minLevel: parseFloat(minLevel),
        pricePerWeight: parseFloat(pricePerWeight),
        createdAt: new Date().toISOString()
      };

      console.log('Customer added to database:', newCustomer);
      res.json({ success: true, customer: newCustomer, message: 'Khách hàng được thêm thành công' });
    });
  } catch (error) {
    console.error('Error in POST /api/customers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a customer
app.put('/api/customers/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { code, minLevel, pricePerWeight } = req.body;

    if (!code || minLevel === undefined || pricePerWeight === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const query = 'UPDATE customers SET code = ?, minLevel = ?, pricePerWeight = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?';
    db.run(query, [code.trim(), parseFloat(minLevel), parseFloat(pricePerWeight), id], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ success: false, error: 'Mã khách hàng đã tồn tại' });
        }
        return res.status(500).json({ success: false, error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy khách hàng' });
      }

      db.get('SELECT * FROM customers WHERE id = ?', [id], (err, row) => {
        if (err) {
          return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, customer: row, message: 'Cập nhật khách hàng thành công' });
      });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a customer
app.delete('/api/customers/:id', (req, res) => {
  try {
    const { id } = req.params;

    const query = 'DELETE FROM customers WHERE id = ?';
    db.run(query, [id], function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy khách hàng' });
      }

      res.json({ success: true, message: 'Xóa khách hàng thành công' });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Close database on server shutdown
process.on('SIGINT', () => {
  console.log('\nClosing database...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database closed');
    }
    process.exit(0);
  });
});