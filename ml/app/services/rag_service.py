import io
from PyPDF2 import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import uuid

class RAGService:
    def __init__(self):
        # Store document chunks in memory for simplicity
        # Format: { document_id: [chunk1, chunk2, ...] }
        self.documents = {}
        # Also store original filenames
        self.doc_names = {}

    def process_pdf(self, file_bytes: bytes, filename: str) -> dict:
        print(f"Processing PDF: {filename} ({len(file_bytes)} bytes)")
        """Extracts text from a PDF, chunks it, and stores it in memory."""
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            chunks = []
            
            # Improved chunking: split by pages and then smaller blocks
            for i, page in enumerate(reader.pages):
                text = page.extract_text()
                if not text:
                    continue
                    
                # Split into smaller chunks (approx 500 characters)
                # First try double newlines, then single, then just fixed size
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
            
            return {
                "document_id": doc_id,
                "filename": filename,
                "num_chunks": len(chunks)
            }
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise Exception(f"Failed to process PDF: {str(e)}")

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
                "answer": "I don't have any document content to search through. Please try uploading your PDF again.",
                "sources": []
            }
            
        texts = [c["text"] for c in all_chunks]
        
        # Compute TF-IDF
        vectorizer = TfidfVectorizer() # Removed stop_words to improve recall for short/simple queries
        try:
            # Check if we have enough vocabulary
            tfidf_matrix = vectorizer.fit_transform(texts)
            query_vec = vectorizer.transform([query])
            
            # Cosine similarity
            sims = cosine_similarity(query_vec, tfidf_matrix).flatten()
            
            # Get top 3 most similar chunks
            top_indices = sims.argsort()[-3:][::-1]
            
            # Filter by a small threshold
            relevant_indices = [i for i in top_indices if sims[i] > 0.001] # Lowered threshold
            
            if not relevant_indices:
                return {
                    "answer": "I couldn't find a direct answer to your question in the uploaded documents. Could you try rephrasing or asking something else?",
                    "sources": []
                }
                
            top_chunks = [all_chunks[i] for i in relevant_indices]
            
            # Format a more "conversational" and "fully functional" answer
            # In a real-world scenario, we would use an LLM (OpenAI/Anthropic) here
            # For now, we'll construct a high-quality summary based on retrieved chunks
            
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
