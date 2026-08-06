import { describe, expect, it } from 'vitest';
import {
  clampDate,
  formatForDateTimeInput,
  formatWallClock,
  getTimezoneOffsetMinutes,
  isValidDate,
  processTrackALocal,
  snapToEvenSeconds,
  uniqueEntryName,
  updateJpegExifTimestamp,
} from './timestamp';

// ---------------------------------------------------------------------------
// Date guards  (regression: a cleared datetime-local input crashed Execute)
// ---------------------------------------------------------------------------

describe('invalid date handling', () => {
  it('detects Invalid Date from an empty input value', () => {
    expect(isValidDate(new Date(''))).toBe(false);
    expect(isValidDate(new Date('2020-01-01T00:00'))).toBe(true);
  });

  it('passes Invalid Date through snap and clamp without throwing', () => {
    const invalid = new Date('');
    expect(() => snapToEvenSeconds(invalid)).not.toThrow();
    expect(() => clampDate(invalid)).not.toThrow();
    expect(isValidDate(clampDate(snapToEvenSeconds(invalid)))).toBe(false);
  });

  it('rejects an invalid target date instead of producing a broken archive', async () => {
    await expect(processTrackALocal([], new Date(''))).rejects.toThrow('Invalid target date');
  });
});

// ---------------------------------------------------------------------------
// Snapping, clamping, formatting
// ---------------------------------------------------------------------------

describe('snapToEvenSeconds', () => {
  it('floors odd seconds to the previous even value', () => {
    expect(snapToEvenSeconds(new Date(2020, 0, 1, 12, 0, 59)).getSeconds()).toBe(58);
    expect(snapToEvenSeconds(new Date(2020, 0, 1, 12, 0, 1)).getSeconds()).toBe(0);
  });

  it('leaves even seconds alone and zeroes milliseconds', () => {
    const result = snapToEvenSeconds(new Date(2020, 0, 1, 12, 0, 42, 999));
    expect(result.getSeconds()).toBe(42);
    expect(result.getMilliseconds()).toBe(0);
  });
});

describe('clampDate', () => {
  it('clamps below the 1980 DOS epoch', () => {
    expect(clampDate(new Date(1970, 0, 1)).getFullYear()).toBe(1980);
  });

  it('clamps above 2107', () => {
    expect(clampDate(new Date(2200, 0, 1)).getFullYear()).toBe(2107);
  });

  it('leaves in-range dates untouched', () => {
    const inRange = new Date(2020, 5, 15, 10, 30, 0);
    expect(clampDate(inRange).getTime()).toBe(inRange.getTime());
  });
});

describe('formatting', () => {
  it('formats for a datetime-local input', () => {
    expect(formatForDateTimeInput(new Date(2020, 0, 5, 9, 7))).toBe('2020-01-05T09:07');
  });

  it('formats a wall clock string with seconds and no timezone suffix', () => {
    const formatted = formatWallClock(new Date(2020, 0, 5, 9, 7, 6));
    expect(formatted).toBe('2020-01-05T09:07:06');
    expect(formatted).not.toContain('Z');
  });

  it('reports the browser offset using the getTimezoneOffset convention', () => {
    const date = new Date(2020, 5, 15);
    expect(getTimezoneOffsetMinutes(date)).toBe(date.getTimezoneOffset());
  });
});

// ---------------------------------------------------------------------------
// Filename collisions
// ---------------------------------------------------------------------------

describe('uniqueEntryName', () => {
  it('suffixes duplicates instead of overwriting them', () => {
    const taken = new Set<string>();
    expect(uniqueEntryName('IMG_0001.JPG', taken)).toBe('IMG_0001.JPG');
    expect(uniqueEntryName('IMG_0001.JPG', taken)).toBe('IMG_0001_1.JPG');
    expect(uniqueEntryName('IMG_0001.JPG', taken)).toBe('IMG_0001_2.JPG');
  });

  it('handles names without an extension', () => {
    const taken = new Set<string>(['README']);
    expect(uniqueEntryName('README', taken)).toBe('README_1');
  });

  it('does not treat a leading dot as an extension separator', () => {
    const taken = new Set<string>(['.gitignore']);
    expect(uniqueEntryName('.gitignore', taken)).toBe('.gitignore_1');
  });
});

