"""Deep document metadata editing for Track B (HWP / OOXML / JPEG).

Timestamp model
---------------
Two different kinds of timestamp live in these formats and they must not be
conflated:

* **Wall clock** (no timezone): ZIP/DOS `date_time` entries and EXIF
  `DateTimeOriginal` strings. These are stored exactly as the user sees them.
* **UTC instant**: Windows FILETIME in HWP summary streams and the
  `dcterms:created` / `dcterms:modified` values in OOXML, which are serialised
  with a trailing `Z`.

The client sends the wall clock it displayed plus the browser's UTC offset, so
both can be derived without the server assuming any particular timezone.
"""

import io
import re
import struct
import zipfile
import xml.etree.ElementTree as ET
import logging
from datetime import datetime, timezone, timedelta

import olefile

logger = logging.getLogger("newfiledate")

MIN_WALL_CLOCK = datetime(1980, 1, 1, 0, 0, 0)
MAX_WALL_CLOCK = datetime(2107, 12, 31, 23, 59, 59)

# Browser getTimezoneOffset() range is -840..720; allow a little slack.
MAX_TZ_OFFSET_MINUTES = 24 * 60

# --- Archive safety limits (decompression bomb / resource exhaustion) --------
MAX_ZIP_ENTRIES = 2_000
MAX_ENTRY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
MAX_TOTAL_UNCOMPRESSED_BYTES = 256 * 1024 * 1024
MAX_COMPRESSION_RATIO = 200

# --- HWP property-set scan limits (malformed OLE stream) --------------------
MAX_OLE_SECTIONS = 64
MAX_OLE_PROPS_PER_SECTION = 4_096

SUPPORTED_EXTENSIONS = frozenset({"hwp", "pptx", "docx", "jpg", "jpeg"})


class UnsafeArchiveError(ValueError):
    """Raised when an uploaded container exceeds the safety limits above."""


# ---------------------------------------------------------------------------
# Filename handling
# ---------------------------------------------------------------------------

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_WINDOWS_RESERVED = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{i}" for i in range(1, 10)}
    | {f"LPT{i}" for i in range(1, 10)}
)
MAX_FILENAME_LENGTH = 200


def sanitize_filename(raw: str | None, fallback: str = "document") -> str:
    """Reduce an uploaded filename to a safe, single-path-segment basename.

    The value reaching this function is fully attacker controlled (it is just a
    string in the multipart body) and is written into a ZIP archive that a user
    later extracts, so directory components must be removed rather than merely
    rejected -- otherwise the service emits Zip Slip archives on request.
    """
    name = raw or ""
    # Treat both separators: a Windows client may send backslashes, and a
    # POSIX extractor would then read them as part of the filename.
    name = name.replace("\\", "/")
    name = name.split("/")[-1]
    name = _CONTROL_CHARS.sub("", name).strip()

    # "", ".", "..", "..." -- nothing usable left.
    if not name or set(name) <= {"."}:
        return fallback

    stem = name.split(".", 1)[0].upper()
    if stem in _WINDOWS_RESERVED:
        name = f"_{name}"

    if len(name) > MAX_FILENAME_LENGTH:
        head, dot, ext = name.rpartition(".")
        if dot and len(ext) <= 10:
            name = head[: MAX_FILENAME_LENGTH - len(ext) - 1] + "." + ext
        else:
            name = name[:MAX_FILENAME_LENGTH]

    return name


def deduplicate_filename(name: str, taken: set[str]) -> str:
    """Return a name not already in `taken`, suffixing `_1`, `_2`, ... as needed.

    Selecting `IMG_0001.JPG` from two different folders is routine in a batch
    upload; without this the second entry silently replaces the first.
    """
    if name not in taken:
        taken.add(name)
        return name

    head, dot, ext = name.rpartition(".")
    stem, suffix = (head, f".{ext}") if dot else (name, "")

    counter = 1
    while True:
        candidate = f"{stem}_{counter}{suffix}"
        if candidate not in taken:
            taken.add(candidate)
            return candidate
        counter += 1


# ---------------------------------------------------------------------------
# Time parsing
# ---------------------------------------------------------------------------


