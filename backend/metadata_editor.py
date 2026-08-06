import io
import struct
import zipfile
import xml.etree.ElementTree as ET
import logging
from datetime import datetime, timezone, timedelta
import olefile

logger = logging.getLogger("timeweaver")

# KST offset (UTC+9)
KST = timezone(timedelta(hours=9))

MIN_TIMESTAMP = datetime(1980, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
MAX_TIMESTAMP = datetime(2107, 12, 31, 23, 59, 59, tzinfo=timezone.utc)

def datetime_to_filetime(dt: datetime) -> int:
    """Convert datetime object (UTC) to Windows 64-bit FILETIME (100-nanosecond intervals since 1601-01-01 UTC)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    
    # Epoch difference between 1601-01-01 and 1970-01-01 in seconds = 11,644,473,600
    EPOCH_AS_FILETIME = 11644473600
    hundred_ns = int((dt.timestamp() + EPOCH_AS_FILETIME) * 10_000_000)
    return hundred_ns

def parse_iso_or_timestamp(target_time_str: str) -> datetime:
    """
    Parse ISO string or YYYY-MM-DDTHH:MM:SS (assumed KST if naive).
    Validates range (1980-01-01 to 2107-12-31).
    Raises ValueError if format is invalid or out of bounds.
    """
    if not target_time_str or not isinstance(target_time_str, str):
        raise ValueError("Target timestamp string is missing or invalid.")
    
    try:
        dt = datetime.fromisoformat(target_time_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=KST)
        utc_dt = dt.astimezone(timezone.utc)
    except Exception as e:
        raise ValueError(f"Invalid timestamp format '{target_time_str}': {e}")

    if utc_dt < MIN_TIMESTAMP or utc_dt > MAX_TIMESTAMP:
        raise ValueError(f"Timestamp {target_time_str} is out of allowed range (1980-01-01 to 2107-12-31).")

    return utc_dt

def modify_hwp_metadata(file_bytes: bytes, target_utc_dt: datetime) -> tuple[bytes, bool]:
    """
    Modifies HWP (OLE Compound File) metadata in \x05HwpSummaryInformation.
    Scans all sections in the Property Set to update PID 11, 12, 13 with target FILETIME.
    Returns (modified_bytes, success_flag).
    """
    try:
        buf = io.BytesIO(file_bytes)
        # Note: olefile modifies writable BytesIO buffer in-place when stream is overwritten
        ole = olefile.OleFileIO(buf, write_mode=True)
        if not ole.exists('\x05HwpSummaryInformation'):
            ole.close()
            return file_bytes, False

        stream_data = bytearray(ole.openstream('\x05HwpSummaryInformation').read())
        if len(stream_data) < 48:
            ole.close()
            return file_bytes, False

        filetime_val = datetime_to_filetime(target_utc_dt)
        filetime_bytes = struct.pack('<Q', filetime_val)
        VT_FILETIME = 0x0040

        # Property set header: Byte 24-27 = section count
        num_sections = struct.unpack_from('<I', stream_data, 24)[0]
        if num_sections < 1:
            ole.close()
            return file_bytes, False

        modified_count = 0
        target_pids = {11, 12, 13}

        # Multi-section scan: Loop through all sections in Property Set header
        for sec_idx in range(num_sections):
            sec_header_ptr = 28 + (sec_idx * 20)  # 16-byte FMTID + 4-byte offset
            if sec_header_ptr + 20 > len(stream_data):
                break

            sec_offset = struct.unpack_from('<I', stream_data, sec_header_ptr + 16)[0]
            if sec_offset + 8 > len(stream_data):
                continue

            num_props = struct.unpack_from('<I', stream_data, sec_offset + 4)[0]
            entry_start = sec_offset + 8

            for i in range(num_props):
                prop_ptr = entry_start + (i * 8)
                if prop_ptr + 8 > len(stream_data):
                    break
                pid, prop_offset = struct.unpack_from('<II', stream_data, prop_ptr)

                if pid in target_pids:
                    val_offset = sec_offset + prop_offset
                    if val_offset + 12 <= len(stream_data):
                        w_type = struct.unpack_from('<I', stream_data, val_offset)[0]
                        if w_type == VT_FILETIME:
                            stream_data[val_offset + 4 : val_offset + 12] = filetime_bytes
                            modified_count += 1

        if modified_count > 0:
            ole.write_stream('\x05HwpSummaryInformation', bytes(stream_data))
            ole.close()
            return buf.getvalue(), True
        else:
            ole.close()
            return file_bytes, False

    except Exception as e:
        logger.warning(f"[HWP Metadata Warning] Fallback due to parsing error: {e}")
        return file_bytes, False


def modify_ooxml_metadata(file_bytes: bytes, target_utc_dt: datetime) -> tuple[bytes, bool]:
    """
    Modifies PPTX / DOCX (OOXML) docProps/core.xml metadata.
    Updates dcterms:created and dcterms:modified.
    Returns (modified_bytes, success_flag).
    """
    try:
        in_zip = zipfile.ZipFile(io.BytesIO(file_bytes), 'r')
        out_buf = io.BytesIO()
        out_zip = zipfile.ZipFile(out_buf, 'w', compression=zipfile.ZIP_DEFLATED)

        iso_str = target_utc_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        is_modified = False

        for item in in_zip.infolist():
            content = in_zip.read(item.filename)
            if item.filename == 'docProps/core.xml':
                try:
                    ET.register_namespace('cp', 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties')
                    ET.register_namespace('dc', 'http://purl.org/dc/elements/1.1/')
                    ET.register_namespace('dcterms', 'http://purl.org/dc/terms/')
                    ET.register_namespace('dcmitype', 'http://purl.org/dc/dcmitype/')
                    ET.register_namespace('xsi', 'http://www.w3.org/2001/XMLSchema-instance')

                    tree = ET.fromstring(content)
                    ns = {
                        'dcterms': 'http://purl.org/dc/terms/',
                        'cp': 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties'
                    }

                    created_elem = tree.find('dcterms:created', ns)
                    if created_elem is not None:
                        created_elem.text = iso_str
                        is_modified = True

                    modified_elem = tree.find('dcterms:modified', ns)
                    if modified_elem is not None:
                        modified_elem.text = iso_str
                        is_modified = True

                    content = ET.tostring(tree, encoding='utf-8', xml_declaration=True)
                except Exception as xml_err:
                    logger.warning(f"[OOXML XML Parse Error] {xml_err}")

            out_zip.writestr(item, content)

        in_zip.close()
        out_zip.close()
        return out_buf.getvalue(), is_modified
    except Exception as e:
        logger.warning(f"[OOXML Metadata Error] {e}")
        return file_bytes, False


def modify_exif_metadata(file_bytes: bytes, target_utc_dt: datetime) -> tuple[bytes, bool]:
    """
    Modifies EXIF metadata in JPEG images.
    Replaces YYYY:MM:DD HH:MM:SS in EXIF DateTime, DateTimeOriginal, DateTimeDigitized.
    """
    try:
        if not file_bytes.startswith(b'\xff\xd8'):
            return file_bytes, False

        kst_dt = target_utc_dt.astimezone(KST)
        formatted_str = kst_dt.strftime('%Y:%m:%d %H:%M:%S').encode('ascii')

        import re
        date_pattern = re.compile(b'\\d{4}:\\d{2}:\\d{2} \\d{2}:\\d{2}:\\d{2}')
        
        modified_bytes, count = date_pattern.subn(formatted_str, file_bytes)
        return modified_bytes, (count > 0)
    except Exception as e:
        logger.warning(f"[EXIF Metadata Error] {e}")
        return file_bytes, False


def process_file_metadata(filename: str, file_bytes: bytes, target_time_str: str) -> tuple[bytes, bool, datetime]:
    """
    Processes a single file's metadata based on its extension.
    Returns (modified_file_bytes, success_flag, target_utc_dt).
    """
    target_utc_dt = parse_iso_or_timestamp(target_time_str)
    ext = filename.lower().split('.')[-1]

    if ext == 'hwp':
        modified_bytes, success = modify_hwp_metadata(file_bytes, target_utc_dt)
    elif ext in ('pptx', 'docx'):
        modified_bytes, success = modify_ooxml_metadata(file_bytes, target_utc_dt)
    elif ext in ('jpg', 'jpeg'):
        modified_bytes, success = modify_exif_metadata(file_bytes, target_utc_dt)
    else:
        modified_bytes, success = file_bytes, False

    return modified_bytes, success, target_utc_dt



def build_output_zip(files_data: list[tuple[str, bytes]], target_time_str: str) -> bytes:
    """
    Packages processed files into a ZIP archive with custom ZipInfo timestamps.
    """
    target_utc_dt = parse_iso_or_timestamp(target_time_str)
    kst_dt = target_utc_dt.astimezone(KST)

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for filename, file_bytes in files_data:
            even_sec = (kst_dt.second // 2) * 2
            zinfo = zipfile.ZipInfo(
                filename=filename,
                date_time=(kst_dt.year, kst_dt.month, kst_dt.day, kst_dt.hour, kst_dt.minute, even_sec)
            )
            zinfo.external_attr = 0o600 << 16
            zf.writestr(zinfo, file_bytes)

    return zip_buf.getvalue()
