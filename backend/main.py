import logging
import os
import time
from collections import OrderedDict, deque
from typing import Deque, List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from metadata_editor import (
    SUPPORTED_EXTENSIONS,
    UnsafeArchiveError,
    build_output_zip,
    deduplicate_filename,
    parse_target_time,
    process_file_metadata,
    sanitize_filename,
)

logger = logging.getLogger("newfiledate")

# --- Request limits ---------------------------------------------------------
# The platform caps the request body at 4.5 MB, but the code must not depend on
# the host for that: these limits also apply to self-hosted deployments.
MAX_FILES_PER_REQUEST = 50
MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024

# Browsers only enforce CORS for cross-origin callers; this keeps the endpoint
# from being usable as a free file-processing backend by arbitrary sites.
DEFAULT_ALLOWED_ORIGINS = [
    "https://www.newfiledate.com",
    "https://newfiledate.com",
    "https://newfiledate.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
]
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", ",".join(DEFAULT_ALLOWED_ORIGINS)).split(",")
    if origin.strip()
]

# --- Best-effort rate limiting ----------------------------------------------
# This is per-instance only. A serverless platform runs many instances, so an
# attacker gets roughly (instances x limit) requests -- it is NOT a substitute
# for edge rate limiting (see "Rate limiting" in README.md). It is still worth
# having: it rejects a sustained flood before any file bytes are read, which is
# where the memory and CPU cost lives.
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 20
# Bounds the tracking table so the limiter cannot itself become a memory leak.
RATE_LIMIT_MAX_TRACKED_CLIENTS = 10_000

_request_times: "OrderedDict[str, Deque[float]]" = OrderedDict()


def reset_rate_limit_state() -> None:
    """Clear the tracking table. Used by tests."""
    _request_times.clear()


def _client_key(request: Request) -> str:
    """Identify the caller for rate limiting.

    On Vercel `x-real-ip` and `x-forwarded-for` are set by the platform edge.
    Both are client-controllable when the app is self-hosted without a proxy, so
    this is an abuse heuristic, not an authentication signal.
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()

    return request.client.host if request.client else "unknown"


def _rate_limit_exceeded(key: str) -> bool:
    now = time.monotonic()
    cutoff = now - RATE_LIMIT_WINDOW_SECONDS

    timestamps = _request_times.get(key)
    if timestamps is None:
        timestamps = deque()
        _request_times[key] = timestamps

    while timestamps and timestamps[0] < cutoff:
        timestamps.popleft()

    _request_times.move_to_end(key)

    # Drop the least recently seen clients once the table is full.
    while len(_request_times) > RATE_LIMIT_MAX_TRACKED_CLIENTS:
        _request_times.popitem(last=False)

    if len(timestamps) >= RATE_LIMIT_MAX_REQUESTS:
        return True

    timestamps.append(now)
    return False


app = FastAPI(
    title="NewFileDate Backend API",
    description="Track B deep document metadata editing",
    version="4.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "NewFileDate API", "version": "4.1.0"}


@app.post("/api/process-metadata")
async def process_metadata(
    request: Request,
    files: List[UploadFile] = File(...),
    target_time: str = Form(...),
    tz_offset_minutes: int | None = Form(default=None),
):
    """Track B: edit embedded document metadata and return a ZIP archive.

    `target_time` is the wall clock the client displayed; `tz_offset_minutes`
    follows the JavaScript `Date.getTimezoneOffset()` convention and lets the
    server derive the UTC instant that HWP and OOXML need.
    """
    # Checked first: rejecting here costs nothing, whereas the work below reads
    # every uploaded file into memory.
    if _rate_limit_exceeded(_client_key(request)):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait a moment and try again.",
            headers={"Retry-After": str(RATE_LIMIT_WINDOW_SECONDS)},
        )

    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files in one request (limit {MAX_FILES_PER_REQUEST}).",
        )

    try:
        wall_clock, target_utc_dt = parse_target_time(target_time, tz_offset_minutes)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    processed_files: list[tuple[str, bytes]] = []
    taken_names: set[str] = set()
    total_bytes = 0
    modified_count = 0

    for upload in files:
        safe_name = deduplicate_filename(sanitize_filename(upload.filename), taken_names)

        ext = safe_name.lower().rpartition(".")[2]
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"'{safe_name}' is not a supported document type. "
                    f"Track B accepts: {', '.join(sorted(SUPPORTED_EXTENSIONS))}."
                ),
            )

        file_bytes = await upload.read()

        if len(file_bytes) > MAX_SINGLE_FILE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"'{safe_name}' exceeds the {MAX_SINGLE_FILE_BYTES // (1024 * 1024)}MB per-file limit.",
            )

        total_bytes += len(file_bytes)
        if total_bytes > MAX_TOTAL_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Request exceeds the {MAX_TOTAL_UPLOAD_BYTES // (1024 * 1024)}MB total upload limit.",
            )

        try:
            modified_bytes, is_modified = process_file_metadata(
                safe_name, file_bytes, wall_clock, target_utc_dt
            )
        except UnsafeArchiveError as err:
            raise HTTPException(status_code=400, detail=f"'{safe_name}': {err}")

        if is_modified:
            modified_count += 1
        processed_files.append((safe_name, modified_bytes))

    try:
        zip_bytes = build_output_zip(processed_files, wall_clock)
    except Exception:
        # Never surface library internals or paths to the caller.
        logger.exception("Failed to build output archive")
        raise HTTPException(status_code=500, detail="Internal processing error.")

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="NewFileDate_Archived.zip"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Total-Files": str(len(processed_files)),
            "X-Modified-Metadata-Files": str(modified_count),
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