def datetime_to_filetime(dt: datetime) -> int:
    """Convert a datetime to Windows 64-bit FILETIME (100ns ticks since 1601-01-01 UTC)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)

    EPOCH_AS_FILETIME = 11_644_473_600  # seconds between 1601-01-01 and 1970-01-01
    return int((dt.timestamp() + EPOCH_AS_FILETIME) * 10_000_000)


def parse_target_time(
    target_time_str: str,
    tz_offset_minutes: int | None = None,
) -> tuple[datetime, datetime]:
    """Parse the requested timestamp into `(wall_clock_naive, utc_aware)`.

    `tz_offset_minutes` follows the JavaScript `Date.getTimezoneOffset()`
    convention: the value to add to local time to reach UTC (KST is -540).
    When it is omitted a naive input is interpreted as UTC -- never as a
    hardcoded local zone.
    """
    if not target_time_str or not isinstance(target_time_str, str):
        raise ValueError("Target timestamp is missing.")

    if tz_offset_minutes is not None and abs(tz_offset_minutes) > MAX_TZ_OFFSET_MINUTES:
        raise ValueError("Timezone offset is out of range.")

    try:
        parsed = datetime.fromisoformat(target_time_str.strip())
    except Exception:
        raise ValueError("Timestamp must be in ISO 8601 format.")

    offset = timedelta(minutes=tz_offset_minutes or 0)

    if parsed.tzinfo is None:
        # The client sent the wall clock it displayed.
        wall_clock = parsed.replace(microsecond=0)
        utc_dt = (wall_clock + offset).replace(tzinfo=timezone.utc)
    else:
        # The client sent an absolute instant; derive the wall clock from it.
        utc_dt = parsed.astimezone(timezone.utc).replace(microsecond=0)
        wall_clock = (utc_dt - offset).replace(tzinfo=None)

    if wall_clock < MIN_WALL_CLOCK or wall_clock > MAX_WALL_CLOCK:
        raise ValueError(
            "Timestamp is outside the supported range (1980-01-01 to 2107-12-31)."
        )

    return wall_clock, utc_dt


# ---------------------------------------------------------------------------
# HWP (OLE compound file)
# ---------------------------------------------------------------------------


def modify_hwp_metadata(file_bytes: bytes, target_utc_dt: datetime) -> tuple[bytes, bool]:
    """Overwrite PIDs 11/12/13 (printed / created / last-saved) in \x05HwpSummaryInformation."""
    try:
        buf = io.BytesIO(file_bytes)
        # olefile rewrites the backing buffer in place when a stream is replaced.
        ole = olefile.OleFileIO(buf, write_mode=True)
        try:
            if not ole.exists("\x05HwpSummaryInformation"):
                return file_bytes, False

            stream_data = bytearray(ole.openstream("\x05HwpSummaryInformation").read())
            if len(stream_data) < 48:
                return file_bytes, False

            filetime_bytes = struct.pack("<Q", datetime_to_filetime(target_utc_dt))
            VT_FILETIME = 0x0040

            # Property set header: bytes 24-27 hold the section count.
            num_sections = struct.unpack_from("<I", stream_data, 24)[0]
            if num_sections < 1:
                return file_bytes, False
            # The count comes from the file; clamp it instead of trusting it.
            num_sections = min(num_sections, MAX_OLE_SECTIONS)

            modified_count = 0
            target_pids = {11, 12, 13}

            for sec_idx in range(num_sections):
                sec_header_ptr = 28 + (sec_idx * 20)  # 16-byte FMTID + 4-byte offset
                if sec_header_ptr + 20 > len(stream_data):
                    break

                sec_offset = struct.unpack_from("<I", stream_data, sec_header_ptr + 16)[0]
                if sec_offset + 8 > len(stream_data):
                    continue

                num_props = struct.unpack_from("<I", stream_data, sec_offset + 4)[0]
                num_props = min(num_props, MAX_OLE_PROPS_PER_SECTION)
                entry_start = sec_offset + 8

                for i in range(num_props):
                    prop_ptr = entry_start + (i * 8)
                    if prop_ptr + 8 > len(stream_data):
                        break
                    pid, prop_offset = struct.unpack_from("<II", stream_data, prop_ptr)

                    if pid in target_pids:
                        val_offset = sec_offset + prop_offset
                        if val_offset + 12 <= len(stream_data):
                            w_type = struct.unpack_from("<I", stream_data, val_offset)[0]
                            if w_type == VT_FILETIME:
                                stream_data[val_offset + 4 : val_offset + 12] = filetime_bytes
                                modified_count += 1

            if modified_count == 0:
                return file_bytes, False

            ole.write_stream("\x05HwpSummaryInformation", bytes(stream_data))
        finally:
            ole.close()

        return buf.getvalue(), True

    except Exception as exc:
        logger.warning("HWP metadata parse failed, passing file through: %s", exc)
        return file_bytes, False


# ---------------------------------------------------------------------------
# OOXML (DOCX / PPTX)
# ---------------------------------------------------------------------------


def _assert_archive_safe(infos: list[zipfile.ZipInfo], compressed_size: int) -> None:
    """Reject archives whose declared expansion would exhaust the function's memory."""
    if len(infos) > MAX_ZIP_ENTRIES:
        raise UnsafeArchiveError(
            f"Archive has too many entries (limit {MAX_ZIP_ENTRIES})."
        )

    declared_total = 0
    for info in infos:
        if info.file_size > MAX_ENTRY_UNCOMPRESSED_BYTES:
            raise UnsafeArchiveError("Archive contains an oversized entry.")
        declared_total += info.file_size

    if declared_total > MAX_TOTAL_UNCOMPRESSED_BYTES:
        raise UnsafeArchiveError("Archive expands beyond the supported size.")

    if compressed_size > 0 and declared_total / compressed_size > MAX_COMPRESSION_RATIO:
        raise UnsafeArchiveError("Archive compression ratio is implausibly high.")


