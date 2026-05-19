import os
import re
from pathlib import Path
from sqlalchemy import create_engine, text

def get_database_url() -> str:
    """Retrieves the database URL from the environment or parses the .env file."""
    # 1. Check environment variable first
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return db_url

    # 2. Check parent directory's .env file
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("DATABASE_URL="):
                    val = line.split("=", 1)[1].strip()
                    # Strip quotes if any
                    val = val.strip("'\"")
                    # Replace postgresql:// with postgresql+psycopg2:// for compatibility
                    if val.startswith("postgresql://"):
                        val = val.replace("postgresql://", "postgresql+psycopg2://", 1)
                    return val

    # Fallback to local default port mapping (5434)
    return "postgresql+psycopg2://postgres:postgres@localhost:5434/crmp"

def get_engine():
    """Creates a SQLAlchemy engine."""
    db_url = get_database_url()
    # Remove async prefix if accidentally passed, as we're doing synchronous loader
    if db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    return create_engine(db_url, pool_pre_ping=True)

def fetch_users():
    """Fetches all users from PostgreSQL."""
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id, full_name, department FROM users"))
        return [
            {
                "id": str(row[0]),
                "fullName": row[1],
                "department": row[2]
            }
            for row in result
        ]

def fetch_proposals():
    """Fetches all proposals from PostgreSQL."""
    engine = get_engine()
    with engine.connect() as conn:
        query = text("""
            SELECT p.id, p.title, p.abstract, p.research_area, p.department_id, p.created_by, d.name as department_name
            FROM proposals p
            LEFT JOIN departments d ON p.department_id = d.id
        """)
        result = conn.execute(query)
        return [
            {
                "id": str(row[0]),
                "title": row[1],
                "abstract": row[2],
                "researchArea": row[3],
                "departmentId": str(row[4]) if row[4] else None,
                "createdBy": str(row[5]) if row[5] else None,
                "department": row[6]
            }
            for row in result
        ]

def fetch_proposal_members():
    """Fetches all proposal members from PostgreSQL."""
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(text("SELECT proposal_id, user_id FROM proposal_members"))
        return [
            {
                "proposalId": str(row[0]),
                "userId": str(row[1])
            }
            for row in result
        ]

def fetch_projects():
    """Fetches all projects from PostgreSQL, including members, advisors, and department info."""
    engine = get_engine()
    with engine.connect() as conn:
        # Fetch projects list
        query = text("""
            SELECT p.project_id, p.project_title, p.project_description, p.research_area, p.project_stage, p.is_funded, p.duration_months, d.name as department_name
            FROM projects p
            LEFT JOIN departments d ON p.department_id = d.id
        """)
        projects_result = conn.execute(query)
        projects_list = []
        for row in projects_result:
            projects_list.append({
                "id": str(row[0]),
                "title": row[1] or "",
                "abstract": row[2] or "",
                "researchArea": row[3] or "",
                "status": row[4] or "",
                "isFunded": bool(row[5]),
                "durationMonths": int(row[6]) if row[6] is not None else 12,
                "department": row[7] or "",
                "members": [],
                "advisor": None
            })
            
        # Fetch members and advisors for all projects
        members_query = text("""
            SELECT pm.project_id, pm.role, u.full_name, u.email
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
        """)
        members_result = conn.execute(members_query)
        for row in members_result:
            pid = str(row[0])
            role = row[1]
            name = row[2]
            email = row[3]
            
            # Find the project in projects_list
            for p in projects_list:
                if p["id"] == pid:
                    if role in ("ADVISOR", "SUPERVISOR"):
                        p["advisor"] = name
                    else:
                        p["members"].append(name)
                    break
        return projects_list
