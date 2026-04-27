from typing import List
import re

def clean_text(text: str) -> str:
    """Cleans and normalizes text."""
    if not text:
        return ""
    # Lowercase, remove special chars
    text = text.lower()
    text = re.sub(r'[^a-zA-Z0-9\s]', '', text)
    return text.strip()

def combine_features(row: dict) -> str:
    """Combines skills, interests, and publications into a single string for vectorization."""
    skills = " ".join([clean_text(s) for s in row.get("skills", [])])
    interests = " ".join([clean_text(i) for i in row.get("interests", [])])
    publications = " ".join([clean_text(p) for p in row.get("publications", [])])
    
    return f"{skills} {interests} {publications}"
