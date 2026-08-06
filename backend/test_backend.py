import io
import struct
import zipfile
from datetime import datetime, timezone
from types import SimpleNamespace

import olefile
import pytest
from docx import Document
from fastapi.testclient import TestClient
from pptx import Presentation

import main as main_module
from main import app
from metadata_editor import (
    MAX_TOTAL_UNCOMPRESSED_BYTES,
    UnsafeArchiveError,
    build_output_zip,
    datetime_to_filetime,
    deduplicate_filename,
    modify_exif_metadata,
    modify_hwp_metadata,
    modify_ooxml_metadata,
    parse_target_time,
    process_file_metadata,
    sanitize_filename,
)

client = TestClient(app)

# Requests must carry an allowed Origin now that CORS is restricted.
ORIGIN = {"Origin": "https://www.newfiledate.com"}


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Clear the per-instance limiter so tests do not exhaust each other's quota."""
    main_module.reset_rate_limit_state()
    yield
    main_module.reset_rate_limit_state()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def create_sample_hwp_bytes() -> bytes:
    """Build a minimal in-memory OLE compound file simulating an HWP document."""
    header = bytearray(512)
    header[0:8] = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    header[24:26] = b"\x3e\x00"
    header[26:28] = b"\x03\x00"
    header[28:30] = b"\xfe\xff"
    header[30:32] = b"\x09\x00"
    header[32:34] = b"\x06\x00"
    header[44:48] = b"\x01\x00\x00\x00"
    header[48:52] = b"\x01\x00\x00\x00"
    header[60:64] = b"\x02\x00\x00\x00"
    header[64:68] = b"\x01\x00\x00\x00"
    header[68:72] = b"\xfe\xff\xff\xff"
    header[76:80] = b"\x00\x00\x00\x00"

    fat = bytearray(512)
    fat[0:4] = struct.pack("<I", 0xFFFFFFFD)
    fat[4:8] = struct.pack("<I", 0xFFFFFFFE)
    fat[8:12] = struct.pack("<I", 0xFFFFFFFE)
    fat[12:16] = struct.pack("<I", 0xFFFFFFFE)
    for i in range(4, 128):
        fat[i * 4 : (i + 1) * 4] = struct.pack("<I", 0xFFFFFFFF)

    dir_sec = bytearray(512)
    root_name = "Root Entry".encode("utf-16le")
    dir_sec[0 : len(root_name)] = root_name
    dir_sec[64:66] = struct.pack("<H", len(root_name) + 2)
    dir_sec[66] = 5
    dir_sec[68:72] = struct.pack("<I", 1)
    dir_sec[116:120] = struct.pack("<I", 3)
    dir_sec[120:124] = struct.pack("<I", 128)

    stream_name = "\x05HwpSummaryInformation".encode("utf-16le")
    dir_sec[128 : 128 + len(stream_name)] = stream_name
    dir_sec[128 + 64 : 128 + 66] = struct.pack("<H", len(stream_name) + 2)
    dir_sec[128 + 66] = 2
    dir_sec[128 + 116 : 128 + 120] = struct.pack("<I", 0)
    dir_sec[128 + 120 : 128 + 124] = struct.pack("<I", 128)

    mini_fat = bytearray(512)
    mini_fat[0:4] = struct.pack("<I", 1)
    mini_fat[4:8] = struct.pack("<I", 0xFFFFFFFE)
    for i in range(2, 128):
        mini_fat[i * 4 : (i + 1) * 4] = struct.pack("<I", 0xFFFFFFFF)

    mini = bytearray(512)
    mini[0:2] = b"\xfe\xff"
    mini[24:28] = struct.pack("<I", 1)
    mini[44:48] = struct.pack("<I", 48)
    mini[48:52] = struct.pack("<I", 80)
    mini[52:56] = struct.pack("<I", 3)

    mini[56:60] = struct.pack("<I", 11)
    mini[60:64] = struct.pack("<I", 32)
    mini[64:68] = struct.pack("<I", 12)
    mini[68:72] = struct.pack("<I", 48)
    mini[72:76] = struct.pack("<I", 13)
    mini[76:80] = struct.pack("<I", 64)

    mini[80:84] = struct.pack("<I", 0x0040)
    mini[84:92] = struct.pack("<Q", 100)
    mini[96:100] = struct.pack("<I", 0x0040)
    mini[100:108] = struct.pack("<Q", 200)
    mini[112:116] = struct.pack("<I", 0x0040)
    mini[116:124] = struct.pack("<Q", 300)

    return bytes(header + fat + dir_sec + mini_fat + mini)


