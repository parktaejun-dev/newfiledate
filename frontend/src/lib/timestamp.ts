import JSZip from 'jszip';

export const MIN_DATE_STR = '1980-01-01T00:00';
export const MAX_DATE_STR = '2107-12-31T23:59';

export interface ProcessFileItem {
  file: File;
  name: string;
  size: number;
}

/**
 * Snap seconds to the nearest or floored even number (0, 2, 4 ... 58)
 * as required by the DOS timestamp standard.
 */
export function snapToEvenSeconds(dt: Date): Date {
  const newDt = new Date(dt.getTime());
  const seconds = newDt.getSeconds();
  newDt.setSeconds(Math.floor(seconds / 2) * 2);
  newDt.setMilliseconds(0);
  return newDt;
}

/**
 * Clamp a Date object within 1980-01-01 and 2107-12-31.
 */
export function clampDate(dt: Date): Date {
  const minTime = new Date('1980-01-01T00:00:00').getTime();
  const maxTime = new Date('2107-12-31T23:59:59').getTime();

  if (dt.getTime() < minTime) return new Date(minTime);
  if (dt.getTime() > maxTime) return new Date(maxTime);
  return dt;
}

/**
 * Formats a Date into YYYY-MM-DDTHH:mm input value for datetime-local
 */
export function formatForDateTimeInput(dt: Date): string {
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const hours = String(dt.getHours()).padStart(2, '0');
  const minutes = String(dt.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Track A: Client-Side OS Timestamp Overwrite using JSZip.
 * 100% Privacy, processed in browser memory.
 */
export async function processTrackALocal(
  files: File[],
  targetDate: Date,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const zip = new JSZip();
  const clampedTarget = clampDate(snapToEvenSeconds(targetDate));

  const total = files.length;
  for (let i = 0; i < total; i++) {
    const file = files[i];
    const arrayBuffer = await file.arrayBuffer();
    
    // Add file with target DOS date
    zip.file(file.name, arrayBuffer, {
      date: clampedTarget,
      binary: true
    });

    if (onProgress) {
      onProgress(Math.round(((i + 1) / total) * 50));
    }
  }

  // Generate zip archive
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      mimeType: 'application/zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    },
    (metadata) => {
      if (onProgress) {
        onProgress(50 + Math.round(metadata.percent / 2));
      }
    }
  );

  return zipBlob;
}