// ---------------------------------------------------------------------------
// EXIF rewriting
// ---------------------------------------------------------------------------

const SCAN_DATA_DATE = '1999:12:31 23:59:58';

/** Minimal JPEG: one APP1 segment plus scan data holding a date-like string. */
function makeJpeg(exifDate: string | null = '2020:06:15 12:34:56'): ArrayBuffer {
  const encoder = new TextEncoder();
  const parts: number[] = [0xff, 0xd8];

  if (exifDate !== null) {
    const payload = [
      ...encoder.encode('Exif\0\0'),
      ...encoder.encode('MM\0*'),
      ...encoder.encode(exifDate),
      0, 0, 0, 0,
    ];
    const length = payload.length + 2;
    parts.push(0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...payload);
  }

  // SOS marker: everything after this is entropy-coded data.
  parts.push(0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00);
  parts.push(...encoder.encode(SCAN_DATA_DATE));
  parts.push(0xff, 0xd9);

  return new Uint8Array(parts).buffer;
}

function decode(buffer: ArrayBuffer): string {
  return new TextDecoder('latin1').decode(new Uint8Array(buffer));
}

describe('updateJpegExifTimestamp', () => {
  it('rewrites the EXIF date inside APP1', () => {
    const { buffer, modified } = updateJpegExifTimestamp(
      makeJpeg(),
      new Date(2001, 1, 3, 4, 5, 6)
    );
    expect(modified).toBe(true);
    expect(decode(buffer)).toContain('2001:02:03 04:05:06');
    expect(decode(buffer)).not.toContain('2020:06:15 12:34:56');
  });

  it('leaves entropy-coded scan data untouched', () => {
    const { buffer } = updateJpegExifTimestamp(makeJpeg(), new Date(2001, 1, 3, 4, 5, 6));
    // A whole-file binary replace would have clobbered this identical-looking date.
    expect(decode(buffer)).toContain(SCAN_DATA_DATE);
  });

  it('preserves the file length so offsets stay valid', () => {
    const original = makeJpeg();
    const { buffer } = updateJpegExifTimestamp(original, new Date(2001, 1, 3, 4, 5, 6));
    expect(buffer.byteLength).toBe(original.byteLength);
  });

  it('reports no change when the photo carries no EXIF date', () => {
    const { modified } = updateJpegExifTimestamp(makeJpeg(null), new Date(2001, 1, 3));
    expect(modified).toBe(false);
  });

  it('ignores non-JPEG input', () => {
    const notJpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer;
    expect(updateJpegExifTimestamp(notJpeg, new Date()).modified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Track A archive assembly
// ---------------------------------------------------------------------------

describe('processTrackALocal', () => {
  it('keeps both files when two share a name', async () => {
    const files = [
      new File([new Uint8Array([1])], 'IMG_0001.JPG'),
      new File([new Uint8Array([2])], 'IMG_0001.JPG'),
    ];
    const result = await processTrackALocal(files, new Date(2020, 0, 1, 0, 0, 0));
    expect(result.renamed).toEqual(['IMG_0001.JPG']);
  });

  it('counts photos whose EXIF timestamp could not be changed', async () => {
    const withExif = new File([makeJpeg()], 'a.jpg');
    const withoutExif = new File([makeJpeg(null)], 'b.jpg');
    const result = await processTrackALocal(
      [withExif, withoutExif],
      new Date(2020, 0, 1, 0, 0, 0)
    );
    expect(result.jpegCount).toBe(2);
    expect(result.exifUpdated).toBe(1);
  });

  it('reports progress from 0 to 100', async () => {
    const seen: number[] = [];
    await processTrackALocal(
      [new File([new Uint8Array([1])], 'a.txt')],
      new Date(2020, 0, 1, 0, 0, 0),
      (pct) => seen.push(pct)
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(Math.max(...seen)).toBeLessThanOrEqual(100);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
  });
});
