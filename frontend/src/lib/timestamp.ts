import JSZip from 'jszip';

export const MIN_DATE_STR = '1980-01-01T00:00';
export const MAX_DATE_STR = '2107-12-31T23:59';

const MIN_TIME = new Date('1980-01-01T00:00:00').getTime();
const MAX_TIME = new Date('2107-12-31T23:59:59').getTime();

/** Guard for `new Date(...)` results, which yield NaN rather than throwing. */
export function isValidDate(dt: Date): boolean {
  return dt instanceof Date && !Number.isNaN(dt.getTime());
}

/**
 * Snap seconds down to an even value (0, 2, 4 ... 58).
 * ZIP/DOS timestamps only have two-second resolution.
 */
export function snapToEvenSeconds(dt: Date): Date {
  if (!isValidDate(dt)) return dt;
  const snapped = new Date(dt.getTime());
  snapped.setSeconds(Math.floor(snapped.getSeconds() / 2) * 2);
  snapped.setMilliseconds(0);
  return snapped;
}

/** Clamp a date into the range the ZIP and EXIF formats can represent. */
export function clampDate(dt: Date): Date {
  if (!isValidDate(dt)) return dt;
  if (dt.getTime() < MIN_TIME) return new Date(MIN_TIME);
  if (dt.getTime() > MAX_TIME) return new Date(MAX_TIME);
  return dt;
}

