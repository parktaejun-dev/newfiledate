import io
import struct
import zipfile
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from docx import Document
from pptx import Presentation
import olefile

from main import app
from metadata_editor import (
    datetime_to_filetime,
    parse_iso_or_timestamp,
    modify_hwp_metadata,
    modify_ooxml_metadata,
    process_file_metadata,
    build_output_zip
)

client = TestClient(app)

def create_sample_hwp_bytes() -> bytes:
    """Helper to create a valid in-memory OLE file simulating an HWP document."""
    header = bytearray(512)
    header[0:8] = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'
    header[24:26] = b'\x3e\x00'
    header[26:28] = b'\x03\x00'
    header[28:30] = b'\xfe\xff'
    header[30:32] = b'\x09\x00'
    header[32:34] = b'\x06\x00'
    header[44:48] = b'\x01\x00\x00\x00'
    header[48:52] = b'\x01\x00\x00\x00'
    header[60:64] = b'\x02\x00\x00\x00'
    header[64:68] = b'\x01\x00\x00\x00'
    header[68:72] = b'\xfe\xff\xff\xff'
    header[76:80] = b'\x00\x00\x00\x00'

    fat = bytearray(512)
    fat[0:4]   = struct.pack('<I', 0xFFFFFFFD)
    fat[4:8]   = struct.pack('<I', 0xFFFFFFFE)
    fat[8:12]  = struct.pack('<I', 0xFFFFFFFE)
    fat[12:16] = struct.pack('<I', 0xFFFFFFFE)
    for i in range(4, 128):
        fat[i*4:(i+1)*4] = struct.pack('<I', 0xFFFFFFFF)

    dir_sec = bytearray(512)
    root_name = 'Root Entry'.encode('utf-16le')
    dir_sec[0:len(root_name)] = root_name
    dir_sec[64:66] = struct.pack('<H', len(root_name) + 2)
    dir_sec[66] = 5
    dir_sec[68:72] = struct.pack('<I', 1)
    dir_sec[116:120] = struct.pack('<I', 3)
    dir_sec[120:124] = struct.pack('<I', 128)

    stream_name = '\x05HwpSummaryInformation'.encode('utf-16le')
    dir_sec[128:128+len(stream_name)] = stream_name
    dir_sec[128+64:128+66] = struct.pack('<H', len(stream_name) + 2)
    dir_sec[128+66] = 2
    dir_sec[128+116:128+120] = struct.pack('<I', 0)
    dir_sec[128+120:128+124] = struct.pack('<I', 128)

    mini_fat = bytearray(512)
    mini_fat[0:4] = struct.pack('<I', 1)
    mini_fat[4:8] = struct.pack('<I', 0xFFFFFFFE)
    for i in range(2, 128):
        mini_fat[i*4:(i+1)*4] = struct.pack('<I', 0xFFFFFFFF)

    mini_stream_data = bytearray(512)
    mini_stream_data[0:2] = b'\xfe\xff'
    mini_stream_data[24:28] = struct.pack('<I', 1)
    mini_stream_data[44:48] = struct.pack('<I', 48)
    mini_stream_data[48:52] = struct.pack('<I', 80)
    mini_stream_data[52:56] = struct.pack('<I', 3)

    mini_stream_data[56:60] = struct.pack('<I', 11)
    mini_stream_data[60:64] = struct.pack('<I', 32)
    mini_stream_data[64:68] = struct.pack('<I', 12)
    mini_stream_data[68:72] = struct.pack('<I', 48)
    mini_stream_data[72:76] = struct.pack('<I', 13)
    mini_stream_data[76:80] = struct.pack('<I', 64)

    mini_stream_data[80:84] = struct.pack('<I', 0x0040)
    mini_stream_data[84:92] = struct.pack('<Q', 100)
    mini_stream_data[96:100] = struct.pack('<I', 0x0040)
    mini_stream_data[100:108] = struct.pack('<Q', 200)
    mini_stream_data[112:116] = struct.pack('<I', 0x0040)
    mini_stream_data[116:124] = struct.pack('<Q', 300)

    return bytes(header + fat + dir_sec + mini_fat + mini_stream_data)


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_datetime_to_filetime():
    dt_utc = datetime(2026, 8, 3, 5, 0, 0, tzinfo=timezone.utc)
    ft = datetime_to_filetime(dt_utc)
    assert ft > 0


