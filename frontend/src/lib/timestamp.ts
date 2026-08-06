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
 * In-place EXIF Timestamp Modifier for JPEG images.
 * Replaces ASCII date strings matching YYYY:MM:DD HH:MM:SS in EXIF tags
 * (DateTime 0x0132, DateTimeOriginal 0x9003, DateTimeDigitized 0x9004).
 */
export function updateJpegExifTimestamp(arrayBuffer: ArrayBuffer, targetDate: Date): ArrayBuffer {
  const bytes = new Uint8Array(arrayBuffer);

  // Check JPEG SOI marker (0xFF, 0xD8)
  if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
    return arrayBuffer;
  }

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const hours = String(targetDate.getHours()).padStart(2, '0');
  const minutes = String(targetDate.getMinutes()).padStart(2, '0');
  const seconds = String(targetDate.getSeconds()).padStart(2, '0');
  const newDateStr = `${year}:${month}:${day} ${hours}:${minutes}:${seconds}`;

  const encoder = new TextEncoder();
  const newDateBytes = encoder.encode(newDateStr);

  const len = bytes.length - 19;
  for (let i = 0; i < len; i++) {
    // Fast check: ASCII structure YYYY:MM:DD HH:MM:SS
    if (
      bytes[i + 4] === 0x3a && // ':'
      bytes[i + 7] === 0x3a && // ':'
      bytes[i + 10] === 0x20 && // ' '
      bytes[i + 13] === 0x3a && // ':'
      bytes[i + 16] === 0x3a    // ':'
    ) {
      let isExifDate = true;
      for (let j = 0; j < 19; j++) {
        if (j === 4 || j === 7 || j === 13 || j === 16) continue;
        if (j === 10) continue;
        const charCode = bytes[i + j];
        if (charCode < 0x30 || charCode > 0x39) {
          isExifDate = false;
          break;
        }
      }

      if (isExifDate) {
        bytes.set(newDateBytes, i);
      }
    }
  }

  return bytes.buffer;
}

/**
 * Track A: Client-Side OS Timestamp Overwrite using JSZip.
 * 100% Privacy, processed in browser memory.
 * Includes EXIF photo timestamp modification for JPEG images.
 * Adjusts for macOS Archive Utility / Windows timezone extraction skew.
 */
export async function processTrackALocal(
  files: File[],
  targetDate: Date,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const zip = new JSZip();
  const clampedTarget = clampDate(snapToEvenSeconds(targetDate));

  // Construct a Date object where UTC values match local time values.
  const utcTargetDate = new Date(Date.UTC(
    clampedTarget.getFullYear(),
    clampedTarget.getMonth(),
    clampedTarget.getDate(),
    clampedTarget.getHours(),
    clampedTarget.getMinutes(),
    clampedTarget.getSeconds()
  ));

  const total = files.length;
  for (let i = 0; i < total; i++) {
    const file = files[i];
    let arrayBuffer = await file.arrayBuffer();
    
    // Modify EXIF metadata for JPEG images
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'jpg' || ext === 'jpeg') {
      arrayBuffer = updateJpegExifTimestamp(arrayBuffer, clampedTarget);
    }

    // Add file with target DOS date
    zip.file(file.name, arrayBuffer, {
      date: utcTargetDate,
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
