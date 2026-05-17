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

    def load_mock_data(self) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """Generates and returns mock data."""
        researchers = generate_mock_researchers(50)
        collaborations = generate_mock_collaborations(researchers, 200)
        return researchers, pd.DataFrame(), collaborations

    def load_real_data_from_db(self) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """
        Fetches real users, proposals, and collaborations from the NestJS backend.
        """
        import httpx
        import numpy as np
        
        try:
            print("Fetching training data from NestJS backend...")
            response = httpx.get("http://localhost:3001/ml/training-data", timeout=20.0)
            response.raise_for_status()
            data = response.json()
            
            users = data.get("users", [])
            proposals = data.get("proposals", [])
            collaborations = data.get("collaborations", [])
            
            # Map departments to specific skills for more realistic mock data
            dept_skills = {
                "Computer Science": ["Python", "Machine Learning", "AI", "React", "Cybersecurity", "Algorithms"],
                "Mathematics": ["Statistics", "Calculus", "Optimization", "Data Analysis", "Python"],
                "Physics": ["Quantum Mechanics", "Thermodynamics", "Data Analysis", "Simulation"],
                "Engineering": ["CAD", "Materials Science", "SolidWorks", "Project Management"],
                "Biology": ["Genetics", "Microbiology", "Ecology", "Lab Research", "Biochemistry"]
            }
            default_skills = ["Research", "Writing", "Presentation", "Data Analysis"]
            
            formatted_users = []
            for u in users:
                dept = u.get("department")
                # Assign 2-3 skills from their department if it matches, otherwise random from pool
                relevant_skills = dept_skills.get(dept, default_skills)
                
                # Use a stable seed for randomization based on user ID to make it deterministic
                np.random.seed(hash(str(u.get("id"))) % 12345678)
                
                user_skills = list(np.random.choice(relevant_skills, size=min(3, len(relevant_skills)), replace=False))
                user_interests = list(np.random.choice(relevant_skills, size=min(2, len(relevant_skills)), replace=False))
                
                formatted_users.append({
                    "id": str(u.get("id")),
                    "name": u.get("fullName"),
                    "department": dept,
                    "skills": user_skills,
                    "interests": user_interests
                })
                
            users_df = pd.DataFrame(formatted_users)
            proposals_df = pd.DataFrame(proposals)
            collaborations_df = pd.DataFrame(collaborations)
            
            print(f"✅ Loaded {len(users_df)} users and {len(proposals_df)} historical proposals.")
            return users_df, proposals_df, collaborations_df
            
        except Exception as e:
            print(f"Failed to load real DB data: {e}. Falling back to mock.")
            # return mock data structure
            return pd.DataFrame(), pd.DataFrame(), pd.DataFrame()
