"""Postor document guard on Modal: Meta Llama Prompt Guard 2 (86M).

Tender documents are DATA, never instructions. Before any agent reads a
page, Postor sends its text here; Prompt Guard 2 (multilingual, built by
Meta to detect prompt injection and jailbreak attempts) returns the
probability that the text tries to instruct a model. Postor flags those
pages in the trace and keeps treating them as plain data.

Deploy (needs a Modal account and a Hugging Face token with access to the
gated meta-llama/Llama-Prompt-Guard-2-86M repo):

    modal secret create huggingface-secret HF_TOKEN=hf_...
    modal secret create postor-guard GUARD_TOKEN=<long random token>
    modal deploy deploy/modal/prompt_guard.py

Then set in Postor's .env:
    POSTOR_GUARD_URL=https://<workspace>--postor-prompt-guard-web.modal.run
    POSTOR_GUARD_TOKEN=<the same GUARD_TOKEN>
"""

import os

import modal

MODEL_ID = "meta-llama/Llama-Prompt-Guard-2-86M"
# Prompt Guard 2 is a 512-token classifier; longer inputs are truncated, so
# Postor sends page chunks well under that size.
MAX_TOKENS = 512
# Requests carry at most this many chunks (keeps one call well under a second
# of CPU inference and bounds memory).
MAX_TEXTS_PER_CALL = 64

app = modal.App("postor-prompt-guard")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.4.1",
        "transformers==4.46.3",
        "fastapi[standard]==0.115.6",
        extra_index_url="https://download.pytorch.org/whl/cpu",
    )
)


def load_model():
    """Downloads (once per container) and loads tokenizer + classifier."""
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    token = os.environ["HF_TOKEN"]
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=token)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_ID, token=token)
    model.eval()
    return tokenizer, model


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("huggingface-secret"),
        modal.Secret.from_name("postor-guard"),
    ],
    cpu=2.0,
    memory=2048,
    scaledown_window=300,
)
@modal.asgi_app()
def web():
    import torch
    from fastapi import FastAPI, Header, HTTPException
    from pydantic import BaseModel

    tokenizer, model = load_model()
    expected_token = os.environ["GUARD_TOKEN"]
    # Prompt Guard 2 is binary: index 0 = benign, index 1 = malicious.
    malicious_index = 1

    api = FastAPI(title="Postor document guard")

    class ClassifyRequest(BaseModel):
        texts: list[str]

    @api.get("/health")
    def health():
        return {"status": "ok", "model": MODEL_ID}

    @api.post("/classify")
    def classify(payload: ClassifyRequest, authorization: str | None = Header(default=None)):
        if authorization != f"Bearer {expected_token}":
            raise HTTPException(status_code=401, detail="invalid guard token")
        if len(payload.texts) > MAX_TEXTS_PER_CALL:
            raise HTTPException(status_code=413, detail=f"max {MAX_TEXTS_PER_CALL} texts per call")
        if not payload.texts:
            return {"model": MODEL_ID, "scores": []}
        inputs = tokenizer(
            payload.texts,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=MAX_TOKENS,
        )
        with torch.no_grad():
            probabilities = torch.softmax(model(**inputs).logits, dim=-1)
        scores = [round(float(row[malicious_index]), 4) for row in probabilities]
        return {"model": MODEL_ID, "scores": scores}

    return api
