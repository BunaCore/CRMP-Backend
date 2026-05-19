import logging
from app.data.loader import DataLoader
from app.models.hybrid import HybridRecommender
from typing import List, Dict

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.models.project_recommender import ProjectRecommender

class RecommenderService:
    """Service layer to interact with the recommendation system."""
    
    def __init__(self, mode: str = "mock"):
        self.loader = DataLoader(mode=mode)
        self.recommender = HybridRecommender()
        self.project_recommender = ProjectRecommender()
        self.is_trained = False

    def train_model(self):
        """Loads data and trains the hybrid and project models."""
        logger.info("Loading data and training model...")
        researchers_df, proposals_df, collaborations_df = self.loader.load_data()
        self.recommender.fit(researchers_df, proposals_df, collaborations_df)
        
        try:
            from app.data.db import fetch_projects
            projects_list = fetch_projects()
            self.project_recommender.fit(projects_list)
            logger.info(f"Successfully fit project recommender with {len(projects_list)} projects.")
        except Exception as e:
            logger.error(f"Failed to fit project recommender: {e}")
            
        self.is_trained = True
        logger.info("Model training completed.")

    def get_recommendations(self, researcher_id: int, top_k: int = 5) -> List[Dict]:
        """Gets recommendations for a specific researcher."""
        if not self.is_trained:
            self.train_model()
            
        logger.info(f"Generating top {top_k} recommendations for researcher {researcher_id}")
        return self.recommender.get_recommendations(researcher_id, top_k)

    def search_researchers(self, query: str, top_k: int = 5) -> List[Dict]:
        """Searches for researchers based on a semantic query."""
        if not self.is_trained:
            self.train_model()
            
        logger.info(f"Searching researchers for query: '{query}'")
        return self.recommender.search(query, top_k)

    def recommend_members(self, proposal_data: dict, top_k: int = 10) -> List[Dict]:
        """Gets member recommendations for the proposal team section."""
        if not self.is_trained:
            self.train_model()
            
        logger.info(f"Generating member recommendations for proposal: '{proposal_data.get('title')}'")
        return self.recommender.recommend_members(proposal_data, top_k)

    def recommend_projects(self, current_metadata: dict, top_k: int = 5) -> List[Dict]:
        """Gets semantically similar projects based on current project metadata."""
        if not self.is_trained:
            self.train_model()
            
        logger.info(f"Generating related project recommendations for project: '{current_metadata.get('title')}'")
        return self.project_recommender.get_recommendations(current_metadata, top_k)

    def search_projects(self, query: str, top_k: int = 5) -> List[Dict]:
        """Performs semantic search across indexed projects."""
        if not self.is_trained:
            self.train_model()
            
        logger.info(f"Searching projects for query: '{query}'")
        return self.project_recommender.search(query, top_k)
