import logging
from app.data.loader import DataLoader
from app.models.hybrid import HybridRecommender
from typing import List, Dict

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RecommenderService:
    """Service layer to interact with the recommendation system."""
    
    def __init__(self, mode: str = "mock"):
        self.loader = DataLoader(mode=mode)
        self.recommender = HybridRecommender()
        self.is_trained = False

    def train_model(self):
        """Loads data and trains the hybrid model."""
        logger.info("Loading data and training model...")
        researchers_df, collaborations_df = self.loader.load_data()
        self.recommender.fit(researchers_df, collaborations_df)
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