def test_parse_iso_or_timestamp_valid():
    dt = parse_iso_or_timestamp("2023-05-15T14:30:00")
    assert dt.hour == 5
    assert dt.day == 15


def test_parse_iso_or_timestamp_invalid():
    with pytest.raises(ValueError, match="Invalid timestamp format"):
        parse_iso_or_timestamp("not-a-date")


def test_parse_iso_or_timestamp_out_of_range():
    with pytest.raises(ValueError, match="out of allowed range"):
        parse_iso_or_timestamp("1975-01-01T00:00:00")

    with pytest.raises(ValueError, match="out of allowed range"):
        parse_iso_or_timestamp("2150-01-01T00:00:00")


def test_modify_hwp_metadata():
    orig_hwp = create_sample_hwp_bytes()
    target_dt = parse_iso_or_timestamp("2023-05-15T14:30:00")
    expected_ft = datetime_to_filetime(target_dt)

    modified_hwp, success = modify_hwp_metadata(orig_hwp, target_dt)
    assert success is True

    ole = olefile.OleFileIO(io.BytesIO(modified_hwp))
    st_data = ole.openstream('\x05HwpSummaryInformation').read()
    ole.close()

    ft_11 = struct.unpack_from('<Q', st_data, 84)[0]
    ft_12 = struct.unpack_from('<Q', st_data, 100)[0]
    ft_13 = struct.unpack_from('<Q', st_data, 116)[0]

    assert ft_11 == expected_ft
    assert ft_12 == expected_ft
    assert ft_13 == expected_ft


def test_modify_docx_metadata():
    doc = Document()
    doc.add_heading('Test DOCX Document', 0)
    docx_buf = io.BytesIO()
    doc.save(docx_buf)

    target_dt = parse_iso_or_timestamp("2023-05-15T14:30:00")
    modified_docx, success = modify_ooxml_metadata(docx_buf.getvalue(), target_dt)
    assert success is True

    mod_zip = zipfile.ZipFile(io.BytesIO(modified_docx))
    core_xml_str = mod_zip.read('docProps/core.xml').decode('utf-8')

    assert "2023-05-15T05:30:00Z" in core_xml_str


def test_modify_pptx_metadata():
    prs = Presentation()
    prs_buf = io.BytesIO()
    prs.save(prs_buf)

    target_dt = parse_iso_or_timestamp("2023-05-15T14:30:00")
    modified_pptx, success = modify_ooxml_metadata(prs_buf.getvalue(), target_dt)
    assert success is True

    mod_zip = zipfile.ZipFile(io.BytesIO(modified_pptx))
    core_xml_str = mod_zip.read('docProps/core.xml').decode('utf-8')

    assert "2023-05-15T05:30:00Z" in core_xml_str


def test_api_process_metadata_with_hwp_and_docx():
    hwp_bytes = create_sample_hwp_bytes()
    
    doc = Document()
    doc.add_heading('Test API DOCX', 0)
    docx_buf = io.BytesIO()
    doc.save(docx_buf)
    docx_bytes = docx_buf.getvalue()

    response = client.post(
        "/api/process-metadata",
        data={"target_time": "2023-05-15T14:30:00"},
        files=[
            ("files", ("test.hwp", hwp_bytes, "application/x-hwp")),
            ("files", ("test.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
        ]
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["X-Modified-Metadata-Files"] == "2"
    
    out_zip = zipfile.ZipFile(io.BytesIO(response.content))
    names = out_zip.namelist()
    assert "test.hwp" in names
    assert "test.docx" in names


def test_api_process_metadata_invalid_time_returns_400():
    response = client.post(
        "/api/process-metadata",
        data={"target_time": "invalid-date-string"},
        files=[("files", ("test.txt", b"sample content", "text/plain"))]
    )
    assert response.status_code == 400
    assert "Invalid timestamp format" in response.json()["detail"]
