from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from typing import List
from metadata_editor import process_file_metadata, build_output_zip

app = FastAPI(
    title="TimeWeaver Backend API",
    description="Track B Deep Metadata & Timestamp Standardizing API",
    version="3.1.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "TimeWeaver API", "version": "3.1.0"}

@app.post("/api/process-metadata")
async def process_metadata(
    files: List[UploadFile] = File(...),
    target_time: str = Form(...)
):
    """
    Track B: Receives files and target timestamp (ISO / KST format),
    modifies internal document metadata (HWP, PPTX, DOCX),
    and returns a ZIP archive containing files with modified OS timestamps.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    try:
        processed_files = []
        modified_count = 0

        for upload in files:
            file_bytes = await upload.read()
            filename = upload.filename or "document"
            
            modified_bytes, is_modified, _ = process_file_metadata(filename, file_bytes, target_time)
            if is_modified:
                modified_count += 1
            processed_files.append((filename, modified_bytes))

        # Package into output ZIP archive
        zip_bytes = build_output_zip(processed_files, target_time)

        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": "attachment; filename=TimeWeaver_Archived.zip",
                "X-Total-Files": str(len(files)),
                "X-Modified-Metadata-Files": str(modified_count)
            }
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal processing error: {err}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
