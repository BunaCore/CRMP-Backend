import pytest
from app.services.recommender_service import RecommenderService
from app.utils.preprocessing import clean_text

def test_clean_text():
    assert clean_text("Machine Learning!") == "machine learning"
    assert clean_text("NLP, AI") == "nlp ai"

def test_recommender_service_mock():
    service = RecommenderService(mode="mock")
    # Test training
    service.train_model()
    assert service.is_trained == True
    
    # Test recommendations
    recs = service.get_recommendations(researcher_id=1, top_k=3)
    assert len(recs) == 3
    assert "name" in recs[0]
    assert "score" in recs[0]
    assert recs[0]["score"] >= 0

def test_recommender_invalid_id():
    service = RecommenderService(mode="mock")
    recs = service.get_recommendations(researcher_id=999, top_k=5)
    assert len(recs) == 0
