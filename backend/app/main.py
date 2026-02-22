from fastapi import FastAPI

app = FastAPI(title="MaPera API")

@app.get("/health")
def health_check():
    return {"status": "ok"}