def _read_entry_bounded(zf: zipfile.ZipFile, info: zipfile.ZipInfo, remaining: int) -> bytes:
    """Read one entry, refusing to exceed `remaining` bytes.

    The central-directory sizes checked above are self-reported and can lie, so
    the actual read is capped independently.
    """
    limit = min(remaining, MAX_ENTRY_UNCOMPRESSED_BYTES)
    with zf.open(info) as handle:
        data = handle.read(limit + 1)
    if len(data) > limit:
        raise UnsafeArchiveError("Archive entry is larger than its declared size.")
    return data


def modify_ooxml_metadata(file_bytes: bytes, target_utc_dt: datetime) -> tuple[bytes, bool]:
    """Update `dcterms:created` / `dcterms:modified` in docProps/core.xml."""
    iso_str = target_utc_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    is_modified = False

    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes), "r") as in_zip:
            infos = in_zip.infolist()
            _assert_archive_safe(infos, len(file_bytes))

            out_buf = io.BytesIO()
            budget = MAX_TOTAL_UNCOMPRESSED_BYTES

            with zipfile.ZipFile(out_buf, "w", compression=zipfile.ZIP_DEFLATED) as out_zip:
                for info in infos:
                    content = _read_entry_bounded(in_zip, info, budget)
                    budget -= len(content)

                    if info.filename == "docProps/core.xml":
                        content, is_modified = _rewrite_core_xml(content, iso_str)

                    out_zip.writestr(info, content)

        return out_buf.getvalue(), is_modified

    except UnsafeArchiveError:
        raise
    except Exception as exc:
        logger.warning("OOXML metadata edit failed, passing file through: %s", exc)
        return file_bytes, False


def _rewrite_core_xml(content: bytes, iso_str: str) -> tuple[bytes, bool]:
    """Replace the Dublin Core date elements, leaving the rest of the part intact."""
    try:
        ET.register_namespace(
            "cp", "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
        )
        ET.register_namespace("dc", "http://purl.org/dc/elements/1.1/")
        ET.register_namespace("dcterms", "http://purl.org/dc/terms/")
        ET.register_namespace("dcmitype", "http://purl.org/dc/dcmitype/")
        ET.register_namespace("xsi", "http://www.w3.org/2001/XMLSchema-instance")

        tree = ET.fromstring(content)
        ns = {"dcterms": "http://purl.org/dc/terms/"}

        touched = False
        for tag in ("dcterms:created", "dcterms:modified"):
            element = tree.find(tag, ns)
            if element is not None:
                element.text = iso_str
                touched = True

        if not touched:
            return content, False

        return ET.tostring(tree, encoding="utf-8", xml_declaration=True), True
    except ET.ParseError as exc:
        # Malformed or hostile core.xml: leave the part byte-identical.
        logger.warning("core.xml parse failed, leaving part unchanged: %s", exc)
        return content, False


