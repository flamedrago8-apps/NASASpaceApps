import serpapi, os, json
from ollama import (
    chat,
    ChatResponse
)

# Use your own API key you bummmmmm
scraper = serpapi.Client(api_key=os.environ.get("SERPAPI_KEY", ""))

def breakdown_prompt(prompt: str):
    """
    Takes the research question or prompt question and breaks it down into multiple search queries
    """
    response: ChatResponse = chat(
            model="qwen3.5:4b",
            messages=[
                {
                    "role": "system",
                    "content": "Analyze the provided research question and break it down into 1-5 distinct, targeted search queries that collectively cover the information necessary to answer it. Include queries addressing foundational information (FOUNDATIONAL), primary sources (PRIMARY_SOURCE), technical details (TECHNICAL_DETAILS), supporting evidence (SUPPORTING_EVIDENCE), limitations, and alternative perspectives (LIMITATIONS_AND_PERSPECTIVE) where relevant. Avoid redundant or unrelated queries. Return exclusively valid JSON using the following structure: {\"research_question\": \"Original research question\", \"search_queries\": [{\"id\": \"Q01\", \"category\": \"FOUNDATIONAL\", \"query\": \"Search query\", \"purpose\": \"Purpose of the search\"}]}. Do not answer the research question, conduct research, or include any text outside the JSON object."
                },
                {"role": "user", "content": prompt}
            ]
        )

    result = json.loads(response["message"]["content"])
    return result

def preform_searches(breakdown: dict):
    # Weights for how many of each source we should collect
    WEIGHTS = {
        "FOUNDATIONAL" : 1,
        "PRIMARY_SOURCE" : 3,
        "TECHNICAL_DETAILS" : 2,
        "SUPPORTING_EVIDENCE" : 3,
        "LIMITATIONS_AND_PERSPECTIVE" : 1
    }
    queries: list = breakdown["search_queries"]
    links = []
    for query in queries:
        category: str = query["category"]
        response = scraper.search(
            engine="brave",
            q=query["query"],
            location="Austin, Texas",
            hl="en",
            gl="us"
        )

        organic_results = response["organic_results"]
        for i in range(0, WEIGHTS[category]):
            links.append(organic_results[i]["link"])

        # Debugging step
        # print(links)

    return links

if __name__ == "__main__":
    # Manual check: runs live searches, so only when executed directly (not on import).
    print(preform_searches(breakdown_prompt("I need to research about NASA.")))