SCAN_DATA_DATE = b"1999:12:31 23:59:58"


def create_sample_jpeg_bytes(exif_date: bytes = b"2020:06:15 12:34:56") -> bytes:
    """Minimal JPEG: one APP1/EXIF segment plus scan data containing a date-like string.

    The scan data copy lets us prove rewrites stay inside APP1.
    """
    payload = b"Exif\x00\x00" + b"MM\x00*" + exif_date + b"\x00" * 8
    app1 = b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload
    scan = b"\xff\xda\x00\x08\x01\x01\x00\x00" + SCAN_DATA_DATE + b"\x11\x22\x33"
    return b"\xff\xd8" + app1 + scan + b"\xff\xd9"


def make_docx_bytes() -> bytes:
    doc = Document()
    doc.add_heading("Test DOCX Document", 0)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Filename sanitisation  (Zip Slip regression)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("../../../../etc/cron.d/pwn", "pwn"),
        ("..\\..\\windows\\system32\\evil.dll", "evil.dll"),
        ("/absolute/path/report.docx", "report.docx"),
        ("normal.hwp", "normal.hwp"),
        ("..", "document"),
        (".", "document"),
        ("", "document"),
        (None, "document"),
        ("bad\x00name.jpg", "badname.jpg"),
        (".gitignore", ".gitignore"),
    ],
)
def test_sanitize_filename_strips_path_components(raw, expected):
    assert sanitize_filename(raw) == expected


def test_sanitize_filename_prefixes_windows_reserved_names():
    assert sanitize_filename("CON.docx") == "_CON.docx"


def test_sanitize_filename_truncates_but_keeps_extension():
    result = sanitize_filename("a" * 500 + ".docx")
    assert len(result) <= 200
    assert result.endswith(".docx")


def test_output_zip_never_contains_traversal_paths():
    zip_bytes = build_output_zip(
        [("../../../../etc/cron.d/pwn", b"x"), ("/tmp/abs.docx", b"y")],
        datetime(2020, 1, 1, 0, 0, 0),
    )
    names = zipfile.ZipFile(io.BytesIO(zip_bytes)).namelist()
    assert names == ["pwn", "abs.docx"]
    assert not any(".." in n or n.startswith("/") for n in names)


def test_api_rejects_traversal_filename_end_to_end():
    """The live regression: a traversal filename must not survive into the archive."""
    response = client.post(
        "/api/process-metadata",
        data={"target_time": "2020-01-01T00:00:00"},
        files=[("files", ("../../../../etc/cron.d/pwn.docx", make_docx_bytes(), "application/octet-stream"))],
        headers=ORIGIN,
    )
    assert response.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(response.content)).namelist()
    assert names == ["pwn.docx"]


# ---------------------------------------------------------------------------
# Duplicate filenames
# ---------------------------------------------------------------------------


def test_deduplicate_filename_suffixes_collisions():
    taken: set[str] = set()
    assert deduplicate_filename("IMG_0001.JPG", taken) == "IMG_0001.JPG"
    assert deduplicate_filename("IMG_0001.JPG", taken) == "IMG_0001_1.JPG"
    assert deduplicate_filename("IMG_0001.JPG", taken) == "IMG_0001_2.JPG"


def test_same_named_files_are_all_preserved():
    zip_bytes = build_output_zip(
        [("IMG_0001.JPG", b"first"), ("IMG_0001.JPG", b"second")],
        datetime(2020, 1, 1, 0, 0, 0),
    )
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    assert len(zf.namelist()) == 2
    assert zf.read("IMG_0001.JPG") == b"first"
    assert zf.read("IMG_0001_1.JPG") == b"second"


# ---------------------------------------------------------------------------
# Decompression bomb
# ---------------------------------------------------------------------------