# ---------------------------------------------------------------------------
# JPEG EXIF
# ---------------------------------------------------------------------------

_EXIF_DATE_PATTERN = re.compile(rb"\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}")


def _app1_segment_ranges(data: bytes) -> list[tuple[int, int]]:
    """Return `(start, end)` payload ranges of every APP1 segment in a JPEG.

    Restricting rewrites to APP1 keeps the substitution away from the entropy
    coded scan data, where a blind binary replace could corrupt the image.
    """
    ranges: list[tuple[int, int]] = []
    if not data.startswith(b"\xff\xd8"):
        return ranges

    index = 2
    length = len(data)

    while index + 4 <= length:
        if data[index] != 0xFF:
            break
        marker = data[index + 1]

        # Standalone markers carry no length field.
        if marker == 0x01 or 0xD0 <= marker <= 0xD8:
            index += 2
            continue
        # Start of scan / end of image: everything after this is compressed data.
        if marker in (0xDA, 0xD9):
            break

        segment_length = int.from_bytes(data[index + 2 : index + 4], "big")
        if segment_length < 2:
            break

        payload_start = index + 4
        payload_end = index + 2 + segment_length
        if payload_end > length:
            break

        if marker == 0xE1:  # APP1 -- EXIF and XMP live here
            ranges.append((payload_start, payload_end))

        index = payload_end

    return ranges


def modify_exif_metadata(file_bytes: bytes, wall_clock: datetime) -> tuple[bytes, bool]:
    """Rewrite EXIF `DateTime` / `DateTimeOriginal` / `DateTimeDigitized` strings.

    EXIF datetimes are unzoned wall clock values, so the user's displayed time is
    written verbatim.
    """
    try:
        ranges = _app1_segment_ranges(file_bytes)
        if not ranges:
            return file_bytes, False

        replacement = wall_clock.strftime("%Y:%m:%d %H:%M:%S").encode("ascii")
        # The substitution is only offset-safe because both sides are 19 bytes.
        assert len(replacement) == 19

        buffer = bytearray(file_bytes)
        count = 0

        for start, end in ranges:
            segment = bytes(buffer[start:end])
            patched, hits = _EXIF_DATE_PATTERN.subn(replacement, segment)
            if hits:
                buffer[start:end] = patched
                count += hits

        return bytes(buffer), count > 0
    except Exception as exc:
        logger.warning("EXIF edit failed, passing file through: %s", exc)
        return file_bytes, False


# ---------------------------------------------------------------------------
# Dispatch & packaging
# ---------------------------------------------------------------------------


def process_file_metadata(
    filename: str,
    file_bytes: bytes,
    wall_clock: datetime,
    target_utc_dt: datetime,
) -> tuple[bytes, bool]:
    """Edit a single file's embedded metadata based on its extension."""
    ext = filename.lower().rpartition(".")[2]

    if ext == "hwp":
        return modify_hwp_metadata(file_bytes, target_utc_dt)
    if ext in ("pptx", "docx"):
        return modify_ooxml_metadata(file_bytes, target_utc_dt)
    if ext in ("jpg", "jpeg"):
        return modify_exif_metadata(file_bytes, wall_clock)
    return file_bytes, False


def build_output_zip(files_data: list[tuple[str, bytes]], wall_clock: datetime) -> bytes:
    """Package processed files, stamping every entry with the target wall clock.

    Names are expected to be sanitised already; they are re-checked here so the
    archive cannot contain traversal paths regardless of the call site.
    """
    even_second = (wall_clock.second // 2) * 2  # DOS timestamps have 2s resolution
    date_time = (
        wall_clock.year,
        wall_clock.month,
        wall_clock.day,
        wall_clock.hour,
        wall_clock.minute,
        even_second,
    )

    zip_buf = io.BytesIO()
    taken: set[str] = set()

    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for filename, file_bytes in files_data:
            safe_name = deduplicate_filename(sanitize_filename(filename), taken)
            zinfo = zipfile.ZipInfo(filename=safe_name, date_time=date_time)
            zinfo.compress_type = zipfile.ZIP_DEFLATED
            zinfo.external_attr = 0o600 << 16
            zf.writestr(zinfo, file_bytes)

    return zip_buf.getvalue()
