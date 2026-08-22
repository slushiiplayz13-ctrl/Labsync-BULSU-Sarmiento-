/**
 * LabSync – Curriculum File Parsing & Import Engine | js/scheduling/import.js
 * Extracted in Phase 2 (Scheduling Architecture Refactor)
 * Handles client-side Excel (.xlsx, .xls), CSV, and JSON parsing with table previews.
 */

(function (global) {
  'use strict';

  /**
   * Cleans and extracts subject rows from structured arrays/objects.
   * @param {Array} rows
   * @returns {Array<{Subject_Code: string, Subject_Name: string}>}
   */
  function parseExcelOrArrayRows(rows) {
    if (!rows || rows.length === 0) return [];

    let rawRows = rows;
    if (rows.length > 0 && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
      const keys = Object.keys(rows[0]);
      rawRows = [keys].concat(rows.map(obj => keys.map(k => obj[k])));
    }

    const cleanRows = [];
    for (let r of rawRows) {
      if (!r) continue;
      let arr = [];
      if (Array.isArray(r)) {
        arr = r.map(c => (c !== undefined && c !== null) ? String(c).trim() : '');
      } else if (typeof r === 'object') {
        arr = Object.values(r).map(c => (c !== undefined && c !== null) ? String(c).trim() : '');
      } else {
        arr = [String(r).trim()];
      }
      if (arr.some(c => c.length > 0)) {
        cleanRows.push(arr);
      }
    }

    if (cleanRows.length === 0) return [];

    let codeIdx = -1;
    let nameIdx = -1;
    let headerRowIdx = -1;

    for (let i = 0; i < Math.min(cleanRows.length, 25); i++) {
      const row = cleanRows[i];
      let foundCode = -1;
      let foundName = -1;

      row.forEach((cell, idx) => {
        const c = cell.toLowerCase();
        if (c.includes('code') || c.includes('course_no') || c.includes('subj_no') || c.includes('course no') || c.includes('subject no')) {
          foundCode = idx;
        } else if (c.includes('name') || c.includes('title') || c.includes('description') || c.includes('descriptive') || c.includes('course title') || c.includes('subject title')) {
          foundName = idx;
        } else if (c === 'subject' || c === 'course' || c === 'subj') {
          if (foundName === -1) foundName = idx;
        }
      });

      if (foundCode !== -1 || foundName !== -1) {
        headerRowIdx = i;
        codeIdx = foundCode;
        nameIdx = foundName;
        break;
      }
    }

    const result = [];
    const startIdx = (headerRowIdx !== -1) ? headerRowIdx + 1 : 0;

    for (let i = startIdx; i < cleanRows.length; i++) {
      const row = cleanRows[i];
      if (!row || row.length === 0) continue;

      let code = '';
      let name = '';

      if (codeIdx !== -1 && nameIdx !== -1 && codeIdx !== nameIdx) {
        code = row[codeIdx] || '';
        name = row[nameIdx] || '';
      } else if (codeIdx !== -1 && nameIdx === -1) {
        code = row[codeIdx] || '';
        const otherIdx = row.findIndex((cell, idx) => idx !== codeIdx && cell.length > 0);
        if (otherIdx !== -1) name = row[otherIdx];
      } else if (nameIdx !== -1 && codeIdx === -1) {
        name = row[nameIdx] || '';
        const otherIdx = row.findIndex((cell, idx) => idx !== nameIdx && cell.length > 0);
        if (otherIdx !== -1) code = row[otherIdx];
      } else {
        const nonEmp = [];
        row.forEach((cell, idx) => { if (cell.length > 0) nonEmp.push({ val: cell, idx }); });

        if (nonEmp.length >= 2) {
          const isFirstNum = !isNaN(Number(nonEmp[0].val)) && nonEmp[0].val.length <= 4;
          if (isFirstNum && nonEmp.length >= 3) {
            code = nonEmp[1].val;
            name = nonEmp[2].val;
          } else {
            code = nonEmp[0].val;
            name = nonEmp[1].val;
          }
        } else if (nonEmp.length === 1) {
          const single = nonEmp[0].val;
          if (single.length > 12 || single.includes(' ')) {
            name = single;
          } else {
            code = single;
          }
        }
      }

      code = code.trim();
      name = name.trim();

      const lowCode = code.toLowerCase();
      const lowName = name.toLowerCase();

      if (!code && !name) continue;
      if (lowCode === 'code' || lowCode === 'subject code' || lowCode === 'course code' || lowCode === '#' || lowCode === 'no' || lowCode === 'no.') continue;
      if (lowName === 'name' || lowName === 'subject name' || lowName === 'course title' || lowName === 'description') continue;
      if (lowCode.includes('bulacan state') || lowCode.includes('curriculum') || lowName.includes('bulacan state')) continue;

      result.push({
        Subject_Code: code,
        Subject_Name: name
      });
    }

    return result;
  }

  /**
   * Parses raw CSV or text content into subject records.
   * @param {string} text
   * @returns {Array<{Subject_Code: string, Subject_Name: string}>}
   */
  function parseCSVText(text) {
    if (!text || !text.trim()) return [];

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const sample = lines.slice(0, 10).join('\n');
    let delimiter = ',';
    if ((sample.match(/\t/g) || []).length > (sample.match(/,/g) || []).length) {
      delimiter = '\t';
    } else if ((sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length) {
      delimiter = ';';
    } else if ((sample.match(/\|/g) || []).length > (sample.match(/,/g) || []).length) {
      delimiter = '|';
    }

    const rows = lines.map(line => {
      return line.split(delimiter).map(cell => cell.replace(/^["']|["']$/g, '').trim());
    });

    return parseExcelOrArrayRows(rows);
  }

  /**
   * Reads and parses an uploaded curriculum file (.xlsx, .xls, .csv, .json, .txt).
   * @param {File} file
   * @param {Function} onParsedCallback - Called with parsed subject array
   */
  function processUploadedFile(file, onParsedCallback) {
    if (!file) return;
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const parsed = Array.isArray(data) ? data : (data.subjects || []);
          if (onParsedCallback) onParsedCallback(parsed);
        } catch (err) {
          alert('Failed to parse JSON file.');
        }
      };
      reader.readAsText(file);
      return;
    }

    if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = parseCSVText(e.target.result);
          if (parsed.length === 0) {
            alert('Could not extract valid subject rows from the uploaded file. Please ensure your file contains Subject Code and Subject Name columns.');
          } else if (onParsedCallback) {
            onParsedCallback(parsed);
          }
        } catch (err) {
          console.error('[LabSync] CSV parse error:', err);
          alert('Failed to parse CSV file.');
        }
      };
      reader.readAsText(file);
      return;
    }

    // Excel files (.xlsx, .xls)
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof XLSX === 'undefined') {
        console.warn('[LabSync] XLSX library not loaded, attempting text fallback');
        const textReader = new FileReader();
        textReader.onload = (te) => {
          const parsed = parseCSVText(te.target.result);
          if (onParsedCallback) onParsedCallback(parsed);
        };
        textReader.readAsText(file);
        return;
      }

      try {
        let workbook = null;
        try {
          workbook = XLSX.read(e.target.result, { type: 'array' });
        } catch (e1) {
          const dataArr = new Uint8Array(e.target.result);
          workbook = XLSX.read(dataArr, { type: 'array' });
        }

        if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
          alert('No worksheets found in the uploaded workbook.');
          return;
        }

        let allExtractedSubjects = [];
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) continue;
          const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          if (jsonRows && jsonRows.length > 0) {
            const subjects = parseExcelOrArrayRows(jsonRows);
            if (subjects.length > 0) {
              allExtractedSubjects = allExtractedSubjects.concat(subjects);
            }
          }
        }

        if (allExtractedSubjects.length > 0) {
          if (onParsedCallback) onParsedCallback(allExtractedSubjects);
        } else {
          alert('Could not extract valid subject rows from the Excel file. Please ensure columns for Subject Code and Subject Name exist.');
        }
      } catch (err) {
        console.error('[LabSync] SheetJS error:', err);
        alert('Failed to parse Excel file. Please ensure it is a valid .xlsx or .xls file.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /**
   * Generates and triggers download of a sample CSV curriculum template.
   */
  function downloadSampleCsv() {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "#,Subject Code,Subject Name\n"
      + "1,CC 102,Introduction to Computing\n"
      + "2,CC 103,Computer Programming 1\n"
      + "3,IT 107*,Human-Computer Interaction\n"
      + "4,IT 106*,Platform Technologies\n"
      + "5,CC 104,Computer Programming 2\n"
      + "6,IT 104*,Discrete Mathematics\n"
      + "7,IT 205*,Quantitative Methods\n"
      + "8,IT 203,Object-Oriented Programming\n"
      + "9,IT 204,Networking 1\n"
      + "10,CC 106,Information Management\n";

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'labsync_subjects_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const curriculumImport = {
    parseExcelOrArrayRows,
    parseCSVText,
    processUploadedFile,
    downloadSampleCsv
  };

  global.curriculumImport = curriculumImport;

})(typeof window !== 'undefined' ? window : this);