def test_zip_bomb_is_rejected():
    """A small OOXML container declaring gigabytes of content must be refused."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("docProps/core.xml", b"<x/>")
        z.writestr("bomb.bin", b"\0" * (600 * 1024 * 1024))

    with pytest.raises(UnsafeArchiveError):
        modify_ooxml_metadata(buf.getvalue(), datetime(2020, 1, 1, tzinfo=timezone.utc))


def test_zip_with_too_many_entries_is_rejected():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for i in range(2_500):
            z.writestr(f"f{i}.txt", b"a")

    with pytest.raises(UnsafeArchiveError):
        modify_ooxml_metadata(buf.getvalue(), datetime(2020, 1, 1, tzinfo=timezone.utc))


def test_api_returns_400_for_zip_bomb():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("docProps/core.xml", b"<x/>")
        z.writestr("bomb.bin", b"\0" * (600 * 1024 * 1024))

    response = client.post(
        "/api/process-metadata",
        data={"target_time": "2020-01-01T00:00:00"},
        files=[("files", ("bomb.docx", buf.getvalue(), "application/octet-stream"))],
        headers=ORIGIN,
    )
    assert response.status_code == 400
    assert "archive" in response.json()["detail"].lower()


def test_high_ratio_archive_is_rejected_even_when_entries_are_small():
    """Every entry fits the per-entry cap; only the compression ratio is abnormal."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("docProps/core.xml", b"<x/>")
        z.writestr("filler.bin", b"\0" * (50 * 1024 * 1024))

    with pytest.raises(UnsafeArchiveError, match="compression ratio"):
        modify_ooxml_metadata(buf.getvalue(), datetime(2020, 1, 1, tzinfo=timezone.utc))


def test_normal_docx_stays_under_the_limits():
    modified, success = modify_ooxml_metadata(
        make_docx_bytes(), datetime(2020, 1, 1, tzinfo=timezone.utc)
    )
    assert success is True
    assert len(modified) < MAX_TOTAL_UNCOMPRESSED_BYTES


# ---------------------------------------------------------------------------
# Timestamp semantics  (no hardcoded timezone)
# ---------------------------------------------------------------------------


def test_naive_wall_clock_is_preserved_verbatim():
    wall, utc = parse_target_time("2023-05-15T14:30:00", tz_offset_minutes=None)
    assert (wall.hour, wall.minute) == (14, 30)
    assert utc.hour == 14  # no offset supplied -> treated as UTC, not KST


def test_wall_clock_and_utc_derived_from_browser_offset():
    # KST (UTC+9) reports -540.
    wall, utc = parse_target_time("2023-05-15T14:30:00", tz_offset_minutes=-540)
    assert (wall.hour, wall.minute) == (14, 30)
    assert utc.hour == 5  # 14:30 KST == 05:30 UTC

    # US Eastern daylight time reports 240.
    wall_ny, utc_ny = parse_target_time("2023-05-15T14:30:00", tz_offset_minutes=240)
    assert (wall_ny.hour, wall_ny.minute) == (14, 30)
    assert utc_ny.hour == 18


def test_aware_input_round_trips_to_the_users_wall_clock():
    wall, utc = parse_target_time("2023-05-15T05:30:00Z", tz_offset_minutes=-540)
    assert (wall.hour, wall.minute) == (14, 30)
    assert utc.hour == 5


def test_zip_entry_uses_the_wall_clock_not_a_server_timezone():
    """Regression: the deployed service shifted 00:00Z to 09:00 for every user."""
    wall, _ = parse_target_time("2020-01-01T00:00:00", tz_offset_minutes=0)
    zip_bytes = build_output_zip([("a.txt", b"x")], wall)
    info = zipfile.ZipFile(io.BytesIO(zip_bytes)).infolist()[0]
    assert info.date_time == (2020, 1, 1, 0, 0, 0)


def test_zip_seconds_snap_to_even_values():
    wall, _ = parse_target_time("2020-01-01T00:00:59", tz_offset_minutes=0)
    zip_bytes = build_output_zip([("a.txt", b"x")], wall)
    info = zipfile.ZipFile(io.BytesIO(zip_bytes)).infolist()[0]
    assert info.date_time[5] == 58


def test_parse_target_time_rejects_garbage():
    with pytest.raises(ValueError, match="ISO 8601"):
        parse_target_time("not-a-date")


def test_parse_target_time_rejects_out_of_range():
    with pytest.raises(ValueError, match="supported range"):
        parse_target_time("1975-01-01T00:00:00")
    with pytest.raises(ValueError, match="supported range"):
        parse_target_time("2150-01-01T00:00:00")


def test_parse_target_time_rejects_absurd_offset():
    with pytest.raises(ValueError, match="offset"):
        parse_target_time("2020-01-01T00:00:00", tz_offset_minutes=99_999)


# ---------------------------------------------------------------------------
# Format-specific editing
# ---------------------------------------------------------------------------


