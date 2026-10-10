
import os
import shutil
from fastapi import BackgroundTasks, FastAPI, File, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "https://wonderful-dune-044c5f110.6.azurestaticapps.net/"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# os.makedirs("uploads", exist_ok=True)

DATA_DIR = os.getenv("DATA_DIR", ".")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
CHROMA_DIR = os.path.join(DATA_DIR, "chroma_db")

os.makedirs(UPLOAD_DIR, exist_ok=True)

embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

vector_store = Chroma(
    collection_name="pdfs",
    embedding_function=embeddings,
    persist_directory="chroma_db",
)

splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

upload_statuses: dict[str, dict[str, str]] = {}


def index_pdf(path: str, filename: str):
    try:
        pages = PyPDFLoader(path).load()
        chunks = splitter.split_documents(pages)

        for c in chunks:
            c.metadata["source"] = filename

        vector_store.add_documents(chunks)
        upload_statuses[filename] = {"file": filename, "status": "ready"}
    except Exception as error:
        upload_statuses[filename] = {
            "file": filename,
            "status": "failed",
            "error": str(error),
        }
        raise


@app.post("/upload")
async def upload(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
):
    uploaded = []
    for file in files:
        # path = os.path.join("uploads", file.filename)
        path = os.path.join(UPLOAD_DIR, file.filename)
        with open(path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        upload_statuses[file.filename] = {"file": file.filename, "status": "processing"}
        background_tasks.add_task(index_pdf, path, file.filename)
        uploaded.append({"file": file.filename, "status": "processing"})

    return uploaded


@app.get("/upload/status")
def get_upload_status(files: list[str] = Query(...)):
    return [
        upload_statuses.get(
            filename,
            {
                "file": filename,
                "status": "failed",
                "error": "No indexing task was found. Please upload this file again.",
            },
        )
        for filename in files
    ]


@app.get("/search")
def search(q: str):
    docs = vector_store.similarity_search(q, k=3)
    return [
        {
            "text": d.page_content[:200],
            "source": d.metadata["source"],
            "page": d.metadata["page"] + 1,
        }
        for d in docs
    ]
