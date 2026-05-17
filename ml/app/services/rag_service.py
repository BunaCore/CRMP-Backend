import io
import os
import json
from PyPDF2 import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import uuid

class RAGService:
    def __init__(self):
        # Store document chunks in memory and persist them to a JSON file
        # Format: { document_id: [chunk1, chunk2, ...] }
        self.documents = {}
        # Also store original filenames
        self.doc_names = {}
        
        # Save RAG store at the root of the ml workspace to prevent uvicorn package auto-reload
        self.store_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
            "rag_store.json"
        )
        self.load_store()

    def load_store(self):
        try:
            if os.path.exists(self.store_path):
                with open(self.store_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.documents = data.get("documents", {})
                    self.doc_names = data.get("doc_names", {})
                print(f"Loaded {len(self.documents)} documents from persistent RAG store.")
        except Exception as e:
            print(f"Error loading RAG store: {e}")

    def save_store(self):
        try:
            with open(self.store_path, "w", encoding="utf-8") as f:
                json.dump({
                    "documents": self.documents,
                    "doc_names": self.doc_names
                }, f, ensure_ascii=False, indent=2)
            print(f"Successfully persisted {len(self.documents)} documents to RAG store.")
        except Exception as e:
            print(f"Error saving RAG store: {e}")

    def process_pdf(self, file_bytes: bytes, filename: str) -> dict:
        print(f"Processing PDF: {filename} ({len(file_bytes)} bytes)")
        """Extracts text from a PDF, chunks it, and stores/persists it."""
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            chunks = []
            
            # Improved chunking: split by pages and then smaller blocks
            for i, page in enumerate(reader.pages):
                text = page.extract_text()
                if not text:
                    continue
                    
                # Split into smaller chunks (approx 500 characters)
                temp_chunks = text.split('\n\n')
                if len(temp_chunks) <= 1:
                    temp_chunks = text.split('\n')
                
                current_chunk = ""
                for part in temp_chunks:
                    part = part.strip()
                    if not part:
                        continue
                        
                    if len(current_chunk) + len(part) < 500:
                        current_chunk += "\n" + part if current_chunk else part
                    else:
                        if current_chunk:
                            chunks.append({
                                "text": current_chunk,
                                "page": i + 1
                            })
                        current_chunk = part
                
                if current_chunk:
                    chunks.append({
                        "text": current_chunk,
                        "page": i + 1
                    })
            
            if not chunks:
                raise ValueError("No readable text found in the PDF")
                
            doc_id = str(uuid.uuid4())
            self.documents[doc_id] = chunks
            self.doc_names[doc_id] = filename
            
            # Persist to disk
            self.save_store()
            
            return {
                "document_id": doc_id,
                "filename": filename,
                "num_chunks": len(chunks)
            }
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise Exception(f"Failed to process PDF: {str(e)}")

    def process_text(self, file_bytes: bytes, filename: str) -> dict:
        print(f"Processing Text File: {filename} ({len(file_bytes)} bytes)")
        """Extracts text from a plain TXT file, chunks it, and stores/persists it."""
        try:
            text = file_bytes.decode('utf-8', errors='ignore')
            lines = text.split('\n')
            chunks = []
            current_chunk = ""
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                    
                if len(current_chunk) + len(line) < 500:
                    current_chunk += "\n" + line if current_chunk else line
                else:
                    if current_chunk:
                        chunks.append({
                            "text": current_chunk,
                            "page": 1  # Text files do not have page numbers
                        })
                    current_chunk = line
            
            if current_chunk:
                chunks.append({
                    "text": current_chunk,
                    "page": 1
                })
                
            if not chunks:
                raise ValueError("No readable text found in the file")
                
            doc_id = str(uuid.uuid4())
            self.documents[doc_id] = chunks
            self.doc_names[doc_id] = filename
            
            # Persist to disk
            self.save_store()
            
            return {
                "document_id": doc_id,
                "filename": filename,
                "num_chunks": len(chunks)
            }
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise Exception(f"Failed to process TXT: {str(e)}")

    def chat(self, document_ids: list[str], query: str) -> dict:
        """Finds the most relevant chunk(s) across provided documents and generates a response."""
        all_chunks = []
        for doc_id in document_ids:
            if doc_id in self.documents:
                for chunk in self.documents[doc_id]:
                    all_chunks.append({
                        "doc_id": doc_id,
                        "filename": self.doc_names[doc_id],
                        "text": chunk["text"],
                        "page": chunk["page"]
                    })
                    
        if not all_chunks:
            return {
                "answer": "I don't have any document content to search through. Please try uploading your PDF/TXT again.",
                "sources": []
            }
            
        texts = [c["text"] for c in all_chunks]
        
        # Compute TF-IDF
        vectorizer = TfidfVectorizer()
        try:
            # Check if we have enough vocabulary
            tfidf_matrix = vectorizer.fit_transform(texts)
            query_vec = vectorizer.transform([query])
            
            # Cosine similarity
            sims = cosine_similarity(query_vec, tfidf_matrix).flatten()
            
            # Get top 3 most similar chunks
            top_indices = sims.argsort()[-3:][::-1]
            
            # Filter by a small threshold
            relevant_indices = [i for i in top_indices if sims[i] > 0.001]
            
            if not relevant_indices:
                return {
                    "answer": "I couldn't find a direct answer to your question in the uploaded documents. Could you try rephrasing or asking something else?",
                    "sources": []
                }
                
            top_chunks = [all_chunks[i] for i in relevant_indices]
            
            main_info = top_chunks[0]['text']
            source_file = top_chunks[0]['filename']
            source_page = top_chunks[0]['page']
            
            if len(top_chunks) > 1:
                answer = f"I've analyzed the uploaded documents and found relevant information in **{source_file}** (page {source_page}).\n\n{main_info}\n\nI also found supporting details in other sections that mention: {top_chunks[1]['text'][:150]}..."
            else:
                answer = f"According to the document **{source_file}** (page {source_page}), here is what I found regarding your query:\n\n{main_info}"
            
            # Format sources for the frontend
            sources = []
            for i, chunk in enumerate(top_chunks):
                sources.append({
                    "id": f"src_{i}_{uuid.uuid4().hex[:4]}",
                    "fileId": chunk["doc_id"],
                    "fileName": chunk["filename"],
                    "page": chunk["page"],
                    "excerpt": chunk["text"][:300] + "..." if len(chunk["text"]) > 300 else chunk["text"]
                })
                
            return {
                "answer": answer,
                "sources": sources
            }
            
        except Exception as e:
            return {
                "answer": f"I encountered an error while analyzing the documents: {str(e)}",
                "sources": []
            }
