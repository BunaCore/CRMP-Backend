import pandas as pd
from typing import Tuple
from app.data.mock_data import generate_mock_researchers, generate_mock_collaborations

class DataLoader:
    """Handles loading of researcher and collaboration data."""
    
    def __init__(self, mode: str = "mock"):
        self.mode = mode

    def load_data(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Loads data based on the current mode."""
        if self.mode == "mock":
            return self.load_mock_data()
        elif self.mode == "db":
            return self.load_real_data_from_db()
        else:
            raise ValueError(f"Unknown mode: {self.mode}")

    def load_mock_data(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Generates and returns mock data."""
        researchers = generate_mock_researchers(50)
        collaborations = generate_mock_collaborations(researchers, 200)
        return researchers, collaborations

    def load_real_data_from_db(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Fetches real users from the NestJS backend API.
        """
        import httpx
        import numpy as np
        
        try:
            print("Fetching real users from NestJS backend...")
            response = httpx.get("http://localhost:3001/users/selector?limit=1000", timeout=10.0)
            response.raise_for_status()
            users = response.json()
            
            departments = ["Computer Science", "Physics", "Biology", "Mathematics", "Chemistry", "Economics", "Engineering", "Arts"]
            skill_pool = [
                "Python", "Machine Learning", "Deep Learning", "Data Analysis", "Quantum Computing",
                "Blockchain", "NLP", "Computer Vision", "Statistics", "Optimization",
                "Genomics", "Biotechnology", "Microbiology", "Thermodynamics", "Organic Chemistry",
                "Econometrics", "Game Theory", "Behavioral Economics", "Cryptography", "Distributed Systems",
                "Frontend", "React", "Next.js", "Node.js", "TypeScript"
            ]
            interest_pool = [
                "Artificial Intelligence", "Sustainability", "Drug Discovery", "Financial Markets",
                "Robotics", "Renewable Energy", "Public Health", "Space Exploration",
                "Climate Change", "Cybersecurity", "Ethics in AI", "Neuroscience"
            ]
            keyword_pool = [
                "Neural Networks", "CRISPR", "Black Holes", "Stock Prediction", "Supply Chain",
                "Carbon Sequestration", "Edge Computing", "Personalized Medicine", "Smart Contracts"
            ]
            
            data = []
            for u in users:
                uid = u.get("value")
                uname = u.get("label")
                
                # Assign some mock skills/interests based on a seed or random
                researcher_skills = list(np.random.choice(skill_pool, size=np.random.randint(3, 8), replace=False))
                researcher_interests = list(np.random.choice(interest_pool, size=np.random.randint(2, 5), replace=False))
                researcher_keywords = list(np.random.choice(keyword_pool, size=np.random.randint(3, 6), replace=False))
                
                data.append({
                    "id": str(uid),
                    "name": uname,
                    "department": np.random.choice(departments),
                    "skills": researcher_skills,
                    "interests": researcher_interests,
                    "publications": researcher_keywords
                })
                
            researchers_df = pd.DataFrame(data)
            
            # mock collaborations for now
            interactions = []
            if not researchers_df.empty:
                researcher_ids = researchers_df["id"].tolist()
                for _ in range(100):
                    if len(researcher_ids) >= 2:
                        u1, u2 = np.random.choice(researcher_ids, size=2, replace=False)
                        interactions.append({"user_id": str(u1), "collaborator_id": str(u2), "score": float(np.random.uniform(0.5, 1.0))})
            collaborations_df = pd.DataFrame(interactions) if interactions else pd.DataFrame(columns=["user_id", "collaborator_id", "score"])
            
            print(f"Loaded {len(researchers_df)} researchers from DB.")
            return researchers_df, collaborations_df
            
        except Exception as e:
            print(f"Failed to load real DB data: {e}. Falling back to mock.")
            return self.load_mock_data()
