from transformers import pipeline

def load_model():
    classifier = pipeline(
        "text-classification",
        model="nlpaueb/legal-bert-base-uncased"
    )
    return classifier

if __name__ == "__main__":
    print("Loading model...")
    classifier = load_model()
    
    test_clause = "The freelancer waives all rights to payment if the client is unsatisfied for any reason."
    result = classifier(test_clause)
    print(result)