def test_datetime_to_filetime():
    assert datetime_to_filetime(datetime(2026, 8, 3, 5, 0, 0, tzinfo=timezone.utc)) > 0


def test_modify_hwp_metadata():
    _, target_utc = parse_target_time("2023-05-15T14:30:00", tz_offset_minutes=-540)
    expected_ft = datetime_to_filetime(target_utc)

    modified, success = modify_hwp_metadata(create_sample_hwp_bytes(), target_utc)
    assert success is True

    ole = olefile.OleFileIO(io.BytesIO(modified))
    data = ole.openstream("\x05HwpSummaryInformation").read()
    ole.close()

    assert struct.unpack_from("<Q", data, 84)[0] == expected_ft
    assert struct.unpack_from("<Q", data, 100)[0] == expected_ft
    assert struct.unpack_from("<Q", data, 116)[0] == expected_ft


def test_modify_hwp_metadata_survives_corrupt_input():
    modified, success = modify_hwp_metadata(b"not an ole file", datetime.now(timezone.utc))
    assert success is False
    assert modified == b"not an ole file"


def test_modify_docx_metadata():
    _, target_utc = parse_target_time("2023-05-15T14:30:00", tz_offset_minutes=-540)
    modified, success = modify_ooxml_metadata(make_docx_bytes(), target_utc)
    assert success is True

    core = zipfile.ZipFile(io.BytesIO(modified)).read("docProps/core.xml").decode("utf-8")
    assert "2023-05-15T05:30:00Z" in core


def test_modify_pptx_metadata():
    prs = Presentation()
    buf = io.BytesIO()
    prs.save(buf)

    _, target_utc = parse_target_time("2023-05-15T14:30:00", tz_offset_minutes=-540)
    modified, success = modify_ooxml_metadata(buf.getvalue(), target_utc)
    assert success is True

    core = zipfile.ZipFile(io.BytesIO(modified)).read("docProps/core.xml").decode("utf-8")
    assert "2023-05-15T05:30:00Z" in core


def test_exif_rewrite_is_confined_to_app1_segment():
    """A blind binary replace would also corrupt entropy-coded scan data."""
    original = create_sample_jpeg_bytes()
    wall = datetime(2020, 6, 15, 12, 34, 56).replace(year=2001, month=2, day=3, hour=4, minute=5, second=6)

    modified, success = modify_exif_metadata(original, wall)
    assert success is True
    assert b"2001:02:03 04:05:06" in modified
    assert b"2020:06:15 12:34:56" not in modified
    # The identical-looking date after the SOS marker must be untouched.
    assert SCAN_DATA_DATE in modified
    assert len(modified) == len(original)


def test_exif_no_op_when_photo_has_no_date():
    jpeg = b"\xff\xd8" + b"\xff\xda\x00\x08\x01\x01\x00\x00" + b"\x11\x22" + b"\xff\xd9"
    modified, success = modify_exif_metadata(jpeg, datetime(2020, 1, 1))
    assert success is False
    assert modified == jpeg


def test_exif_uses_wall_clock_not_utc():
    modified, _ = modify_exif_metadata(create_sample_jpeg_bytes(), datetime(2023, 5, 15, 14, 30, 0))
    assert b"2023:05:15 14:30:00" in modified


def test_process_file_metadata_passes_through_unknown_types():
    modified, success = process_file_metadata(
        "notes.txt", b"plain", datetime(2020, 1, 1), datetime(2020, 1, 1, tzinfo=timezone.utc)
    )
    assert success is False
    assert modified == b"plain"


