import os
from openai import OpenAI

def normalize_path(path):
    if ":" in path and "\\" in path:
        drive, rest = path.split(":", 1)
        drive = drive.lower()
        rest = rest.replace("\\", "/")
        return f"/mnt/{drive}{rest}"
    return path

def main():
    # Load Gemini API key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("Please set your GEMINI_API_KEY environment variable.")

    # Create a Gemini-compatible OpenAI client 
    client = OpenAI(
        api_key=api_key,
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
    )

    # Read text file
    file_path = normalize_path(input("Enter path to your text file: ").strip())
    if not os.path.exists(file_path):
        print("File not found.")
        return

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Ask a question 
    question = input("Enter your question about the document: ").strip()

    # Send to LLM
    prompt = f"""
    You are an assistant that extracts information from documents.
    Document:
    ---
    {content[:4000]}
    ---
    Question: {question}
    Provide a concise and clear answer.
    """

    response = client.chat.completions.create(
        model="gemini-2.0-flash",  
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
    )

    print("\n=== Answer ===")
    print(response.choices[0].message.content.strip())

if __name__ == "__main__":
    main()