/** Format a Date as the `YYYY-MM-DDTHH:mm` value a datetime-local input expects. */
export function formatForDateTimeInput(dt: Date): string {
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const hours = String(dt.getHours()).padStart(2, '0');
  const minutes = String(dt.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format a Date as an unzoned wall clock string (`YYYY-MM-DDTHH:mm:ss`).
 *
 * Track B sends this rather than `toISOString()`: ZIP and EXIF timestamps are
 * wall clock values, so converting to UTC first would shift every result by the
 * user's offset.
 */
export function formatWallClock(dt: Date): string {
  const seconds = String(dt.getSeconds()).padStart(2, '0');
  return `${formatForDateTimeInput(dt)}:${seconds}`;
}

/** Minutes to add to local time to reach UTC, matching `Date.getTimezoneOffset()`. */
export function getTimezoneOffsetMinutes(dt: Date): number {
  return dt.getTimezoneOffset();
}

/**
 * Return a name not present in `taken`, appending `_1`, `_2`, ... on collision.
 *
 * Picking `IMG_0001.JPG` from two different folders is routine in a batch
 * upload, and JSZip silently overwrites same-named entries.
 */
export function uniqueEntryName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }

  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const suffix = dot > 0 ? name.slice(dot) : '';

  let counter = 1;
  for (;;) {
    const candidate = `${stem}_${counter}${suffix}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
    counter += 1;
  }
}

/**
 * Return the payload ranges of every APP1 segment in a JPEG.
 *
 * Confining the rewrite to APP1 keeps it away from the entropy coded scan data,
 * where a blind binary replace could corrupt the image.
 */
function app1SegmentRanges(bytes: Uint8Array): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return ranges;

  let index = 2;
  while (index + 4 <= bytes.length) {
    if (bytes[index] !== 0xff) break;
    const marker = bytes[index + 1];

    // Standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      index += 2;
      continue;
    }
    // Start of scan / end of image: compressed data follows.
    if (marker === 0xda || marker === 0xd9) break;

    const segmentLength = (bytes[index + 2] << 8) | bytes[index + 3];
    if (segmentLength < 2) break;

    const payloadStart = index + 4;
    const payloadEnd = index + 2 + segmentLength;
    if (payloadEnd > bytes.length) break;

    if (marker === 0xe1) ranges.push([payloadStart, payloadEnd]);
    index = payloadEnd;
  }

  return ranges;
}

const DATE_LENGTH = 19; // "YYYY:MM:DD HH:MM:SS"

function looksLikeExifDate(bytes: Uint8Array, at: number): boolean {
  if (
    bytes[at + 4] !== 0x3a || // ':'
    bytes[at + 7] !== 0x3a ||
    bytes[at + 10] !== 0x20 || // ' '
    bytes[at + 13] !== 0x3a ||
    bytes[at + 16] !== 0x3a
  ) {
    return false;
  }

  for (let j = 0; j < DATE_LENGTH; j++) {
    if (j === 4 || j === 7 || j === 10 || j === 13 || j === 16) continue;
    const code = bytes[at + j];
    if (code < 0x30 || code > 0x39) return false;
  }
  return true;
}

/**
 * Rewrite EXIF `DateTime` / `DateTimeOriginal` / `DateTimeDigitized` strings in place.
 *
 * Returns whether any timestamp was found; a JPEG carrying no EXIF date is left
 * untouched so the UI can report that honestly instead of claiming success.
 */
export function updateJpegExifTimestamp(
  arrayBuffer: ArrayBuffer,
  targetDate: Date
): { buffer: ArrayBuffer; modified: boolean } {
  const bytes = new Uint8Array(arrayBuffer);
  const ranges = app1SegmentRanges(bytes);
  if (ranges.length === 0) return { buffer: arrayBuffer, modified: false };

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const hours = String(targetDate.getHours()).padStart(2, '0');
  const minutes = String(targetDate.getMinutes()).padStart(2, '0');
  const seconds = String(targetDate.getSeconds()).padStart(2, '0');
  // Same byte length as the value being replaced, so offsets stay valid.
  const replacement = new TextEncoder().encode(
    `${year}:${month}:${day} ${hours}:${minutes}:${seconds}`
  );

  let modified = false;
  for (const [start, end] of ranges) {
    // `<=` so a timestamp ending exactly at the segment boundary is still matched.
    for (let i = start; i + DATE_LENGTH <= end; i++) {
      if (looksLikeExifDate(bytes, i)) {
        bytes.set(replacement, i);
        modified = true;
        i += DATE_LENGTH - 1;
      }
    }
  }

  return { buffer: bytes.buffer, modified };
}

export interface TrackAResult {
  blob: Blob;
  exifUpdated: number;
  jpegCount: number;
  renamed: string[];
}

function isJpeg(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'jpg' || ext === 'jpeg';
}

/**
 * Track A: build a ZIP in browser memory whose entries carry the target date.
 *
 * Nothing leaves the page. Only JPEGs are read into memory (their EXIF has to be
 * rewritten); every other file is handed to JSZip as a Blob so a large batch is
 * streamed rather than buffered.
 */
export async function processTrackALocal(
  files: File[],
  targetDate: Date,
  onProgress?: (percent: number) => void
): Promise<TrackAResult> {
  if (!isValidDate(targetDate)) {
    throw new Error('Invalid target date.');
  }

  const zip = new JSZip();
  const clampedTarget = clampDate(snapToEvenSeconds(targetDate));

  // JSZip interprets the `date` option in UTC, so mirror the local wall clock
  // into UTC fields to make extracted files show the time the user picked.
  const utcTargetDate = new Date(
    Date.UTC(
      clampedTarget.getFullYear(),
      clampedTarget.getMonth(),
      clampedTarget.getDate(),
      clampedTarget.getHours(),
      clampedTarget.getMinutes(),
      clampedTarget.getSeconds()
    )
  );

  const taken = new Set<string>();
  const renamed: string[] = [];
  let exifUpdated = 0;
  let jpegCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const entryName = uniqueEntryName(file.name, taken);
    if (entryName !== file.name) renamed.push(file.name);

    if (isJpeg(file.name)) {
      jpegCount += 1;
      const { buffer, modified } = updateJpegExifTimestamp(
        await file.arrayBuffer(),
        clampedTarget
      );
      if (modified) exifUpdated += 1;
      zip.file(entryName, buffer, { date: utcTargetDate, binary: true });
    } else {
      // Blob input keeps the file out of JS heap until the archive is generated.
      zip.file(entryName, file, { date: utcTargetDate, binary: true });
    }

    onProgress?.(Math.round(((i + 1) / files.length) * 50));
  }

  const blob = await zip.generateAsync(
    {
      type: 'blob',
      mimeType: 'application/zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => onProgress?.(50 + Math.round(metadata.percent / 2))
  );

  return { blob, exifUpdated, jpegCount, renamed };
}
