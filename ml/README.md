# CRMP Researcher Recommendation System

This module provides a hybrid recommendation system for the Collaborative Research Management Platform (CRMP).

## Features
- **Content-Based Filtering**: Recommends researchers based on shared skills, interests, and publication keywords using TF-IDF and Cosine Similarity.
- **Collaborative Filtering**: Recommends researchers based on past collaboration patterns using SVD Matrix Factorization.
- **Hybrid Model**: Combines both scores (0.7 Content + 0.3 Collaborative) for better accuracy.
- **FastAPI Integration**: Ready-to-use REST API.
- **Mock Data Support**: Realistic synthetic dataset for immediate testing.
- **Future-Proof**: Easily switch between mock data and real database sources.

## Setup

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the API**:
   ```bash
   cd ml
   python -m app.main
   ```
   The API will be available at `http://localhost:8000`.

3. **Run Tests**:
   ```bash
   pytest tests/
   ```

## API Endpoints

### POST `/recommend`
Request Body:
```json
{
  "researcher_id": 1,
  "top_k": 5
}
```

Response:
```json
{
  "recommendations": [
    {
      "id": 2,
      "name": "Researcher 2",
      "score": 0.85
    },
    ...
  ]
}
```

### GET `/health`
Returns the status of the service.
