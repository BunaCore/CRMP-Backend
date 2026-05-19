import numpy as np
from sentence_transformers import SentenceTransformer
import faiss
from typing import List, Dict

class ProjectRecommender:
    """Semantic recommendation and search engine for research projects/proposals."""
    
    def __init__(self):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.index = None
        self.projects_list = []
        self.id_mapping = {}
        self.reverse_id_mapping = {}

    def fit(self, projects_list: List[Dict]):
        """Fits the model by building a FAISS index on all projects' semantic features."""
        self.projects_list = projects_list if projects_list is not None else []
        
        if not self.projects_list:
            self.id_mapping = {}
            self.reverse_id_mapping = {}
            self.index = None
            return

        # Map internal index indices to real project IDs
        self.id_mapping = {i: p['id'] for i, p in enumerate(self.projects_list)}
        self.reverse_id_mapping = {p['id']: i for i, p in enumerate(self.projects_list)}
        
        # Build semantic representation for each project
        profiles = []
        for p in self.projects_list:
            title = p.get("title") or ""
            abstract = p.get("abstract") or ""
            research_area = p.get("researchArea") or ""
            dept = p.get("department") or ""
            
            profile_text = f"Title: {title}. Research Area: {research_area}. Department: {dept}. Abstract: {abstract}."
            profiles.append(profile_text)
            
        self.embeddings = self.model.encode(profiles, convert_to_tensor=False)
        self.embeddings = np.array(self.embeddings).astype('float32')
        
        # Initialize FAISS index
        dimension = self.embeddings.shape[1]
        self.index = faiss.IndexFlatIP(dimension)  # Cosine similarity index
        
        # Normalize and add vectors
        faiss.normalize_L2(self.embeddings)
        self.index.add(self.embeddings)

    def get_recommendations(self, current_metadata: Dict, top_k: int = 5) -> List[Dict]:
        """Gets projects most semantically related to current metadata, filtering out the source project itself."""
        if self.index is None or not self.projects_list:
            return []
            
        current_id = current_metadata.get("id")
        title = current_metadata.get("title") or ""
        abstract = current_metadata.get("abstract") or ""
        research_area = current_metadata.get("researchArea") or ""
        dept = current_metadata.get("department") or ""
        
        search_text = f"Title: {title}. Research Area: {research_area}. Department: {dept}. Abstract: {abstract}."
        search_vec = self.model.encode([search_text]).astype('float32')
        faiss.normalize_L2(search_vec)
        
        # Search all projects
        scores, indices = self.index.search(search_vec, len(self.projects_list))
        
        recommendations = []
        for i, idx in enumerate(indices[0]):
            if idx == -1:
                continue
            project = self.projects_list[idx]
            
            # Skip recommending the project itself
            if project["id"] == current_id:
                continue
                
            similarity_score = float(scores[0][i])
            # Normalize to 0-100% score range
            match_score = round(max(0.0, min(1.0, (similarity_score + 1) / 2)) * 100, 1)
            
            recommendations.append({
                "id": project["id"],
                "title": project["title"],
                "researchArea": project["researchArea"],
                "department": project["department"],
                "abstract": project["abstract"],
                "matchScore": match_score,
                "advisor": project.get("advisor"),
                "members": project.get("members", []),
                "status": project.get("status")
            })
            
        # Return top K sorted by matchScore descending
        recommendations = sorted(recommendations, key=lambda x: x['matchScore'], reverse=True)
        return recommendations[:top_k]

    def search(self, query: str, top_k: int = 5) -> List[Dict]:
        """Performs a semantic query search over all indexed projects."""
        if self.index is None or not self.projects_list or not query.strip():
            return []
            
        search_vec = self.model.encode([query]).astype('float32')
        faiss.normalize_L2(search_vec)
        
        scores, indices = self.index.search(search_vec, min(top_k, len(self.projects_list)))
        
        results = []
        for i, idx in enumerate(indices[0]):
            if idx == -1:
                continue
            project = self.projects_list[idx]
            similarity_score = float(scores[0][i])
            match_score = round(max(0.0, min(1.0, (similarity_score + 1) / 2)) * 100, 1)
            
            results.append({
                "id": project["id"],
                "title": project["title"],
                "researchArea": project["researchArea"],
                "department": project["department"],
                "abstract": project["abstract"],
                "matchScore": match_score,
                "advisor": project.get("advisor"),
                "members": project.get("members", []),
                "status": project.get("status")
            })
            
        return results