# ---------------------------------------------------------------------------
# API surface
# ---------------------------------------------------------------------------


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_api_process_metadata_with_hwp_and_docx():
    response = client.post(
        "/api/process-metadata",
        data={"target_time": "2023-05-15T14:30:00", "tz_offset_minutes": -540},
        files=[
            ("files", ("test.hwp", create_sample_hwp_bytes(), "application/x-hwp")),
            ("files", ("test.docx", make_docx_bytes(), "application/octet-stream")),
        ],
        headers=ORIGIN,
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["X-Modified-Metadata-Files"] == "2"

    names = zipfile.ZipFile(io.BytesIO(response.content)).namelist()
    assert set(names) == {"test.hwp", "test.docx"}


def test_api_rejects_unsupported_extension():
    response = client.post(
        "/api/process-metadata",
        data={"target_time": "2023-05-15T14:30:00"},
        files=[("files", ("payload.txt", b"sample", "text/plain"))],
        headers=ORIGIN,
    )
    assert response.status_code == 400
    assert "not a supported document type" in response.json()["detail"]


def test_api_rejects_too_many_files():
    files = [("files", (f"f{i}.docx", b"x", "application/octet-stream")) for i in range(60)]
    response = client.post(
        "/api/process-metadata",
        data={"target_time": "2023-05-15T14:30:00"},
        files=files,
        headers=ORIGIN,
    )
    assert response.status_code == 400
    assert "Too many files" in response.json()["detail"]


def test_api_rejects_oversized_file():
    response = client.post(
        "/api/process-metadata",
        data={"target_time": "2023-05-15T14:30:00"},
        files=[("files", ("big.docx", b"\0" * (11 * 1024 * 1024), "application/octet-stream"))],
        headers=ORIGIN,
    )
    assert response.status_code == 413
    assert "per-file limit" in response.json()["detail"]


def test_api_invalid_time_returns_400():
    response = client.post(
        "/api/process-metadata",
        data={"target_time": "invalid-date-string"},
        files=[("files", ("test.docx", make_docx_bytes(), "application/octet-stream"))],
        headers=ORIGIN,
    )
    assert response.status_code == 400
    assert "ISO 8601" in response.json()["detail"]


def test_api_does_not_leak_internal_exception_text():
    """Error bodies must stay generic even when processing blows up internally."""
    import metadata_editor

    original = metadata_editor.build_output_zip
    try:
        def explode(*_args, **_kwargs):
            raise RuntimeError("/var/task/secret/path.py exploded")

        # main.py imported the symbol directly, so patch it there.
        import main as main_module

        main_module.build_output_zip = explode

        response = client.post(
            "/api/process-metadata",
            data={"target_time": "2023-05-15T14:30:00"},
            files=[("files", ("test.docx", make_docx_bytes(), "application/octet-stream"))],
            headers=ORIGIN,
        )
        assert response.status_code == 500
        assert response.json()["detail"] == "Internal processing error."
        assert "secret/path" not in response.text
    finally:
        import main as main_module

        main_module.build_output_zip = original


def test_rate_limiter_rejects_a_flood_before_reading_files():
    docx = make_docx_bytes()

    def send(ip: str):
        return client.post(
            "/api/process-metadata",
            data={"target_time": "2023-05-15T14:30:00"},
            files=[("files", ("test.docx", docx, "application/octet-stream"))],
            headers={**ORIGIN, "x-real-ip": ip},
        )

    statuses = [send("203.0.113.9").status_code for _ in range(main_module.RATE_LIMIT_MAX_REQUESTS + 3)]

    assert statuses[: main_module.RATE_LIMIT_MAX_REQUESTS] == [200] * main_module.RATE_LIMIT_MAX_REQUESTS
    assert statuses[main_module.RATE_LIMIT_MAX_REQUESTS :] == [429, 429, 429]

    blocked = send("203.0.113.9")
    assert blocked.headers["Retry-After"] == str(main_module.RATE_LIMIT_WINDOW_SECONDS)

    # A different caller is unaffected.
    assert send("198.51.100.7").status_code == 200


def test_rate_limiter_table_stays_bounded():
    """The limiter must not become a memory-exhaustion vector itself."""
    for i in range(main_module.RATE_LIMIT_MAX_TRACKED_CLIENTS + 500):
        main_module._rate_limit_exceeded(f"10.0.{i // 256}.{i % 256}")

    assert len(main_module._request_times) <= main_module.RATE_LIMIT_MAX_TRACKED_CLIENTS


def test_rate_limit_key_prefers_platform_header():
    request = SimpleNamespace(
        headers={"x-real-ip": "203.0.113.5", "x-forwarded-for": "1.2.3.4, 5.6.7.8"},
        client=SimpleNamespace(host="10.0.0.1"),
    )
    assert main_module._client_key(request) == "203.0.113.5"

    forwarded_only = SimpleNamespace(
        headers={"x-forwarded-for": "1.2.3.4, 5.6.7.8"},
        client=SimpleNamespace(host="10.0.0.1"),
    )
    assert main_module._client_key(forwarded_only) == "1.2.3.4"


def test_cors_does_not_allow_arbitrary_origins():
    response = client.options(
        "/api/process-metadata",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.headers.get("access-control-allow-origin") != "https://evil.example"
    assert response.headers.get("access-control-allow-origin") != "*"
