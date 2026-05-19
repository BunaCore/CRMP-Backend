from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import List
from app.api.schemas import (
    RecommendationRequest,
    RecommendationResponse,
    RagChatRequest,
    RagChatResponse,
    RagStatsResponse,
    RagDeleteResponse,
    SearchRequest,
)
from app.services.recommender_service import RecommenderService
from app.services.rag_service import RAGService

router = APIRouter()
recommender_service = RecommenderService(mode="db")
rag_service = RAGService()

@router.post("/recommend", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    """
    Standard hybrid recommendation for a researcher's dashboard.
    """
    try:
        recommendations = await recommender_service.get_recommendations(
            request.researcher_id, request.top_k
        )
        return {"recommendations": recommendations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recommend-members", response_model=List[dict])
async def recommend_members(request: dict):
    """
    Advanced member recommendation for the proposal team section.
    Expects: {title, research_area, host_department, query, pi_id}
    """
    try:
        recommendations = recommender_service.recommend_members(request)
        return recommendations
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search/members", response_model=RecommendationResponse)
async def search_members(request: SearchRequest):
    try:
        results = recommender_service.search_researchers(
            query=request.query,
            top_k=request.top_k
        )
        return {"recommendations": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recommend-projects", response_model=List[dict])
async def recommend_projects(request: dict):
    """
    Exposes related projects recommendations.
    Expects: {id, title, researchArea, abstract, department, top_k}
    """
    try:
        top_k = request.get("top_k", 5)
        recommendations = recommender_service.recommend_projects(request, top_k)
        return recommendations
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search-projects", response_model=List[dict])
async def search_projects(request: dict):
    """
    Exposes project semantic search.
    Expects: {query, top_k}
    """
    try:
        query = request.get("query", "")
        top_k = request.get("top_k", 5)
        results = recommender_service.search_projects(query, top_k)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ═══════════════════════════════════════════════════════════════════════
# RAG ENDPOINTS (Upgraded Semantic Pipeline)
# ═══════════════════════════════════════════════════════════════════════

@router.post("/rag/upload")
async def rag_upload(file: UploadFile = File(...)):
    """
    Ingests a document (PDF or TXT) into the semantic RAG index.

    Pipeline: File → Chunker → BGE Embeddings → FAISS + BM25 indexes.
    """
    try:
        filename_lower = file.filename.lower()
        contents = await file.read()

        if filename_lower.endswith('.pdf'):
            result = rag_service.process_pdf(contents, file.filename)
        elif filename_lower.endswith('.txt'):
            result = rag_service.process_text(contents, file.filename)
        else:
            raise HTTPException(
                status_code=400,
                detail="Only PDF and TXT files are supported"
            )

        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rag/chat", response_model=RagChatResponse)
async def rag_chat(request: RagChatRequest):
    """
    Answers a question using hybrid semantic + keyword retrieval
    over previously uploaded documents.

    Pipeline: Query → FAISS + BM25 → Score Fusion → Reranking → Response.
    """
    try:
        result = rag_service.chat(request.document_ids, request.query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/rag/stats", response_model=RagStatsResponse)
async def rag_stats():
    """
    Returns comprehensive RAG index statistics.

    Useful for monitoring index health, debugging retrieval issues,
    and verifying that documents were properly ingested.
    """
    try:
        return rag_service.get_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/rag/documents/{document_id}", response_model=RagDeleteResponse)
async def rag_delete_document(document_id: str):
    """
    Removes a document from all RAG indexes (FAISS + BM25).

    This is an idempotent operation — deleting a non-existent document
    returns deleted_chunks=0 without error.
    """
    try:
        result = rag_service.delete_document(document_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ═══════════════════════════════════════════════════════════════════════
# MODEL MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════

@router.get("/retrain")
async def retrain_model():
    try:
        recommender_service.train_model()
        return {"message": "Model retrained successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health_check():
    return {"status": "healthy"}
