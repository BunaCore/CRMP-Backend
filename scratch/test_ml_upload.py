
import httpx
import asyncio

async def test():
    # Create a dummy PDF file content
    pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Title (Test) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"

    url = "http://localhost:8001/rag/upload"
    files = {'file': ('test.pdf', pdf_content, 'application/pdf')}

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, files=files)
            print(f"Status Code: {response.status_code}")
            print(f"Response: {response.text}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
