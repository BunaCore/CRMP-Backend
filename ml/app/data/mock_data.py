import pandas as pd
import numpy as np
from typing import List, Dict

def generate_mock_researchers(n: int = 50) -> pd.DataFrame:
    """Generates a synthetic dataset of researchers."""
    departments = ["Computer Science", "Physics", "Biology", "Mathematics", "Chemistry", "Economics"]
    
    skill_pool = [
        "Python", "Machine Learning", "Deep Learning", "Data Analysis", "Quantum Computing",
        "Blockchain", "NLP", "Computer Vision", "Statistics", "Optimization",
        "Genomics", "Biotechnology", "Microbiology", "Thermodynamics", "Organic Chemistry",
        "Econometrics", "Game Theory", "Behavioral Economics", "Cryptography", "Distributed Systems"
    ]
    
    interest_pool = [
        "Artificial Intelligence", "Sustainability", "Drug Discovery", "Financial Markets",
        "Robotics", "Renewable Energy", "Public Health", "Space Exploration",
        "Climate Change", "Cybersecurity", "Ethics in AI", "Neuroscience"
    ]
    
    keyword_pool = [
        "Neural Networks", "CRISPR", "Black Holes", "Stock Prediction", "Supply Chain",
        "Carbon Sequestration", "Edge Computing", "Personalized Medicine", "Smart Contracts",
        "Quantum Supremacy", "Bioinformatics", "Microservices"
    ]
    
    data = []
    for i in range(1, n + 1):
        researcher_skills = list(np.random.choice(skill_pool, size=np.random.randint(3, 7), replace=False))
        researcher_interests = list(np.random.choice(interest_pool, size=np.random.randint(2, 5), replace=False))
        researcher_keywords = list(np.random.choice(keyword_pool, size=np.random.randint(3, 8), replace=False))
        
        data.append({
            "id": i,
            "name": f"Researcher {i}",
            "department": np.random.choice(departments),
            "skills": researcher_skills,
            "interests": researcher_interests,
            "publications": researcher_keywords
        })
        
    return pd.DataFrame(data)

def generate_mock_collaborations(researchers_df: pd.DataFrame, n_interactions: int = 200) -> pd.DataFrame:
    """Generates synthetic collaboration interactions."""
    researcher_ids = researchers_df["id"].tolist()
    interactions = []
    
    for _ in range(n_interactions):
        u1, u2 = np.random.choice(researcher_ids, size=2, replace=False)
        # Interaction score based on shared department or random factor
        score = np.random.uniform(0.5, 1.0)
        interactions.append({
            "user_id": int(u1),
            "collaborator_id": int(u2),
            "score": float(score)
        })
        
    return pd.DataFrame(interactions)
