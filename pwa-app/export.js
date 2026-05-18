// export.js
// Full ZIP export + JSON/ZIP import for Silent Witness vault.
// Requires JSZip loaded globally via <script> tag (window.JSZip).

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg',
};

function buildExportFileName() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `silent-witness-export-${stamp}.zip`;
}

function mimeToExt(mime) {
  return MIME_EXT[mime] || mime?.split('/')[1] || 'bin';
}

function dataUrlMime(dataUrl) {
  const m = dataUrl?.match(/^data:([^;]+);/);
  return m ? m[1] : 'application/octet-stream';
}

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function generateReportMarkdown(records) {
  const exportDate = new Date().toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const lines = [
    '# Silent Witness — Evidence Export Report',
    '',
    `Exported: ${exportDate}`,
    `Total records: ${records.length}`,
    '',
    '---',
    '',
  ];

  records.forEach((r, i) => {
    const date = new Date(r.savedAt || r.timestamp).toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

    lines.push(`## Record ${i + 1}`);
    lines.push('');
    lines.push(`**Date:** ${date}`);
    lines.push(`**Type:** ${r.modality || 'entry'}`);
    if (r.bodyRegion) lines.push(`**Body region:** ${r.bodyRegion}`);
    lines.push('');

    const notes = r.narrative || r.textNotes;
    if (notes) {
      lines.push('### Notes');
      lines.push(notes);
      lines.push('');
    }

    const ai = r.aiAnalysis;
    if (ai) {
      lines.push('### AI Analysis');
      const desc = ai.analysis?.structured_description || ai.summary;
      if (desc) lines.push(desc);
      const sev = ai.severity || ai.severity_assessment;
      if (sev) lines.push(`**Severity:** ${sev}`);
      lines.push('');
    }

    const corr = r.corroboration || {};
    lines.push('### Corroboration');
    lines.push(`- Medical attention: ${corr.doctor ? 'Yes' : 'No'}`);
    lines.push(`- Witnesses: ${corr.witnesses ? 'Yes' : 'No'}`);
    lines.push(`- Police: ${corr.police ? 'Yes' : 'No'}`);
    lines.push(`- Digital evidence: ${corr.digital ? 'Yes' : 'No'}`);
    lines.push('');

    if (r._photoPath) lines.push(`**Photo:** ${r._photoPath}`);
    if (r._audioPath) lines.push(`**Audio:** ${r._audioPath}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}

async function buildFullExportZip(records, showToast) {
  const zip = new window.JSZip();
  const warnings = [];
  const exportRecords = [];
  let photoIdx = 1;
  let audioIdx = 1;

  showToast('Adding attachments...');

  for (const r of records) {
    const rec = { ...r };

    if (r.photoDataUrl) {
      try {
        const mime = dataUrlMime(r.photoDataUrl);
        const filename = `photo-${String(photoIdx).padStart(3, '0')}.${mimeToExt(mime)}`;
        const path = `attachments/photos/${filename}`;
        zip.file(path, dataUrlToUint8Array(r.photoDataUrl));
        rec._photoPath = path;
        photoIdx++;
      } catch (e) {
        warnings.push(`Photo for record ${r.id} could not be extracted: ${e.message}`);
      }
    }

    if (r.audioDataUrl) {
      try {
        const mime = r.audioMime || dataUrlMime(r.audioDataUrl);
        const filename = `audio-${String(audioIdx).padStart(3, '0')}.${mimeToExt(mime)}`;
        const path = `attachments/audio/${filename}`;
        zip.file(path, dataUrlToUint8Array(r.audioDataUrl));
        rec._audioPath = path;
        audioIdx++;
      } catch (e) {
        warnings.push(`Audio for record ${r.id} could not be extracted: ${e.message}`);
      }
    }

    exportRecords.push(rec);
  }

  showToast('Creating ZIP...');

  zip.file('data.json', JSON.stringify({
    exportVersion: 1,
    appName: 'Silent Witness',
    exportedAt: new Date().toISOString(),
    recordCount: exportRecords.length,
    records: exportRecords,
    warnings,
  }, null, 2));

  zip.file('report.md', generateReportMarkdown(exportRecords));

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return { zipBlob, warnings };
}

async function deliverExportFile(zipBlob, fileName) {
  const file = new File([zipBlob], fileName, { type: 'application/zip' });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Silent Witness Export' });
      return { method: 'web-share', success: true };
    } catch (err) {
      if (err?.name === 'AbortError') return { method: 'web-share', success: false, cancelled: true };
      console.warn('[Export] Web Share failed, falling back to download:', err);
    }
  }

  try {
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { method: 'download', success: true };
  } catch (err) {
    console.error('[Export] Download fallback failed:', err);
    return { method: 'failed', success: false };
  }
}

export async function runFullExport(storage, showToast) {
  if (!window.JSZip) {
    showToast('Export library not loaded. Please check your connection.');
    return;
  }

  showToast('Collecting records...');

  let records;
  try {
    records = await storage.listIncidents();
  } catch (err) {
    showToast('Export failed: could not read records');
    return;
  }

  if (records.length === 0) {
    showToast('No records to export');
    return;
  }

  const sorted = records
    .slice()
    .sort((a, b) => new Date(a.savedAt || a.timestamp) - new Date(b.savedAt || b.timestamp));

  let zipBlob, warnings;
  try {
    ({ zipBlob, warnings } = await buildFullExportZip(sorted, showToast));
  } catch (err) {
    console.error('[Export] ZIP build failed:', err);
    showToast('Export failed');
    return;
  }

  if (warnings.length) console.warn('[Export] warnings:', warnings);

  const result = await deliverExportFile(zipBlob, buildExportFileName());

  if (result.cancelled) {
    showToast('Export cancelled');
  } else if (result.success) {
    showToast('Export ready');
  } else {
    showToast('Export could not be delivered');
  }
}

export async function importFromBlob(storage, zipBlob, showToast) {
  if (!window.JSZip) {
    showToast('Import library not loaded.');
    return 0;
  }
  try {
    const zip = await window.JSZip.loadAsync(zipBlob);
    const dataFile = zip.file('data.json');
    if (!dataFile) {
      console.warn('[importFromBlob] data.json not found in ZIP');
      return 0;
    }
    const parsed = JSON.parse(await dataFile.async('text'));
    const records = parsed.records;
    if (!Array.isArray(records) || records.length === 0) return 0;
    let imported = 0;
    for (const r of records) {
      try {
        const { id, _photoPath, _audioPath, ...data } = r;
        await storage.saveIncident(data);
        imported++;
      } catch (err) {
        console.warn('[importFromBlob] failed to save record:', err);
      }
    }
    return imported;
  } catch (err) {
    console.error('[importFromBlob] failed:', err);
    return 0;
  }
}

export async function runImport(storage, showToast, onComplete) {
  if (!window.JSZip) {
    showToast('Import library not loaded. Please check your connection.');
    return;
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.json';

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) { resolve(); return; }

      showToast('Reading file...');

      try {
        let records;

        if (file.name.endsWith('.zip')) {
          const zip = await window.JSZip.loadAsync(file);
          const dataFile = zip.file('data.json');
          if (!dataFile) {
            showToast('Invalid file: data.json not found in ZIP');
            resolve(); return;
          }
          const parsed = JSON.parse(await dataFile.async('text'));
          records = parsed.records;
        } else {
          const parsed = JSON.parse(await file.text());
          // support both { records: [...] } and bare array
          records = Array.isArray(parsed) ? parsed : parsed.records;
        }

        if (!Array.isArray(records) || records.length === 0) {
          showToast('No records found in file');
          resolve(); return;
        }

        showToast(`Importing ${records.length} record${records.length !== 1 ? 's' : ''}...`);

        let imported = 0;
        for (const r of records) {
          try {
            const { id, _photoPath, _audioPath, ...data } = r;
            await storage.saveIncident(data);
            imported++;
          } catch (err) {
            console.warn('[Import] failed to save record:', err);
          }
        }

        showToast(`Imported ${imported} record${imported !== 1 ? 's' : ''}`);
        onComplete?.();
        resolve();
      } catch (err) {
        console.error('[Import] failed:', err);
        showToast('Import failed: invalid or corrupted file');
        resolve();
      }
    };

    input.click();
  });
}
